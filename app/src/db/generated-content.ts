/**
 * Sauvegarde / restauration de ce que les fichiers de seed ne contiennent pas :
 * le contenu généré par Claude (résumés, analyses, biographies), l'état de
 * lecture coché par l'utilisateur et ses listes personnelles.
 *
 * Pourquoi : `npm run db:seed` vide puis réinsère authors + books. Les colonnes
 * générées (books.summary/analysis, authors.bio) n'existent pas dans les
 * fichiers de seed : un reseed les perd définitivement, alors qu'elles ont coûté
 * des appels modèle. Ces deux commandes encadrent donc tout reseed.
 *
 * Les enregistrements sont indexés par clé naturelle (nom d'auteur et titre
 * normalisés via normalizeKey) et JAMAIS par id : le seed réattribue toutes les
 * clés primaires.
 *
 * Usage :
 *   npm run db:reseed                             (sauvegarde + seed + restaure)
 *
 * ou, si l'on veut piloter les trois étapes à la main :
 *   npx tsx src/db/generated-content.ts save      (avant le reseed)
 *   npx tsx src/db/generated-content.ts restore   (après le reseed)
 *
 * Préférer `npm run db:reseed`. Un `npm run db:seed` lancé seul a déjà effacé
 * 3 analyses et 3 biographies le 6 septembre 2026 : l'enchaînement manuel avait
 * été fait à moitié. Le script npm rend l'oubli impossible.
 */
import fs from "node:fs";
import path from "node:path";
import { asc, eq, isNotNull, or } from "drizzle-orm";
import { db } from "./index";
import { authors, books, listItems, lists } from "./schema";
import { normalizeKey } from "../lib/normalize";

const FILE = path.resolve(process.cwd(), "..", "seed", "generated-content.json");

interface SavedBook {
  authorKey: string; // normalizeKey(nom de l'auteur)
  titleKey: string; // normalizeKey(titre)
  title: string; // lisible, pour les messages
  summary: string | null;
  analysis: string | null;
  analysisGeneratedAt: string | null;
  read: boolean;
}

interface SavedAuthor {
  authorKey: string;
  name: string;
  bio: string | null;
  bioGeneratedAt: string | null;
}

/** Les livres d'une liste sont référencés par clé naturelle, jamais par id :
 *  le seed réattribue toutes les clés primaires. */
interface SavedList {
  name: string;
  description: string | null;
  createdAt: string;
  books: { authorKey: string; titleKey: string; title: string; note: string | null }[];
}

interface Payload {
  savedAt: string;
  books: SavedBook[];
  authors: SavedAuthor[];
  /** Absent des sauvegardes antérieures aux listes : traité comme vide. */
  lists?: SavedList[];
}

function save(): void {
  const bookRows = db
    .select({ book: books, author: authors })
    .from(books)
    .innerJoin(authors, eq(books.authorId, authors.id))
    .where(
      or(isNotNull(books.summary), isNotNull(books.analysis), eq(books.read, true))
    )
    .all();

  const authorRows = db
    .select()
    .from(authors)
    .where(isNotNull(authors.bio))
    .all();

  const listRows = db.select().from(lists).orderBy(asc(lists.id)).all();
  const savedLists: SavedList[] = listRows.map((l) => ({
    name: l.name,
    description: l.description,
    createdAt: l.createdAt,
    books: db
      .select({ item: listItems, book: books, author: authors })
      .from(listItems)
      .innerJoin(books, eq(books.id, listItems.bookId))
      .innerJoin(authors, eq(authors.id, books.authorId))
      .where(eq(listItems.listId, l.id))
      .orderBy(asc(listItems.position))
      .all()
      .map((r) => ({
        authorKey: normalizeKey(r.author.name),
        titleKey: normalizeKey(r.book.title),
        title: r.book.title,
        note: r.item.note,
      })),
  }));

  const payload: Payload = {
    savedAt: new Date().toISOString(),
    books: bookRows.map((r) => ({
      authorKey: normalizeKey(r.author.name),
      titleKey: normalizeKey(r.book.title),
      title: r.book.title,
      summary: r.book.summary,
      analysis: r.book.analysis,
      analysisGeneratedAt: r.book.analysisGeneratedAt,
      read: r.book.read,
    })),
    authors: authorRows.map((a) => ({
      authorKey: normalizeKey(a.name),
      name: a.name,
      bio: a.bio,
      bioGeneratedAt: a.bioGeneratedAt,
    })),
    lists: savedLists,
  };

  fs.writeFileSync(FILE, JSON.stringify(payload, null, 1) + "\n", "utf-8");
  const lus = payload.books.filter((b) => b.read).length;
  const entrees = savedLists.reduce((n, l) => n + l.books.length, 0);
  console.log(
    `Sauvegardé : ${payload.books.length} livre(s) (dont ${lus} lu(s)), ` +
      `${payload.authors.length} biographie(s), ` +
      `${savedLists.length} liste(s) (${entrees} entrées) → ${FILE}`
  );
}

