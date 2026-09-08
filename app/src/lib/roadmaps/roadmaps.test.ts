/**
 * Garde-fous des parcours de lecture.
 *
 * Ce fichier a changé de rôle. Il imposait auparavant que **tout** livre de la
 * bibliothèque appartienne à un parcours : une force qui poussait les livres
 * dedans, et qui a produit ce qu'on pouvait en attendre — un livre spécialisé
 * apparaissait en moyenne 1,06 fois, c'est-à-dire exactement une fois, parce
 * qu'il fallait bien le caser.
 *
 * Le critère est désormais la pertinence seule, et les tests deviennent une
 * force qui tient les livres **dehors** : un parcours doit avoir une colonne
 * vertébrale et ne pas se remplir d'ouvrages de niche. La couverture n'est plus
 * une exigence ; elle est mesurée par `scripts/parcours-metrics.ts`, et un
 * livre sans parcours est un résultat normal.
 */
import { describe, expect, it } from "vitest";
import { listBooks } from "@/lib/queries";
import { priorityIndex, priorityOf } from "@/lib/priorities/resolve";
import { ROADMAPS } from "./index";
import { resolveLibrary } from "./resolve";
import { ROADMAP_FAMILIES } from "./types";

const books = await listBooks();
const resolved = resolveLibrary(books);
const prios = priorityIndex();

/** Longueur minimale d'un chemin de lecture. En dessous, c'est une liste. */
const MIN_ENTREES = 8;
/** Sans ce socle de livres qui comptent, un parcours n'a pas de colonne vertébrale. */
const MIN_COLONNE_VERTEBRALE = 6;
/** Au-delà, le parcours se remplit d'ouvrages de niche. */
const MAX_PART_SPECIALISEE = 20;

/**
 * Parcours dont le sujet EST une littérature spécialisée : la règle ci-dessus
 * n'a pas de sens pour eux, et l'exception doit rester nommée, jamais implicite.
 */
const SPECIALISE_ASSUME = new Set(["le-mythe-arthurien"]);

/**
 * L'échelle de priorité est celle de la culture générale adulte : un album
 * illustré y est structurellement « complémentaire ». Ces parcours se jugent
 * sur leur propre axe.
 */
const HORS_ECHELLE_ADULTE = new Set([
  "lire-avec-les-tout-petits",
  "classiques-de-l-enfance",
]);

function stats(slug: string) {
  const items = resolved.itemsBySlug.get(slug) ?? [];
  let specialise = 0;
  let colonne = 0;
  for (const item of items) {
    const p = priorityOf(item.book, prios);
    if (p === "specialise") specialise++;
    if (p === "essentiel" || p === "important") colonne++;
  }
  return {
    n: items.length,
    specialise,
    colonne,
    partSpecialisee: items.length ? (specialise / items.length) * 100 : 0,
  };
}

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
        if (seen.has(item.book.id)) duplicates.push(`${slug} : « ${item.book.title} »`);
        seen.add(item.book.id);
      }
    }
    expect(duplicates).toEqual([]);
  });
});

describe("parcours — forme", () => {
  it("chaque parcours est assez long pour être un chemin", () => {
    const courts = ROADMAPS.map((r) => ({ slug: r.slug, ...stats(r.slug) }))
      .filter((s) => s.n < MIN_ENTREES)
      .map((s) => `${s.slug} : ${s.n} entrées`);
    expect(courts, `minimum ${MIN_ENTREES} entrées`).toEqual([]);
  });

  it("chaque parcours a une colonne vertébrale", () => {
    const sansSocle = ROADMAPS.filter((r) => !HORS_ECHELLE_ADULTE.has(r.slug))
      .map((r) => ({ slug: r.slug, ...stats(r.slug) }))
      .filter((s) => s.colonne < MIN_COLONNE_VERTEBRALE)
      .map((s) => `${s.slug} : ${s.colonne} livre(s) essentiel/important sur ${s.n}`);
    expect(
      sansSocle,
      `minimum ${MIN_COLONNE_VERTEBRALE} livres essentiels ou importants par parcours`
    ).toEqual([]);
  });

  it("aucun parcours ne se remplit d'ouvrages de niche", () => {
    const charges = ROADMAPS.filter(
      (r) => !SPECIALISE_ASSUME.has(r.slug) && !HORS_ECHELLE_ADULTE.has(r.slug)
    )
      .map((r) => ({ slug: r.slug, ...stats(r.slug) }))
      .filter((s) => s.partSpecialisee > MAX_PART_SPECIALISEE)
      .sort((a, b) => b.partSpecialisee - a.partSpecialisee)
      .map((s) => `${s.slug} : ${s.partSpecialisee.toFixed(0)} % (${s.specialise}/${s.n})`);
    expect(
      charges,
      `maximum ${MAX_PART_SPECIALISEE} % d'entrées spécialisées par parcours`
    ).toEqual([]);
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
    // Plancher relevé de 40 à 110 : le minimum réel du corpus était déjà 102,
    // l'ancien seuil ne protégeait donc plus rien.
    const faibles: string[] = [];
    for (const r of ROADMAPS) {
      for (const entry of r.entries) {
        if (entry.note.trim().length < 110) faibles.push(`${r.slug} : « ${entry.title} »`);
      }
    }
    expect(faibles).toEqual([]);
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
