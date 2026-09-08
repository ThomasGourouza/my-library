/**
 * Livres et auteurs : lecture, écriture, et les règles d'unicité.
 *
 * Les écritures vivaient dans les routes d'API du temps de SQLite, qui
 * s'appuyait sur ses index uniques comme dernier rempart. Sans moteur, chaque
 * règle doit être tenue en un seul endroit par lequel tous les appelants
 * passent — sinon la deuxième route qui crée un auteur oublie la vérification.
 * Elles sont donc ici, à côté des lectures, comme le faisait déjà `lists.ts`.
 *
 * Tout est asynchrone depuis que la source peut être distante (cf. `store.ts`).
 * Conséquence à ne pas perdre de vue : **les contrôles d'existence appartiennent
 * au callback de `mutate`**, jamais à la route. Un `getAuthor` suivi d'un
 * `deleteAuthor` était atomique tant que la lecture l'était ; il ne l'est plus,
 * et la fenêtre entre les deux laisse passer des livres orphelins — que
 * `assertIntegrity` refuse ensuite de relire, ce qui met toutes les pages en
 * 500.
 */
import { DuplicateError, ConflictError, cmp, mutate, nextId, now, store } from "@/lib/store";
import type {
  Author,
  AuthorWithCount,
  Book,
  BookWithAuthor,
  Store,
} from "@/lib/types";
import { normalizeKey, normalizeText } from "@/lib/normalize";
import { PERIODS, type BookQuery } from "@/lib/validation";
import type {
  AuthorInput,
  AuthorUpdate,
  BookInput,
  BookUpdate,
} from "@/lib/validation";

const byId = (s: Store) => new Map(s.authors.map((a) => [a.id, a]));
const withAuthor = (b: Book, authors: Map<number, Author>): BookWithAuthor => ({
  ...b,
  author: authors.get(b.authorId)!,
});

/** Ordre chronologique des périodes : les libellés en chiffres romains ne se
 *  trient pas en alphabétique (XIXe viendrait avant XVIe). Une valeur hors
 *  liste part en fin, comme le faisait le `else` du CASE SQL. */
const periodRank = (period: string | null): number => {
  const i = PERIODS.indexOf(period as (typeof PERIODS)[number]);
  return i === -1 ? PERIODS.length : i;
};

/**
 * Tris disponibles pour la liste des livres.
 *
 * Attention à la collation : `ORDER BY titleNormalized` en SQLite était du
 * BINARY, pas du `localeCompare("fr")`. Comme `normalizeKey` ne produit que
 * `[a-z0-9' ]`, la comparaison brute le reproduit à l'octet près — passer par
 * `localeCompare` ici réordonnerait silencieusement toute la liste.
 */
const SORTS: Record<
  NonNullable<BookQuery["sort"]>,
  (a: BookWithAuthor, b: BookWithAuthor) => number
> = {
  title: (a, b) => cmp(a.titleNormalized, b.titleNormalized),
  author: (a, b) => cmp(a.author.nameNormalized, b.author.nameNormalized),
  period: (a, b) => cmp(periodRank(a.period), periodRank(b.period)),
  // NULL en premier en ASC, en dernier en DESC : le comportement de SQLite.
  publicationYear: (a, b) =>
    cmp(a.publicationYear ?? -Infinity, b.publicationYear ?? -Infinity),
  createdAt: (a, b) => cmp(a.createdAt, b.createdAt),
};

/**
 * Liste des livres avec leur auteur, filtrée et triée.
 * Recherche insensible aux accents via les clés *Normalized.
 */
