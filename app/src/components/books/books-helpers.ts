/**
 * Types, constantes et petites fonctions partagées entre books-view,
 * books-table et books-grouped. Rien ici ne touche aux contrats gelés
 * (schema/validation/normalize/queries) : uniquement de la logique UI.
 */
import type { BookWithRoadmaps } from "@/lib/roadmaps/queries";
import { PRIORITY_LABELS, priorityRank, type Priority } from "@/lib/priorities/types";
import { PERIODS } from "@/lib/validation";

/** Rang chronologique d'une période (chiffres romains → index de l'enum).
 *  Les valeurs inconnues/nulles vont en fin. */
export function periodRank(value: string | null | undefined): number {
  const i = PERIODS.indexOf((value ?? "") as (typeof PERIODS)[number]);
  return i === -1 ? PERIODS.length : i;
}

// ---------------------------------------------------------------------------
// Vue tableau / groupé
// ---------------------------------------------------------------------------

export type ViewMode = "table" | "grouped";

export function isViewMode(v: string | null): v is ViewMode {
  return v === "table" || v === "grouped";
}

// ---------------------------------------------------------------------------
// Regroupement ("Grouper par")
// ---------------------------------------------------------------------------

export type GroupByKey =
  | "author"
  | "genre"
  | "period"
  | "category"
  | "audience"
  | "priority";

export const GROUP_OPTIONS: { value: GroupByKey; label: string }[] = [
  { value: "author", label: "Auteur" },
  { value: "genre", label: "Genre" },
  { value: "period", label: "Période" },
  { value: "category", label: "Catégorie" },
  { value: "audience", label: "Public" },
  { value: "priority", label: "Priorité" },
];

const GROUP_KEYS = GROUP_OPTIONS.map((g) => g.value);

export function isGroupByKey(v: string | null): v is GroupByKey {
  return !!v && (GROUP_KEYS as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Filtres multi-sélection
// ---------------------------------------------------------------------------

export type FilterKey =
  | "category"
  | "genre"
  | "period"
  | "audience"
  | "courant"
  | "roadmap"
  | "priority"
  | "read";

export type Filters = Record<FilterKey, string[]>;

export const FILTER_KEYS: FilterKey[] = [
  "read",
  "priority",
  "category",
  "genre",
  "period",
  "audience",
  "courant",
  "roadmap",
];

export const EMPTY_FILTERS: Filters = {
  category: [],
  genre: [],
  period: [],
  audience: [],
  courant: [],
  roadmap: [],
  priority: [],
  read: [],
};

export const FILTER_LABELS: Record<FilterKey, string> = {
  category: "Catégorie",
  genre: "Genre",
  period: "Période",
  audience: "Public",
  courant: "Courant",
  roadmap: "Parcours",
  priority: "Priorité",
  read: "Lu",
};

// ---------------------------------------------------------------------------
// Tri (colonnes triables de la table, pour valider le paramètre `sort`)
// ---------------------------------------------------------------------------

export const SORTABLE_COLUMNS = [
  "title",
  "author",
  "category",
  "genre",
  "courant",
  "theme",
  "period",
  "publicationYear",
  "originalLanguage",
  "audience",
  "roadmaps",
  "priority",
  "read",
] as const;
export type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

export function isSortableColumn(id: string): id is SortableColumn {
  return (SORTABLE_COLUMNS as readonly string[]).includes(id);
}

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------

/** Majuscule initiale (public, vision du monde en version compacte). */
export function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Regroupement des livres (appliqué après recherche + filtres)
// ---------------------------------------------------------------------------

export interface BookGroup {
  key: string;
  label: string;
  books: BookWithRoadmaps[];
}

function rawGroupValue(book: BookWithRoadmaps, key: GroupByKey): string | null {
  switch (key) {
    case "author":
      return book.author.name;
    case "genre":
      return book.genre;
    case "period":
      return book.period;
    case "category":
      return book.category;
    case "audience":
      return book.audience;
    case "priority":
      return book.priority;
  }
}

function groupLabel(raw: string, key: GroupByKey): string {
  if (key === "audience") return capitalize(raw);
  if (key === "priority") return PRIORITY_LABELS[raw as Priority] ?? raw;
  return raw;
}

export function groupBooks(
  books: BookWithRoadmaps[],
  key: GroupByKey
): BookGroup[] {
  const map = new Map<string, BookGroup>();
  const rest: BookWithRoadmaps[] = [];

  for (const book of books) {
    const raw = rawGroupValue(book, key);
    if (raw == null || raw === "") {
      rest.push(book);
      continue;
    }
    const existing = map.get(raw);
    if (existing) existing.books.push(book);
    else map.set(raw, { key: raw, label: groupLabel(raw, key), books: [book] });
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    g.books.sort((a, b) =>
      a.titleNormalized.localeCompare(b.titleNormalized, "fr")
    );
  }
  // Périodes et priorités ont un ordre propre ; le reste se trie alphabétiquement.
  groups.sort((a, b) => {
    if (key === "period") return periodRank(a.key) - periodRank(b.key);
    if (key === "priority") return priorityRank(a.key) - priorityRank(b.key);
    return a.label.localeCompare(b.label, "fr");
  });

  if (rest.length) {
    rest.sort((a, b) =>
      a.titleNormalized.localeCompare(b.titleNormalized, "fr")
    );
    groups.push({ key: "__none__", label: "Non renseigné", books: rest });
  }

  return groups;
}
