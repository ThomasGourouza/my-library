import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const authors = sqliteTable(
  "authors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // clé de dédup + recherche : minuscules, sans accents (normalizeKey)
    nameNormalized: text("name_normalized").notNull(),
    // années négatives = av. J.-C.
    birthYear: integer("birth_year"),
    deathYear: integer("death_year"),
    nationality: text("nationality"),
    language: text("language"),
    mainGenre: text("main_genre"),
    mainField: text("main_field"),
    period: text("period"),
    notes: text("notes"),
    // générés par « Analyse Claude »
    bio: text("bio"),
    bioGeneratedAt: text("bio_generated_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("authors_name_normalized_unique").on(t.nameNormalized)]
);

export const books = sqliteTable(
  "books",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    titleNormalized: text("title_normalized").notNull(),
    // NOT NULL : les œuvres anonymes reçoivent un auteur dédié
    // (« Homère », « Anonyme (œuvre médiévale) », …)
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id),
    category: text("category").notNull(),
    genre: text("genre"),
    courant: text("courant"),
    theme: text("theme"),
    period: text("period"),
    publicationYear: integer("publication_year"),
    audience: text("audience").notNull().default("adultes"),
    originalLanguage: text("original_language"),
    notes: text("notes"),
    // générés par « Analyse Claude »
    summary: text("summary"),
    analysis: text("analysis"),
    analysisGeneratedAt: text("analysis_generated_at"),
    // true = ajouté depuis les connaissances du modèle (ligne auteur-seul)
    enriched: integer("enriched", { mode: "boolean" }).notNull().default(false),
    // Coché par l'utilisateur. Absent des fichiers de seed : c'est de l'état
    // personnel, sauvegardé et restauré autour de db:seed par
    // src/db/generated-content.ts, comme les analyses.
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("books_title_author_unique").on(t.titleNormalized, t.authorId),
    index("books_author_idx").on(t.authorId),
    index("books_category_idx").on(t.category),
    index("books_period_idx").on(t.period),
    index("books_audience_idx").on(t.audience),
  ]
);

/**
 * Listes de lecture personnelles.
 *
 * À ne pas confondre avec les parcours (`src/lib/roadmaps/`), qui sont du
 * contenu éditorial rédigé, versionné et tenu par des tests. Une liste est ce
 * que l'utilisateur compose lui-même depuis l'interface : « à lire cet été »,
 * « offerts », « à relire ». Elle vit en base parce qu'elle change souvent et
 * ne regarde que lui.
 *
 * Comme la case « Lu » et les analyses, les listes ne sont pas dans les
 * fichiers de seed : elles sont sauvegardées et restaurées autour d'un reseed
 * par src/db/generated-content.ts, par clé naturelle.
 */
export const lists = sqliteTable(
  "lists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Deux listes du même nom aux accents près sont la même liste.
    nameNormalized: text("name_normalized").notNull(),
    description: text("description"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("lists_name_normalized_unique").on(t.nameNormalized)]
);

export const listItems = sqliteTable(
  "list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    // Rang dans la liste, à partir de 1. Une liste est un ordre, pas un sac.
    position: integer("position").notNull(),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("list_items_list_book_unique").on(t.listId, t.bookId),
    index("list_items_list_idx").on(t.listId),
  ]
);

export const analysisJobs = sqliteTable("analysis_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // running | done | error
  error: text("error"),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  finishedAt: text("finished_at"),
});

export type Author = typeof authors.$inferSelect;
export type NewAuthor = typeof authors.$inferInsert;
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type ListItem = typeof listItems.$inferSelect;

export type BookWithAuthor = Book & { author: Author };
export type AuthorWithCount = Author & { bookCount: number };
