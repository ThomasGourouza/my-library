import { NextRequest, NextResponse } from "next/server";
import { authorExists, createBook, listBooks } from "@/lib/queries";
import { DuplicateError } from "@/lib/store";
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
  return NextResponse.json({ books: listBooks(parsed.data) });
}

export async function POST(request: NextRequest) {
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
  const data = parsed.data;

  if (data.authorId != null && !authorExists(data.authorId)) {
    return NextResponse.json({ error: "Auteur introuvable" }, { status: 400 });
  }

  try {
    return NextResponse.json({ book: createBook(data) }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
