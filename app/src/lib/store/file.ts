/**
 * Backend fichier : la bibliothèque est `../data/library.json`, sur le disque.
 *
 * C'est le backend du développement local et des tests, et c'est le
 * comportement d'avant l'hébergement, repris tel quel — y compris les appels
 * synchrones de `node:fs`. Ils sont délibérés : la séquence
 * écriture → fsync → rename doit rester indivisible, et à 1,5 Mo elle coûte
 * quelques millisecondes. Seule la signature est devenue asynchrone, pour que
 * le backend GitHub puisse prendre la même place.
 */
import fs from "node:fs";
import path from "node:path";
import type { Snapshot } from "./snapshot";

/**
 * Hors de `app/` : le fichier remplace le dossier `seed/`, il vit à côté du
 * `pipeline/` qui l'a produit, et `app/` ne contient que du code.
 * `LIBRARY_DATA_PATH` sert aux tests, qui travaillent sur une copie jetable.
 *
 * Calculé dans une fonction, jamais au niveau du module : un
 * `path.resolve(process.cwd(), …)` évalué à l'import fait conclure au traceur
 * de Turbopack que le projet entier est une dépendance du bundle
 * (« Encountered unexpected file in NFT list »), et gonfle chaque fonction
 * serverless de tout le dépôt. C'est aussi la règle d'or de ce magasin : aucun
 * effet de bord à l'import.
 */
const file = (): string =>
  process.env.LIBRARY_DATA_PATH ??
  path.resolve(process.cwd(), "..", "data", "library.json");

export const label = (): string => path.basename(file());

/** Le fichier, s'il a changé depuis le jeton fourni. Le jeton est le mtime. */
export async function read(token: string | undefined): Promise<Snapshot | null> {
  const FILE = file();
  const current = String(fs.statSync(FILE).mtimeMs);
  if (token === current) return null;
  return { json: fs.readFileSync(FILE, "utf-8"), token: current };
}

/**
 * Réécrit le fichier entier, de façon atomique (temporaire + `rename`).
 *
 * Ni jeton de compare-and-swap ni message de commit, contrairement au backend
 * GitHub : ici l'historique est celui de git, écrit par l'utilisateur.
 */
export async function write(json: string): Promise<string> {
  const FILE = file();
  // Le pid dans le nom : plusieurs processus (workers de vitest, scripts
  // lancés en parallèle) écriraient sinon dans le même fichier temporaire.
  const tmp = `${FILE}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, json);
    // `rename` est atomique face à un `kill`, pas face à une panne : sans
    // fsync, l'entrée de répertoire peut atterrir avant les données.
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // Un niveau d'annulation pour ce que git ne protège pas : le non committé,
  // dont chaque analyse vaut une minute de temps modèle.
  fs.renameSync(FILE, `${FILE}.bak`);
  fs.renameSync(tmp, FILE);

  return String(fs.statSync(FILE).mtimeMs);
}
