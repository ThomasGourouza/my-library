/**
 * La porte par mot de passe, côté Next : lecture du cookie de la requête
 * courante, et refus des écritures non authentifiées.
 *
 * Le dépôt étant public, cette porte protège d'abord les **écritures** :
 * `data/library.json` reste lisible par tout le monde sur github.com. Ce
 * qu'elle empêche, c'est qu'un inconnu coche « Lu », crée un livre ou vide une
 * liste — chacune de ces actions étant un commit signé de l'identité du
 * propriétaire du token.
 *
 * La crypto elle-même vit dans `@/lib/session`, sans dépendance à Next, pour
 * que le proxy puisse appeler exactement la même vérification.
 *
 * `requireAuth()` est appelée par les 12 routes mutantes une par une, plutôt
 * que déléguée au proxy : un matcher qui change, et l'écriture serait ouverte
 * sans que rien ne le signale.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, authEnabled, verifyCookie } from "@/lib/session";

export { COOKIE, authEnabled, checkPassword, issueCookie } from "@/lib/session";

/** Vrai si la requête courante porte une session valide. */
export async function isAuthenticated(): Promise<boolean> {
  if (!authEnabled()) return true;
  const jar = await cookies();
  return verifyCookie(jar.get(COOKIE)?.value);
}

/**
 * À appeler en tête des routes qui écrivent. Rend une réponse 401 à renvoyer
 * telle quelle, ou `null` quand la requête est autorisée.
 */
export async function requireAuth(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json(
    { error: "Non authentifié : reconnectez-vous pour modifier la bibliothèque." },
    { status: 401 }
  );
}
