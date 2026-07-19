import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analysisJobs, authors, books } from "@/db/schema";
import {
  buildPrompt,
  buildSchema,
  type AnalysisResult,
} from "@/lib/analysis/prompt";

/** Extraction défensive du premier objet JSON équilibré d'un texte. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
    } else if (c === "\\") {
      escaped = true;
    } else if (c === '"') {
      inString = !inString;
    } else if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function isAnalysisResult(v: unknown): v is AnalysisResult {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as AnalysisResult).summary === "string" &&
    typeof (v as AnalysisResult).analysis === "string"
  );
}

/**
 * Exécute l'« Analyse Claude » pour un livre : appelle l'Agent SDK
 * (session Claude Code locale, pas de clé API), puis persiste résumé,
 * analyse et — si l'auteur n'en a pas encore — sa biographie et ses
 * métadonnées manquantes. Met à jour le job en fin de course.
 */
export async function runAnalysis(bookId: number, jobId: number): Promise<void> {
  try {
    const book = db.select().from(books).where(eq(books.id, bookId)).get();
    if (!book) throw new Error("Livre introuvable");
    const author = db
      .select()
      .from(authors)
      .where(eq(authors.id, book.authorId))
      .get();
    if (!author) throw new Error("Auteur introuvable");

    // Règle de réutilisation : la bio n'est générée qu'une fois par auteur.
    const includeBio = author.bio == null;

    let result: AnalysisResult | null = null;
    let rawText = "";

    for await (const message of query({
      prompt: buildPrompt(book, author, includeBio),
      options: {
        model: "claude-sonnet-5",
        // > 1 pour laisser au SDK une marge de retry si la première sortie
        // ne valide pas le schéma (les tours en trop ne coûtent rien si le
        // premier réussit).
        maxTurns: 3,
        allowedTools: [],
        outputFormat: { type: "json_schema", schema: buildSchema(includeBio) },
      },
    })) {
      if (message.type === "result") {
        if (message.subtype === "success") {
          rawText = message.result;
          const structured = message.structured_output;
          if (isAnalysisResult(structured)) result = structured;
        } else {
          throw new Error(
            `Échec de l'agent : ${message.subtype}${
              "errors" in message && message.errors.length
                ? ` — ${message.errors.join(" ; ")}`
                : ""
            }`
          );
        }
      }
    }

    if (!result) {
      const fallback = extractJson(rawText);
      if (isAnalysisResult(fallback)) result = fallback;
    }
    if (!result) throw new Error("Réponse de l'agent illisible (JSON attendu)");

    const now = new Date().toISOString();
    db.transaction((tx) => {
      tx.update(books)
        .set({
          summary: result.summary,
          analysis: result.analysis,
          analysisGeneratedAt: now,
          updatedAt: sql`(datetime('now'))`,
        })
        .where(eq(books.id, bookId))
        .run();

      if (includeBio && result.authorBio) {
        // Relecture DANS la transaction : `author` a été lu avant l'appel
        // agent (~1 min). Re-vérifier bio == null évite (a) d'écraser une
        // saisie faite par l'utilisateur pendant l'analyse et (b) une double
        // génération de bio si deux analyses du même auteur tournent en //.
        const current = tx
          .select()
          .from(authors)
          .where(eq(authors.id, author.id))
          .get();
        if (current && current.bio == null) {
          const info = result.authorInfo ?? {};
          // Enrichissement fill-only-if-null : jamais d'écrasement.
          tx.update(authors)
            .set({
              bio: result.authorBio,
              bioGeneratedAt: now,
              nationality: current.nationality ?? info.nationality ?? null,
              language: current.language ?? info.language ?? null,
              birthYear: current.birthYear ?? info.birthYear ?? null,
              deathYear: current.deathYear ?? info.deathYear ?? null,
              mainGenre: current.mainGenre ?? info.mainGenre ?? null,
              mainField: current.mainField ?? info.mainField ?? null,
              updatedAt: sql`(datetime('now'))`,
            })
            .where(eq(authors.id, author.id))
            .run();
        }
      }

      tx.update(analysisJobs)
        .set({ status: "done", finishedAt: sql`(datetime('now'))` })
        .where(eq(analysisJobs.id, jobId))
        .run();
    });
  } catch (e) {
    db.update(analysisJobs)
      .set({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        finishedAt: sql`(datetime('now'))`,
      })
      .where(eq(analysisJobs.id, jobId))
      .run();
  }
}
