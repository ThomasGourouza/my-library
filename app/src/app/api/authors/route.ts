import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authors } from "@/db/schema";
import { listAuthors, type AuthorFilters } from "@/lib/queries";
import { normalizeKey, normalizeText } from "@/lib/normalize";
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
  return NextResponse.json({ authors: listAuthors(filters) });
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

  const name = normalizeText(parsed.data.name);
  const nameNormalized = normalizeKey(name);

  const existing = db
    .select({ id: authors.id })
    .from(authors)
    .where(eq(authors.nameNormalized, nameNormalized))
    .get();
  if (existing) {
    return NextResponse.json(
      { error: "Cet auteur existe déjà" },
      { status: 409 }
    );
  }

  const author = db
    .insert(authors)
    .values({
      name,
      nameNormalized,
      birthYear: parsed.data.birthYear ?? null,
      deathYear: parsed.data.deathYear ?? null,
      nationality: parsed.data.nationality ?? null,
      language: parsed.data.language ?? null,
      mainGenre: parsed.data.mainGenre ?? null,
      mainField: parsed.data.mainField ?? null,
      period: parsed.data.period ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning()
    .get();

  return NextResponse.json({ author }, { status: 201 });
}
