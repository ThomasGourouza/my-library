/**
 * Priorité de lecture : hiérarchiser 2046 livres dont personne ne lira la
 * totalité.
 *
 * L'échelle est délibérément celle de la **culture générale**, pas celle des
 * disciplines : la question posée pour chaque livre est « qu'apporte-t-il à un
 * lecteur cultivé qui n'est pas du métier ? », jamais « compte-t-il dans son
 * domaine ? ». Conséquence assumée : un traité qui fonde son champ mais ne se
 * lit que par des spécialistes reste en bas de l'échelle.
 *
 * Comme les parcours, ces valeurs sont rédigées et vivent dans des fichiers
 * versionnés — aucune métadonnée de la base ne porte l'information
 * « importance » (mesuré : le nombre de parcours, la position dans un parcours
 * et le nombre de livres par auteur sont respectivement constant, un proxy de
 * la date de publication, et inversé).
 */

/** Du plus prioritaire au moins prioritaire — l'ordre du tableau fait foi. */
export const PRIORITIES = [
  "essentiel",
  "important",
  "complementaire",
  "specialise",
] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  essentiel: "Essentiel",
  important: "Important",
  complementaire: "Complémentaire",
  specialise: "Spécialisé",
};

/** Affiché en infobulle : c'est le contrat de calibration, il doit rester lisible. */
export const PRIORITY_DESCRIPTIONS: Record<Priority, string> = {
  essentiel:
    "Un lecteur cultivé doit l’avoir lu ; son absence se remarque.",
  important:
    "Grand livre dont la portée dépasse son domaine — à lire si le sujet vous parle.",
  complementaire:
    "Bon livre, mais qui approfondit un sujet déjà couvert par un livre au-dessus.",
  specialise:
    "Technique, érudit ou de consultation : sa valeur ne dépasse pas son champ.",
};

/** Rang de tri (1 = plus prioritaire). Valeurs inconnues ou nulles en dernier. */
export function priorityRank(value: string | null | undefined): number {
  const i = PRIORITIES.indexOf((value ?? "") as Priority);
  return i === -1 ? PRIORITIES.length : i;
}

export function isPriority(v: string | null | undefined): v is Priority {
  return !!v && (PRIORITIES as readonly string[]).includes(v);
}

/** Un livre et sa priorité, référencé par clé naturelle (jamais par id). */
export interface PriorityEntry {
  /** Nom de l'auteur, exactement tel qu'en bibliothèque. */
  author: string;
  /** Titre, exactement tel qu'en bibliothèque. */
  title: string;
  priority: Priority;
}
