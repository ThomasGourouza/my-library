/**
 * Le magasin de données : un seul fichier JSON versionné, tenu en mémoire.
 *
 * Lecture — `store()` rend le contenu en mémoire, relu si le fichier a changé
 * sur le disque : un `git pull` est donc pris en compte sans redémarrer.
 * Écriture — `mutate()` modifie la mémoire puis réécrit le fichier entier, de
 * façon atomique (temporaire + rename).
 *
 * Tout est synchrone, comme l'était better-sqlite3. Node étant mono-thread,
 * rien ne peut s'intercaler entre la relecture du fichier et le rename.
 *
 * Aucun effet de bord à l'import — et c'est impératif : `next build` lance
 * plusieurs workers qui chargent le bundle de chaque page et de chaque route
 * pour les analyser. C'est exactement comme cela qu'un `data/library.db` vide
 * s'est retrouvé créé du temps de SQLite, par un `export const db = …` au
 * niveau module. Ici, tout se fait dans les fonctions.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeKey } from "@/lib/normalize";
import type { Store } from "@/lib/types";

/**
 * Hors de `app/` : le fichier remplace le dossier `seed/`, il vit à côté du
 * `pipeline/` qui l'a produit, et `app/` ne contient que du code.
 * `LIBRARY_DATA_PATH` sert aux tests, qui travaillent sur une copie jetable.
 */
const FILE =
  process.env.LIBRARY_DATA_PATH ??
  path.resolve(process.cwd(), "..", "data", "library.json");

/** Ce que signalait « UNIQUE constraint failed » du temps de SQLite. Les
 *  routes d'API la traduisent en 409. */
export class DuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
  }
}

/**
 * Clés de recherche et de déduplication, absentes du fichier et posées à la
 * lecture : elles ne peuvent donc pas se désynchroniser de la valeur
 * affichée. Le revers, à ne pas oublier dans les fonctions de création :
 * elles doivent être posées sur tout enregistrement neuf, car les composants
 * client les lisent (books-view, books-table, authors-view, …).
 */
const DERIVED = new Set(["nameNormalized", "titleNormalized"]);

// Le cache survit au rechargement à chaud de `next dev`, comme le faisait le
// client SQLite.
const g = globalThis as unknown as {
  __library?: { store: Store; mtimeMs: number };
};

/** Comparaison à trois voies, sans soustraction : `(-Infinity) - (-Infinity)`
 *  vaut NaN, et un comparateur qui rend NaN trie n'importe comment. */
export const cmp = <T>(x: T, y: T): number => (x < y ? -1 : x > y ? 1 : 0);

/**
 * Ce que garantissaient la clé primaire et la clé étrangère.
 *
 * Une fusion git peut produire deux enregistrements de même identifiant — deux
 * machines qui ajoutent un livre chacune prennent le même `max + 1`, et les
 * deux blocs sont trop éloignés pour que git s'en aperçoive. `find()` en
 * renverrait alors un au hasard : la mauvaise fiche sous la bonne URL. Mieux
 * vaut échouer ici, quand on se souvient encore de ce qu'on a fusionné.
 */
