import { NextRequest, NextResponse } from "next/server";
import { createList, listInputSchema, listLists } from "@/lib/lists";
import { isConflict } from "@/lib/store";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ lists: await listLists() });
}

export async function POST(request: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

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
    return NextResponse.json(
      { list: await createList(parsed.data) },
      { status: 201 }
    );
  } catch (err) {
    // Le nom normalisé est unique : deux « À lire cet été » sont la même liste.
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
