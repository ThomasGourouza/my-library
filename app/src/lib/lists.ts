/**
 * Listes de lecture personnelles : lecture et écriture.
 *
 * Distinction à garder en tête : les **parcours** sont du contenu éditorial
 * rédigé, versionné dans `src/lib/roadmaps/data/` et tenu par des tests ; les
 * **listes** sont composées par l'utilisateur depuis l'interface. Aucun écran
 * ne modifie les premiers, tous les écrans peuvent modifier les secondes —
 * c'est la raison d'être de cette séparation.
 *
 * Les entrées d'une liste sont imbriquées dans la liste, et l'ordre du tableau
 * *est* le rang : il n'y a plus de colonne `position` à renuméroter, ni de
 * cascade à écrire quand une liste disparaît.
 */
import { z } from "zod";
import { DuplicateError, cmp, mutate, nextId, now, store } from "@/lib/store";
import type { BookWithAuthor, ListMeta } from "@/lib/types";
import { normalizeKey, normalizeText } from "@/lib/normalize";

export const listInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(120),
  description: z.string().trim().max(2000).nullish(),
});
export type ListInput = z.infer<typeof listInputSchema>;

export type ListSummary = ListMeta & { bookCount: number; readCount: number };

export interface ListEntry {
  position: number;
  book: BookWithAuthor;
  note: string | null;
}

export type ListWithItems = ListMeta & { items: ListEntry[] };

/** La liste sans ses entrées : ce que renvoient les vues de synthèse. */
const meta = (l: ListMeta & { items?: unknown }): ListMeta => ({
  id: l.id,
  name: l.name,
  nameNormalized: l.nameNormalized,
  description: l.description,
  createdAt: l.createdAt,
});

export function listLists(): ListSummary[] {
  const s = store();
  const readById = new Map(s.books.map((b) => [b.id, b.read]));
  return s.lists
    .map((l) => ({
      ...meta(l),
      bookCount: l.items.length,
      // Un comptage, donc 0 et jamais undefined : le `?? 0` qu'imposait le
      // `sum()` SQL (NULL sur un ensemble vide) n'a plus de raison d'être.
      readCount: l.items.filter((it) => readById.get(it.bookId) === true).length,
    }))
    .sort((a, b) => cmp(a.nameNormalized, b.nameNormalized));
}

export function getList(id: number): ListWithItems | undefined {
  const s = store();
  const list = s.lists.find((l) => l.id === id);
  if (!list) return undefined;
  const authorsById = new Map(s.authors.map((a) => [a.id, a]));
  const booksById = new Map(s.books.map((b) => [b.id, b]));
  return {
    ...meta(list),
    items: list.items.flatMap((it, i) => {
      const book = booksById.get(it.bookId);
      // Une entrée dont le livre a disparu est ignorée — ce que faisait
      // l'INNER JOIN. Cela peut arriver après une fusion git où le livre
      // n'existe que sur l'autre branche.
      if (!book) return [];
      return [
        {
          position: i + 1,
          book: { ...book, author: authorsById.get(book.authorId)! },
          note: it.note,
        },
      ];
    }),
  };
}

/** Listes contenant un livre donné — affiché sur la fiche du livre. */
export function getListsForBook(bookId: number): ListMeta[] {
  return store()
    .lists.filter((l) => l.items.some((it) => it.bookId === bookId))
    .map(meta)
    .sort((a, b) => cmp(a.nameNormalized, b.nameNormalized));
}

export function createList(input: ListInput): ListMeta {
  return mutate((s) => {
    const name = normalizeText(input.name);
    const nameNormalized = normalizeKey(name);
    // Deux listes du même nom aux accents près sont la même liste. La
    // vérification était portée par l'index unique SQL, elle est ici
    // maintenant : c'est la seule garantie que le refactor déplace vraiment.
    if (s.lists.some((l) => l.nameNormalized === nameNormalized)) {
      throw new DuplicateError("Une liste porte déjà ce nom");
    }
    const list = {
      id: nextId(s.lists),
      name,
      nameNormalized,
      description: input.description ?? null,
      createdAt: now(),
      items: [],
    };
    s.lists.push(list);
    return meta(list);
  });
}

export function updateList(
  id: number,
  input: Partial<ListInput>
): ListMeta | undefined {
  return mutate((s) => {
    const list = s.lists.find((l) => l.id === id);
    if (!list) return undefined;
    if (input.name !== undefined) {
      const name = normalizeText(input.name);
      const nameNormalized = normalizeKey(name);
      if (s.lists.some((l) => l.id !== id && l.nameNormalized === nameNormalized)) {
        throw new DuplicateError("Une liste porte déjà ce nom");
      }
      list.name = name;
      list.nameNormalized = nameNormalized;
    }
    if (input.description !== undefined) {
      list.description = input.description ?? null;
    }
    return meta(list);
  });
}

export function deleteList(id: number): boolean {
  return mutate((s) => {
    const i = s.lists.findIndex((l) => l.id === id);
    if (i === -1) return false;
    // Les entrées sont imbriquées : elles partent avec la liste, sans cascade.
    s.lists.splice(i, 1);
    return true;
  });
}

/** Ajoute un livre en fin de liste. Sans effet s'il y est déjà. */
export function addBookToList(listId: number, bookId: number): boolean {
  return mutate((s) => {
    const list = s.lists.find((l) => l.id === listId);
    if (!list) return false;
    if (list.items.some((it) => it.bookId === bookId)) return false;
    list.items.push({ bookId, note: null, createdAt: now() });
    return true;
  });
}

export function removeBookFromList(listId: number, bookId: number): boolean {
  return mutate((s) => {
    const list = s.lists.find((l) => l.id === listId);
    if (!list) return false;
    const i = list.items.findIndex((it) => it.bookId === bookId);
    if (i === -1) return false;
    list.items.splice(i, 1);
    return true;
  });
}

/** Déplace un livre d'un cran. L'ordre du tableau porte le rang : il n'y a
 *  rien à renuméroter, et donc plus de trous à rattraper. */
export function moveBookInList(
  listId: number,
  bookId: number,
  direction: "up" | "down"
): boolean {
  return mutate((s) => {
    const list = s.lists.find((l) => l.id === listId);
    if (!list) return false;
    const i = list.items.findIndex((it) => it.bookId === bookId);
    if (i === -1) return false;
    const target = direction === "up" ? i - 1 : i + 1;
    if (target < 0 || target >= list.items.length) return false;
    [list.items[i], list.items[target]] = [list.items[target], list.items[i]];
    return true;
  });
}
