/**
 * Garde-fous des parcours de lecture.
 *
 * Le test de couverture est la contrepartie exécutable de l'exigence « tout
 * livre appartient à au moins un parcours » : sans lui, un livre ajouté à la
 * bibliothèque disparaîtrait silencieusement de la navigation par parcours.
 *
 * Le test de résolution attrape les fautes de frappe sur les titres et les noms
 * d'auteur, invisibles autrement : une entrée qui ne correspond à rien est
 * simplement ignorée à l'affichage.
 */
import { describe, expect, it } from "vitest";
import { listBooks } from "@/lib/queries";
import { ROADMAPS } from "./index";
import { resolveLibrary } from "./resolve";
import { ROADMAP_FAMILIES } from "./types";

const books = listBooks();
const resolved = resolveLibrary(books);

describe("parcours — résolution", () => {
  it("chaque entrée correspond à un livre de la bibliothèque", () => {
    const details = resolved.unresolved.map(
      ({ slug, entry }) => `${slug} : « ${entry.title} » — ${entry.author}`
    );
    expect(details).toEqual([]);
  });

  it("aucun livre n'apparaît deux fois dans le même parcours", () => {
    const duplicates: string[] = [];
    for (const [slug, items] of resolved.itemsBySlug) {
      const seen = new Set<number>();
      for (const item of items) {
        if (seen.has(item.book.id)) {
          duplicates.push(`${slug} : « ${item.book.title} »`);
        }
        seen.add(item.book.id);
      }
    }
    expect(duplicates).toEqual([]);
  });
});

describe("parcours — couverture", () => {
  it("tout livre de la bibliothèque appartient à au moins un parcours", () => {
    const uncovered = books
      .filter((book) => !resolved.refsByBookId.has(book.id))
      .map((book) => `${book.category} | ${book.author.name} | ${book.title}`);
    // Message d'échec utile : on liste les manquants, pas juste un compte.
    expect(
      uncovered,
      `${uncovered.length} livre(s) sans parcours sur ${books.length}`
    ).toEqual([]);
  });

  it("aucun parcours n'est vide", () => {
    const empty = ROADMAPS.filter(
      (r) => (resolved.itemsBySlug.get(r.slug)?.length ?? 0) === 0
    ).map((r) => r.slug);
    expect(empty).toEqual([]);
  });
});

describe("parcours — intégrité", () => {
  it("les slugs sont uniques et utilisables en URL", () => {
    const slugs = ROADMAPS.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug, `slug invalide : ${slug}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("chaque parcours est complètement renseigné", () => {
    for (const r of ROADMAPS) {
      expect(r.title.trim(), r.slug).not.toBe("");
      expect(r.goal.trim(), r.slug).not.toBe("");
      expect(r.description.length, `${r.slug} : description trop courte`).toBeGreaterThan(80);
      expect(ROADMAP_FAMILIES, r.slug).toContain(r.family);
      expect(r.minAge, r.slug).toBeGreaterThanOrEqual(0);
      expect(r.ageLabel, `${r.slug} : ageLabel doit citer minAge`).toMatch(
        new RegExp(`\\b${r.minAge}\\b`)
      );
    }
  });

  it("chaque livre est justifié par une note propre", () => {
    const weak: string[] = [];
    for (const r of ROADMAPS) {
      for (const entry of r.entries) {
        // Une note trop courte est du remplissage : on l'interdit.
        if (entry.note.trim().length < 40) {
          weak.push(`${r.slug} : « ${entry.title} »`);
        }
      }
    }
    expect(weak).toEqual([]);
  });

  it("les notes ne sont pas copiées d'un livre à l'autre", () => {
    const seen = new Map<string, string>();
    const repeats: string[] = [];
    for (const r of ROADMAPS) {
      for (const entry of r.entries) {
        const key = entry.note.trim().toLowerCase();
        const previous = seen.get(key);
        if (previous) repeats.push(`${previous} ≡ ${r.slug} : « ${entry.title} »`);
        else seen.set(key, `${r.slug} : « ${entry.title} »`);
      }
    }
    expect(repeats).toEqual([]);
  });
});
