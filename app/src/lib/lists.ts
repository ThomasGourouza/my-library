/**
 * Listes de lecture personnelles : lecture et écriture.
 *
 * Distinction à garder en tête : les **parcours** sont du contenu éditorial
 * rédigé, versionné dans `src/lib/roadmaps/data/` et tenu par des tests ; les
 * **listes** sont composées par l'utilisateur depuis l'interface et vivent en
 * base. Aucun écran ne modifie les premiers, tous les écrans peuvent modifier
 * les secondes — c'est la raison d'être de cette séparation.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  authors,
  books,
  listItems,
  lists,
  type BookWithAuthor,
  type List,
} from "@/db/schema";
import { normalizeKey, normalizeText } from "@/lib/normalize";

export const listInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(120),
  description: z.string().trim().max(2000).nullish(),
});
export type ListInput = z.infer<typeof listInputSchema>;

export type ListSummary = List & { bookCount: number; readCount: number };

export interface ListEntry {
  position: number;
  book: BookWithAuthor;
  note: string | null;
}

export type ListWithItems = List & { items: ListEntry[] };

export function listLists(): ListSummary[] {
  const rows = db
    .select({
      list: lists,
      bookCount: sql<number>`count(${listItems.id})`,
      readCount: sql<number>`sum(case when ${books.read} then 1 else 0 end)`,
    })
    .from(lists)
    .leftJoin(listItems, eq(listItems.listId, lists.id))
    .leftJoin(books, eq(books.id, listItems.bookId))
    .groupBy(lists.id)
    .orderBy(asc(lists.nameNormalized))
    .all();
  return rows.map((r) => ({
    ...r.list,
    bookCount: r.bookCount,
    // sum() sur une liste vide renvoie NULL, pas 0.
    readCount: r.readCount ?? 0,
  }));
}

export function getList(id: number): ListWithItems | undefined {
  const list = db.select().from(lists).where(eq(lists.id, id)).get();
  if (!list) return undefined;
  const rows = db
    .select({ item: listItems, book: books, author: authors })
    .from(listItems)
    .innerJoin(books, eq(books.id, listItems.bookId))
    .innerJoin(authors, eq(authors.id, books.authorId))
    .where(eq(listItems.listId, id))
    .orderBy(asc(listItems.position))
    .all();
  return {
    ...list,
    // La position stockée peut avoir des trous (suppressions) : on renumérote à
    // l'affichage pour que « n°3 » veuille toujours dire « le troisième ».
    items: rows.map((r, i) => ({
      position: i + 1,
      book: { ...r.book, author: r.author },
      note: r.item.note,
    })),
  };
}

/** Listes contenant un livre donné — affiché sur la fiche du livre. */
export function getListsForBook(bookId: number): List[] {
  return db
    .select({ list: lists })
    .from(listItems)
    .innerJoin(lists, eq(lists.id, listItems.listId))
    .where(eq(listItems.bookId, bookId))
    .orderBy(asc(lists.nameNormalized))
    .all()
    .map((r) => r.list);
}

export function createList(input: ListInput): List {
  const name = normalizeText(input.name);
  return db
    .insert(lists)
    .values({
      name,
      nameNormalized: normalizeKey(name),
      description: input.description ?? null,
    })
    .returning()
    .get();
}

export function updateList(id: number, input: Partial<ListInput>): List | undefined {
  const values: Partial<typeof lists.$inferInsert> = {
    updatedAt: sql`(datetime('now'))` as unknown as string,
  };
  if (input.name !== undefined) {
    const name = normalizeText(input.name);
    values.name = name;
    values.nameNormalized = normalizeKey(name);
  }
  if (input.description !== undefined) {
    values.description = input.description ?? null;
  }
  return db.update(lists).set(values).where(eq(lists.id, id)).returning().get();
}

export function deleteList(id: number): boolean {
  // ON DELETE CASCADE emporte les entrées ; le pragma foreign_keys est actif.
  return db.delete(lists).where(eq(lists.id, id)).returning({ id: lists.id }).all()
    .length > 0;
}

/** Ajoute un livre en fin de liste. Sans effet s'il y est déjà. */
export function addBookToList(listId: number, bookId: number): boolean {
  const existing = db
    .select({ id: listItems.id })
    .from(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.bookId, bookId)))
    .get();
  if (existing) return false;
  const last =
    db
      .select({ n: sql<number>`coalesce(max(${listItems.position}), 0)` })
      .from(listItems)
      .where(eq(listItems.listId, listId))
      .get()?.n ?? 0;
  db.insert(listItems)
    .values({ listId, bookId, position: last + 1 })
    .run();
  touch(listId);
  return true;
}

export function removeBookFromList(listId: number, bookId: number): boolean {
  const removed = db
    .delete(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.bookId, bookId)))
    .returning({ id: listItems.id })
    .all();
  if (removed.length > 0) touch(listId);
  return removed.length > 0;
}

/**
 * Déplace un livre d'un cran. Renumérote toute la liste dans la foulée : c'est
 * une poignée de lignes, et cela garantit qu'aucun trou ne s'accumule.
 */
export function moveBookInList(
  listId: number,
  bookId: number,
  direction: "up" | "down"
): boolean {
  const rows = db
    .select({ id: listItems.id, bookId: listItems.bookId })
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.position))
    .all();
  const index = rows.findIndex((r) => r.bookId === bookId);
  if (index === -1) return false;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return false;

  const reordered = [...rows];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  db.transaction((tx) => {
    reordered.forEach((row, i) => {
      tx.update(listItems)
        .set({ position: i + 1 })
        .where(eq(listItems.id, row.id))
        .run();
    });
  });
  touch(listId);
  return true;
}

function touch(listId: number): void {
  db.update(lists)
    .set({ updatedAt: sql`(datetime('now'))` as unknown as string })
    .where(eq(lists.id, listId))
    .run();
}
