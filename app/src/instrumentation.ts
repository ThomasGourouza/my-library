/**
 * Au démarrage du serveur : tirer les données une fois.
 *
 * `register()` est appelé une fois par processus, en `next dev` comme en
 * `next start`, et **jamais pendant `next build`** — Next retourne avant même
 * de charger ce module quand `NEXT_PHASE` vaut `phase-production-build`. Le
 * fichier de données n'est donc jamais touché à la construction.
 *
 * L'import est dynamique et à l'intérieur du garde de runtime, ce que la
 * documentation recommande et qui est ici obligatoire : `@/lib/git` charge
 * `node:child_process`, absent du runtime Edge, où `register()` est pourtant
 * appelé aussi.
 *
 * Rien de tout cela ne doit empêcher le serveur de démarrer : un dépôt
 * injoignable, un réseau coupé ou des modifications locales non committées se
 * signalent dans la console et le démarrage continue. La barre de navigation
 * reprendra la main quinze secondes plus tard.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { onLocalFile } = await import("@/lib/store");
    if (!onLocalFile()) return;

    const { branche, etat, git, raison, repoRoot, seul } = await import("@/lib/git");

    await seul(async () => {
      const repo = await repoRoot();
      try {
        await git(["fetch", "origin", branche()], repo);
      } catch (e) {
        console.warn(`[sync] dépôt injoignable au démarrage — ${raison(e)}`);
        return;
      }
      const { behind, dirty } = await etat(repo);
      if (behind === 0) return;
      if (dirty) {
        console.warn(
          `[sync] ${behind} commit(s) à tirer, mais data/library.json a des ` +
            "modifications non committées : poussez-les depuis l'application."
        );
        return;
      }
      await git(["pull", "--ff-only"], repo);
      console.log(`[sync] ${behind} commit(s) tiré(s) au démarrage.`);
    });
  } catch (e) {
    // Y compris l'échec des imports eux-mêmes : rien ici ne doit empêcher le
    // serveur de démarrer.
    console.warn("[sync] synchronisation au démarrage impossible :", e);
  }
}
