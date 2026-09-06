import { NextRequest, NextResponse } from "next/server";
import { createList, listInputSchema, listLists } from "@/lib/lists";

export async function GET() {
  return NextResponse.json({ lists: listLists() });
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
  const parsed = listInputSchema.safeParse(body);
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
    return NextResponse.json({ list: createList(parsed.data) }, { status: 201 });
  } catch (err) {
    // Le nom normalisé est unique : deux « À lire cet été » sont la même liste.
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Une liste porte déjà ce nom" },
        { status: 409 }
      );
    }
    throw err;
  }
}
