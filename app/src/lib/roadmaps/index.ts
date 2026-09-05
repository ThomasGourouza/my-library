/**
 * Registre des parcours.
 *
 * Un fichier par parcours dans `data/`, importé ici dans l'ordre d'affichage.
 * Ajouter un parcours = créer le fichier puis l'ajouter à cette liste ; le test
 * `roadmaps.test.ts` vérifie ensuite que ses entrées existent en bibliothèque et
 * que l'ensemble couvre bien tous les livres.
 */
import type { Roadmap } from "./types";

import { lireAvecLesToutPetits } from "./data/lire-avec-les-tout-petits";
import { classiquesDeLEnfance } from "./data/classiques-de-l-enfance";
import { premiersGrandsRomans } from "./data/premiers-grands-romans";
import { sourcesMoyenAgeRenaissance } from "./data/sources-moyen-age-renaissance";
import { leGrandSiecle } from "./data/le-grand-siecle";
import { lumieresLitteraires } from "./data/lumieres-litteraires";
import { romantismeFrancais } from "./data/romantisme-francais";
import { realismeEtNaturalisme } from "./data/realisme-et-naturalisme";
import { romanFrancaisXxe } from "./data/roman-francais-xxe";
import { litteratureContemporaine } from "./data/litterature-contemporaine";

export const ROADMAPS: Roadmap[] = [
  lireAvecLesToutPetits,
  classiquesDeLEnfance,
  premiersGrandsRomans,
  sourcesMoyenAgeRenaissance,
  leGrandSiecle,
  lumieresLitteraires,
  romantismeFrancais,
  realismeEtNaturalisme,
  romanFrancaisXxe,
  litteratureContemporaine,
];

const BY_SLUG = new Map(ROADMAPS.map((r) => [r.slug, r]));

export function getRoadmap(slug: string): Roadmap | undefined {
  return BY_SLUG.get(slug);
}

export * from "./types";
