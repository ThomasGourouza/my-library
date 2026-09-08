/**
 * La porte par mot de passe, en amont de toutes les pages et de toutes les
 * routes.
 *
 * Next 16 a renommé Middleware en Proxy ; le fichier vit à la racine de `src/`,
 * au même niveau que `app/`, et il ne peut y en avoir qu'un.
 *
 * Il vérifie la **signature** du cookie, pas seulement sa présence — le proxy
 * tourne sur le runtime Node.js depuis Next 16, donc `node:crypto` y est
 * disponible et la vérification est celle de `@/lib/session`, la même qu'appelle
 * `requireAuth()`. Un contrôle de simple présence laisserait n'importe quel
 * cookie forgé ouvrir la bibliothèque en lecture.
 *
 * Cela ne dispense **pas** les routes d'appeler `requireAuth()` : l'autorisation
 * ne doit pas reposer sur une couche qu'un changement de matcher peut désactiver
 * sans bruit. Ici c'est une porte ; là-bas c'est la serrure.
 *
 * `/api` n'est **pas** exempté : sans cela, la bibliothèque entière resterait
 * lisible par `GET /api/books` depuis l'extérieur.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE, authEnabled, verifyCookie } from "@/lib/session";

export function proxy(request: NextRequest) {
  // Pas de mot de passe configuré : c'est le cas du développement local, et
  // l'application s'ouvre directement.
  if (!authEnabled()) return NextResponse.next();

  if (verifyCookie(request.cookies.get(COOKIE)?.value)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  // Une requête d'API n'a que faire d'une redirection vers un formulaire : le
  // client attend du JSON, et `fetch` suivrait la redirection en silence pour
  // finir par parser du HTML.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Non authentifié : reconnectez-vous pour accéder à la bibliothèque." },
      { status: 401 }
    );
  }

  const login = new URL("/connexion", request.url);
  // Pour revenir là où l'on allait une fois le mot de passe donné.
  if (pathname !== "/") login.searchParams.set("suivant", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Sans matcher, le proxy tournerait aussi sur les fichiers statiques et
  // bloquerait le CSS de la page de connexion elle-même.
  matcher: [
    "/((?!connexion|api/connexion|_next/static|_next/image|favicon.ico).*)",
  ],
};
