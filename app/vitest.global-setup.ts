/**
 * Les tests lisent la base SQLite réelle — c'est voulu : les garde-fous des
 * parcours, des priorités et du corpus n'ont de sens que sur les vraies
 * 2 038 lignes. Mais ils ne doivent en aucun cas l'écrire : un test des listes
 * de lecture qui créerait puis supprimerait des enregistrements toucherait les
 * données de l'utilisateur.
 *
 * D'où cette copie : une base jetable, identique au contenu près, régénérée à
 * chaque exécution. `VACUUM INTO` produit une copie cohérente même si l'appli
 * tourne en parallèle avec un journal WAL ouvert — un simple `cp` du fichier
 * .db pourrait, lui, manquer les écritures encore dans le journal.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const SOURCE =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "library.db");
const TARGET = path.join(process.cwd(), ".tmp", "test-library.db");

export default function setup() {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(TARGET + suffix, { force: true });
  }
  if (fs.existsSync(SOURCE)) {
    const source = new Database(SOURCE, { readonly: true });
    source.exec(`VACUUM INTO '${TARGET.replace(/'/g, "''")}'`);
    source.close();
    // Le mode WAL est posé ici, une fois. Sans cela, les workers de vitest
    // ouvrent la copie en parallèle et se disputent le verrou exclusif que
    // demande le passage en WAL — « database is locked » sur deux fichiers de
    // test sur trois.
    const copy = new Database(TARGET);
    copy.pragma("journal_mode = WAL");
    copy.close();
  }
  // Lu par src/db/index.ts au premier import.
  process.env.DATABASE_PATH = TARGET;
}
