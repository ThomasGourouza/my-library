import { and, asc, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  authors,
  books,
  type Author,
  type AuthorWithCount,
  type Book,
  type BookWithAuthor,
} from "@/db/schema";
import { normalizeKey } from "@/lib/normalize";
import { PERIODS, type BookQuery } from "@/lib/validation";

/** Ordre chronologique des périodes (les libellés en chiffres romains ne se
 *  trient pas correctement en alphabétique : XIXe viendrait avant XVIe). */
const periodRankSql = sql`case ${books.period} ${sql.join(
  PERIODS.map((p, i) => sql`when ${p} then ${i}`),
  sql` `
)} else ${PERIODS.length} end`;

/**
 * Liste des livres avec leur auteur, filtrée/triée côté SQL.
 * Recherche insensible aux accents via les colonnes *Normalized.
 */
export function listBooks(filters: BookQuery = {}): BookWithAuthor[] {
  const conds: SQL[] = [];
  if (filters.search) {
    const k = `%${normalizeKey(filters.search)}%`;
    conds.push(
      or(like(books.titleNormalized, k), like(authors.nameNormalized, k))!
    );
  }
  if (filters.category) conds.push(eq(books.category, filters.category));
  if (filters.genre) conds.push(eq(books.genre, filters.genre));
  if (filters.courant) conds.push(eq(books.courant, filters.courant));
  if (filters.period) conds.push(eq(books.period, filters.period));
  if (filters.audience) conds.push(eq(books.audience, filters.audience));
  if (filters.worldview) conds.push(eq(books.worldview, filters.worldview));
  if (filters.authorId) conds.push(eq(books.authorId, filters.authorId));

  const dir = filters.dir === "desc" ? desc : asc;
  const orderCols = {
    title: books.titleNormalized,
    author: authors.nameNormalized,
    period: periodRankSql,
    publicationYear: books.publicationYear,
    createdAt: books.createdAt,
  } as const;
  const orderCol = orderCols[filters.sort ?? "title"];

  const rows = db
    .select({ book: books, author: authors })
    .from(books)
    .innerJoin(authors, eq(books.authorId, authors.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(dir(orderCol), asc(books.titleNormalized))
    .all();
  return rows.map((r) => ({ ...r.book, author: r.author }));
}

export function getBook(id: number): BookWithAuthor | undefined {
  const row = db
    .select({ book: books, author: authors })
    .from(books)
    .innerJoin(authors, eq(books.authorId, authors.id))
    .where(eq(books.id, id))
    .get();
  return row ? { ...row.book, author: row.author } : undefined;
}

export interface AuthorFilters {
  search?: string;
  mainField?: string;
  mainGenre?: string;
  period?: string;
  nationality?: string;
  language?: string;
}

export function listAuthors(filters: AuthorFilters = {}): AuthorWithCount[] {
  const conds: SQL[] = [];
  if (filters.search)
    conds.push(like(authors.nameNormalized, `%${normalizeKey(filters.search)}%`));
  if (filters.mainField) conds.push(eq(authors.mainField, filters.mainField));
  if (filters.mainGenre) conds.push(eq(authors.mainGenre, filters.mainGenre));
  if (filters.period) conds.push(eq(authors.period, filters.period));
  if (filters.nationality) conds.push(eq(authors.nationality, filters.nationality));
  if (filters.language) conds.push(eq(authors.language, filters.language));

  const rows = db
    .select({
      author: authors,
      bookCount: sql<number>`count(${books.id})`.as("book_count"),
    })
    .from(authors)
    .leftJoin(books, eq(books.authorId, authors.id))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(authors.id)
    .orderBy(asc(authors.nameNormalized))
    .all();
  return rows.map((r) => ({ ...r.author, bookCount: r.bookCount }));
}

export function getAuthor(
  id: number
): (Author & { books: Book[] }) | undefined {
  const author = db.select().from(authors).where(eq(authors.id, id)).get();
  if (!author) return undefined;
  const authorBooks = db
    .select()
    .from(books)
    .where(eq(books.authorId, id))
    .orderBy(asc(books.titleNormalized))
    .all();
  return { ...author, books: authorBooks };
}

export function countBooksByAuthor(authorId: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(books)
    .where(eq(books.authorId, authorId))
    .get();
  return row?.n ?? 0;
}

/** Valeurs distinctes pour alimenter les popovers de filtres. */
export function getFilterOptions(): {
  genres: string[];
  courants: string[];
  themes: string[];
  nationalities: string[];
  languages: string[];
  mainFields: string[];
  mainGenres: string[];
} {
  const distinct = (col: SQL<string | null>, table: typeof books | typeof authors) =>
    db
      .selectDistinct({ v: col })
      .from(table)
      .all()
      .map((r) => r.v)
      .filter((v): v is string => v != null && v !== "")
      .sort((a, b) => a.localeCompare(b, "fr"));
  return {
    genres: distinct(sql`${books.genre}`, books),
    courants: distinct(sql`${books.courant}`, books),
    themes: distinct(sql`${books.theme}`, books),
    nationalities: distinct(sql`${authors.nationality}`, authors),
    languages: distinct(sql`${authors.language}`, authors),
    mainFields: distinct(sql`${authors.mainField}`, authors),
    mainGenres: distinct(sql`${authors.mainGenre}`, authors),
  };
}
