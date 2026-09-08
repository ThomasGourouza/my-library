import { query } from "@anthropic-ai/claude-agent-sdk";
import { mutate, store } from "@/lib/store";
import { finishJob } from "@/lib/analysis/jobs";
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

/**
 * Environnement du sous-processus Claude Code, privé des variables qui
 * imposeraient une authentification par clé d'API.
 *
 * ANTHROPIC_API_KEY est exportée dans le shell de l'utilisateur, donc héritée
 * par le serveur Next, donc par le SDK — qui la préfère alors au login
 * claude.ai. Résultat quand la clé est révoquée ou sans crédit :
 * « 401 API key is invalid », alors que l'abonnement, lui, fonctionne.
 *
 * Le SDK REMPLACE entièrement l'environnement quand on passe `env` : il faut
 * donc recopier process.env, moins les variables d'authentification.
 */
function envSansCleApi(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
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
    const s = store();
    const book = s.books.find((b) => b.id === bookId);
    if (!book) throw new Error("Livre introuvable");
    const author = s.authors.find((a) => a.id === book.authorId);
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
        // Sans cela, l'analyse échoue en 401 dès que la clé du shell est
        // révoquée ou épuisée, alors que l'abonnement est valide.
        env: envSansCleApi(),
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

    const generatedAt = new Date().toISOString();
    // Une seule mutation, et les enregistrements retrouvés PAR IDENTIFIANT
    // dans le magasin qu'elle fournit : `book` et `author` ci-dessus ont été
    // lus avant l'appel agent (~1 min) et peuvent appartenir à une version
    // périmée du fichier. C'est la règle que la transaction SQL tenait à sa
    // place, avec sa relecture explicite.
    mutate((fresh) => {
      const b = fresh.books.find((x) => x.id === bookId);
      if (!b) throw new Error("Livre introuvable");
      b.summary = result.summary;
      b.analysis = result.analysis;
      b.analysisGeneratedAt = generatedAt;

      const a = fresh.authors.find((x) => x.id === b.authorId);
      // Re-vérifier bio == null évite (a) d'écraser une saisie faite par
      // l'utilisateur pendant l'analyse et (b) une double génération de bio si
      // deux analyses du même auteur tournent en parallèle.
      if (includeBio && result.authorBio && a && a.bio == null) {
        const info = result.authorInfo ?? {};
        a.bio = result.authorBio;
        a.bioGeneratedAt = generatedAt;
        // Enrichissement fill-only-if-null : jamais d'écrasement.
        a.nationality ??= info.nationality ?? null;
        a.language ??= info.language ?? null;
        a.birthYear ??= info.birthYear ?? null;
        a.deathYear ??= info.deathYear ?? null;
        a.mainGenre ??= info.mainGenre ?? null;
        a.mainField ??= info.mainField ?? null;
      }
    });
    finishJob(jobId, "done");
  } catch (e) {
    finishJob(jobId, "error", e instanceof Error ? e.message : String(e));
  }
}
