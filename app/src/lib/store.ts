/**
 * Le magasin de données : un seul fichier JSON, tenu en mémoire.
 *
 * Deux backends, choisis une fois par environnement. En local, le fichier
 * `../data/library.json` sur le disque (`store/file.ts`). Déployé, le même
 * fichier lu et **committé** via l'API GitHub (`store/github.ts`) : la copie
 * sur `master` est alors la seule source, identique en ligne et en local au
 * dernier commit.
 *
 * Lecture — `store()` rend le contenu en mémoire, revalidé si la source a
 * changé : un `git pull` (ou un commit poussé depuis l'application déployée)
 * est pris en compte sans redémarrer.
 * Écriture — `mutate()` modifie la mémoire puis réécrit la source entière.
 *
 * **Plus rien n'est synchrone**, et c'est le changement dont tout le reste
 * découle. Le commentaire qui promettait ici que « rien ne peut s'intercaler
 * entre la relecture et le rename » était vrai du temps de better-sqlite3 puis
 * du fichier lu en synchrone. Il ne l'est plus : `mutate()` rend une promesse,
 * et deux mutations qui se chevauchent recevraient de `store()` le **même
 * objet en cache** — la seconde sérialiserait la modification de la première
 * et partirait avec le même jeton. Ce n'est pas un entrelacement rare : cocher
 * cinq lignes de `/livres` lance cinq requêtes concurrentes. D'où le mutex
 * ci-dessous : les mutations passent une par une.
 *
 * Aucun effet de bord à l'import — impératif : `next build` charge le bundle de
 * chaque page et de chaque route pour les analyser. C'est exactement comme cela
 * qu'un `data/library.db` vide s'est retrouvé créé du temps de SQLite, par un
 * `export const db = …` au niveau module. Ici, tout se fait dans les fonctions.
 */
import { normalizeKey } from "@/lib/normalize";
import type { Store } from "@/lib/types";
import type { Snapshot } from "@/lib/store/snapshot";
import * as fileBackend from "@/lib/store/file";
import * as githubBackend from "@/lib/store/github";

export { ConflictError, DuplicateError, StaleWriteError } from "@/lib/store/errors";
import { ConflictError } from "@/lib/store/errors";

/**
 * Deux fonctions et un `if`, pas une interface à deux implémentations : il y a
 * une implémentation par environnement, choisie une fois.
 */
const onGithub = (): boolean =>
  (process.env.LIBRARY_BACKEND ?? (process.env.GITHUB_REPO ? "github" : "file")) ===
  "github";

function backend() {
  if (onGithub()) return githubBackend;
  // Sur Vercel, `FILE` pointe vers un chemin inexistant et le système de
  // fichiers est en lecture seule : un GITHUB_REPO absent ou mal orthographié
  // sélectionnerait silencieusement le backend fichier et renverrait ENOENT sur
  // toutes les pages. Mieux vaut nommer la variable qui manque.
  if (process.env.VERCEL) {
    throw new Error(
      "Backend fichier sélectionné sur Vercel, où il ne peut pas fonctionner " +
        "(pas de `data/`, système de fichiers en lecture seule). Renseignez " +
        "GITHUB_REPO et GITHUB_TOKEN dans les variables d'environnement du projet."
    );
  }
  return fileBackend;
}

/**
 * Vrai quand la bibliothèque est le fichier du disque — donc en local, dans une
 * copie de travail git. C'est la condition de tout ce qui n'a de sens qu'ici :
 * lancer une analyse, ou tirer les données avec `git pull`.
 */
export const onLocalFile = (): boolean => !onGithub();

/**
 * « Analyse Claude » n'existe que sur le backend fichier : l'Agent SDK réutilise
 * la session Claude Code locale, que la documentation interdit aux tiers de
 * rejouer, et le mode clé d'API est facturé au token. Les analyses déjà
 * produites, elles, s'affichent partout — elles sont dans le fichier.
 */
export const analysisEnabled = (): boolean => onLocalFile();

/**
 * Clés de recherche et de déduplication, absentes du fichier et posées à la
 * lecture : elles ne peuvent donc pas se désynchroniser de la valeur affichée.
 * Le revers, à ne pas oublier dans les fonctions de création : elles doivent
 * être posées sur tout enregistrement neuf, car les composants client les
 * lisent (books-view, books-table, authors-view, …).
 */
const DERIVED = new Set(["nameNormalized", "titleNormalized"]);

