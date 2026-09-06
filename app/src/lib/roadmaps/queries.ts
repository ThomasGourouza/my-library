/**
 * Accès aux parcours pour les pages. Même style que `@/lib/queries` :
 * fonctions synchrones (better-sqlite3 l'est), types de retour explicites.
 */
import type { BookWithAuthor } from "@/db/schema";
import { listBooks } from "@/lib/queries";
import { priorityIndex, priorityOf } from "@/lib/priorities/resolve";
import type { Priority } from "@/lib/priorities/types";
import { ROADMAPS, getRoadmap } from "./index";
import { resolveLibrary, type RoadmapItem, type RoadmapRef } from "./resolve";
import type { Roadmap } from "./types";

export type { RoadmapItem, RoadmapRef };

/**
 * Un parcours tel qu'affiché dans la liste : sans les entrées, avec le nombre
 * de livres et combien sont lus. La progression est ce qui répond à « où j'en
 * suis » sans ouvrir les 53 parcours un par un.
 */
export type RoadmapSummary = Omit<Roadmap, "entries"> & {
  bookCount: number;
  readCount: number;
};

/** Champs repris explicitement : ajouter un champ à Roadmap force à décider
 *  ici s'il doit remonter jusqu'aux pages. */
function withoutEntries(r: Roadmap): Omit<Roadmap, "entries"> {
  return {
    slug: r.slug,
    title: r.title,
    goal: r.goal,
    description: r.description,
    ageLabel: r.ageLabel,
    minAge: r.minAge,
    family: r.family,
  };
}

export function listRoadmaps(): RoadmapSummary[] {
  const { itemsBySlug } = resolveLibrary();
  return ROADMAPS.map((roadmap) => {
    const items = itemsBySlug.get(roadmap.slug) ?? [];
    return {
      ...withoutEntries(roadmap),
      bookCount: items.length,
      readCount: items.filter((i) => i.book.read).length,
    };
  });
}

/** Un parcours et ses livres, dans l'ordre de lecture. */
export function getRoadmapBySlug(
  slug: string
): (Omit<Roadmap, "entries"> & { items: RoadmapItem[] }) | undefined {
  const roadmap = getRoadmap(slug);
  if (!roadmap) return undefined;
  const { itemsBySlug } = resolveLibrary();
  return { ...withoutEntries(roadmap), items: itemsBySlug.get(slug) ?? [] };
}

/** Les parcours qui contiennent un livre donné (fiche livre). */
export function getRoadmapsForBook(bookId: number): RoadmapRef[] {
  return resolveLibrary().refsByBookId.get(bookId) ?? [];
}

/** Un livre augmenté de ses parcours et de sa priorité — alimente les colonnes
 *  « Parcours » et « Priorité » du tableau. */
export type BookWithRoadmaps = BookWithAuthor & {
  roadmaps: RoadmapRef[];
  priority: Priority | null;
};

/**
 * Tous les livres avec leurs parcours. Une seule lecture de la base et un seul
 * index partagé, au lieu d'une résolution par livre.
 */
export function listBooksWithRoadmaps(): BookWithRoadmaps[] {
  const books = listBooks();
  const { refsByBookId } = resolveLibrary(books);
  const priorities = priorityIndex();
  return books.map((book) => ({
    ...book,
    roadmaps: refsByBookId.get(book.id) ?? [],
    priority: priorityOf(book, priorities),
  }));
}
