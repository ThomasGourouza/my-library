/**
 * Sauvegarde / restauration du contenu généré par Claude (résumés, analyses,
 * biographies).
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
 *   npx tsx src/db/generated-content.ts save      (avant le reseed)
 *   npx tsx src/db/generated-content.ts restore   (après le reseed)
 */
import fs from "node:fs";
import path from "node:path";
import { eq, isNotNull, or } from "drizzle-orm";
import { db } from "./index";
import { authors, books } from "./schema";
import { normalizeKey } from "../lib/normalize";

const FILE = path.resolve(process.cwd(), "..", "seed", "generated-content.json");

interface SavedBook {
  authorKey: string; // normalizeKey(nom de l'auteur)
  titleKey: string; // normalizeKey(titre)
  title: string; // lisible, pour les messages
  summary: string | null;
  analysis: string | null;
  analysisGeneratedAt: string | null;
}

interface SavedAuthor {
  authorKey: string;
  name: string;
  bio: string | null;
  bioGeneratedAt: string | null;
}

interface Payload {
  savedAt: string;
  books: SavedBook[];
  authors: SavedAuthor[];
}

function save(): void {
  const bookRows = db
    .select({ book: books, author: authors })
    .from(books)
    .innerJoin(authors, eq(books.authorId, authors.id))
    .where(or(isNotNull(books.summary), isNotNull(books.analysis)))
    .all();

  const authorRows = db
    .select()
    .from(authors)
    .where(isNotNull(authors.bio))
    .all();

  const payload: Payload = {
    savedAt: new Date().toISOString(),
    books: bookRows.map((r) => ({
      authorKey: normalizeKey(r.author.name),
      titleKey: normalizeKey(r.book.title),
      title: r.book.title,
      summary: r.book.summary,
      analysis: r.book.analysis,
      analysisGeneratedAt: r.book.analysisGeneratedAt,
    })),
    authors: authorRows.map((a) => ({
      authorKey: normalizeKey(a.name),
      name: a.name,
      bio: a.bio,
      bioGeneratedAt: a.bioGeneratedAt,
    })),
  };

  fs.writeFileSync(FILE, JSON.stringify(payload, null, 1) + "\n", "utf-8");
  console.log(
    `Sauvegardé : ${payload.books.length} livre(s) analysé(s), ` +
      `${payload.authors.length} biographie(s) → ${FILE}`
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
  });

  console.log(
    `Restauré : ${restoredBooks}/${payload.books.length} analyse(s), ` +
      `${restoredAuthors}/${payload.authors.length} biographie(s).`
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
