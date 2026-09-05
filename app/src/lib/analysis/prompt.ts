import type { Author, Book } from "@/db/schema";
import { formatLifespan, formatYear } from "@/lib/normalize";

/** Résultat structuré attendu de l'agent (voir buildSchema). */
export interface AnalysisResult {
  summary: string;
  analysis: string;
  authorBio?: string;
  authorInfo?: {
    nationality?: string | null;
    language?: string | null;
    birthYear?: number | null;
    deathYear?: number | null;
    mainGenre?: string | null;
    mainField?: string | null;
  };
}

/** Schéma JSON pour outputFormat json_schema (bio incluse ou non). */
export function buildSchema(includeBio: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    summary: {
      type: "string",
      description: "Résumé de l'œuvre en français, environ 200 mots.",
    },
    analysis: {
      type: "string",
      description:
        "Analyse approfondie en français, environ 500 mots : contexte, thèmes, style, portée.",
    },
  };
  const required = ["summary", "analysis"];
  if (includeBio) {
    properties.authorBio = {
      type: "string",
      description: "Biographie de l'auteur en français, environ 250 mots.",
    };
    properties.authorInfo = {
      type: "object",
      description:
        "Métadonnées factuelles sur l'auteur, uniquement si tu en es certain.",
      properties: {
        nationality: {
          type: ["string", "null"],
          description: "Adjectif féminin minuscule, ex. « française »",
        },
        language: { type: ["string", "null"] },
        birthYear: {
          type: ["integer", "null"],
          description: "Négatif = av. J.-C.",
        },
        deathYear: { type: ["integer", "null"] },
        mainGenre: { type: ["string", "null"] },
        mainField: { type: ["string", "null"] },
      },
      additionalProperties: false,
    };
    required.push("authorBio");
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function metaLine(label: string, value: string | null | undefined): string {
  return value ? `- ${label} : ${value}\n` : "";
}

/** Prompt français avec les métadonnées connues du livre et de l'auteur. */
export function buildPrompt(
  book: Book,
  author: Author,
  includeBio: boolean
): string {
  const lifespan = formatLifespan(author.birthYear, author.deathYear);
  let p = `Tu es un critique littéraire et un historien des idées francophone, précis et honnête.

Livre de ma bibliothèque personnelle :
- Titre : ${book.title}
- Auteur : ${author.name}${lifespan ? ` (${lifespan})` : ""}
${metaLine("Catégorie", book.category)}${metaLine("Genre", book.genre)}${metaLine(
    "Courant",
    book.courant
  )}${metaLine("Thème", book.theme)}${metaLine("Période", book.period)}${metaLine(
    "Première publication",
    book.publicationYear != null ? formatYear(book.publicationYear) : null
  )}${metaLine("Langue originale", book.originalLanguage)}${metaLine(
    "Notes",
    book.notes
  )}
Rédige, en FRANÇAIS uniquement :
1. \`summary\` — un résumé de l'œuvre (~200 mots) : propos, contenu, structure.
2. \`analysis\` — une analyse approfondie (~500 mots) : contexte historique et intellectuel, thèmes majeurs, style, portée et postérité, place dans l'œuvre de l'auteur.`;

  if (includeBio) {
    p += `
3. \`authorBio\` — une biographie de ${author.name} (~250 mots) : vie, œuvre, importance.
4. \`authorInfo\` — ses métadonnées factuelles (nationalité en adjectif féminin minuscule, langue d'écriture, années de naissance/décès — négatives pour av. J.-C., genre dominant, domaine principal parmi : Littérature, Philosophie & psychologie, Histoire, Sciences géopolitiques, Sciences, Mathématiques). N'indique que ce dont tu es certain, sinon null.`;
  }

  p += `

Style : prose claire et cultivée, paragraphes courts ; markdown léger autorisé (italiques pour les titres d'œuvres), pas de titres \`#\` ni de listes à puces dans summary. Si l'œuvre exacte t'est inconnue ou ambiguë, dis-le explicitement au début de \`summary\` et reste prudent plutôt que d'inventer.`;

  return p;
}
