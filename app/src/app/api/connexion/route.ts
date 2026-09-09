/**
 * La route de connexion : un mot de passe contre un cookie signé.
 *
 * Exemptée du proxy (cf. `src/proxy.ts`), sans quoi rien ne pourrait jamais
 * l'atteindre.
 */
import { NextRequest, NextResponse } from "next/server";
import { authEnabled, checkPassword, issueCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!authEnabled()) {
    return NextResponse.json(
      { error: "Aucun mot de passe n'est configuré sur cette installation." },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const password = (body as { password?: unknown })?.password;
  if (typeof password !== "string" || !checkPassword(password)) {
    // Le même message pour un mot de passe vide et pour un mot de passe faux :
    // il n'y a rien à apprendre ici.
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  // Derrière le proxy de Vercel, `nextUrl.protocol` reste `http:` : c'est
  // `x-forwarded-proto` qui dit la vérité sur le protocole vu par le navigateur.
  const forwarded = request.headers.get("x-forwarded-proto");
  const secure = forwarded
    ? forwarded.split(",")[0].trim() === "https"
    : request.nextUrl.protocol === "https:";

  const response = NextResponse.json({ ok: true });
  const { name, value, options } = issueCookie(secure);
  response.cookies.set(name, value, options);
  return response;
}
