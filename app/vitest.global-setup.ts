/**
 * Les tests lisent le vrai fichier de données — c'est voulu : les garde-fous
 * des parcours, des priorités et du corpus n'ont de sens que sur les vraies
 * 2 038 lignes. Mais ils ne doivent en aucun cas l'écrire : un test des listes
 * de lecture qui créerait puis supprimerait des enregistrements toucherait le
 * fichier versionné de l'utilisateur.
 *
 * D'où cette copie jetable, régénérée à chaque exécution. Une simple copie
 * suffit désormais : le fichier est remplacé d'un seul `rename` atomique, donc
 * on n'en lit jamais une version partielle. C'est ce que le `VACUUM INTO` du
 * temps de SQLite allait chercher, le journal WAL pouvant contenir des
 * écritures qu'un `cp` du fichier .db aurait manquées.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE =
  process.env.LIBRARY_DATA_PATH ??
  path.resolve(process.cwd(), "..", "data", "library.json");
const TARGET = path.join(process.cwd(), ".tmp", "test-library.json");

export default function setup() {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.copyFileSync(SOURCE, TARGET);
  // Lu par src/lib/store.ts au premier accès.
  process.env.LIBRARY_DATA_PATH = TARGET;
}
