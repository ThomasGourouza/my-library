import { z } from "zod";

// ---------------------------------------------------------------------------
// Vocabulaires contrôlés (validés par zod, pas par des CHECK SQL)
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  "Littérature",
  "Philosophie & psychologie",
  "Histoire",
  "Sciences géopolitiques",
  "Sciences",
  "Mathématiques",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const AUDIENCES = ["enfants", "adolescents", "adultes", "tous"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const WORLDVIEWS = [
  "cynique",
  "chrétienne",
  "aristocratique",
  "classique",
  "scientifique",
  "existentialiste",
  "géopolitique",
] as const;
export type Worldview = (typeof WORLDVIEWS)[number];

export const WORLDVIEW_LABELS: Record<Worldview, string> = {
  cynique: "Cynique / lucide désenchantée",
  chrétienne: "Chrétienne / tragique",
  aristocratique: "Aristocratique / héroïque",
  classique: "Classique / mesure et raison",
  scientifique: "Scientifique / matérialiste",
  existentialiste: "Existentialiste / liberté radicale",
  géopolitique: "Géopolitique / puissance et civilisation",
};

export const PERIODS = [
  "Antiquité",
  "Moyen Âge",
  "XVIe siècle",
  "XVIIe siècle",
  "XVIIIe siècle",
  "XIXe siècle",
  "XXe siècle",
  "XXIe siècle",
] as const;
export type Period = (typeof PERIODS)[number];

// ---------------------------------------------------------------------------
// Schémas zod
// ---------------------------------------------------------------------------

const yearSchema = z
  .number()
  .int()
  .min(-3000, "Année trop ancienne")
  .max(2100, "Année trop lointaine");

export const authorInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(200),
  birthYear: yearSchema.nullish(),
  deathYear: yearSchema.nullish(),
  nationality: z.string().trim().max(100).nullish(),
  language: z.string().trim().max(100).nullish(),
  mainGenre: z.string().trim().max(100).nullish(),
  mainField: z.string().trim().max(100).nullish(),
  period: z.enum(PERIODS).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});
export type AuthorInput = z.infer<typeof authorInputSchema>;

export const bookInputSchema = z
  .object({
    title: z.string().trim().min(1, "Le titre est requis").max(300),
    authorId: z.number().int().positive().nullish(),
    newAuthor: authorInputSchema.nullish(),
    category: z.enum(CATEGORIES),
    genre: z.string().trim().max(100).nullish(),
    courant: z.string().trim().max(150).nullish(),
    theme: z.string().trim().max(150).nullish(),
    period: z.enum(PERIODS).nullish(),
    publicationYear: yearSchema.nullish(),
    audience: z.enum(AUDIENCES).default("adultes"),
    worldview: z.enum(WORLDVIEWS).nullish(),
    originalLanguage: z.string().trim().max(100).nullish(),
    notes: z.string().trim().max(4000).nullish(),
  })
  .refine((b) => b.authorId != null || b.newAuthor != null, {
    message: "Un auteur est requis (authorId ou newAuthor)",
    path: ["authorId"],
  });
export type BookInput = z.infer<typeof bookInputSchema>;

// Mise à jour : mêmes champs, tous optionnels sauf contrainte d'auteur relâchée
export const bookUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  authorId: z.number().int().positive().optional(),
  newAuthor: authorInputSchema.nullish(),
  category: z.enum(CATEGORIES).optional(),
  genre: z.string().trim().max(100).nullish(),
  courant: z.string().trim().max(150).nullish(),
  theme: z.string().trim().max(150).nullish(),
  period: z.enum(PERIODS).nullish(),
  publicationYear: yearSchema.nullish(),
  audience: z.enum(AUDIENCES).optional(),
  worldview: z.enum(WORLDVIEWS).nullish(),
  originalLanguage: z.string().trim().max(100).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});
export type BookUpdate = z.infer<typeof bookUpdateSchema>;

export const authorUpdateSchema = authorInputSchema.partial();
export type AuthorUpdate = z.infer<typeof authorUpdateSchema>;

export const bookSortKeys = [
  "title",
  "author",
  "period",
  "publicationYear",
  "createdAt",
] as const;

export const bookQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  genre: z.string().trim().max(100).optional(),
  courant: z.string().trim().max(150).optional(),
  period: z.enum(PERIODS).optional(),
  audience: z.enum(AUDIENCES).optional(),
  worldview: z.enum(WORLDVIEWS).optional(),
  authorId: z.coerce.number().int().positive().optional(),
  sort: z.enum(bookSortKeys).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});
export type BookQuery = z.infer<typeof bookQuerySchema>;
