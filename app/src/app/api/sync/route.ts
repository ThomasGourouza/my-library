/**
 * La surveillance du dépôt distant, sondée par la barre de navigation.
 *
 * Une seule requête sert les deux besoins : elle **tire** si le distant a
 * pris de l'avance, et elle renvoie de quoi savoir s'il y a quelque chose à
 * pousser (donc si le bouton doit être actif).
 *
 * `POST` et non `GET` : l'appel modifie l'état du dépôt. Un GET qui mute serait
 * préchargé par le navigateur au premier survol de lien.
 *
 * Les pannes de réseau ne sont pas des erreurs ici. Ce sondage tourne toutes
 * les 15 s : un dépôt injoignable doit rendre un état paisible (`blocked`), pas
 * une erreur qui déclencherait un toast rouge quatre fois par minute.
 */
import { NextResponse } from "next/server";
import { invalidate, onLocalFile } from "@/lib/store";
import { DATA, branche, etat, git, raison, repoRoot, seul } from "@/lib/git";

export async function POST() {
  if (!onLocalFile()) {
    return NextResponse.json(
      { error: "La synchronisation n'existe que sur l'installation locale." },
      { status: 403 }
    );
  }

  return seul(async () => {
    let repo: string;
    try {
      repo = await repoRoot();
    } catch {
      return NextResponse.json(
        { error: "Aucun dépôt git ici : impossible de synchroniser." },
        { status: 500 }
      );
    }

    const repos = (bloque: string | null, pulled = 0, dataChanged = false) =>
      etat(repo).then((e) =>
        NextResponse.json({ ...e, pulled, dataChanged, blocked: bloque })
      );

    try {
      await git(["fetch", "origin", branche()], repo);
    } catch (e) {
      // Hors ligne, ou GitHub indisponible : on rend l'état local tel quel.
      return repos(`Dépôt injoignable — ${raison(e)}`);
    }

    const avant = await etat(repo);
    if (avant.behind === 0) return repos(null);

    // Le fichier a des modifications non committées : `git pull` refuserait de
    // les écraser, et c'est le bon comportement. Pousser débloquera.
    if (avant.dirty) {
      return repos("Modifications locales à pousser avant de pouvoir tirer");
    }

    const head = async () =>
      (await git(["rev-parse", "HEAD"], repo)).stdout.trim();
    const depuis = await head();
    try {
      await git(["pull", "--ff-only"], repo);
    } catch (e) {
      return repos(`Impossible de tirer — ${raison(e)}`);
    }
    const vers = await head();

    const fichiers = await git(["diff", "--name-only", depuis, vers], repo);
    const dataChanged = fichiers.stdout.split("\n").includes(DATA);
    // Sans cela, le rafraîchissement qui suit immédiatement retomberait sur la
    // seconde de fraîcheur du magasin et afficherait encore l'ancien état.
    if (dataChanged) invalidate();

    return repos(null, avant.behind, dataChanged);
  });
}