export async function listBooks(filters: BookQuery = {}): Promise<BookWithAuthor[]> {
  const s = await store();
  const authors = byId(s);
  const key = filters.search ? normalizeKey(filters.search) : null;

  const rows = s.books
    .map((b) => withAuthor(b, authors))
    .filter((b) => {
      // `.includes` plutôt que LIKE '%…%' : un `%` ou un `_` tapé par
      // l'utilisateur est désormais cherché littéralement.
      if (key && !b.titleNormalized.includes(key) && !b.author.nameNormalized.includes(key))
        return false;
      if (filters.category && b.category !== filters.category) return false;
      if (filters.genre && b.genre !== filters.genre) return false;
      if (filters.courant && b.courant !== filters.courant) return false;
      if (filters.period && b.period !== filters.period) return false;
      if (filters.audience && b.audience !== filters.audience) return false;
      if (filters.authorId && b.authorId !== filters.authorId) return false;
      return true;
    });

  // `dir` ne s'applique qu'à la clé principale ; le titre reste la clé de
  // départage, toujours croissante — comme `orderBy(dir(col), asc(title))`.
  const sign = filters.dir === "desc" ? -1 : 1;
  const primary = SORTS[filters.sort ?? "title"];
  rows.sort(
    (a, b) => sign * primary(a, b) || cmp(a.titleNormalized, b.titleNormalized)
  );
  return rows;
}

export async function getBook(id: number): Promise<BookWithAuthor | undefined> {
  const s = await store();
  const book = s.books.find((b) => b.id === id);
  return book ? withAuthor(book, byId(s)) : undefined;
}

export interface AuthorFilters {
  search?: string;
  mainField?: string;
  mainGenre?: string;
  period?: string;
  nationality?: string;
  language?: string;
}

export async function listAuthors(
  filters: AuthorFilters = {}
): Promise<AuthorWithCount[]> {
  const s = await store();
  const key = filters.search ? normalizeKey(filters.search) : null;

  // Compté sur tous les livres : les filtres ne portent que sur des colonnes
  // d'auteur, donc ils ne réduisaient pas le `count()` du LEFT JOIN.
  const counts = new Map<number, number>();
  for (const b of s.books) counts.set(b.authorId, (counts.get(b.authorId) ?? 0) + 1);

  return s.authors
    .filter((a) => {
      if (key && !a.nameNormalized.includes(key)) return false;
      if (filters.mainField && a.mainField !== filters.mainField) return false;
      if (filters.mainGenre && a.mainGenre !== filters.mainGenre) return false;
      if (filters.period && a.period !== filters.period) return false;
      if (filters.nationality && a.nationality !== filters.nationality) return false;
      if (filters.language && a.language !== filters.language) return false;
      return true;
    })
    .map((a) => ({ ...a, bookCount: counts.get(a.id) ?? 0 }))
    .sort((a, b) => cmp(a.nameNormalized, b.nameNormalized));
}

export async function getAuthor(
  id: number
): Promise<(Author & { books: Book[] }) | undefined> {
  const s = await store();
  const author = s.authors.find((a) => a.id === id);
  if (!author) return undefined;
  return {
    ...author,
    books: s.books
      .filter((b) => b.authorId === id)
      .sort((a, b) => cmp(a.titleNormalized, b.titleNormalized)),
  };
}

/**
 * Valeurs distinctes pour alimenter les popovers de filtres.
 *
 * Deux fonctions plutôt qu'une : `/livres` n'a que faire des nationalités et
 * `/auteurs` que faire des courants.
 *
 * Ici le `localeCompare("fr")` est bien nécessaire, contrairement aux tris
 * ci-dessus : ce sont des valeurs d'affichage accentuées, pas des clés.
 */
const distinct = (values: (string | null)[]): string[] =>
  [...new Set(values)]
    .filter((v): v is string => v != null && v !== "")
    .sort((a, b) => a.localeCompare(b, "fr"));

export interface BookFilterOptions {
  genres: string[];
  courants: string[];
}

export async function getBookFilterOptions(): Promise<BookFilterOptions> {
  const { books } = await store();
  return {
    genres: distinct(books.map((b) => b.genre)),
    courants: distinct(books.map((b) => b.courant)),
  };
}

