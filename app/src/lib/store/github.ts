/**
 * Backend GitHub : `data/library.json` sur une branche du dépôt est la base.
 *
 * Lecture  — `GET /contents` conditionnel (`If-None-Match`), donc un 304 la
 *            plupart du temps : ni quota consommé, ni 1,5 Mo retéléchargé.
 * Écriture — `PUT /contents`, soit un commit signé de l'identité du token.
 *
 * Deux pièges qui ne se voient qu'à l'exécution, et qui justifient l'essentiel
 * de ce fichier :
 *
 * 1. **Le type de média.** Sans `Accept: application/vnd.github.raw`, l'API
 *    répond en JSON et **tronque silencieusement au-delà de 1 Mo** — HTTP 200,
 *    `content: ""`, `encoding: "none"`. On parserait du vide sans erreur. Le
 *    type `raw` porte la limite de lecture à 100 Mo.
 * 2. **Les deux formes de l'ETag.** L'ETag *est* le sha du blob, mais le GET le
 *    rend entre guillemets (parfois préfixé `W/`) alors que le PUT attend le
 *    sha nu. Envoyer la forme nue en `If-None-Match` : plus jamais de 304, donc
 *    1,5 Mo à chaque lecture. Envoyer la forme entre guillemets en `sha` :
 *    chaque PUT part en 422. D'où `bare()`, et le jeton conservé sous sa forme
 *    citée.
 *
 * Pas de `raw.githubusercontent.com`, malgré sa simplicité : non documenté,
 * limité séparément, et mis en cache CDN ~5 minutes. Lire un fichier vieux de
 * cinq minutes, le modifier et le réécrire effacerait ce qui s'est passé entre
 * les deux.
 */
import type { Snapshot } from "./snapshot";
import { StaleWriteError } from "./errors";

const API = "https://api.github.com";
const PATH = "data/library.json";

/** Deux tentatives de plus sur la lecture. Sur une instance froide, un seul
 *  GET capricieux mettrait sinon toutes les pages en 500. */
const READ_ATTEMPTS = 3;
const RETRY_MS = 500;
/** Une attente demandée par GitHub au-delà de cela ne se rattrape pas dans une
 *  requête HTTP : autant échouer avec un message clair. */
const MAX_RETRY_AFTER_MS = 10_000;

interface Config {
  repo: string;
  branch: string;
  auth: string;
}

/**
 * Les variables, vérifiées à chaque appel plutôt qu'à l'import : rien ne doit
 * s'exécuter au chargement du module (cf. `store.ts`), et un token expiré doit
 * donner un message qui le nomme, pas un 500 opaque.
 */
function config(): Config {
  const repo = process.env.GITHUB_REPO;
  const auth = process.env.GITHUB_TOKEN;
  if (!repo) {
    throw new Error(
      "GITHUB_REPO manquant : le backend GitHub ne sait pas quel dépôt lire " +
        "(format attendu : « proprietaire/depot »)."
    );
  }
  if (!auth) {
    throw new Error(
      "GITHUB_TOKEN manquant : le backend GitHub ne peut ni lire ni écrire."
    );
  }
  return { repo, branch: process.env.GITHUB_BRANCH ?? "master", auth };
}

export const label = (): string => {
  const repo = process.env.GITHUB_REPO ?? "?";
  const branch = process.env.GITHUB_BRANCH ?? "master";
  return `${repo}@${branch}:${PATH}`;
};

