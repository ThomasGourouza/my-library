/**
 * `git pull` déclenché depuis l'interface — le pendant du bouton « Rafraîchir ».
 *
 * L'application déployée écrit dans `data/library.json` sur `master` à chaque
 * modification. Sur le poste local, la bibliothèque est le fichier du disque :
 * sans un `git pull`, elle ignore tout de ce qui a été fait en ligne. C'est la
 * seule couture du dispositif, et ce bouton est là pour ne pas avoir à changer
 * de fenêtre pour la recoudre.
 *
 * **Cette route n'existe qu'en local.** Elle exécute une commande, donc elle
 * doit être inerte partout ailleurs : le garde-fou est `onLocalFile()`, le même
 * qui conditionne « Analyse Claude ». Sur Vercel il n'y a de toute façon ni
 * dépôt git ni disque inscriptible, mais mieux vaut deux raisons qu'une.
 *
 * Aucune entrée utilisateur ne touche la ligne de commande : les arguments sont
 * des constantes, et `execFile` n'ouvre pas de shell.
 */
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { invalidate, onLocalFile } from "@/lib/store";

const run = promisify(execFile);

/** Une commande git bloquée ne doit pas retenir la requête indéfiniment. */
const TIMEOUT_MS = 60_000;

const git = (args: string[], cwd: string) =>
  run("git", args, { cwd, timeout: TIMEOUT_MS });

export async function POST() {
  if (!onLocalFile()) {
    return NextResponse.json(
      { error: "Le rafraîchissement n'existe que sur l'installation locale." },
      { status: 403 }
    );
  }

  // La racine du dépôt plutôt que `..` : le serveur peut être lancé
  // d'ailleurs, et git répond mieux à la question que nous.
  let repo: string;
  try {
    const { stdout } = await git(["rev-parse", "--show-toplevel"], process.cwd());
    repo = stdout.trim();
  } catch {
    return NextResponse.json(
      { error: "Aucun dépôt git ici : impossible de tirer les données." },
      { status: 500 }
    );
  }

  const head = async () => (await git(["rev-parse", "HEAD"], repo)).stdout.trim();
  const avant = await head();

  // Le refus le plus fréquent, dit en français plutôt qu'en git.
  //
  // C'est LE garde-fou du dispositif : tant que le fichier a des modifications
  // non committées, `git pull` refuse de les écraser. Le message de git le dit
  // très bien, mais dans la langue du système et noyé dans la progression du
  // fetch — autant reconnaître le cas nous-mêmes, ce qui ne dépend d'aucune
  // langue.
  const sale = (
    await git(["status", "--porcelain", "--", "data/library.json"], repo)
  ).stdout.trim();
  if (sale) {
    return NextResponse.json(
      {
        error:
          "data/library.json a des modifications non committées : git refuserait " +
          "de les écraser. Committez-les (ou annulez-les) avant de rafraîchir.",
      },
      { status: 409 }
    );
  }

  try {
    // `--ff-only` : un bouton ne doit pas fabriquer un commit de fusion. Si les
    // deux côtés ont divergé, on s'arrête et on le dit — cela se règle dans un
    // terminal, en connaissance de cause.
    await git(["pull", "--ff-only"], repo);
  } catch (e) {
    // git écrit ses explications sur stderr, et dans la langue du système :
    // on les rend telles quelles plutôt que de les interpréter.
    const detail =
      (e as { stderr?: string; message?: string }).stderr?.trim() ||
      (e as Error).message ||
      "erreur inconnue";
    // On écarte la progression du fetch (« From … », « a..b  master -> … »),
    // qui ne dit rien de l'échec et mange la place du vrai message.
    const propre = detail
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^From /.test(l) && !/->\s*\S+$/.test(l))
      .slice(0, 3)
      .join(" ")
      .slice(0, 300);
    return NextResponse.json(
      { error: `git pull a échoué : ${propre}` },
      { status: 409 }
    );
  }

  const apres = await head();

  if (avant === apres) {
    return NextResponse.json({ ok: true, commits: 0, donnees: false });
  }

  const [nb, fichiers] = await Promise.all([
    git(["rev-list", "--count", `${avant}..${apres}`], repo),
    git(["diff", "--name-only", avant, apres], repo),
  ]);

  const donnees = fichiers.stdout.split("\n").includes("data/library.json");
  // Le fichier a pu être remplacé : le magasin doit repartir de zéro, sans
  // attendre la seconde de fraîcheur, car l'interface se rafraîchit aussitôt.
  if (donnees) invalidate();

  return NextResponse.json({
    ok: true,
    commits: Number(nb.stdout.trim()) || 0,
    donnees,
  });
}