export interface AuthorFilterOptions {
  nationalities: string[];
  languages: string[];
  mainFields: string[];
  mainGenres: string[];
}

export async function getAuthorFilterOptions(): Promise<AuthorFilterOptions> {
  const { authors } = await store();
  return {
    nationalities: distinct(authors.map((a) => a.nationality)),
    languages: distinct(authors.map((a) => a.language)),
    mainFields: distinct(authors.map((a) => a.mainField)),
    mainGenres: distinct(authors.map((a) => a.mainGenre)),
  };
}

// ---------------------------------------------------------------------------
// Recherche transverse (palette ⌘K)
// ---------------------------------------------------------------------------

/** Ce qui commence par la recherche passe devant : en tapant « 1984 » on veut
 *  1984, pas « 1984 revisité ». */
const prefixFirst = (value: string, key: string): number =>
  value.startsWith(key) ? 0 : 1;

export async function searchBooks(
  key: string,
  limit: number
): Promise<{ id: number; title: string; author: string }[]> {
  const s = await store();
  const authors = byId(s);
  return s.books
    .map((b) => withAuthor(b, authors))
    .filter(
      (b) =>
        b.titleNormalized.includes(key) || b.author.nameNormalized.includes(key)
    )
    .sort(
      (a, b) =>
        cmp(prefixFirst(a.titleNormalized, key), prefixFirst(b.titleNormalized, key)) ||
        cmp(a.titleNormalized, b.titleNormalized)
    )
    .slice(0, limit)
    .map((b) => ({ id: b.id, title: b.title, author: b.author.name }));
}

