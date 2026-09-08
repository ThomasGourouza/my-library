import { NextRequest, NextResponse } from "next/server";
import {
  countBooksByAuthor,
  deleteAuthor,
  getAuthor,
  updateAuthor,
} from "@/lib/queries";
import { DuplicateError } from "@/lib/store";
import { authorUpdateSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const notFoundResponse = () =>
  NextResponse.json({ error: "Auteur introuvable" }, { status: 404 });

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const author = getAuthor(id);
  if (!author) return notFoundResponse();
  return NextResponse.json({ author });
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

  const parsed = authorUpdateSchema.safeParse(body);
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
    const author = updateAuthor(id, parsed.data);
    if (!author) return notFoundResponse();
    return NextResponse.json({ author });
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

  if (!getAuthor(id)) return notFoundResponse();
  const bookCount = countBooksByAuthor(id);
  if (bookCount > 0) {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer : des livres sont rattachés à cet auteur",
        bookCount,
      },
      { status: 409 }
    );
  }

  deleteAuthor(id);
  return NextResponse.json({ ok: true });
}
