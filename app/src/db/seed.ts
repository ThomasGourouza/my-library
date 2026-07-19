/**
 * Seed transactionnel : vide puis réinsère authors + books depuis
 * ../seed/authors.json et ../seed/books.json (racine du dépôt).
 * Sans fichiers de seed, insère une petite fixture (dev Phase 0/1).
 * Idempotent : relancer reproduit exactement le même contenu.
 *
 * Usage : npm run db:seed   (depuis app/)
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { analysisJobs, authors, books } from "./schema";
import { normalizeKey, normalizeText } from "../lib/normalize";

interface SeedAuthor {
  key: string;
  name: string;
  birthYear?: number | null;
  deathYear?: number | null;
  nationality?: string | null;
  language?: string | null;
  mainGenre?: string | null;
  mainField?: string | null;
  period?: string | null;
  notes?: string | null;
}

interface SeedBook {
  title: string;
  authorKey: string;
  category: string;
  genre?: string | null;
  courant?: string | null;
  theme?: string | null;
  period?: string | null;
  publicationYear?: number | null;
  audience?: string | null;
  worldview?: string | null;
  originalLanguage?: string | null;
  notes?: string | null;
  enriched?: boolean;
}

const FIXTURE_AUTHORS: SeedAuthor[] = [
  { key: "homere", name: "Homère", birthYear: -800, deathYear: -740, nationality: "grecque", language: "grec ancien", mainGenre: "Épopée", mainField: "Littérature", period: "Antiquité" },
  { key: "fedor-dostoievski", name: "Fédor Dostoïevski", birthYear: 1821, deathYear: 1881, nationality: "russe", language: "russe", mainGenre: "Roman", mainField: "Littérature", period: "XIXe siècle" },
  { key: "albert-camus", name: "Albert Camus", birthYear: 1913, deathYear: 1960, nationality: "française", language: "français", mainGenre: "Roman", mainField: "Littérature", period: "XXe siècle" },
  { key: "francois-de-la-rochefoucauld", name: "François de La Rochefoucauld", birthYear: 1613, deathYear: 1680, nationality: "française", language: "français", mainGenre: "Maximes", mainField: "Philosophie & psychologie", period: "XVIIe siècle" },
  { key: "charles-perrault", name: "Charles Perrault", birthYear: 1628, deathYear: 1703, nationality: "française", language: "français", mainGenre: "Conte", mainField: "Littérature", period: "XVIIe siècle" },
];

const FIXTURE_BOOKS: SeedBook[] = [
  { title: "L’Iliade", authorKey: "homere", category: "Littérature", genre: "Épopée", period: "Antiquité", audience: "tous", originalLanguage: "grec ancien" },
  { title: "L’Odyssée", authorKey: "homere", category: "Littérature", genre: "Épopée", period: "Antiquité", audience: "tous", originalLanguage: "grec ancien" },
  { title: "Crime et Châtiment", authorKey: "fedor-dostoievski", category: "Littérature", genre: "Roman", period: "XIXe siècle", publicationYear: 1866, originalLanguage: "russe" },
  { title: "Les Frères Karamazov", authorKey: "fedor-dostoievski", category: "Littérature", genre: "Roman", period: "XIXe siècle", publicationYear: 1880, originalLanguage: "russe" },
  { title: "L’Étranger", authorKey: "albert-camus", category: "Littérature", genre: "Roman", courant: "Absurde", period: "XXe siècle", publicationYear: 1942, worldview: "existentialiste", originalLanguage: "français" },
  { title: "Le Mythe de Sisyphe", authorKey: "albert-camus", category: "Philosophie & psychologie", genre: "Essai", courant: "Absurde", period: "XXe siècle", publicationYear: 1942, worldview: "existentialiste", originalLanguage: "français" },
  { title: "Réflexions ou sentences et maximes morales", authorKey: "francois-de-la-rochefoucauld", category: "Philosophie & psychologie", genre: "Maximes", period: "XVIIe siècle", publicationYear: 1665, worldview: "cynique", originalLanguage: "français" },
  { title: "Contes de ma mère l’Oye", authorKey: "charles-perrault", category: "Littérature", genre: "Conte", period: "XVIIe siècle", publicationYear: 1697, audience: "enfants", originalLanguage: "français" },
];

function loadSeedFiles(): { authors: SeedAuthor[]; books: SeedBook[]; source: string } {
  const seedDir = path.resolve(process.cwd(), "..", "seed");
  const aPath = path.join(seedDir, "authors.json");
  const bPath = path.join(seedDir, "books.json");
  if (fs.existsSync(aPath) && fs.existsSync(bPath)) {
    return {
      authors: JSON.parse(fs.readFileSync(aPath, "utf-8")),
      books: JSON.parse(fs.readFileSync(bPath, "utf-8")),
      source: seedDir,
    };
  }
  return { authors: FIXTURE_AUTHORS, books: FIXTURE_BOOKS, source: "fixture intégrée" };
}

function main() {
  const seed = loadSeedFiles();
  console.log(`Seed depuis : ${seed.source}`);
  console.log(`  ${seed.authors.length} auteurs, ${seed.books.length} livres`);

  db.transaction((tx) => {
    tx.delete(analysisJobs).run();
    tx.delete(books).run();
    tx.delete(authors).run();

    const idByKey = new Map<string, number>();
    let dupAuthors = 0;
    for (const a of seed.authors) {
      const name = normalizeText(a.name);
      const nameNormalized = normalizeKey(name);
      try {
        const inserted = tx
          .insert(authors)
          .values({
            name,
            nameNormalized,
            birthYear: a.birthYear ?? null,
            deathYear: a.deathYear ?? null,
            nationality: a.nationality ?? null,
            language: a.language ?? null,
            mainGenre: a.mainGenre ?? null,
            mainField: a.mainField ?? null,
            period: a.period ?? null,
            notes: a.notes ?? null,
          })
          .returning({ id: authors.id })
          .get();
        idByKey.set(a.key, inserted.id);
      } catch (e) {
        // Deux clés distinctes → même nom normalisé : on rattache la clé du
        // doublon à l'auteur déjà inséré pour ne pas casser les authorKey des
        // livres (au lieu de faire échouer toute la transaction).
        if (String(e).includes("UNIQUE")) {
          const existing = tx
            .select({ id: authors.id })
            .from(authors)
            .where(eq(authors.nameNormalized, nameNormalized))
            .get();
          if (!existing) throw e;
          idByKey.set(a.key, existing.id);
          dupAuthors++;
          console.warn(`  doublon auteur ignoré : ${name}`);
        } else {
          throw e;
        }
      }
    }
    if (dupAuthors) console.warn(`  ${dupAuthors} auteur(s) en double ignoré(s)`);

    let skipped = 0;
    for (const b of seed.books) {
      const authorId = idByKey.get(b.authorKey);
      if (authorId == null) {
        throw new Error(`Livre « ${b.title} » : authorKey inconnu « ${b.authorKey} »`);
      }
      const title = normalizeText(b.title);
      try {
        tx.insert(books)
          .values({
            title,
            titleNormalized: normalizeKey(title),
            authorId,
            category: b.category,
            genre: b.genre ?? null,
            courant: b.courant ?? null,
            theme: b.theme ?? null,
            period: b.period ?? null,
            publicationYear: b.publicationYear ?? null,
            audience: b.audience ?? "adultes",
            worldview: b.worldview ?? null,
            originalLanguage: b.originalLanguage ?? null,
            notes: b.notes ?? null,
            enriched: b.enriched ?? false,
          })
          .run();
      } catch (e) {
        if (String(e).includes("UNIQUE")) {
          skipped++;
          console.warn(`  doublon ignoré : ${title} (auteur ${b.authorKey})`);
        } else {
          throw e;
        }
      }
    }
    if (skipped) console.warn(`  ${skipped} doublon(s) ignoré(s)`);
  });

  const nA = db.select().from(authors).all().length;
  const nB = db.select().from(books).all().length;
  console.log(`OK — base : ${nA} auteurs, ${nB} livres`);
}

main();
