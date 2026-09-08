/**
 * Ce qu'un backend de stockage rend au magasin.
 *
 * Le `token` est opaque pour `store.ts` : c'est le `mtime` du fichier pour le
 * backend fichier, l'ETag du blob pour le backend GitHub. Il sert deux fois —
 * à demander « et si rien n'a changé ? » à la lecture, et de jeton de
 * compare-and-swap à l'écriture.
 */
export interface Snapshot {
  json: string;
  token: string;
}
