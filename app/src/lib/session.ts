/**
 * Le jeton de session : signature, vérification, mot de passe.
 *
 * Rien de Next ici — ni `next/headers`, ni `next/server`. C'est ce qui permet
 * au proxy et aux routes d'appeler **la même** crypto : la question « faut-il
 * dupliquer la vérification entre deux couches ? » ne se pose pas, il n'y en a
 * qu'une, dans ce fichier.
 *
 * Le cookie est `<exp>.<hmac(secret, exp)>`. Il porte donc son expiration et la
 * signe : signer une constante donnerait un jeton éternel, que rien ne pourrait
 * révoquer sans changer le secret.
 */
import crypto from "node:crypto";

export const COOKIE = "bibliotheque_session";

/**
 * 30 jours. Une expiration courte se rappellerait au mauvais moment : un
 * `router.refresh()` après une modification échouerait en silence, et la page
 * afficherait un état périmé sans rien dire.
 */
export const MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * La porte n'existe que si un mot de passe **et** un secret sont configurés. En
 * local il n'y en a pas, et l'application s'ouvre directement — c'est ce qui
 * permet de la tester en posant simplement les deux variables.
 */
export const authEnabled = (): boolean =>
  Boolean(process.env.LIBRARY_PASSWORD && process.env.LIBRARY_SESSION_SECRET);

function secret(): string {
  const value = process.env.LIBRARY_SESSION_SECRET;
  if (!value) {
    throw new Error(
      "LIBRARY_SESSION_SECRET manquant : impossible de signer ou de vérifier " +
        "un cookie de session."
    );
  }
  return value;
}

const sign = (payload: string): string =>
  crypto.createHmac("sha256", secret()).update(payload).digest("hex");

/**
 * Comparaison en temps constant. Les deux valeurs sont d'abord condensées :
 * `timingSafeEqual` exige des longueurs égales et lèverait sur des entrées de
 * tailles différentes — ce qui, en soi, révélerait la longueur attendue.
 */
function sameValue(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export const checkPassword = (attempt: string): boolean => {
  const expected = process.env.LIBRARY_PASSWORD;
  // Une réponse constante, pas un code : la force brute se traite par un mot de
  // passe aléatoire de 32 caractères, pas par un compteur en mémoire qu'une
  // instance froide remettrait à zéro.
  return Boolean(expected) && sameValue(attempt, expected!);
};

/** Le cookie à poser après une authentification réussie. */
export function issueCookie(): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
} {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  return {
    name: COOKIE,
    value: `${exp}.${sign(String(exp))}`,
    options: {
      httpOnly: true,
      // En HTTP local, un cookie `Secure` ne serait jamais renvoyé — et la page
      // de connexion boucherait sur elle-même. En ligne, tout est en HTTPS.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_S,
    },
  };
}

/**
 * Signature valide **et** non expirée.
 *
 * `SameSite=Lax` sur le cookie tient lieu du jeton CSRF absent : les 12 routes
 * mutantes acceptent du JSON sans contrôle d'origine.
 */
export function verifyCookie(value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot === -1) return false;
  const exp = value.slice(0, dot);
  const mac = value.slice(dot + 1);

  const seconds = Number(exp);
  if (!Number.isInteger(seconds) || seconds * 1000 <= Date.now()) return false;
  return sameValue(mac, sign(exp));
}
