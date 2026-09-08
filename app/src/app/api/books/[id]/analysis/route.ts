import { NextRequest, NextResponse } from "next/server";
import { getBook } from "@/lib/queries";
import { STALE_MS, jobAgeMs, latestJob, startJob } from "@/lib/analysis/jobs";
import { runAnalysis } from "@/lib/analysis/run";

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

  return NextResponse.json({
    job: latestJob(id),
    summary: book.summary,
    analysis: book.analysis,
    analysisGeneratedAt: book.analysisGeneratedAt,
    bio: book.author.bio,
    bioGeneratedAt: book.author.bioGeneratedAt,
  });
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const book = getBook(id);
  if (!book) return notFoundResponse();

  const current = latestJob(id);
  if (current?.status === "running" && jobAgeMs(current) < STALE_MS) {
    return NextResponse.json(
      { error: "Une analyse est déjà en cours", jobId: current.id },
      { status: 409 }
    );
  }

  // Un job fantôme (« running » depuis plus de 5 min) est simplement remplacé.
  const job = startJob(id);

  // Fire-and-forget : le client suit l'avancement via GET.
  void runAnalysis(id, job.id);

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
