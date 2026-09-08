/**
 * Résolution des entrées de parcours vers les livres de la bibliothèque.
 *
 * Les parcours désignent les livres par nom d'auteur + titre, jamais par id.
 * Les identifiants sont désormais stables et versionnés — ce n'est donc plus
 * une nécessité technique, mais cela reste le bon choix : un fichier de
 * parcours doit se lire et se relire, et c'est ce qui rend réparable une
 * collision d'identifiants après une fusion git. La correspondance passe par
 * normalizeKey(), la même fonction qui dérive `titleNormalized` /
 * `nameNormalized` au chargement — accents, casse et apostrophes
 * typographiques sont donc déjà neutralisés.
 */
import type { BookWithAuthor } from "@/lib/types";
import { normalizeKey } from "@/lib/normalize";
import { priorityIndex, priorityOf } from "@/lib/priorities/resolve";
import type { Priority } from "@/lib/priorities/types";
import { ROADMAPS } from "./index";
import type { Roadmap, RoadmapEntry } from "./types";

/** Un livre du parcours, résolu, avec sa place dans l'ordre de lecture. */
export interface RoadmapItem {
  position: number;
  book: BookWithAuthor;
  note: string;
  /** null tant que le livre n'a pas été jugé. */
  priority: Priority | null;
}

/** Renvoi d'un parcours vers lequel un livre appartient. */
export interface RoadmapRef {
  slug: string;
  title: string;
  family: Roadmap["family"];
  position: number;
}

function entryKey(author: string, title: string): string {
  return `${normalizeKey(author)}|${normalizeKey(title)}`;
}

/**
 * Index des livres par clé naturelle. Construit à la demande : ~2000 lignes,
 * négligeable, et toujours à jour puisqu'il part des livres qu'on lui passe.
 */
function buildBookIndex(books: BookWithAuthor[]): Map<string, BookWithAuthor> {
  const index = new Map<string, BookWithAuthor>();
  for (const book of books) {
    index.set(entryKey(book.author.name, book.title), book);
  }
  return index;
}

/** Entrée dont le livre est introuvable — signalée par le test de couverture. */
export interface UnresolvedEntry {
  slug: string;
  entry: RoadmapEntry;
}

export interface ResolvedLibrary {
  books: BookWithAuthor[];
  /** slug de parcours → livres résolus, dans l'ordre de lecture. */
  itemsBySlug: Map<string, RoadmapItem[]>;
  /** id de livre → parcours qui le contiennent. */
  refsByBookId: Map<number, RoadmapRef[]>;
  /** Entrées ne correspondant à aucun livre (faute de frappe, livre retiré). */
  unresolved: UnresolvedEntry[];
}

/**
 * Résout tous les parcours d'un coup : un seul index, partagé. Les pages qui en
 * ont besoin appellent cette fonction plutôt que de refaire le travail parcours
 * par parcours.
 *
 * `books` est un paramètre **obligatoire**, et doit le rester. Il valait
 * auparavant `listBooks()` par défaut, ce qui résolvait la bibliothèque deux
 * fois sur l'accueil — et, la lecture étant devenue asynchrone, un appel de
 * données dans un paramètre par défaut est de toute façon impossible à
 * `await`.
 */
export function resolveLibrary(books: BookWithAuthor[]): ResolvedLibrary {
  const index = buildBookIndex(books);
  const priorities = priorityIndex();
  const itemsBySlug = new Map<string, RoadmapItem[]>();
  const refsByBookId = new Map<number, RoadmapRef[]>();
  const unresolved: UnresolvedEntry[] = [];

  for (const roadmap of ROADMAPS) {
    const items: RoadmapItem[] = [];
    for (const entry of roadmap.entries) {
      const book = index.get(entryKey(entry.author, entry.title));
      if (!book) {
        // Ignoré à l'affichage plutôt que de casser la page ; le test de
        // couverture, lui, échoue bruyamment sur ces entrées.
        unresolved.push({ slug: roadmap.slug, entry });
        continue;
      }
      const position = items.length + 1;
      items.push({
        position,
        book,
        note: entry.note,
        priority: priorityOf(book, priorities),
      });
      const refs = refsByBookId.get(book.id);
      const ref: RoadmapRef = {
        slug: roadmap.slug,
        title: roadmap.title,
        family: roadmap.family,
        position,
      };
      if (refs) refs.push(ref);
      else refsByBookId.set(book.id, [ref]);
    }
    itemsBySlug.set(roadmap.slug, items);
  }

  return { books, itemsBySlug, refsByBookId, unresolved };
}
