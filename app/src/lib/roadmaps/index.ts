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
import { laPoesie } from "./data/la-poesie";
import { leTheatre } from "./data/le-theatre";
import { leRomanRusse } from "./data/le-roman-russe";
import { leMondeAngloSaxon } from "./data/le-monde-anglo-saxon";
import { lettresAllemandes } from "./data/lettres-allemandes";
import { chineEtJapon } from "./data/chine-et-japon";
import { mediterraneeEtAmeriqueLatine } from "./data/mediterranee-et-amerique-latine";
import { europeDuNordEtCentrale } from "./data/europe-du-nord-et-centrale";
import { lesFondationsGrecques } from "./data/les-fondations-grecques";
import { romeEtLeStoicisme } from "./data/rome-et-le-stoicisme";
import { textesSacresEtTradition } from "./data/textes-sacres-et-tradition";
import { leMytheArthurien } from "./data/le-mythe-arthurien";
import { initiationALaPhilosophie } from "./data/initiation-a-la-philosophie";
import { philosophieAntiqueEtMedievale } from "./data/philosophie-antique-et-medievale";
import { rationalismeEtLumieres } from "./data/rationalisme-et-lumieres";
import { lesMaitresDuSoupcon } from "./data/les-maitres-du-soupcon";
import { phenomenologieEtExistentialisme } from "./data/phenomenologie-et-existentialisme";
import { philosophieContemporaine } from "./data/philosophie-contemporaine";
import { philosophieMoraleEtArtDeVivre } from "./data/philosophie-morale-et-art-de-vivre";
import { psychologieEtConnaissanceDeSoi } from "./data/psychologie-et-connaissance-de-soi";
import { comprendreLaPuissance } from "./data/comprendre-la-puissance";

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
  laPoesie,
  leTheatre,
  leRomanRusse,
  leMondeAngloSaxon,
  lettresAllemandes,
  chineEtJapon,
  mediterraneeEtAmeriqueLatine,
  europeDuNordEtCentrale,
  lesFondationsGrecques,
  romeEtLeStoicisme,
  textesSacresEtTradition,
  leMytheArthurien,
  initiationALaPhilosophie,
  philosophieAntiqueEtMedievale,
  rationalismeEtLumieres,
  lesMaitresDuSoupcon,
  phenomenologieEtExistentialisme,
  philosophieContemporaine,
  philosophieMoraleEtArtDeVivre,
  psychologieEtConnaissanceDeSoi,
  comprendreLaPuissance,
];

const BY_SLUG = new Map(ROADMAPS.map((r) => [r.slug, r]));

export function getRoadmap(slug: string): Roadmap | undefined {
  return BY_SLUG.get(slug);
}

export * from "./types";
