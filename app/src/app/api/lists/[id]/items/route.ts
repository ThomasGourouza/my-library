import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isConflict, store } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
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

/**
 * Les deux contrôles d'existence servent à distinguer un 404 d'un « rien à
 * faire » ; ils ne gardent aucune invariante — les mutations, elles, refont
 * leur propre recherche et rendent `false` si la cible a disparu entre-temps.
 * Une seule lecture pour les deux.
 */
async function resolve(context: RouteContext, request: NextRequest) {
  const listId = parseId((await context.params).id);
  if (listId == null) return { error: "Liste introuvable" as const, status: 404 };

  const s = await store();
  if (!s.lists.some((l) => l.id === listId)) {
    return { error: "Liste introuvable" as const, status: 404 };
  }

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
  if (!s.books.some((b) => b.id === parsed.data.bookId)) {
    return { error: "Livre introuvable" as const, status: 404 };
  }

  return { listId, data: parsed.data };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const denied = await requireAuth();
  if (denied) return denied;

  const r = await resolve(context, request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    if (r.data.move) {
      const moved = await moveBookInList(r.listId, r.data.bookId, r.data.move);
      // Un livre déjà en tête qu'on monte encore : rien à faire, ce n'est pas
      // une erreur, l'interface renvoie simplement l'état inchangé.
      return NextResponse.json({ moved, list: await getList(r.listId) });
    }

    const added = await addBookToList(r.listId, r.data.bookId);
    return NextResponse.json(
      { added, list: await getList(r.listId) },
      { status: added ? 201 : 200 }
    );
  } catch (err) {
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const denied = await requireAuth();
  if (denied) return denied;

  const r = await resolve(context, request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  try {
    const removed = await removeBookFromList(r.listId, r.data.bookId);
    return NextResponse.json({ removed, list: await getList(r.listId) });
  } catch (err) {
    if (isConflict(err)) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
