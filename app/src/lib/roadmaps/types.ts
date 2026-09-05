/**
 * Parcours de lecture : types et familles.
 *
 * Un parcours est du contenu rédigé (objectif, description, ordre de lecture,
 * justification livre par livre), pas une vue dérivée des métadonnées — les
 * colonnes qui auraient pu servir de fil conducteur sont trop lacunaires
 * (theme nul à 79 %, courant à 48 %). Il vit donc dans des fichiers versionnés
 * sous `data/`, un par parcours, et non en base.
 */

/** Un livre dans un parcours, référencé par clé naturelle. */
export interface RoadmapEntry {
  /** Nom de l'auteur, exactement tel qu'en bibliothèque. */
  author: string;
  /** Titre, exactement tel qu'en bibliothèque. */
  title: string;
  /** Pourquoi ce livre est ici, et à cette place. */
  note: string;
}

export const ROADMAP_FAMILIES = [
  "jeunesse",
  "litterature-francaise",
  "litteratures-du-monde",
  "fondations",
  "philosophie",
  "societe",
  "sciences",
  "visions",
  "formes",
] as const;
export type RoadmapFamily = (typeof ROADMAP_FAMILIES)[number];

export const FAMILY_LABELS: Record<RoadmapFamily, string> = {
  jeunesse: "Jeunesse et famille",
  "litterature-francaise": "Littérature française",
  "litteratures-du-monde": "Littératures du monde",
  fondations: "Antiquité et fondations",
  philosophie: "Philosophie et connaissance de soi",
  societe: "Politique, histoire, société",
  sciences: "Sciences",
  visions: "Visions du monde",
  formes: "Formes et pratiques de lecture",
};

export interface Roadmap {
  /** Identifiant d'URL : /parcours/<slug>. Stable, ne jamais renommer. */
  slug: string;
  title: string;
  /** L'objectif en une ligne : ce que le parcours permet d'atteindre. */
  goal: string;
  /** À qui il s'adresse et selon quelle logique il progresse (3-5 phrases). */
  description: string;
  /** Âge conseillé, en clair : « Dès 16 ans », « 3-7 ans ». */
  ageLabel: string;
  /** Borne basse de l'âge conseillé, pour trier et filtrer. */
  minAge: number;
  family: RoadmapFamily;
  /** Dans l'ordre de lecture recommandé. */
  entries: RoadmapEntry[];
}
