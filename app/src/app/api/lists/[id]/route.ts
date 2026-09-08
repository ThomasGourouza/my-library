import { NextRequest, NextResponse } from "next/server";
import { deleteList, getList, listInputSchema, updateList } from "@/lib/lists";
import { DuplicateError } from "@/lib/store";

type RouteContext = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const notFound = () =>
  NextResponse.json({ error: "Liste introuvable" }, { status: 404 });

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFound();
  const list = getList(id);
  return list ? NextResponse.json({ list }) : notFound();
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }
  const parsed = listInputSchema.partial().safeParse(body);
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
    const list = updateList(id, parsed.data);
    return list ? NextResponse.json({ list }) : notFound();
  } catch (err) {
    if (err instanceof DuplicateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFound();
  return deleteList(id) ? NextResponse.json({ ok: true }) : notFound();
}
