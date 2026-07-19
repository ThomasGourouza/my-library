/**
 * Types, constantes et petites fonctions partagées entre books-view,
 * books-table et books-grouped. Rien ici ne touche aux contrats gelés
 * (schema/validation/normalize/queries) : uniquement de la logique UI.
 */
import type { BookWithAuthor } from "@/db/schema";
import { WORLDVIEW_LABELS, type Worldview } from "@/lib/validation";

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
  | "worldview";

export const GROUP_OPTIONS: { value: GroupByKey; label: string }[] = [
  { value: "author", label: "Auteur" },
  { value: "genre", label: "Genre" },
  { value: "period", label: "Période" },
  { value: "category", label: "Catégorie" },
  { value: "audience", label: "Public" },
  { value: "worldview", label: "Vision du monde" },
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
  | "worldview"
  | "courant";

export type Filters = Record<FilterKey, string[]>;

export const FILTER_KEYS: FilterKey[] = [
  "category",
  "genre",
  "period",
  "audience",
  "worldview",
  "courant",
];

export const EMPTY_FILTERS: Filters = {
  category: [],
  genre: [],
  period: [],
  audience: [],
  worldview: [],
  courant: [],
};

export const FILTER_LABELS: Record<FilterKey, string> = {
  category: "Catégorie",
  genre: "Genre",
  period: "Période",
  audience: "Public",
  worldview: "Vision du monde",
  courant: "Courant",
};

// ---------------------------------------------------------------------------
// Tri (colonnes triables de la table, pour valider le paramètre `sort`)
// ---------------------------------------------------------------------------

export const SORTABLE_COLUMNS = [
  "title",
  "author",
  "category",
  "genre",
  "period",
  "audience",
  "worldview",
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

/** Libellé compact affiché dans les badges/cellules de tableau. */
export function worldviewShortLabel(w: string): string {
  return capitalize(w);
}

/** Libellé complet affiché dans les menus de filtre, puces actives et groupes. */
export function worldviewFullLabel(w: string): string {
  return WORLDVIEW_LABELS[w as Worldview] ?? w;
}

// ---------------------------------------------------------------------------
// Regroupement des livres (appliqué après recherche + filtres)
// ---------------------------------------------------------------------------

export interface BookGroup {
  key: string;
  label: string;
  books: BookWithAuthor[];
}

function rawGroupValue(book: BookWithAuthor, key: GroupByKey): string | null {
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
    case "worldview":
      return book.worldview;
  }
}

function groupLabel(raw: string, key: GroupByKey): string {
  if (key === "worldview") return worldviewFullLabel(raw);
  if (key === "audience") return capitalize(raw);
  return raw;
}

export function groupBooks(
  books: BookWithAuthor[],
  key: GroupByKey
): BookGroup[] {
  const map = new Map<string, BookGroup>();
  const rest: BookWithAuthor[] = [];

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
  groups.sort((a, b) => a.label.localeCompare(b.label, "fr"));

  if (rest.length) {
    rest.sort((a, b) =>
      a.titleNormalized.localeCompare(b.titleNormalized, "fr")
    );
    groups.push({ key: "__none__", label: "Non renseigné", books: rest });
  }

  return groups;
}
