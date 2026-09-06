/**
 * Recherche transverse pour la palette de commandes (⌘K).
 *
 * Pourquoi une route plutôt que les données déjà chargées : la palette est
 * disponible partout, y compris sur les fiches, qui ne chargent ni les
 * 2 038 livres ni les 1 069 auteurs. Les envoyer au client à chaque page pour
 * une recherche occasionnelle coûterait plus cher que la requête elle-même.
 */
import { NextRequest, NextResponse } from "next/server";
import { asc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { authors, books } from "@/db/schema";
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
  const pattern = `%${key}%`;
  const prefix = `${key}%`;

  // Ce qui commence par la recherche passe devant : en tapant « 1984 » on veut
  // 1984, pas « 1984 revisité ». L'expression est répétée dans ORDER BY plutôt
  // que nommée : SQLite ne voit pas l'alias d'une colonne calculée depuis la
  // clause de tri.
  const titleStartsWith = sql<number>`case when ${books.titleNormalized} like ${prefix} then 0 else 1 end`;
  const nameStartsWith = sql<number>`case when ${authors.nameNormalized} like ${prefix} then 0 else 1 end`;

  const bookRows = db
    .select({ id: books.id, title: books.title, author: authors.name })
    .from(books)
    .innerJoin(authors, eq(books.authorId, authors.id))
    .where(or(like(books.titleNormalized, pattern), like(authors.nameNormalized, pattern)))
    .orderBy(titleStartsWith, asc(books.titleNormalized))
    .limit(LIMIT)
    .all();

  const authorRows = db
    .select({
      id: authors.id,
      name: authors.name,
      n: sql<number>`count(${books.id})`,
    })
    .from(authors)
    .leftJoin(books, eq(books.authorId, authors.id))
    .where(like(authors.nameNormalized, pattern))
    .groupBy(authors.id)
    .orderBy(nameStartsWith, asc(authors.nameNormalized))
    .limit(LIMIT)
    .all();

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
      hint: `${a.n} livre${a.n > 1 ? "s" : ""}`,
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