/**
 * Plancher de fraîcheur. Sans lui, l'amplification des lectures — `/` appelle
 * `store()` trois fois, `POST /api/lists/[id]/items` quatre fois plus une
 * écriture, cinq pages interrogent la donnée dans `generateMetadata` **et**
 * dans le corps — deviendrait autant d'allers-retours réseau sur le backend
 * GitHub. Avec lui, chaque page en fait **un**, l'obsolescence est bornée à une
 * seconde, et les lectures plafonnent à ~60/min contre 5 000/h autorisées.
 *
 * `React.cache()` ne remplace pas ceci : c'est un no-op dans les Route
 * Handlers — `if (!dispatcher) return fn.apply(null, arguments)`, sans erreur ni
 * avertissement. Il marcherait là où on le teste et échouerait en silence dans
 * les 12 routes mutantes, c'est-à-dire sur le chemin d'écriture.
 *
 * **Il ne vaut que pour les lectures, et `mutate()` s'en exempte** — voir
 * `apply()`. Une lecture servie avec une seconde de retard n'affiche qu'un état
 * légèrement périmé ; une **écriture** partie d'un état périmé réécrit le
 * fichier entier et détruit ce que la lecture a manqué. C'est exactement ce qui
 * est arrivé : un `git pull` avait ramené quatre livres cochés « Lu » en ligne,
 * une analyse Claude s'est terminée dans la seconde qui suivait, `mutate()` a
 * reçu l'objet en cache d'avant le pull, et les quatre coches ont disparu du
 * fichier. À ne pas « optimiser » en le rendant universel.
 */
const FRESH_MS = 1000;

interface Cached {
  store: Store;
  /** Le texte source tel qu'il a été lu : sert à ne pas réécrire à l'identique. */
  json: string;
  token: string;
  /** Dernière fois que la source a été interrogée (pas forcément relue). */
  checkedAt: number;
}

// Le cache survit au rechargement à chaud de `next dev`, comme le faisait le
// client SQLite.
const g = globalThis as unknown as { __library?: Cached };

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
      `${backend().label()} est incohérent (fusion git à reprendre ?) :\n  - ${problems.join("\n  - ")}`
    );
  }
}

function parse(json: string): Store {
  const fresh = JSON.parse(json) as Store;
  for (const a of fresh.authors) a.nameNormalized = normalizeKey(a.name);
  for (const b of fresh.books) b.titleNormalized = normalizeKey(b.title);
  for (const l of fresh.lists) l.nameNormalized = normalizeKey(l.name);
  assertIntegrity(fresh);
  return fresh;
}

/**
 * Le contenu de la source, revalidé s'il a changé depuis le dernier appel.
 *
 * `exact: true` saute le plancher de fraîcheur et interroge la source dans tous
 * les cas. Réservé au chemin d'écriture (cf. `apply()`).
 */
