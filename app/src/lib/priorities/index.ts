/**
 * Registre des priorités de lecture.
 *
 * Un fichier par catégorie : c'est l'unité d'audit naturelle. Pour juger de la
 * calibration, on veut relire d'un coup tous les « Essentiel » de Littérature,
 * pas les croiser avec ceux de Mathématiques.
 */
import type { PriorityEntry } from "./types";

import { litterature } from "./data/litterature";
import { philosophie } from "./data/philosophie";
import { histoire } from "./data/histoire";
import { geopolitique } from "./data/geopolitique";
import { sciences } from "./data/sciences";
import { mathematiques } from "./data/mathematiques";

export const PRIORITY_ENTRIES: PriorityEntry[] = [
  ...litterature,
  ...philosophie,
  ...histoire,
  ...geopolitique,
  ...sciences,
  ...mathematiques,
];

export * from "./types";
