import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authors, books } from "@/db/schema";
import { getBook, listBooks } from "@/lib/queries";
import { normalizeKey, normalizeText } from "@/lib/normalize";
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

  let authorId: number;
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
    authorId = existing.id;
  } else {
    // Garanti non-nul par le refine de bookInputSchema quand authorId est absent.
    const newAuthor = data.newAuthor!;
    const name = normalizeText(newAuthor.name);
    const nameNormalized = normalizeKey(name);
    const existingAuthor = db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.nameNormalized, nameNormalized))
      .get();
    if (existingAuthor) {
      authorId = existingAuthor.id;
    } else {
      const created = db
        .insert(authors)
        .values({
          name,
          nameNormalized,
          birthYear: newAuthor.birthYear ?? null,
          deathYear: newAuthor.deathYear ?? null,
          nationality: newAuthor.nationality ?? null,
          language: newAuthor.language ?? null,
          mainGenre: newAuthor.mainGenre ?? null,
          mainField: newAuthor.mainField ?? null,
          period: newAuthor.period ?? null,
          notes: newAuthor.notes ?? null,
        })
        .returning({ id: authors.id })
        .get();
      authorId = created.id;
    }
  }

  const title = normalizeText(data.title);
  const titleNormalized = normalizeKey(title);

  let bookId: number;
  try {
    const inserted = db
      .insert(books)
      .values({
        title,
        titleNormalized,
        authorId,
        category: data.category,
        genre: data.genre ?? null,
        courant: data.courant ?? null,
        theme: data.theme ?? null,
        period: data.period ?? null,
        publicationYear: data.publicationYear ?? null,
        audience: data.audience,
        worldview: data.worldview ?? null,
        originalLanguage: data.originalLanguage ?? null,
        notes: data.notes ?? null,
      })
      .returning({ id: books.id })
      .get();
    bookId = inserted.id;
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Ce livre existe déjà pour cet auteur" },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ book: getBook(bookId) }, { status: 201 });
}