function assertIntegrity(s: Store): void {
  const dup = (ids: number[]) => [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const problems: string[] = [];

  const dupAuthors = dup(s.authors.map((a) => a.id));
  if (dupAuthors.length) problems.push(`identifiants d'auteurs en double : ${dupAuthors.join(", ")}`);
  const dupBooks = dup(s.books.map((b) => b.id));
  if (dupBooks.length) problems.push(`identifiants de livres en double : ${dupBooks.join(", ")}`);
  const dupLists = dup(s.lists.map((l) => l.id));
  if (dupLists.length) problems.push(`identifiants de listes en double : ${dupLists.join(", ")}`);

  const authorIds = new Set(s.authors.map((a) => a.id));
  const orphans = s.books.filter((b) => !authorIds.has(b.authorId));
  if (orphans.length) {
    problems.push(
      `livres sans auteur : ${orphans.slice(0, 5).map((b) => `« ${b.title} » (authorId ${b.authorId})`).join(", ")}` +
        (orphans.length > 5 ? ` … et ${orphans.length - 5} autres` : "")
    );
  }

  if (problems.length) {
    throw new Error(
      `${path.basename(FILE)} est incohérent (fusion git à reprendre ?) :\n  - ${problems.join("\n  - ")}`
    );
  }
}

function parse(): Store {
  const fresh = JSON.parse(fs.readFileSync(FILE, "utf-8")) as Store;
  for (const a of fresh.authors) a.nameNormalized = normalizeKey(a.name);
  for (const b of fresh.books) b.titleNormalized = normalizeKey(b.title);
  for (const l of fresh.lists) l.nameNormalized = normalizeKey(l.name);
  assertIntegrity(fresh);
  return fresh;
}

/** Le contenu du fichier, relu s'il a changé depuis le dernier appel. */
export function store(): Store {
  const { mtimeMs } = fs.statSync(FILE);
  if (g.__library?.mtimeMs === mtimeMs) return g.__library.store;
  try {
    g.__library = { store: parse(), mtimeMs };
  } catch (e) {
    // `git checkout` et `git pull` écrivent les fichiers de façon NON
    // atomique : une lecture au mauvais moment tombe sur du JSON tronqué. On
    // continue de servir le dernier état valide, et on ne met pas à jour le
    // mtime pour réessayer au prochain appel — sinon toutes les pages
    // renvoient 500 jusqu'au redémarrage.
    if (!g.__library) throw e;
    console.error(`Lecture de ${FILE} impossible, dernier état valide conservé :`, e);
  }
  return g.__library.store;
}

/**
 * Ordre du fichier : par clé naturelle, pas par identifiant.
 *
 * Ce n'est pas cosmétique. À ~14 lignes par enregistrement, deux machines qui
 * insèrent des livres de clés différentes produisent deux hunks sans
 * recouvrement, que git fusionne proprement. Trié par identifiant, tout
 * ajout se ferait à la même place — la fin du tableau — et conflitterait à
 * chaque fois.
 */
function sortRecords(s: Store): void {
  const nameById = new Map(s.authors.map((a) => [a.id, a.nameNormalized]));
  s.authors.sort((x, y) => cmp(x.nameNormalized, y.nameNormalized));
  s.books.sort(
    (x, y) =>
      cmp(nameById.get(x.authorId) ?? "", nameById.get(y.authorId) ?? "") ||
      cmp(x.titleNormalized, y.titleNormalized)
  );
  s.lists.sort((x, y) => cmp(x.nameNormalized, y.nameNormalized));
}

/**
 * Applique une modification, puis réécrit le fichier.
 *
 * `fn` doit chercher ses enregistrements dans le `Store` qu'on lui passe, par
 * identifiant — jamais via une référence retenue avant un `await`. Un objet lu
 * plus tôt peut appartenir à une version périmée du magasin, et le modifier
 * n'écrirait rien : c'est le cas de `runAnalysis`, qui écrit une minute après
 * avoir lu. C'est la règle que la transaction SQL tenait à sa place.
 *
 * En cas d'échec — doublon refusé, disque plein — le cache est jeté : la
 * mémoire ne reste jamais en avance sur le fichier.
 */
export function mutate<T>(fn: (s: Store) => T): T {
  const current = store();
  try {
    const result = fn(current);
    sortRecords(current);
    const json =
      JSON.stringify(current, (k, v) => (DERIVED.has(k) ? undefined : v), 2) + "\n";

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
    // Un niveau d'annulation pour ce que git ne protège pas : le non
    // committé, dont chaque analyse vaut une minute de temps modèle.
    fs.renameSync(FILE, `${FILE}.bak`);
    fs.renameSync(tmp, FILE);

    // Notre propre écriture ne doit pas provoquer une relecture — et 3 100
    // appels à normalizeKey — au prochain accès.
    g.__library = { store: current, mtimeMs: fs.statSync(FILE).mtimeMs };
    return result;
  } catch (e) {
    g.__library = undefined;
    throw e;
  }
}

/**
 * Identifiant neuf.
 *
 * Pas un simple `max + 1` : deux machines qui ajoutent chacune un livre
 * prendraient le même, git fusionnerait les deux blocs sans broncher, et
 * `find()` renverrait l'un des deux au hasard. `AUTOINCREMENT` n'a jamais eu à
 * survivre à une fusion de texte. Le plancher horodaté reste un entier et
 * ramène la collision à « deux machines dans la même seconde ».
 */
export const nextId = (rows: { id: number }[]): number =>
  Math.max(
    rows.reduce((max, r) => Math.max(max, r.id), 0) + 1,
    Math.floor(Date.now() / 1000)
  );

export const now = (): string => new Date().toISOString();

// ponytail: chaque mutation re-sérialise tout le fichier. À 1,5 Mo c'est
// 3 ms, invisible. Mais une analyse pèse ~6 Ko de prose : à couverture
// complète le fichier ferait ~10 Mo, et cocher « Lu » se sentirait. La sortie
// est alors de déplacer analyses et biographies dans un second fichier indexé
// par clé naturelle — ce qu'était déjà seed/generated-content.json.
