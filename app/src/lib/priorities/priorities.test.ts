/**
 * Garde-fous des priorités de lecture.
 *
 * Le test de couverture est la contrepartie exécutable de l'exigence « chaque
 * livre porte une priorité » : sans lui, un livre ajouté à la bibliothèque
 * resterait indéfiniment sans rang, invisible au tri comme au filtre.
 *
 * Le test de calibration est le seul qui juge le fond : un premier rang qui
 * enfle cesse d'être une liste de lecture. Il ne remplace pas la relecture
 * éditoriale, il empêche seulement la dérive silencieuse.
 */
import { describe, expect, it } from "vitest";
import { listBooks } from "@/lib/queries";
import { PRIORITY_ENTRIES } from "./index";
import { priorityIndex, priorityOf, unresolvedEntries } from "./resolve";
import { PRIORITIES, type Priority } from "./types";

const books = await listBooks();
const index = priorityIndex();

/** Au-delà, le rang « Essentiel » ne se lit plus d'un trait et perd son usage. */
const PLAFOND_ESSENTIEL = 200;

describe("priorités — résolution", () => {
  it("chaque entrée correspond à un livre de la bibliothèque", () => {
    const details = unresolvedEntries(books).map(
      (e) => `« ${e.title} » — ${e.author}`
    );
    expect(details).toEqual([]);
  });

  it("aucun livre n'a deux priorités", () => {
    const vus = new Set<string>();
    const doublons: string[] = [];
    for (const e of PRIORITY_ENTRIES) {
      const cle = `${e.author}|${e.title}`;
      if (vus.has(cle)) doublons.push(cle);
      vus.add(cle);
    }
    expect(doublons).toEqual([]);
  });

  it("toutes les valeurs appartiennent à l'échelle", () => {
    const hors = PRIORITY_ENTRIES.filter(
      (e) => !(PRIORITIES as readonly string[]).includes(e.priority)
    ).map((e) => `${e.title} → ${e.priority}`);
    expect(hors).toEqual([]);
  });
});

describe("priorités — couverture", () => {
  it("tout livre de la bibliothèque porte une priorité", () => {
    const sans = books
      .filter((b) => priorityOf(b, index) === null)
      .map((b) => `${b.category} | ${b.author.name} | ${b.title}`);
    // Message d'échec utile : la liste des manquants sert de compteur.
    expect(
      sans,
      `${sans.length} livre(s) sans priorité sur ${books.length}`
    ).toEqual([]);
  });
});

describe("priorités — calibration", () => {
  it("le rang « Essentiel » reste une liste lisible d'un trait", () => {
    const n = books.filter((b) => priorityOf(b, index) === "essentiel").length;
    expect(
      n,
      `${n} livres en « Essentiel » : au-delà de ${PLAFOND_ESSENTIEL}, le rang ne trie plus rien`
    ).toBeLessThanOrEqual(PLAFOND_ESSENTIEL);
  });

  it("chaque rang de l'échelle est effectivement utilisé", () => {
    const vides = PRIORITIES.filter(
      (p: Priority) => !books.some((b) => priorityOf(b, index) === p)
    );
    // Tolère l'amorçage : tant qu'aucune priorité n'est posée, rien à vérifier.
    if (PRIORITY_ENTRIES.length === 0) return;
    expect(vides).toEqual([]);
  });
});
