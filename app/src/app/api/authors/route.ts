import { NextRequest, NextResponse } from "next/server";
import { createAuthor, listAuthors, type AuthorFilters } from "@/lib/queries";
import { DuplicateError } from "@/lib/store";
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

  try {
    return NextResponse.json({ author: createAuthor(parsed.data) }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
