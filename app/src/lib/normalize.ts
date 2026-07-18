/**
 * Normalisation de texte partagée (affichage vs clés de recherche/dédup).
 * Miroir des règles du pipeline Python (preclean.py norm_key).
 */

/** Nettoyage d'affichage : NFC, apostrophes typographiques, espaces. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/'/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clé insensible aux accents/casse/apostrophes — utilisée pour
 * nameNormalized / titleNormalized (dédup + recherche). Jamais affichée.
 */
export function normalizeKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** -428 -> "428 av. J.-C." ; 1913 -> "1913" ; null -> "" */
export function formatYear(y: number | null | undefined): string {
  if (y == null) return "";
  return y < 0 ? `${-y} av. J.-C.` : String(y);
}

/** (1913, 1960) -> "1913–1960" ; (-428, -348) -> "428–348 av. J.-C." */
export function formatLifespan(
  birth: number | null | undefined,
  death: number | null | undefined
): string {
  if (birth == null && death == null) return "";
  if (birth != null && death != null) {
    if (birth < 0 && death < 0) return `${-birth}–${-death} av. J.-C.`;
    return `${formatYear(birth)}–${formatYear(death)}`;
  }
  if (birth != null) return `né(e) en ${formatYear(birth)}`;
  return `mort(e) en ${formatYear(death)}`;
}
