/**
 * Résolution des priorités vers les livres de la bibliothèque.
 *
 * Même mécanique que les parcours : correspondance par nom d'auteur + titre
 * normalisés via normalizeKey(), la fonction qui dérive déjà
 * `nameNormalized` / `titleNormalized` au chargement. Jamais par id, pour que
 * le fichier reste lisible et relisible — cf. `roadmaps/resolve.ts`.
 */
import { normalizeKey } from "@/lib/normalize";
import { PRIORITY_ENTRIES } from "./index";
import type { Priority, PriorityEntry } from "./types";

function entryKey(author: string, title: string): string {
  return `${normalizeKey(author)}|${normalizeKey(title)}`;
}

let cached: Map<string, Priority> | null = null;

/**
 * Index « auteur|titre » → priorité. Construit une fois par processus : les
 * entrées sont statiques, contrairement aux livres qui viennent de la base.
 */
export function priorityIndex(): Map<string, Priority> {
  if (cached) return cached;
  const index = new Map<string, Priority>();
  for (const e of PRIORITY_ENTRIES) {
    index.set(entryKey(e.author, e.title), e.priority);
  }
  cached = index;
  return index;
}

/** Priorité d'un livre, ou null s'il n'a pas encore été jugé. */
export function priorityOf(
  book: { title: string; author: { name: string } },
  index = priorityIndex()
): Priority | null {
  return index.get(entryKey(book.author.name, book.title)) ?? null;
}

/** Entrées ne correspondant à aucun livre — signalées par le test. */
export function unresolvedEntries(
  books: { title: string; author: { name: string } }[]
): PriorityEntry[] {
  const present = new Set(books.map((b) => entryKey(b.author.name, b.title)));
  return PRIORITY_ENTRIES.filter((e) => !present.has(entryKey(e.author, e.title)));
}
