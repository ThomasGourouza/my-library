/**
 * Données du tableau de bord.
 *
 * Une seule lecture de la base et une seule résolution des parcours : tout ce
 * que la page affiche se déduit de `listBooksWithRoadmaps()`, qui porte déjà
 * l'auteur, les parcours et la priorité de chaque livre.
 *
 * Règle tenue partout ici : ne rien afficher qui n'existe pas. Tant qu'aucun
 * livre n'est marqué « Lu », les compteurs affichent zéro plutôt qu'un
 * indicateur inventé, et la page met en avant les points d'entrée.
 */
import { db } from "@/db";
import { authors, books as booksTable } from "@/db/schema";
import { sql } from "drizzle-orm";
import { CATEGORIES, type Category } from "@/lib/validation";
import { PRIORITIES, type Priority } from "@/lib/priorities/types";
import { listRoadmaps, listBooksWithRoadmaps } from "@/lib/roadmaps/queries";
import type { BookWithRoadmaps } from "@/lib/roadmaps/queries";
import type { RoadmapSummary } from "@/lib/roadmaps/queries";

export interface Repartition<T extends string> {
  key: T;
  total: number;
  read: number;
}

export interface DashboardBook {
  id: number;
  title: string;
  authorId: number;
  authorName: string;
  roadmapCount: number;
}

export interface Dashboard {
  totals: {
    books: number;
    authors: number;
    read: number;
    roadmaps: number;
    roadmapEntries: number;
    withoutRoadmap: number;
    analysed: number;
  };
  byPriority: Repartition<Priority>[];
  /** Livres sans priorité : le test de couverture doit les maintenir à zéro. */
  withoutPriority: number;
  byCategory: Repartition<Category>[];
  /** Parcours entamés mais non terminés, le plus avancé d'abord. */
  inProgress: RoadmapSummary[];
  /** Suggestions de départ : les parcours les plus courts non entamés. */
  toStart: RoadmapSummary[];
  /** Essentiels non lus, les plus centraux d'abord. */
  nextEssentials: DashboardBook[];
  /** Livres portant une analyse Claude, la plus récente d'abord. */
  analysed: DashboardBook[];
}

const SUGGESTIONS = 4;
const NEXT_ESSENTIALS = 8;

function toDashboardBook(book: BookWithRoadmaps): DashboardBook {
  return {
    id: book.id,
    title: book.title,
    authorId: book.author.id,
    authorName: book.author.name,
    roadmapCount: book.roadmaps.length,
  };
}

function tally<T extends string>(
  keys: readonly T[],
  books: BookWithRoadmaps[],
  keyOf: (b: BookWithRoadmaps) => string | null
): Repartition<T>[] {
  const index = new Map<string, Repartition<T>>(
    keys.map((k) => [k, { key: k, total: 0, read: 0 }])
  );
  for (const book of books) {
    const entry = index.get(keyOf(book) ?? "");
    if (!entry) continue;
    entry.total++;
    if (book.read) entry.read++;
  }
  return keys.map((k) => index.get(k)!);
}

export function getDashboard(): Dashboard {
  const books = listBooksWithRoadmaps();
  const roadmaps = listRoadmaps();

  const authorCount =
    db.select({ n: sql<number>`count(*)` }).from(authors).get()?.n ?? 0;
  const analysedCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(booksTable)
      .where(sql`${booksTable.analysis} is not null`)
      .get()?.n ?? 0;

  const analysed = books
    .filter((b) => b.analysis != null)
    .sort((a, b) =>
      (b.analysisGeneratedAt ?? "").localeCompare(a.analysisGeneratedAt ?? "")
    )
    .map(toDashboardBook);

  // Les plus centraux d'abord : un essentiel cité par cinq parcours est plus
  // souvent le point de passage qu'un essentiel isolé. À nombre égal, l'ordre
  // alphabétique — jamais l'aléatoire, pour que la page ne change pas d'avis
  // entre deux rafraîchissements.
  const nextEssentials = books
    .filter((b) => b.priority === "essentiel" && !b.read)
    .sort(
      (a, b) =>
        b.roadmaps.length - a.roadmaps.length ||
        a.titleNormalized.localeCompare(b.titleNormalized, "fr")
    )
    .slice(0, NEXT_ESSENTIALS)
    .map(toDashboardBook);

  const started = roadmaps.filter(
    (r) => r.readCount > 0 && r.readCount < r.bookCount
  );
  started.sort(
    (a, b) => b.readCount / b.bookCount - a.readCount / a.bookCount
  );

  // Le plus court chemin d'abord : quand rien n'est commencé, le parcours qu'on
  // a une chance de finir vaut mieux que le plus prestigieux.
  const toStart = roadmaps
    .filter((r) => r.readCount === 0 && r.bookCount > 0)
    .sort((a, b) => a.bookCount - b.bookCount || a.title.localeCompare(b.title, "fr"))
    .slice(0, SUGGESTIONS);

  return {
    totals: {
      books: books.length,
      authors: authorCount,
      read: books.filter((b) => b.read).length,
      roadmaps: roadmaps.length,
      roadmapEntries: roadmaps.reduce((n, r) => n + r.bookCount, 0),
      withoutRoadmap: books.filter((b) => b.roadmaps.length === 0).length,
      analysed: analysedCount,
    },
    byPriority: tally(PRIORITIES, books, (b) => b.priority),
    withoutPriority: books.filter((b) => b.priority == null).length,
    byCategory: tally(CATEGORIES, books, (b) => b.category),
    inProgress: started.slice(0, SUGGESTIONS),
    toStart,
    nextEssentials,
    analysed,
  };
}
