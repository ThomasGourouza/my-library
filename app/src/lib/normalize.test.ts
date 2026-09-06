/**
 * `normalizeKey` porte la recherche, la déduplication et la résolution des
 * parcours et des priorités : une régression ici ne se voit pas à l'écran, elle
 * fait juste disparaître des livres des résultats. D'où ces cas figés.
 */
import { describe, expect, it } from "vitest";
import {
  formatLifespan,
  formatYear,
  normalizeKey,
  normalizeText,
} from "./normalize";

describe("normalizeKey", () => {
  it("neutralise accents, casse et ponctuation", () => {
    expect(normalizeKey("Crime et Châtiment")).toBe("crime et chatiment");
    expect(normalizeKey("  L’ÉTRANGER  ")).toBe("l'etranger");
    expect(normalizeKey("À la recherche du temps perdu")).toBe(
      "a la recherche du temps perdu"
    );
  });

  it("rend identiques les deux apostrophes", () => {
    expect(normalizeKey("L’Iliade")).toBe(normalizeKey("L'Iliade"));
  });

  it("développe œ et æ, que NFKD laisse intacts", () => {
    // Sans ce cas, « Le Cœur » et « Le Coeur » seraient deux livres.
    expect(normalizeKey("Le Cœur simple")).toBe("le coeur simple");
    expect(normalizeKey("Æneis")).toBe("aeneis");
  });

  it("réduit toute autre ponctuation à un espace unique", () => {
    expect(normalizeKey("30 ans après Maastricht : Le Frexit ou la mort")).toBe(
      "30 ans apres maastricht le frexit ou la mort"
    );
    expect(normalizeKey("Jin Ping Mei (Le Lotus d’or)")).toBe(
      "jin ping mei le lotus d'or"
    );
  });

  it("est idempotente", () => {
    const once = normalizeKey("L’Épopée de Gilgamesh");
    expect(normalizeKey(once)).toBe(once);
  });
});

describe("normalizeText", () => {
  it("uniformise les apostrophes et les espaces sans toucher aux accents", () => {
    expect(normalizeText("L'Étranger")).toBe("L’Étranger");
    expect(normalizeText("  deux   espaces  ")).toBe("deux espaces");
  });
});

describe("formatYear", () => {
  it("rend les années négatives en « av. J.-C. »", () => {
    expect(formatYear(-428)).toBe("428 av. J.-C.");
    expect(formatYear(1913)).toBe("1913");
    expect(formatYear(null)).toBe("");
    expect(formatYear(undefined)).toBe("");
  });
});

describe("formatLifespan", () => {
  it("écrit une vie complète", () => {
    expect(formatLifespan(1913, 1960)).toBe("1913–1960");
  });

  it("ne répète pas « av. J.-C. » quand les deux bornes le sont", () => {
    expect(formatLifespan(-428, -348)).toBe("428–348 av. J.-C.");
  });

  it("gère une borne manquante", () => {
    expect(formatLifespan(1969, null)).toBe("né(e) en 1969");
    expect(formatLifespan(null, 1980)).toBe("mort(e) en 1980");
    expect(formatLifespan(null, null)).toBe("");
  });

  it("garde la mention pour une vie à cheval sur l'ère", () => {
    expect(formatLifespan(-4, 65)).toBe("4 av. J.-C.–65");
  });
});