export async function searchAuthors(
  key: string,
  limit: number
): Promise<{ id: number; name: string; bookCount: number }[]> {
  const s = await store();
  const counts = new Map<number, number>();
  for (const b of s.books) counts.set(b.authorId, (counts.get(b.authorId) ?? 0) + 1);
  return s.authors
    .filter((a) => a.nameNormalized.includes(key))
    .sort(
      (a, b) =>
        cmp(prefixFirst(a.nameNormalized, key), prefixFirst(b.nameNormalized, key)) ||
        cmp(a.nameNormalized, b.nameNormalized)
    )
    .slice(0, limit)
    .map((a) => ({ id: a.id, name: a.name, bookCount: counts.get(a.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/** L'ordre des champs est un contrat : `JSON.stringify` respecte l'ordre
 *  d'insertion, et un enregistrement construit dans un autre ordre réécrirait
 *  tout son bloc dans le diff git. Cf. `src/lib/types.ts`. */
function makeAuthor(s: Store, input: AuthorInput): Author {
  const name = normalizeText(input.name);
  return {
    id: nextId(s.authors),
    name,
    nameNormalized: normalizeKey(name),
    birthYear: input.birthYear ?? null,
    deathYear: input.deathYear ?? null,
    nationality: input.nationality ?? null,
    language: input.language ?? null,
    mainGenre: input.mainGenre ?? null,
    mainField: input.mainField ?? null,
    period: input.period ?? null,
    notes: input.notes ?? null,
    bio: null,
    bioGeneratedAt: null,
    createdAt: now(),
  };
}

/** Réutilise l'auteur de même nom normalisé, sinon le crée. Utilisé par le
 *  « Créer l'auteur « X » » du formulaire de livre. */
function resolveAuthor(s: Store, input: AuthorInput): Author {
  const key = normalizeKey(normalizeText(input.name));
  const existing = s.authors.find((a) => a.nameNormalized === key);
  if (existing) return existing;
  const author = makeAuthor(s, input);
  s.authors.push(author);
  return author;
}

export function createAuthor(input: AuthorInput): Promise<Author> {
  return mutate(
    (s) => {
      const key = normalizeKey(normalizeText(input.name));
      if (s.authors.some((a) => a.nameNormalized === key)) {
        throw new DuplicateError("Cet auteur existe déjà");
      }
      const author = makeAuthor(s, input);
      s.authors.push(author);
      return author;
    },
    (author) => `Ajout de l'auteur ${author.name}`
  );
}

export function updateAuthor(
  id: number,
  input: AuthorUpdate
): Promise<Author | undefined> {
  return mutate(
    (s) => {
      const author = s.authors.find((a) => a.id === id);
      if (!author) return undefined;
      if (input.name !== undefined) {
        const name = normalizeText(input.name);
        const key = normalizeKey(name);
        if (s.authors.some((a) => a.id !== id && a.nameNormalized === key)) {
          throw new DuplicateError("Cet auteur existe déjà");
        }
        author.name = name;
        author.nameNormalized = key;
      }
      if (input.birthYear !== undefined) author.birthYear = input.birthYear ?? null;
      if (input.deathYear !== undefined) author.deathYear = input.deathYear ?? null;
      if (input.nationality !== undefined) author.nationality = input.nationality ?? null;
      if (input.language !== undefined) author.language = input.language ?? null;
      if (input.mainGenre !== undefined) author.mainGenre = input.mainGenre ?? null;
      if (input.mainField !== undefined) author.mainField = input.mainField ?? null;
      if (input.period !== undefined) author.period = input.period ?? null;
      if (input.notes !== undefined) author.notes = input.notes ?? null;
      return author;
    },
    (author) => `Modification de l'auteur ${author?.name ?? id}`
  );
}

/**
 * Résultat d'une suppression d'auteur : ce que la route doit savoir pour
 * choisir son code HTTP, obtenu **sans** seconde lecture.
 *
 * Le comptage des livres se fait ici, dans le callback, et non plus dans la
 * route : `getAuthor` → `countBooksByAuthor` → `deleteAuthor` laissait une
 * fenêtre pendant laquelle un livre pouvait être rattaché à l'auteur qu'on
 * s'apprêtait à supprimer. Il en serait resté orphelin, et le fichier illisible.
 */
export type AuthorDeletion =
  | { ok: true; name: string }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "books"; bookCount: number };

export function deleteAuthor(id: number): Promise<AuthorDeletion> {
  return mutate(
    (s): AuthorDeletion => {
      const i = s.authors.findIndex((a) => a.id === id);
      if (i === -1) return { ok: false, reason: "missing" };
      const bookCount = s.books.filter((b) => b.authorId === id).length;
      if (bookCount > 0) return { ok: false, reason: "books", bookCount };
      const [author] = s.authors.splice(i, 1);
      return { ok: true, name: author.name };
    },
    (r) => (r.ok ? `Suppression de l'auteur ${r.name}` : "")
  );
}

function makeBook(s: Store, input: BookInput, authorId: number): Book {
  const title = normalizeText(input.title);
  return {
    id: nextId(s.books),
    title,
    titleNormalized: normalizeKey(title),
    authorId,
    category: input.category,
    genre: input.genre ?? null,
    courant: input.courant ?? null,
    theme: input.theme ?? null,
    period: input.period ?? null,
    publicationYear: input.publicationYear ?? null,
    audience: input.audience,
    originalLanguage: input.originalLanguage ?? null,
    notes: input.notes ?? null,
    summary: null,
    analysis: null,
    analysisGeneratedAt: null,
    enriched: false,
    read: false,
    createdAt: now(),
  };
}

/**
 * Crée un livre, en résolvant ou créant son auteur au passage.
 *
 * Les deux — auteur puis livre — dans une seule mutation : un livre refusé
 * pour doublon ne laisse donc pas derrière lui l'auteur qu'on venait de créer,
 * ce que faisaient les deux insertions séparées de l'ancienne route.
 */
export function createBook(input: BookInput): Promise<BookWithAuthor> {
  return mutate(
    (s) => {
      const author =
        input.authorId != null
          ? s.authors.find((a) => a.id === input.authorId)
          : resolveAuthor(s, input.newAuthor!);
      // Vérifié ici, dans le callback : la route ne peut pas le faire sans
      // rouvrir la fenêtre que le magasin asynchrone a créée. Sans ce
      // contrôle, le `!` d'origine fabriquait un livre orphelin.
      if (!author) throw new ConflictError("Auteur introuvable");

      const title = normalizeKey(normalizeText(input.title));
      if (s.books.some((b) => b.authorId === author.id && b.titleNormalized === title)) {
        throw new DuplicateError("Ce livre existe déjà pour cet auteur");
      }
      const book = makeBook(s, input, author.id);
      s.books.push(book);
      return { ...book, author };
    },
    (book) => `Ajout de ${book.title} (${book.author.name})`
  );
}

export function updateBook(
  id: number,
  input: BookUpdate
): Promise<BookWithAuthor | undefined> {
  // Cocher « Lu » est de loin la modification la plus fréquente, et elle mérite
  // un message qui la nomme plutôt qu'un « Modification » indifférencié.
  const onlyRead =
    input.read !== undefined &&
    Object.keys(input).filter((k) => input[k as keyof BookUpdate] !== undefined)
      .length === 1;

  return mutate(
    (s) => {
      const book = s.books.find((b) => b.id === id);
      if (!book) return undefined;

      let authorId = book.authorId;
      if (input.authorId != null) {
        if (!s.authors.some((a) => a.id === input.authorId)) {
          throw new ConflictError("Auteur introuvable");
        }
        authorId = input.authorId;
      } else if (input.newAuthor != null) {
        authorId = resolveAuthor(s, input.newAuthor).id;
      }

      const titleNormalized =
        input.title !== undefined
          ? normalizeKey(normalizeText(input.title))
          : book.titleNormalized;

      if (titleNormalized !== book.titleNormalized || authorId !== book.authorId) {
        if (
          s.books.some(
            (b) =>
              b.id !== id &&
              b.authorId === authorId &&
              b.titleNormalized === titleNormalized
          )
        ) {
          throw new DuplicateError("Ce livre existe déjà pour cet auteur");
        }
      }

      book.authorId = authorId;
      if (input.title !== undefined) {
        book.title = normalizeText(input.title);
        book.titleNormalized = titleNormalized;
      }
      if (input.category !== undefined) book.category = input.category;
      if (input.genre !== undefined) book.genre = input.genre ?? null;
      if (input.courant !== undefined) book.courant = input.courant ?? null;
      if (input.theme !== undefined) book.theme = input.theme ?? null;
      if (input.period !== undefined) book.period = input.period ?? null;
      if (input.publicationYear !== undefined)
        book.publicationYear = input.publicationYear ?? null;
      if (input.audience !== undefined) book.audience = input.audience;
      if (input.originalLanguage !== undefined)
        book.originalLanguage = input.originalLanguage ?? null;
      if (input.notes !== undefined) book.notes = input.notes ?? null;
      if (input.read !== undefined) book.read = input.read;

      return { ...book, author: s.authors.find((a) => a.id === authorId)! };
    },
    (book) => {
      if (!book) return "";
      if (onlyRead) {
        return `${book.title} — ${book.read ? "lu" : "non lu"}`;
      }
      return `Modification de ${book.title}`;
    }
  );
}

export function deleteBook(id: number): Promise<boolean> {
  let title = "";
  return mutate(
    (s) => {
      const i = s.books.findIndex((b) => b.id === id);
      if (i === -1) return false;
      title = s.books[i].title;
      s.books.splice(i, 1);
      // Ce que faisait ON DELETE CASCADE sur list_items.
      for (const list of s.lists) {
        const j = list.items.findIndex((it) => it.bookId === id);
        if (j !== -1) list.items.splice(j, 1);
      }
      return true;
    },
    (ok) => (ok ? `Suppression de ${title}` : "")
  );
}
