/**
 * Recherche transverse pour la palette de commandes (⌘K).
 *
 * Pourquoi une route plutôt que les données déjà chargées : la palette est
 * disponible partout, y compris sur les fiches, qui ne chargent ni les
 * 2 038 livres ni les 1 069 auteurs. Les envoyer au client à chaque page pour
 * une recherche occasionnelle coûterait plus cher que la requête elle-même.
 */
import { NextRequest, NextResponse } from "next/server";
import { searchAuthors, searchBooks } from "@/lib/queries";
import { normalizeKey } from "@/lib/normalize";
import { ROADMAPS } from "@/lib/roadmaps/index";
import { FAMILY_LABELS } from "@/lib/roadmaps/types";

/** Assez pour reconnaître ce qu'on cherche, assez court pour rester lisible. */
const LIMIT = 6;

export interface SearchHit {
  id: string;
  label: string;
  hint: string;
  href: string;
}

export interface SearchResults {
  books: SearchHit[];
  authors: SearchHit[];
  roadmaps: SearchHit[];
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q") ?? "";
  const key = normalizeKey(raw);
  if (key.length < 2) {
    return NextResponse.json({
      books: [],
      authors: [],
      roadmaps: [],
    } satisfies SearchResults);
  }
  // Deux lectures du magasin, un seul aller-retour : la seconde est servie
  // depuis la mémoire par le plancher de fraîcheur (cf. `@/lib/store`).
  const bookRows = await searchBooks(key, LIMIT);
  const authorRows = await searchAuthors(key, LIMIT);

  // Les parcours vivent dans des fichiers, pas en base : filtrés en mémoire.
  const roadmapHits = ROADMAPS.filter(
    (r) =>
      normalizeKey(r.title).includes(key) || normalizeKey(r.goal).includes(key)
  ).slice(0, LIMIT);

  return NextResponse.json({
    books: bookRows.map((b) => ({
      id: `book-${b.id}`,
      label: b.title,
      hint: b.author,
      href: `/livres/${b.id}`,
    })),
    authors: authorRows.map((a) => ({
      id: `author-${a.id}`,
      label: a.name,
      hint: `${a.bookCount} livre${a.bookCount > 1 ? "s" : ""}`,
      href: `/auteurs/${a.id}`,
    })),
    roadmaps: roadmapHits.map((r) => ({
      id: `roadmap-${r.slug}`,
      label: r.title,
      hint: FAMILY_LABELS[r.family],
      href: `/parcours/${r.slug}`,
    })),
  } satisfies SearchResults);
}
