/**
 * Committer `data/library.json` et le pousser — l'autre sens de la
 * synchronisation, celui qui demande une décision et reste donc un bouton.
 *
 * Le site déployé relit le fichier depuis GitHub à chaque requête : pousser
 * suffit à le mettre à jour, il n'y a **rien à redéployer**. Le code, lui,
 * continue de se livrer par `./deploy.sh`.
 */
import { NextResponse } from "next/server";
import { onLocalFile } from "@/lib/store";
import { DATA, branche, etat, git, raison, repoRoot, seul } from "@/lib/git";

const MESSAGE = "Bibliothèque : mise à jour depuis le poste local";

export async function POST() {
  if (!onLocalFile()) {
    return NextResponse.json(
      { error: "L'envoi n'existe que sur l'installation locale." },
      { status: 403 }
    );
  }

  return seul(async () => {
    let repo: string;
    try {
      repo = await repoRoot();
    } catch {
      return NextResponse.json(
        { error: "Aucun dépôt git ici : impossible d'envoyer." },
        { status: 500 }
      );
    }

    // `etat()` compare à FETCH_HEAD : il faut donc un fetch récent pour savoir
    // ce qu'on a en avance. Une panne de réseau ne bloque pas l'envoi — le push
    // dira lui-même s'il est refusé.
    await git(["fetch", "origin", branche()], repo).catch(() => {});

    const avant = await etat(repo);
    if (!avant.dirty && avant.ahead === 0) {
      return NextResponse.json({ error: "Rien à pousser" }, { status: 409 });
    }

    // `-- data/library.json` : le commit ne prend que ce chemin, quel que soit
    // le contenu de l'index. Du code à moitié écrit n'a rien à faire dans un
    // commit déclenché par un bouton.
    if (avant.dirty) {
      try {
        await git(["commit", "-m", MESSAGE, "--", DATA], repo);
      } catch (e) {
        return NextResponse.json(
          { error: `Commit impossible — ${raison(e)}` },
          { status: 409 }
        );
      }
    }

    const pousser = () => git(["push", "origin", `HEAD:${branche()}`], repo);

    try {
      await pousser();
    } catch (premier) {
      // Rejet le plus probable : le distant a bougé entre-temps. On rejoue nos
      // commits par-dessus les siens, puis on repousse.
      //
      // `--autostash` n'est pas un raffinement : sans lui, la reprise échoue
      // dès qu'un fichier **quelconque** du dépôt est modifié — du code en
      // cours d'écriture, par exemple — avec « cannot pull with rebase: You
      // have unstaged changes ». Il met ces modifications de côté le temps du
      // rebase et les remet ensuite.
      try {
        await git(["pull", "--rebase", "--autostash"], repo);
      } catch (e) {
        // Un conflit sur 56 000 lignes de JSON ne se résout pas depuis un
        // bouton : on remet le dépôt d'aplomb et on renvoie au terminal.
        await git(["rebase", "--abort"], repo).catch(() => {});
        return NextResponse.json(
          {
            error:
              `Le distant a changé et la reprise a échoué — ${raison(e)}. ` +
              "À résoudre au terminal : git pull --rebase.",
          },
          { status: 409 }
        );
      }
      try {
        await pousser();
      } catch {
        return NextResponse.json(
          { error: `Envoi refusé — ${raison(premier)}` },
          { status: 409 }
        );
      }
    }

    // Re-fetch avant de rendre l'état : sans lui, `FETCH_HEAD` date d'avant
    // notre propre push et l'interface afficherait encore « 1 à pousser ».
    await git(["fetch", "origin", branche()], repo).catch(() => {});
    const apres = await etat(repo);
    return NextResponse.json({
      ok: true,
      pousses: avant.ahead + (avant.dirty ? 1 : 0),
      ...apres,
    });
  });
}
