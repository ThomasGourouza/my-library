/**
 * Les deux conflits d'écriture, dans leur propre module : `store.ts` les
 * ré-exporte, et les backends peuvent les lever sans dépendre de lui.
 */

/**
 * Écriture refusée pour une raison que l'utilisateur peut comprendre et
 * corriger. Les routes d'API la traduisent en 409 avec son message.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Ce que signalait « UNIQUE constraint failed » du temps de SQLite. */
export class DuplicateError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
  }
}

/**
 * La source a changé entre la lecture et l'écriture. Sur le backend GitHub, le
 * `sha` envoyé n'était plus le dernier : quelqu'un (ou l'autre poste) a
 * committé entre-temps.
 *
 * On ne rejoue **pas** la mutation. Rejouer `moveBookInList`, qui échange par
 * index courant, déplacerait le livre d'un cran de plus ; rejouer une création
 * lèverait `DuplicateError` pour une écriture qui a réussi. Un message clair
 * et l'utilisateur recommence : le cas est rare (un seul utilisateur, et le
 * mutex sérialise déjà les mutations d'une même instance).
 */
export class StaleWriteError extends ConflictError {
  constructor() {
    super("La bibliothèque a changé entre-temps. Rechargez la page et réessayez.");
    this.name = "StaleWriteError";
  }
}
