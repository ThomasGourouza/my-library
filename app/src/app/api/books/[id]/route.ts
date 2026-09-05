import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { analysisJobs, authors, books } from "@/db/schema";
import { getBook } from "@/lib/queries";
import { normalizeKey, normalizeText } from "@/lib/normalize";
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

  const current = db.select().from(books).where(eq(books.id, id)).get();
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
  const updates: Partial<typeof books.$inferInsert> = {};

  if (data.authorId != null) {
    const existing = db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.id, data.authorId))
      .get();
    if (!existing) {
      return NextResponse.json(
        { error: "Auteur introuvable" },
        { status: 400 }
      );
    }
    if (existing.id !== current.authorId) updates.authorId = existing.id;
  } else if (data.newAuthor != null) {
    const name = normalizeText(data.newAuthor.name);
    const nameNormalized = normalizeKey(name);
    const existingAuthor = db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.nameNormalized, nameNormalized))
      .get();
    const resolvedAuthorId = existingAuthor
      ? existingAuthor.id
      : db
          .insert(authors)
          .values({
            name,
            nameNormalized,
            birthYear: data.newAuthor.birthYear ?? null,
            deathYear: data.newAuthor.deathYear ?? null,
            nationality: data.newAuthor.nationality ?? null,
            language: data.newAuthor.language ?? null,
            mainGenre: data.newAuthor.mainGenre ?? null,
            mainField: data.newAuthor.mainField ?? null,
            period: data.newAuthor.period ?? null,
            notes: data.newAuthor.notes ?? null,
          })
          .returning({ id: authors.id })
          .get().id;
    if (resolvedAuthorId !== current.authorId) updates.authorId = resolvedAuthorId;
  }

  if (data.title !== undefined) {
    const title = normalizeText(data.title);
    const titleNormalized = normalizeKey(title);
    updates.title = title;
    updates.titleNormalized = titleNormalized;
  }

  if (data.category !== undefined) updates.category = data.category;
  if (data.genre !== undefined) updates.genre = data.genre ?? null;
  if (data.courant !== undefined) updates.courant = data.courant ?? null;
  if (data.theme !== undefined) updates.theme = data.theme ?? null;
  if (data.period !== undefined) updates.period = data.period ?? null;
  if (data.publicationYear !== undefined)
    updates.publicationYear = data.publicationYear ?? null;
  if (data.audience !== undefined) updates.audience = data.audience;
  if (data.originalLanguage !== undefined)
    updates.originalLanguage = data.originalLanguage ?? null;
  if (data.notes !== undefined) updates.notes = data.notes ?? null;

  // Vérification de doublon (titre, auteur) si l'un des deux change.
  if (updates.titleNormalized !== undefined || updates.authorId !== undefined) {
    const dupTitle = updates.titleNormalized ?? current.titleNormalized;
    const dupAuthor = updates.authorId ?? current.authorId;
    const duplicate = db
      .select({ id: books.id })
      .from(books)
      .where(
        and(
          eq(books.titleNormalized, dupTitle),
          eq(books.authorId, dupAuthor),
          ne(books.id, id)
        )
      )
      .get();
    if (duplicate) {
      return NextResponse.json(
        { error: "Ce livre existe déjà pour cet auteur" },
        { status: 409 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ book: getBook(id) });
  }

  try {
    db.update(books)
      .set({ ...updates, updatedAt: sql`(datetime('now'))` })
      .where(eq(books.id, id))
      .run();
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Ce livre existe déjà pour cet auteur" },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ book: getBook(id) });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const current = db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, id))
    .get();
  if (!current) return notFoundResponse();

  db.delete(analysisJobs).where(eq(analysisJobs.bookId, id)).run();
  db.delete(books).where(eq(books.id, id)).run();

  return NextResponse.json({ ok: true });
}
