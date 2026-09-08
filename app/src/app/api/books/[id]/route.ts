import { NextRequest, NextResponse } from "next/server";
import { deleteBook, getBook, updateBook } from "@/lib/queries";
import { isConflict } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
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

  const book = await getBook(id);
  if (!book) return notFoundResponse();
  return NextResponse.json({ book });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAuth();
  if (denied) return denied;

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

  // `updateBook` porte la règle d'unicité (titre, auteur) et l'existence de
  // l'auteur : une seule vérification, dans la mutation, là où elle ne peut
  // plus être invalidée entre le contrôle et l'écriture.
  try {
    const book = await updateBook(id, parsed.data);
    if (!book) return notFoundResponse();
    return NextResponse.json({ book });
  } catch (err) {
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAuth();
  if (denied) return denied;

  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  // Emporte les entrées de listes qui désignaient ce livre.
  try {
    if (!(await deleteBook(id))) return notFoundResponse();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