function restore(): void {
  if (!fs.existsSync(FILE)) {
    console.log(`Rien à restaurer (${FILE} absent).`);
    return;
  }
  const payload: Payload = JSON.parse(fs.readFileSync(FILE, "utf-8"));

  // Index par clé naturelle, construit une fois.
  const bookRows = db
    .select({ id: books.id, title: books.titleNormalized, author: authors.nameNormalized })
    .from(books)
    .innerJoin(authors, eq(books.authorId, authors.id))
    .all();
  const bookByKey = new Map(bookRows.map((r) => [`${r.author}|${r.title}`, r.id]));

  const authorRows = db
    .select({ id: authors.id, key: authors.nameNormalized })
    .from(authors)
    .all();
  const authorByKey = new Map(authorRows.map((r) => [r.key, r.id]));

  let restoredBooks = 0;
  let restoredAuthors = 0;
  let restoredLists = 0;
  let restoredListItems = 0;
  const missing: string[] = [];

  db.transaction((tx) => {
    for (const b of payload.books) {
      const id = bookByKey.get(`${b.authorKey}|${b.titleKey}`);
      if (id == null) {
        missing.push(`livre « ${b.title} »`);
        continue;
      }
      tx.update(books)
        .set({
          summary: b.summary,
          analysis: b.analysis,
          analysisGeneratedAt: b.analysisGeneratedAt,
          read: b.read ?? false,
        })
        .where(eq(books.id, id))
        .run();
      restoredBooks++;
    }
    for (const a of payload.authors) {
      const id = authorByKey.get(a.authorKey);
      if (id == null) {
        missing.push(`auteur « ${a.name} »`);
        continue;
      }
      tx.update(authors)
        .set({ bio: a.bio, bioGeneratedAt: a.bioGeneratedAt })
        .where(eq(authors.id, id))
        .run();
      restoredAuthors++;
    }

    // Les listes ne sont pas touchées par le seed (il ne vide que authors et
    // books), mais leurs entrées pointent sur des identifiants de livres qui,
    // eux, ont tous changé : la cascade les a effacées. On les recrée.
    for (const l of payload.lists ?? []) {
      const key = normalizeKey(l.name);
      const existing = tx
        .select({ id: lists.id })
        .from(lists)
        .where(eq(lists.nameNormalized, key))
        .get();
      const listId =
        existing?.id ??
        tx
          .insert(lists)
          .values({
            name: l.name,
            nameNormalized: key,
            description: l.description,
            createdAt: l.createdAt,
          })
          .returning({ id: lists.id })
          .get().id;
      restoredLists++;

      tx.delete(listItems).where(eq(listItems.listId, listId)).run();
      let position = 0;
      for (const b of l.books) {
        const bookId = bookByKey.get(`${b.authorKey}|${b.titleKey}`);
        if (bookId == null) {
          missing.push(`liste « ${l.name} » → « ${b.title} »`);
          continue;
        }
        position++;
        tx.insert(listItems)
          .values({ listId, bookId, position, note: b.note })
          .run();
        restoredListItems++;
      }
    }
  });

  const savedListItems = (payload.lists ?? []).reduce(
    (n, l) => n + l.books.length,
    0
  );
  console.log(
    `Restauré : ${restoredBooks}/${payload.books.length} analyse(s), ` +
      `${restoredAuthors}/${payload.authors.length} biographie(s), ` +
      `${restoredLists}/${(payload.lists ?? []).length} liste(s) ` +
      `(${restoredListItems}/${savedListItems} entrées).`
  );
  // Une cible manquante signifie que le livre/auteur a disparu du seed : on le
  // signale bruyamment plutôt que de perdre le contenu en silence.
  if (missing.length) {
    console.warn(`  ⚠ cible introuvable pour : ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}

const mode = process.argv[2];
if (mode === "save") save();
else if (mode === "restore") restore();
else {
  console.error("Usage : npx tsx src/db/generated-content.ts save|restore");
  process.exit(2);
}
