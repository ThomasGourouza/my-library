/**
 * Garde-fous de qualité de la bibliothèque elle-même.
 *
 * Les tests de parcours et de priorités vérifient le contenu rédigé ; celui-ci
 * vérifie le corpus. Il existe parce que la contrainte d'unicité en base porte
 * sur le couple (titre, auteur) : deux fois la même œuvre sous deux auteurs
 * différents passe donc sans rien déclencher. C'est exactement ce qui s'était
 * produit — Gilgamesh, Beowulf, La Chanson des Nibelungen, La Mort le Roi Artu
 * et Tristan et Iseut existaient chacun en double sous deux auteurs anonymes
 * distincts, avec des priorités et des parcours éclatés entre les deux entrées.
 */
import { describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { listBooks } from "@/lib/queries";
import { normalizeKey } from "@/lib/normalize";

const books = await listBooks();

/** Un auteur « anonyme » est un libellé de convention, pas une personne. */
function isAnonymous(name: string): boolean {
  return normalizeKey(name).startsWith("anonyme");
}

describe("bibliothèque — doublons", () => {
  it("aucune œuvre anonyme n'existe sous deux auteurs anonymes différents", () => {
    // Deux auteurs anonymes qui portent le même titre désignent forcément le
    // même texte : personne ne signe « Anonyme (X) » pour se distinguer d'un
    // « Anonyme (Y) ». Entre auteurs nommés, au contraire, un titre partagé est
    // courant et légitime — « Phèdre » de Racine, de Sénèque et de Platon.
    const parTitre = new Map<string, string[]>();
    for (const book of books) {
      if (!isAnonymous(book.author.name)) continue;
      const key = book.titleNormalized;
      const noms = parTitre.get(key);
      if (noms) noms.push(book.author.name);
      else parTitre.set(key, [book.author.name]);
    }
    const doublons = [...parTitre]
      .filter(([, noms]) => new Set(noms).size > 1)
      .map(([titre, noms]) => `« ${titre} » : ${[...new Set(noms)].join(" / ")}`);
    expect(doublons).toEqual([]);
  });

  it("aucun auteur ne s'appelle « Anonyme » tout court", () => {
    // Un fourre-tout sans qualificatif attire les œuvres qui n'ont pas trouvé
    // leur place et fabrique des doublons avec les auteurs anonymes qualifiés.
    const fourreTout = books
      .map((b) => b.author.name)
      .filter((name) => normalizeKey(name) === "anonyme");
    expect([...new Set(fourreTout)]).toEqual([]);
  });
});

describe("bibliothèque — intégrité", () => {
  it("les identifiants sont uniques et chaque livre a son auteur", async () => {
    // Ce que la clé primaire et la clé étrangère garantissaient jusqu'ici, et
    // que plus aucun moteur ne tient : le fichier de données est modifiable à
    // la main et fusionnable par git. Deux enregistrements de même identifiant
    // — deux machines ayant pris le même `max + 1` — feraient renvoyer par
    // `find()` l'un des deux au hasard, soit la mauvaise fiche sous la bonne
    // URL. `store()` le vérifie au chargement ; ce test le dit à voix haute.
    const { authors, books: rows, lists } = await store();
    expect(new Set(authors.map((a) => a.id)).size).toBe(authors.length);
    expect(new Set(rows.map((b) => b.id)).size).toBe(rows.length);
    expect(new Set(lists.map((l) => l.id)).size).toBe(lists.length);

    const authorIds = new Set(authors.map((a) => a.id));
    const orphelins = rows
      .filter((b) => !authorIds.has(b.authorId))
      .map((b) => `${b.title} (authorId ${b.authorId})`);
    expect(orphelins).toEqual([]);
  });

  it("aucun champ texte ne contient d'apostrophe droite", () => {
    // normalizeText impose l'apostrophe typographique, et les routes d'API
    // l'appliquent. Le seed ne le faisait que pour le titre et le nom : la base
    // proposait deux fois le même courant dans les filtres, « Liberté
    // d'expression » et « Liberté d’expression ».
    const fautifs: string[] = [];
    for (const b of books) {
      for (const [champ, valeur] of Object.entries({
        title: b.title,
        genre: b.genre,
        courant: b.courant,
        theme: b.theme,
        notes: b.notes,
        "author.name": b.author.name,
        "author.notes": b.author.notes,
      })) {
        if (valeur?.includes("'")) fautifs.push(`${b.title} : ${champ}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("aucun champ texte ne contient de valeur creuse", () => {
    // Le pipeline remplaçait les cases vides par « — » ; une seule qui subsiste
    // remonte jusque dans les filtres comme si c'était une vraie valeur.
    const creux = new Set(["—", "-", "N/A", "n/a", "?", "null", "undefined"]);
    const fautifs: string[] = [];
    for (const b of books) {
      for (const [champ, valeur] of Object.entries({
        genre: b.genre,
        courant: b.courant,
        theme: b.theme,
        originalLanguage: b.originalLanguage,
        notes: b.notes,
      })) {
        if (valeur != null && (valeur.trim() === "" || creux.has(valeur.trim()))) {
          fautifs.push(`${b.title} : ${champ} = « ${valeur} »`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});