/** `W/"abc"` ou `"abc"` → `abc`. Ce que le PUT attend en `sha`. */
const bare = (etag: string): string =>
  etag.replace(/^W\//, "").replace(/^"|"$/g, "");

const headers = ({ auth }: Config): Record<string, string> => ({
  Authorization: `Bearer ${auth}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le délai demandé par GitHub, s'il en demande un. */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/** 401/403/404 : inutile de réessayer, et le message doit nommer la cause. */
function fatal(res: Response): Error | null {
  if (res.status === 401) {
    return new Error(
      "GITHUB_TOKEN refusé par GitHub (401) : token expiré, révoqué, ou mal copié."
    );
  }
  if (res.status === 403 && !res.headers.get("retry-after")) {
    return new Error(
      "GITHUB_TOKEN sans les droits nécessaires (403) : il faut « Contents: " +
        `read and write » sur ${process.env.GITHUB_REPO}.`
    );
  }
  if (res.status === 404) {
    return new Error(
      `${label()} introuvable (404) : dépôt, branche ou chemin inexistant, ` +
        "ou token sans accès à ce dépôt."
    );
  }
  return null;
}

/**
 * Un appel, réessayé sur les pannes passagères : coupure réseau, 5xx, et les
 * 403/429 assortis d'un `Retry-After`. Jamais sur une erreur d'autorisation ni
 * sur un conflit — les rejouer ne changerait rien.
 */
async function attempt(
  send: () => Promise<Response>,
  attempts: number
): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(RETRY_MS * i);
    let res: Response;
    try {
      res = await send();
    } catch (e) {
      last = e;
      continue;
    }
    if (res.ok || res.status === 304) return res;

    const wait = retryAfterMs(res);
    if (wait != null && wait <= MAX_RETRY_AFTER_MS && i < attempts - 1) {
      await sleep(wait);
      continue;
    }

    const known = fatal(res);
    if (known) throw known;
    if (res.status < 500 && wait == null) return res; // 409/422 : à l'appelant
    last = new Error(
      `GitHub a répondu ${res.status} : ${(await res.text().catch(() => "")).slice(0, 200)}`
    );
  }
  throw last instanceof Error
    ? last
    : new Error(`GitHub injoignable après ${attempts} tentatives`);
}

/** Le fichier, s'il a changé depuis le jeton fourni (l'ETag cité). */
export async function read(token: string | undefined): Promise<Snapshot | null> {
  const cfg = config();
  const url = `${API}/repos/${cfg.repo}/contents/${PATH}?ref=${encodeURIComponent(cfg.branch)}`;

  const res = await attempt(
    () =>
      fetch(url, {
        headers: {
          ...headers(cfg),
          // Ce qui porte la limite de lecture à 100 Mo (cf. en-tête du module).
          Accept: "application/vnd.github.raw",
          ...(token ? { "If-None-Match": token } : {}),
        },
        cache: "no-store",
      }),
    READ_ATTEMPTS
  );

  if (res.status === 304) return null;
  if (!res.ok) {
    throw new Error(
      `Lecture de ${label()} impossible : GitHub a répondu ${res.status}.`
    );
  }

  const etag = res.headers.get("etag");
  // Sans ETag il n'y a pas de jeton : le mettre en cache à `undefined`
  // enverrait `If-None-Match: undefined` et supprimerait tous les 304 à venir.
  if (!etag) {
    throw new Error(
      `Réponse de GitHub sans ETag pour ${label()} : impossible de suivre les ` +
        "versions, lecture abandonnée."
    );
  }
  return { json: await res.text(), token: etag };
}

/**
 * Écrit le fichier en un commit. `token` est le jeton de compare-and-swap :
 * si la branche a bougé depuis, GitHub répond 409 et rien n'est écrasé.
 */
export async function write(
  json: string,
  token: string | undefined,
  message: string
): Promise<string> {
  const cfg = config();

  // Sans jeton (cache vidé par une erreur précédente), le sha courant doit être
  // relu : `PUT /contents` refuse d'écraser un fichier existant sans lui.
  const etag = token ?? (await read(undefined))?.token;
  if (!etag) throw new Error(`Impossible d'obtenir le sha courant de ${label()}.`);

  const res = await attempt(
    () =>
      fetch(`${API}/repos/${cfg.repo}/contents/${PATH}`, {
        method: "PUT",
        headers: { ...headers(cfg), "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          content: Buffer.from(json, "utf-8").toString("base64"),
          sha: bare(etag),
          branch: cfg.branch,
        }),
        cache: "no-store",
      }),
    // Une écriture n'est pas rejouée à l'aveugle : elle a déjà pu passer.
    1
  );

  // 409 = sha périmé (le compare-and-swap a mordu) ; 422 = sha refusé.
  if (res.status === 409 || res.status === 422) throw new StaleWriteError();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Écriture de ${label()} refusée par GitHub (${res.status}) : ${body.slice(0, 200)}`
    );
  }

  // La réponse porte le nouveau sha : aucune relecture après écriture. On le
  // remet entre guillemets, forme attendue par `If-None-Match`.
  const body = (await res.json()) as { content?: { sha?: string } };
  const sha = body.content?.sha;
  if (!sha) throw new Error("Réponse d'écriture GitHub sans sha.");
  return `"${sha}"`;
}
