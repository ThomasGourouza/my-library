import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analysisJobs, authors, books } from "@/db/schema";
import { runAnalysis } from "@/lib/analysis/run";

type RouteContext = { params: Promise<{ id: string }> };

/** Un job « running » plus vieux que 5 min est considéré comme mort. */
const STALE_MS = 5 * 60 * 1000;

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const notFoundResponse = () =>
  NextResponse.json({ error: "Livre introuvable" }, { status: 404 });

function latestJob(bookId: number) {
  return db
    .select()
    .from(analysisJobs)
    .where(eq(analysisJobs.bookId, bookId))
    .orderBy(desc(analysisJobs.id))
    .limit(1)
    .get();
}

/** startedAt SQLite « YYYY-MM-DD HH:MM:SS » = UTC. */
function jobAgeMs(startedAt: string): number {
  const t = Date.parse(startedAt.replace(" ", "T") + "Z");
  return Number.isNaN(t) ? 0 : Date.now() - t;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const book = db.select().from(books).where(eq(books.id, id)).get();
  if (!book) return notFoundResponse();
  const author = db
    .select()
    .from(authors)
    .where(eq(authors.id, book.authorId))
    .get();

  return NextResponse.json({
    job: latestJob(id) ?? null,
    summary: book.summary,
    analysis: book.analysis,
    analysisGeneratedAt: book.analysisGeneratedAt,
    bio: author?.bio ?? null,
    bioGeneratedAt: author?.bioGeneratedAt ?? null,
  });
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const book = db.select().from(books).where(eq(books.id, id)).get();
  if (!book) return notFoundResponse();

  const current = latestJob(id);
  if (current?.status === "running") {
    if (jobAgeMs(current.startedAt) < STALE_MS) {
      return NextResponse.json(
        { error: "Une analyse est déjà en cours", jobId: current.id },
        { status: 409 }
      );
    }
    // Garde anti-blocage : job fantôme, on le clôt avant d'en relancer un.
    db.update(analysisJobs)
      .set({
        status: "error",
        error: "Job expiré (> 5 min)",
        finishedAt: sql`(datetime('now'))`,
      })
      .where(eq(analysisJobs.id, current.id))
      .run();
  }

  const job = db
    .insert(analysisJobs)
    .values({ bookId: id, status: "running" })
    .returning()
    .get();

  // Fire-and-forget : le client suit l'avancement via GET.
  void runAnalysis(id, job.id);

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
