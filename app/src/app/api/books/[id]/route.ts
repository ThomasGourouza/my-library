import { NextRequest, NextResponse } from "next/server";
import {
  authorExists,
  deleteBook,
  getBook,
  updateBook,
} from "@/lib/queries";
import { DuplicateError } from "@/lib/store";
import { bookUpdateSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const notFoundResponse = () =>
  NextResponse.json({ error: "Livre introuvable" }, { status: 404 });

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const book = getBook(id);
  if (!book) return notFoundResponse();
  return NextResponse.json({ book });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = bookUpdateSchema.safeParse(body);
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

  // `updateBook` porte la règle d'unicité (titre, auteur) : une seule
  // vérification, là où la route en faisait une avant l'UPDATE et rattrapait
  // en plus la violation de contrainte SQL après.
  try {
    const book = updateBook(id, data);
    if (!book) return notFoundResponse();
    return NextResponse.json({ book });
  } catch (err) {
    if (err instanceof DuplicateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  // Emporte les entrées de listes qui désignaient ce livre.
  if (!deleteBook(id)) return notFoundResponse();
  return NextResponse.json({ ok: true });
}
