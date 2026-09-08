/**
 * La forme des données. Anciennement inférée du schéma Drizzle
 * (`src/db/schema.ts`), écrite à la main depuis que la base est un fichier
 * JSON versionné — cf. `src/lib/store.ts`.
 *
 * Types uniquement, aucune dépendance à `node:fs` : les composants client
 * peuvent l'importer sans emporter le module de lecture du fichier.
 *
 * L'ordre des champs est un contrat : `JSON.stringify` respecte l'ordre
 * d'insertion des clés, donc les fonctions de création et le script de
 * migration doivent produire les champs dans cet ordre-là, sinon un
 * enregistrement modifié réécrit tout son bloc dans le diff git.
 */

/** Clés de recherche et de déduplication. Dérivées de `name`/`title` par
 *  `normalizeKey` au chargement, donc absentes du fichier : elles ne peuvent
 *  pas se désynchroniser de la valeur affichée. Elles sont en revanche bien
 *  présentes sur chaque enregistrement en mémoire, et lues côté client
 *  (books-view, books-table, authors-view, books-helpers, dashboard). */
export interface Author {
  id: number;
  name: string;
  nameNormalized: string;
  birthYear: number | null;
  deathYear: number | null;
  nationality: string | null;
  language: string | null;
  mainGenre: string | null;
  mainField: string | null;
  period: string | null;
  notes: string | null;
  /** Produits par « Analyse Claude ». */
  bio: string | null;
  bioGeneratedAt: string | null;
  createdAt: string;
}

export interface Book {
  id: number;
  title: string;
  titleNormalized: string;
  /** Jamais nul : les œuvres anonymes reçoivent un auteur dédié
   *  (« Homère », « Anonyme (œuvre médiévale) », …). */
  authorId: number;
  category: string;
  genre: string | null;
  courant: string | null;
  theme: string | null;
  period: string | null;
  publicationYear: number | null;
  audience: string;
  originalLanguage: string | null;
  notes: string | null;
  /** Produits par « Analyse Claude ». */
  summary: string | null;
  analysis: string | null;
  analysisGeneratedAt: string | null;
  /** true = ajouté depuis les connaissances du modèle (ligne auteur-seul). */
  enriched: boolean;
  /** Coché par l'utilisateur. */
  read: boolean;
  createdAt: string;
}

/**
 * Une entrée de liste : pas d'identifiant, pas de rang. L'ordre du tableau
 * `items` *est* le rang — `getList` le renumérote à l'affichage, ce qu'il
 * faisait déjà du temps de la colonne `position`, qui ne portait donc aucune
 * information.
 */
export interface ListItem {
  bookId: number;
  note: string | null;
  createdAt: string;
}

/**
 * Liste de lecture personnelle.
 *
 * À ne pas confondre avec les parcours (`src/lib/roadmaps/`), qui sont du
 * contenu éditorial rédigé, versionné et tenu par des tests. Une liste est ce
 * que l'utilisateur compose lui-même depuis l'interface.
 */
export interface List {
  id: number;
  name: string;
  nameNormalized: string;
  description: string | null;
  createdAt: string;
  items: ListItem[];
}

/** Une liste sans ses entrées — ce que renvoient `listLists` et
 *  `getListsForBook`. */
export type ListMeta = Omit<List, "items">;

export type BookWithAuthor = Book & { author: Author };
export type AuthorWithCount = Author & { bookCount: number };

/**
 * Suivi d'une « Analyse Claude » en cours. Vit dans une `Map` en mémoire
 * (`src/lib/analysis/jobs.ts`), pas dans le fichier de données : un job est un
 * appel d'environ une minute dans le processus courant, et un job « running »
 * de plus de cinq minutes est de toute façon considéré mort.
 */
export interface AnalysisJob {
  id: number;
  bookId: number;
  status: "running" | "done" | "error";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** Le contenu de `data/library.json`, tel qu'il est tenu en mémoire. */
export interface Store {
  authors: Author[];
  books: Book[];
  lists: List[];
}
