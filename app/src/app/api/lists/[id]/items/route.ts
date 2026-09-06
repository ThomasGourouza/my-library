import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { books, lists } from "@/db/schema";
import {
  addBookToList,
  getList,
  moveBookInList,
  removeBookFromList,
} from "@/lib/lists";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  bookId: z.number().int().positive(),
  /** Absent = ajout ; « up »/« down » = déplacement d'un cran. */
  move: z.enum(["up", "down"]).optional(),
});

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolve(context: RouteContext, request: NextRequest) {
  const listId = parseId((await context.params).id);
  if (listId == null) return { error: "Liste introuvable" as const, status: 404 };
  const list = db.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).get();
  if (!list) return { error: "Liste introuvable" as const, status: 404 };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "Corps de requête JSON invalide" as const, status: 400 };
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { error: "Données invalides" as const, status: 400 };
  }
  const book = db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, parsed.data.bookId))
    .get();
  if (!book) return { error: "Livre introuvable" as const, status: 404 };

  return { listId, data: parsed.data };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const r = await resolve(context, request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  if (r.data.move) {
    const moved = moveBookInList(r.listId, r.data.bookId, r.data.move);
    // Un livre déjà en tête qu'on monte encore : rien à faire, ce n'est pas
    // une erreur, l'interface renvoie simplement l'état inchangé.
    return NextResponse.json({ moved, list: getList(r.listId) });
  }

  const added = addBookToList(r.listId, r.data.bookId);
  return NextResponse.json({ added, list: getList(r.listId) }, { status: added ? 201 : 200 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const r = await resolve(context, request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const removed = removeBookFromList(r.listId, r.data.bookId);
  return NextResponse.json({ removed, list: getList(r.listId) });
}
