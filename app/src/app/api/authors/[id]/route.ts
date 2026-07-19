import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { authors } from "@/db/schema";
import { countBooksByAuthor, getAuthor } from "@/lib/queries";
import { normalizeKey, normalizeText } from "@/lib/normalize";
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

  const current = db.select().from(authors).where(eq(authors.id, id)).get();
  if (!current) return notFoundResponse();

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

  const data = parsed.data;
  const updates: Partial<typeof authors.$inferInsert> = {};

  if (data.name !== undefined) {
    const name = normalizeText(data.name);
    const nameNormalized = normalizeKey(name);
    const duplicate = db
      .select({ id: authors.id })
      .from(authors)
      .where(
        and(eq(authors.nameNormalized, nameNormalized), ne(authors.id, id))
      )
      .get();
    if (duplicate) {
      return NextResponse.json(
        { error: "Cet auteur existe déjà" },
        { status: 409 }
      );
    }
    updates.name = name;
    updates.nameNormalized = nameNormalized;
  }

  if (data.birthYear !== undefined) updates.birthYear = data.birthYear ?? null;
  if (data.deathYear !== undefined) updates.deathYear = data.deathYear ?? null;
  if (data.nationality !== undefined)
    updates.nationality = data.nationality ?? null;
  if (data.language !== undefined) updates.language = data.language ?? null;
  if (data.mainGenre !== undefined) updates.mainGenre = data.mainGenre ?? null;
  if (data.mainField !== undefined) updates.mainField = data.mainField ?? null;
  if (data.period !== undefined) updates.period = data.period ?? null;
  if (data.notes !== undefined) updates.notes = data.notes ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ author: current });
  }

  const author = db
    .update(authors)
    .set({ ...updates, updatedAt: sql`(datetime('now'))` })
    .where(eq(authors.id, id))
    .returning()
    .get();

  return NextResponse.json({ author });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const current = db
    .select({ id: authors.id })
    .from(authors)
    .where(eq(authors.id, id))
    .get();
  if (!current) return notFoundResponse();

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

  db.delete(authors).where(eq(authors.id, id)).run();
  return NextResponse.json({ ok: true });
}
