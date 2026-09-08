/**
 * Suivi des « Analyse Claude » en cours, en mémoire.
 *
 * Ces jobs ne vont pas dans le fichier de données, et n'ont pas à y aller : un
 * job est un appel d'environ une minute lancé dans le processus courant, et un
 * job « running » de plus de cinq minutes est de toute façon traité comme mort.
 *
 * C'est un gain, pas une régression : du temps de la table SQL, un serveur qui
 * mourait en cours d'analyse laissait une ligne « running » qui bloquait toute
 * relance par un 409 pendant cinq minutes. Une entrée de `Map` oubliée, elle,
 * disparaît avec le processus — et le résultat déjà écrit, lui, est dans le
 * fichier.
 */
import type { AnalysisJob } from "@/lib/types";

/** Un job « running » plus vieux que 5 min est considéré comme mort. Le
 *  garde-fou reste nécessaire : si c'est le sous-processus du SDK qui se bloque
 *  sans que le serveur redémarre, le job resterait « running » pour toujours,
 *  et le bouton désactivé pour toujours. */
export const STALE_MS = 5 * 60 * 1000;

// Survit au rechargement à chaud de `next dev`.
const g = globalThis as unknown as {
  __analysisJobs?: Map<number, AnalysisJob>;
  __analysisSeq?: number;
};
const jobs = (g.__analysisJobs ??= new Map());

/** Le dernier job d'un livre, s'il y en a eu un depuis le démarrage. */
export const latestJob = (bookId: number): AnalysisJob | null =>
  jobs.get(bookId) ?? null;

export function startJob(bookId: number): AnalysisJob {
  g.__analysisSeq = (g.__analysisSeq ?? 0) + 1;
  const job: AnalysisJob = {
    id: g.__analysisSeq,
    bookId,
    status: "running",
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  // Remplace l'entrée précédente : un job fantôme n'a plus besoin d'être
  // clôturé explicitement avant d'en relancer un.
  jobs.set(bookId, job);
  return job;
}

export function finishJob(
  jobId: number,
  status: "done" | "error",
  error?: string
): void {
  const job = [...jobs.values()].find((j) => j.id === jobId);
  // Un job périmé qui se termine ne doit pas écraser le statut de son
  // successeur : d'où la recherche par identifiant plutôt que par livre.
  if (!job) return;
  job.status = status;
  job.error = error ?? null;
  job.finishedAt = new Date().toISOString();
}

export const jobAgeMs = (job: AnalysisJob): number =>
  Date.now() - Date.parse(job.startedAt);
