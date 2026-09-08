import { NextRequest, NextResponse } from "next/server";
import { createAuthor, listAuthors, type AuthorFilters } from "@/lib/queries";
import { isConflict } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { authorInputSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters: AuthorFilters = {};
  const keys = [
    "search",
    "mainField",
    "mainGenre",
    "period",
    "nationality",
    "language",
  ] as const;
  for (const key of keys) {
    const value = sp.get(key);
    if (value) filters[key] = value;
  }
  return NextResponse.json({ authors: await listAuthors(filters) });
}

export async function POST(request: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = authorInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Données invalides",
        details: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "corps"} : ${i.message}`
        ),
      },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      { author: await createAuthor(parsed.data) },
      { status: 201 }
    );
  } catch (err) {
    // Doublon refusé, ou source modifiée entre la lecture et l'écriture : dans
    // les deux cas un 409 assorti du message, que les clients affichent en toast.
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