export async function store({ exact = false } = {}): Promise<Store> {
  const cached = g.__library;
  if (!exact && cached && Date.now() - cached.checkedAt < FRESH_MS) {
    return cached.store;
  }

  try {
    const snap: Snapshot | null = await backend().read(cached?.token);
    if (snap) {
      g.__library = {
        store: parse(snap.json),
        json: snap.json,
        token: snap.token,
        checkedAt: Date.now(),
      };
    } else if (cached) {
      cached.checkedAt = Date.now();
    }
  } catch (e) {
    // Trois causes, un seul bon comportement : continuer à servir le dernier
    // état valide. `git checkout` et `git pull` écrivent les fichiers de façon
    // NON atomique, donc une lecture au mauvais moment tombe sur du JSON
    // tronqué ; le réseau peut lâcher ; GitHub peut renvoyer un 5xx. Le jeton
    // n'est pas avancé, donc la prochaine lecture réessaie — mais `checkedAt`
    // l'est, ce qui borne les tentatives à une par seconde plutôt que de
    // marteler la source pendant toute la panne.
    if (!cached) throw e;
    cached.checkedAt = Date.now();
    console.error(
      `Lecture de ${backend().label()} impossible, dernier état valide conservé :`,
      e
    );
  }
  return g.__library!.store;
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

const serialize = (s: Store): string =>
  JSON.stringify(s, (k, v) => (DERIVED.has(k) ? undefined : v), 2) + "\n";

/** Le jeton et le message ne concernent que GitHub : le `if` est ici plutôt
 *  que sous forme de paramètres muets dans le backend fichier. */
const writeSource = (json: string, token: string, message: string): Promise<string> =>
  onGithub()
    ? githubBackend.write(json, token, message)
    : fileBackend.write(json);

/**
 * Le mutex : une chaîne de promesses. Un utilisateur, une instance — les
 * mutations concurrentes deviennent séquentielles, le partage de l'objet en
 * cache disparaît, et les 409 du backend GitHub deviennent quasi impossibles
 * (il faudrait une écriture venue d'ailleurs entre deux des nôtres).
 *
 * La chaîne est neutralisée après chaque maillon : une mutation qui échoue ne
 * doit pas empêcher la suivante de partir.
 */
const q = globalThis as unknown as { __libraryQueue?: Promise<unknown> };

/**
 * Applique une modification, puis réécrit la source.
 *
 * `fn` doit chercher ses enregistrements dans le `Store` qu'on lui passe, par
 * identifiant — jamais via une référence retenue avant un `await`. Un objet lu
 * plus tôt peut appartenir à une version périmée du magasin, et le modifier
 * n'écrirait rien : c'est le cas de `runAnalysis`, qui écrit une minute après
 * avoir lu. C'est la règle que la transaction SQL tenait à sa place.
 *
 * `message` décrit l'écriture ; il devient le message du commit sur le backend
 * GitHub et est ignoré par le backend fichier. Il est dérivé du résultat pour
 * que les fonctions publiques (`createBook`, `deleteList`, …) gardent leur
 * signature : c'est ici, et nulle part dans les routes, que l'intention se dit.
 *
 * En cas d'échec — doublon refusé, disque plein, conflit GitHub — le cache est
 * jeté : la mémoire ne reste jamais en avance sur la source.
 */
export function mutate<T>(
  fn: (s: Store) => T,
  message: (result: T) => string
): Promise<T> {
  const previous = q.__libraryQueue ?? Promise.resolve();
  const run = previous.then(
    () => apply(fn, message),
    () => apply(fn, message)
  );
  q.__libraryQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function apply<T>(
  fn: (s: Store) => T,
  message: (result: T) => string
): Promise<T> {
  // `exact` : jamais le cache du plancher de fraîcheur ici. Une mutation est un
  // lire-modifier-réécrire sur la totalité du fichier ; partir d'un état vieux
  // d'une seconde suffit à effacer ce qu'un `git pull` vient de ramener.
  const current = await store({ exact: true });
  try {
    const result = fn(current);
    sortRecords(current);

    // Avant l'écriture, pas seulement à la lecture. C'est la ligne la plus
    // utile du dispositif : sans elle, l'application peut committer un fichier
    // qu'elle refusera ensuite de relire — et se met alors définitivement à
    // terre, à corriger à la main dans l'éditeur web de GitHub. Avec elle, une
    // requête échoue avec un message en français. ~1 ms sur 3 100 lignes.
    assertIntegrity(current);

    const json = serialize(current);
    const cached = g.__library!;
    // Rien n'a bougé : ne pas committer 1,5 Mo pour un `deleteBook` sur un
    // identifiant inconnu ou un livre déjà présent dans la liste.
    if (json === cached.json) return result;

    const token = await writeSource(json, cached.token, message(result));
    g.__library = { store: current, json, token, checkedAt: Date.now() };
    return result;
  } catch (e) {
    g.__library = undefined;
    throw e;
  }
}

/**
 * Jette le cache : la prochaine lecture repart de la source.
 *
 * Utile après un `git pull`, qui remplace le fichier sous les pieds du
 * magasin. Le `mtime` suffirait à le faire remarquer, mais pas avant la
 * seconde de fraîcheur ; or l'interface se rafraîchit tout de suite après, et
 * afficherait encore les anciennes données.
 */
export function invalidate(): void {
  g.__library = undefined;
}

/** Vrai si l'erreur doit devenir un 409 assorti de son message. */
export const isConflict = (e: unknown): e is ConflictError =>
  e instanceof ConflictError;

/**
 * Identifiant neuf.
 *
 * Pas un simple `max + 1` : deux machines qui ajoutent chacune un livre
 * prendraient le même, git fusionnerait les deux blocs sans broncher, et
 * `find()` renverrait l'un des deux au hasard. `AUTOINCREMENT` n'a jamais eu à
 * survivre à une fusion de texte. Le plancher horodaté reste un entier et
 * ramène la collision à « deux machines dans la même seconde ».
 *
 * Il est calculé **dans** le callback de `mutate`, après relecture, et doit y
 * rester : le sortir produirait des identifiants en double sur deux mutations
 * successives, donc `assertIntegrity`, donc des 500 permanents. À ne pas
 * « optimiser ».
 */
export const nextId = (rows: { id: number }[]): number =>
  Math.max(
    rows.reduce((max, r) => Math.max(max, r.id), 0) + 1,
    Math.floor(Date.now() / 1000)
  );

export const now = (): string => new Date().toISOString();

// ponytail: chaque mutation re-sérialise tout le fichier. À 1,5 Mo c'est
// 3 ms, invisible en local ; en ligne c'est un corps de 2,1 Mo en base64 et un
// commit, soit 1 à 2 s par clic. Mais une analyse pèse ~6 Ko de prose : à
// couverture complète le fichier ferait ~10 Mo, et l'écriture deviendrait
// pénible dans les deux cas. La sortie est alors de déplacer analyses et
// biographies dans un second fichier indexé par clé naturelle — ce qu'était
// déjà seed/generated-content.json.
