/**
 * Accès aux parcours pour les pages. Même style que `@/lib/queries` : types de
 * retour explicites, et lecture asynchrone depuis que la source de données peut
 * être distante (cf. `@/lib/store`).
 *
 * Deux niveaux, et la distinction compte pour l'accueil. Les fonctions
 * `listRoadmaps` / `listBooksWithRoadmaps` lisent la bibliothèque **et** la
 * résolvent : parfaites pour une page qui n'a besoin que de l'une des deux. La
 * page d'accueil a besoin des deux, et les enchaîner indexerait 2 038 livres
 * deux fois — elle passe donc par `roadmapSummaries` / `booksWithRoadmaps`, qui
 * partagent une résolution unique.
 */
import type { BookWithAuthor } from "@/lib/types";
import { listBooks } from "@/lib/queries";
import { priorityIndex, priorityOf } from "@/lib/priorities/resolve";
import type { Priority } from "@/lib/priorities/types";
import { ROADMAPS, getRoadmap } from "./index";
import {
  resolveLibrary,
  type ResolvedLibrary,
  type RoadmapItem,
  type RoadmapRef,
} from "./resolve";
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

/** Un livre augmenté de ses parcours et de sa priorité — alimente les colonnes
 *  « Parcours » et « Priorité » du tableau. */
export type BookWithRoadmaps = BookWithAuthor & {
  roadmaps: RoadmapRef[];
  priority: Priority | null;
};

// ---------------------------------------------------------------------------
// À partir d'une résolution déjà faite
// ---------------------------------------------------------------------------

export function roadmapSummaries({ itemsBySlug }: ResolvedLibrary): RoadmapSummary[] {
  return ROADMAPS.map((roadmap) => {
    const items = itemsBySlug.get(roadmap.slug) ?? [];
    return {
      ...withoutEntries(roadmap),
      bookCount: items.length,
      readCount: items.filter((i) => i.book.read).length,
    };
  });
}

export function booksWithRoadmaps(
  books: BookWithAuthor[],
  { refsByBookId }: ResolvedLibrary
): BookWithRoadmaps[] {
  const priorities = priorityIndex();
  return books.map((book) => ({
    ...book,
    roadmaps: refsByBookId.get(book.id) ?? [],
    priority: priorityOf(book, priorities),
  }));
}

// ---------------------------------------------------------------------------
// Lecture + résolution, pour les pages qui n'ont besoin que d'une des deux
// ---------------------------------------------------------------------------

export async function listRoadmaps(): Promise<RoadmapSummary[]> {
  return roadmapSummaries(resolveLibrary(await listBooks()));
}

/** Un parcours et ses livres, dans l'ordre de lecture. */
export async function getRoadmapBySlug(
  slug: string
): Promise<(Omit<Roadmap, "entries"> & { items: RoadmapItem[] }) | undefined> {
  const roadmap = getRoadmap(slug);
  // Avant la lecture : un slug inconnu ne doit pas coûter une résolution.
  if (!roadmap) return undefined;
  const { itemsBySlug } = resolveLibrary(await listBooks());
  return { ...withoutEntries(roadmap), items: itemsBySlug.get(slug) ?? [] };
}

/** Les parcours qui contiennent un livre donné (fiche livre). */
export async function getRoadmapsForBook(bookId: number): Promise<RoadmapRef[]> {
  const { refsByBookId } = resolveLibrary(await listBooks());
  return refsByBookId.get(bookId) ?? [];
}

/** Tous les livres avec leurs parcours. Une seule lecture, un seul index. */
export async function listBooksWithRoadmaps(): Promise<BookWithRoadmaps[]> {
  const books = await listBooks();
  return booksWithRoadmaps(books, resolveLibrary(books));
}
