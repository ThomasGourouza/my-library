import { NextRequest, NextResponse } from "next/server";
import { getBook } from "@/lib/queries";
import { analysisEnabled } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
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

  const book = await getBook(id);
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
  const denied = await requireAuth();
  if (denied) return denied;

  // La génération n'existe que sur le backend fichier : l'Agent SDK réutilise
  // la session Claude Code locale. Les analyses déjà produites, elles,
  // s'affichent partout — elles sont dans le fichier de données.
  if (!analysisEnabled()) {
    return NextResponse.json(
      {
        error:
          "« Analyse Claude » n'est disponible que sur l'installation locale, " +
          "où la session Claude Code est accessible.",
      },
      { status: 403 }
    );
  }

  const id = parseId((await params).id);
  if (id == null) return notFoundResponse();

  const book = await getBook(id);
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

  // Fire-and-forget : le client suit l'avancement via GET. Viable ici parce que
  // le processus est le serveur local de l'utilisateur ; en serverless
  // l'instance peut être gelée dès la réponse envoyée, ce qui est l'autre
  // raison pour laquelle l'analyse reste locale.
  void runAnalysis(id, job.id);

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
