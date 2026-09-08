import { NextRequest, NextResponse } from "next/server";
import { createBook, listBooks } from "@/lib/queries";
import { isConflict } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { bookInputSchema, bookQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = bookQuerySchema.safeParse(Object.fromEntries(sp.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Paramètres de requête invalides",
        details: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "corps"} : ${i.message}`
        ),
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ books: await listBooks(parsed.data) });
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

  const parsed = bookInputSchema.safeParse(body);
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

  // L'existence de l'auteur est vérifiée dans le callback de `createBook`, et
  // non plus ici : la lecture étant asynchrone, un contrôle fait dans la route
  // pouvait être invalidé avant l'écriture — et fabriquer un livre orphelin.
  try {
    return NextResponse.json(
      { book: await createBook(parsed.data) },
      { status: 201 }
    );
  } catch (err) {
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
