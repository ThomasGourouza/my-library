"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AnalysisJob, BookWithAuthor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface AnalysisData {
  job: AnalysisJob | null;
  summary: string | null;
  analysis: string | null;
  analysisGeneratedAt: string | null;
  bio: string | null;
  bioGeneratedAt: string | null;
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Requête échouée (${r.status})`);
  return r.json();
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0 [&_em]:italic [&_strong]:font-semibold">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

export function AnalysisPanel({
  book,
  disabled = false,
}: {
  book: BookWithAuthor;
  /** Vrai quand la génération n'est pas disponible (application déployée). */
  disabled?: boolean;
}) {
  const router = useRouter();

  // Clé neutralisée quand la génération est impossible : sans cela, l'affichage
  // de **chaque** fiche livre déclenchait un GET — soit une invocation et une
  // lecture complète de la bibliothèque de plus — pour des champs que `book`
  // porte déjà. Le bouton mort et la requête inutile partent ensemble.
  const { data, mutate } = useSWR<AnalysisData>(
    disabled ? null : `/api/books/${book.id}/analysis`,
    fetcher,
    // Polling 2 s uniquement tant qu'un job tourne (dérivé, pas d'état local).
    { refreshInterval: (latest) => (latest?.job?.status === "running" ? 2000 : 0) }
  );

  const job = data?.job ?? null;
  const running = job?.status === "running";
  const summary = data?.summary ?? book.summary;
  const analysis = data?.analysis ?? book.analysis;
  const bio = data?.bio ?? book.author.bio;
  const generatedAt = formatDate(
    data?.analysisGeneratedAt ?? book.analysisGeneratedAt
  );
  const hasContent = Boolean(summary || analysis);

  // Suivi de la transition running -> done/error pour rafraîchir la page.
  const prevStatus = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!job) return;
    if (prevStatus.current === "running" && job.status !== "running") {
      if (job.status === "done") {
        toast.success("Analyse générée");
        router.refresh();
      } else if (job.status === "error") {
        toast.error(`Échec de l'analyse : ${job.error ?? "erreur inconnue"}`);
      }
    }
    prevStatus.current = job.status;
  }, [job, router]);

  const launch = async () => {
    try {
      const res = await fetch(`/api/books/${book.id}/analysis`, {
        method: "POST",
      });
      if (res.status === 202 || res.status === 409) {
        if (res.status === 409) toast.info("Une analyse est déjà en cours");
        mutate();
      } else {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Impossible de lancer l'analyse");
      }
    } catch {
      toast.error("Impossible de lancer l'analyse");
    }
  };

  const button = disabled ? (
    <p className="text-xs text-muted-foreground">
      Génération disponible sur l’installation locale
    </p>
  ) : running ? (
    <Button disabled>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Génération en cours…
    </Button>
  ) : hasContent ? (
    <Button variant="outline" onClick={launch}>
      <RefreshCw className="size-4" aria-hidden />
      Régénérer
    </Button>
  ) : (
    <Button onClick={launch}>
      <Sparkles className="size-4" aria-hidden />
      Analyse Claude
    </Button>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analyse Claude</h2>
          {generatedAt && (
            <p className="text-xs text-muted-foreground">
              Générée par Claude le {generatedAt}
            </p>
          )}
        </div>
        {button}
      </div>

      {!hasContent && !running && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {disabled ? (
              <>
                Aucune analyse pour ce livre. « Analyse Claude » s&apos;exécute
                depuis l&apos;installation locale ; les analyses produites
                là-bas s&apos;affichent ensuite ici.
              </>
            ) : (
              <>
                Aucune analyse pour ce livre. Lancez « Analyse Claude » pour
                générer un résumé, une analyse approfondie et la biographie de
                l&apos;auteur.
              </>
            )}
          </CardContent>
        </Card>
      )}

      {running && !hasContent && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Génération en cours — environ une minute…
          </CardContent>
        </Card>
      )}

      {job?.status === "error" && (
        <p className="text-sm text-destructive">
          La dernière tentative a échoué : {job.error ?? "erreur inconnue"}
        </p>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Résumé</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{summary}</Markdown>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle>Analyse approfondie</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{analysis}</Markdown>
          </CardContent>
        </Card>
      )}

      {bio && (
        <Card>
          <CardHeader>
            <CardTitle>Biographie de l&apos;auteur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Markdown>{bio}</Markdown>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Biographie de {book.author.name}
              {formatDate(data?.bioGeneratedAt ?? book.author.bioGeneratedAt)
                ? ` — générée le ${formatDate(
                    data?.bioGeneratedAt ?? book.author.bioGeneratedAt
                  )}`
                : ""}
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
