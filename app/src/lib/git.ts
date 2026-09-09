/**
 * Les commandes git dont l'interface a besoin, en un seul endroit.
 *
 * Deux routes s'en servent — `/api/sync` (surveiller et tirer) et
 * `/api/sync/push` (committer et pousser) — plus le démarrage du serveur
 * (`src/instrumentation.ts`). Rien de tout cela n'existe en ligne : c'est
 * `onLocalFile()` qui garde chaque appelant, et sur Vercel il n'y a de toute
 * façon ni dépôt ni disque inscriptible.
 *
 * Aucune entrée utilisateur ne touche la ligne de commande : tous les arguments
 * sont des constantes, et `execFile` n'ouvre pas de shell.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Une commande bloquée ne doit pas retenir la requête indéfiniment. */
const TIMEOUT_MS = 60_000;

export const DATA = "data/library.json";

export const branche = (): string => process.env.GITHUB_BRANCH ?? "master";

/**
 * `GIT_TERMINAL_PROMPT=0` est ce qui distingue un échec d'un blocage : sans
 * lui, un `git push` sans identifiants en cache attendrait une saisie que
 * personne ne fera jamais, et la requête pendrait jusqu'au délai.
 */
export const git = (args: string[], cwd: string) =>
  run("git", args, {
    cwd,
    timeout: TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

/** La racine du dépôt : le serveur peut être lancé d'ailleurs que depuis `app/`,
 *  et git répond mieux à la question que `path.resolve(cwd, "..")`. */
export async function repoRoot(): Promise<string> {
  const { stdout } = await git(["rev-parse", "--show-toplevel"], process.cwd());
  return stdout.trim();
}

/**
 * Ce que git a dit, débarrassé de la progression du fetch (« From … », la ligne
 * `a..b  master -> origin/master ») qui ne dit rien de l'échec et mange la
 * place du vrai message. git écrit dans la langue du système : on rend son
 * texte tel quel plutôt que de l'interpréter.
 */
export function raison(e: unknown): string {
  const brut =
    (e as { stderr?: string; message?: string }).stderr?.trim() ||
    (e as Error).message ||
    "erreur inconnue";
  return brut
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^From /.test(l) && !/->\s*\S+$/.test(l))
    .slice(0, 3)
    .join(" ")
    .slice(0, 300);
}

export interface EtatSync {
  /** `data/library.json` a des modifications non committées. */
  dirty: boolean;
  /** Commits locaux non poussés. */
  ahead: number;
  /** Commits distants non tirés. */
  behind: number;
}

/**
 * L'état du dépôt vis-à-vis du distant. Ne fait aucun réseau : `fetch` d'abord.
 *
 * La comparaison porte sur **`FETCH_HEAD`**, pas sur `origin/<branche>`, et
 * c'est le cœur du dispositif. `git fetch origin master` écrit toujours
 * `FETCH_HEAD` — c'est la seule chose qu'il garantisse — mais il ne met pas
 * forcément à jour la branche de suivi. Observé ici : depuis le serveur Next,
 * la sortie du fetch se limitait à « master -> FETCH_HEAD » sans la ligne
 * « a..b master -> origin/master », si bien que `HEAD..origin/master` valait
 * éternellement 0 et que rien n'était jamais tiré. Le fetch ramène pourtant
 * bien les objets : `FETCH_HEAD` les désigne, et suffit à tout comparer.
 */
export async function etat(repo: string): Promise<EtatSync> {
  const ref = (await git(["rev-parse", "--verify", "--quiet", "FETCH_HEAD"], repo)
    .then(({ stdout }) => stdout.trim())
    .catch(() => "")) || `origin/${branche()}`;
  const [sale, avance, retard] = await Promise.all([
    git(["status", "--porcelain", "--", DATA], repo),
    git(["rev-list", "--count", `${ref}..HEAD`], repo),
    git(["rev-list", "--count", `HEAD..${ref}`], repo),
  ]);
  return {
    dirty: sale.stdout.trim().length > 0,
    ahead: Number(avance.stdout.trim()) || 0,
    behind: Number(retard.stdout.trim()) || 0,
  };
}

/**
 * Un verrou d'exclusion, même chaîne de promesses que le mutex d'écriture du
 * magasin. Le sondage toutes les 15 s et un clic sur « Pousser » peuvent
 * tomber en même temps ; deux commandes git concurrentes sur le même dépôt se
 * marcheraient dessus (index verrouillé, rebase à moitié appliqué).
 */
const q = globalThis as unknown as { __gitQueue?: Promise<unknown> };

export function seul<T>(fn: () => Promise<T>): Promise<T> {
  const precedent = q.__gitQueue ?? Promise.resolve();
  const suite = precedent.then(fn, fn);
  q.__gitQueue = suite.then(
    () => undefined,
    () => undefined
  );
  return suite;
}
