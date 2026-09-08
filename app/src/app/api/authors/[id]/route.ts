import { NextRequest, NextResponse } from "next/server";
import { deleteAuthor, getAuthor, updateAuthor } from "@/lib/queries";
import { isConflict } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
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

  const author = await getAuthor(id);
  if (!author) return notFoundResponse();
  return NextResponse.json({ author });
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
    const author = await updateAuthor(id, parsed.data);
    if (!author) return notFoundResponse();
    return NextResponse.json({ author });
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

  // Existence et comptage des livres sont décidés **dans** la mutation, pas
  // ici : la séquence getAuthor → countBooksByAuthor → deleteAuthor laissait
  // passer, entre le comptage et la suppression, un livre rattaché à cet
  // auteur. Il en serait resté orphelin, et le fichier illisible à la lecture
  // suivante — donc toutes les pages en 500.
  try {
    const result = await deleteAuthor(id);
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.reason === "missing") return notFoundResponse();
    return NextResponse.json(
      {
        error: "Impossible de supprimer : des livres sont rattachés à cet auteur",
        bookCount: result.bookCount,
      },
      { status: 409 }
    );
  } catch (err) {
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
