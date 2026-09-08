/**
 * Backend GitHub : les deux pièges qui ne se voient qu'à l'exécution.
 *
 * Ces tests ne parlent pas à GitHub — ils remplacent `fetch` et vérifient ce
 * qu'on lui demande. C'est exactement ce qui compte ici : les deux erreurs que
 * ce backend peut faire sont muettes en production. Envoyer le sha nu en
 * `If-None-Match` ne casse rien, cela supprime seulement tous les 304 — donc
 * 1,5 Mo retéléchargés à chaque lecture, sans le moindre message. Oublier le
 * type de média `raw` ne casse rien non plus : l'API répond 200 avec un contenu
 * vide au-delà de 1 Mo.
 *
 * Ce qui reste invérifiable sans token, et que ces tests ne prétendent pas
 * couvrir : qu'un `PUT` d'un corps base64 de ~2 Mo passe réellement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { read, write } from "./github";
import { StaleWriteError } from "./errors";

const SHA = "768a9775bfd5479b7640abe95085353fed88f45b";

function respond(
  status: number,
  { body = "", etag, json }: { body?: string; etag?: string; json?: unknown } = {}
): Response {
  const headers = new Headers();
  if (etag) headers.set("etag", etag);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => body,
    json: async () => json,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.GITHUB_REPO = "ThomasGourouza/my-library";
  process.env.GITHUB_TOKEN = "jeton-de-test";
  process.env.GITHUB_BRANCH = "master";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_REPO;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_BRANCH;
});

const lastInit = () => fetchMock.mock.calls.at(-1)![1] as RequestInit;
const lastHeaders = () => lastInit().headers as Record<string, string>;

describe("backend GitHub — lecture", () => {
  it("demande le type de média brut, sans quoi l'API tronque à 1 Mo en silence", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { body: '{"authors":[]}', etag: `"${SHA}"` })
    );
    await read(undefined);
    expect(lastHeaders().Accept).toBe("application/vnd.github.raw");
    // Une réponse en cache CDN vieille de cinq minutes, modifiée puis réécrite,
    // effacerait ce qui s'est passé entre-temps.
    expect(lastInit().cache).toBe("no-store");
  });

  it("envoie l'ETag entre guillemets, tel qu'il a été reçu", async () => {
    fetchMock.mockResolvedValue(respond(304));
    // La forme nue ne déclencherait jamais de 304 : chaque lecture
    // retéléchargerait 1,5 Mo, sans erreur pour le signaler.
    expect(await read(`"${SHA}"`)).toBeNull();
    expect(lastHeaders()["If-None-Match"]).toBe(`"${SHA}"`);
  });

  it("rend le contenu et garde l'ETag comme jeton", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { body: '{"authors":[]}', etag: `"${SHA}"` })
    );
    expect(await read(undefined)).toEqual({
      json: '{"authors":[]}',
      token: `"${SHA}"`,
    });
  });

  it("refuse une réponse sans ETag plutôt que de mettre `undefined` en cache", async () => {
    // Un jeton `undefined` produirait `If-None-Match: undefined`, donc plus
    // jamais de 304 — la panne la plus discrète que ce backend puisse avoir.
    fetchMock.mockResolvedValue(respond(200, { body: "{}" }));
    await expect(read(undefined)).rejects.toThrow(/sans ETag/);
  });

  it("nomme la variable en cause quand le token est refusé", async () => {
    fetchMock.mockResolvedValue(respond(401));
    await expect(read(undefined)).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it("réessaie une panne passagère au lieu de mettre toutes les pages en 500", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue(respond(200, { body: "{}", etag: `"${SHA}"` }));
    expect((await read(undefined))?.token).toBe(`"${SHA}"`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("backend GitHub — écriture", () => {
  it("envoie le sha nu, sinon chaque PUT part en 422", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { json: { content: { sha: "nouveau" } } })
    );
    // Forme faible ET guillemets : les deux doivent tomber.
    await write("{}", `W/"${SHA}"`, "Ajout d'un livre");
    const body = JSON.parse(lastInit().body as string);
    expect(body.sha).toBe(SHA);
    expect(body.message).toBe("Ajout d'un livre");
    expect(body.branch).toBe("master");
    expect(Buffer.from(body.content, "base64").toString("utf-8")).toBe("{}");
  });

  it("garde le nouveau sha, sans relecture après écriture", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { json: { content: { sha: "abc123" } } })
    );
    expect(await write("{}", `"${SHA}"`, "m")).toBe('"abc123"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("traduit un sha périmé en conflit, et ne rejoue rien", async () => {
    // C'est le compare-and-swap : quelqu'un a committé entre notre lecture et
    // notre écriture, et rien n'a été écrasé.
    for (const status of [409, 422]) {
      fetchMock.mockResolvedValue(respond(status, { body: "conflict" }));
      await expect(write("{}", `"${SHA}"`, "m")).rejects.toThrow(StaleWriteError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockClear();
    }
  });
});
