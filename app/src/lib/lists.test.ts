/**
 * Listes de lecture : le seul module qui écrive en base depuis l'interface.
 *
 * Ces tests créent et suppriment de vrais enregistrements — ils tournent sur la
 * copie jetable montée par `vitest.global-setup.ts`, jamais sur la base de
 * l'utilisateur. Chaque test nettoie derrière lui pour rester indépendant.
 */
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { DuplicateError } from "@/lib/store";
import { listBooks } from "@/lib/queries";
import {
  addBookToList,
  createList,
  deleteList,
  getList,
  getListsForBook,
  listLists,
  moveBookInList,
  removeBookFromList,
  updateList,
} from "./lists";

const corpus = listBooks().slice(0, 4);
const created: number[] = [];

function makeList(name: string) {
  const list = createList({ name });
  created.push(list.id);
  return list;
}

afterEach(() => {
  for (const id of created.splice(0)) deleteList(id);
});

describe("listes — cycle de vie", () => {
  it("crée, relit et supprime une liste", () => {
    const list = makeList("Test — cycle de vie");
    expect(getList(list.id)?.name).toBe("Test — cycle de vie");
    expect(listLists().some((l) => l.id === list.id)).toBe(true);
    expect(deleteList(list.id)).toBe(true);
    expect(getList(list.id)).toBeUndefined();
    created.length = 0;
  });

  it("refuse deux listes dont les noms ne diffèrent que par les accents", () => {
    makeList("Été");
    // La contrainte porte sur le nom normalisé : « Ete » et « Été » sont la
    // même liste pour qui la cherche.
    // createList lève avant d'enregistrer l'identifiant : rien à nettoyer de
    // plus que « Été », dont afterEach s'occupe.
    expect(() => makeList("ete")).toThrow(DuplicateError);
  });

  it("renomme, mais pas sur le nom d'une autre liste", () => {
    const list = makeList("Test — avant");
    // Se renommer soi-même passe : la vérification d'unicité s'exclut.
    expect(updateList(list.id, { name: "Test — après" })?.name).toBe("Test — après");
    expect(getList(list.id)?.name).toBe("Test — après");

    const other = makeList("Test — occupé");
    expect(() => updateList(list.id, { name: "Test — occupé" })).toThrow(
      DuplicateError
    );
    expect(getList(other.id)?.name).toBe("Test — occupé");
  });

  it("écrit sur le disque, pas seulement en mémoire", () => {
    // Le seul test du nouveau mécanisme : tous les autres passeraient sur un
    // magasin qui ne serait jamais persisté.
    const list = makeList("Test — persistance");
    const onDisk = JSON.parse(
      fs.readFileSync(process.env.LIBRARY_DATA_PATH!, "utf-8")
    );
    const saved = onDisk.lists.find((l: { id: number }) => l.id === list.id);
    expect(saved?.name).toBe("Test — persistance");
    // Les clés dérivées ne sont pas écrites : elles ne peuvent pas dériver.
    expect(saved).not.toHaveProperty("nameNormalized");
  });
});

describe("listes — contenu", () => {
  it("ajoute en fin de liste et ignore un doublon", () => {
    const list = makeList("Test — contenu");
    expect(addBookToList(list.id, corpus[0].id)).toBe(true);
    expect(addBookToList(list.id, corpus[1].id)).toBe(true);
    // Deuxième ajout du même livre : sans effet, et sans erreur.
    expect(addBookToList(list.id, corpus[0].id)).toBe(false);

    const items = getList(list.id)!.items;
    expect(items.map((i) => i.book.id)).toEqual([corpus[0].id, corpus[1].id]);
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });

  it("retire un livre et renumérote ce qui reste", () => {
    const list = makeList("Test — retrait");
    for (const b of corpus.slice(0, 3)) addBookToList(list.id, b.id);
    expect(removeBookFromList(list.id, corpus[0].id)).toBe(true);
    // Le trou laissé en base ne doit pas se voir : « n°1 » veut toujours dire
    // « le premier ».
    expect(getList(list.id)!.items.map((i) => i.position)).toEqual([1, 2]);
    expect(removeBookFromList(list.id, corpus[0].id)).toBe(false);
  });

  it("déplace un livre d'un cran, sans sortir des bornes", () => {
    const list = makeList("Test — ordre");
    for (const b of corpus.slice(0, 3)) addBookToList(list.id, b.id);

    expect(moveBookInList(list.id, corpus[2].id, "up")).toBe(true);
    expect(getList(list.id)!.items.map((i) => i.book.id)).toEqual([
      corpus[0].id,
      corpus[2].id,
      corpus[1].id,
    ]);

    // Monter le premier ou descendre le dernier ne fait rien et ne casse rien.
    expect(moveBookInList(list.id, corpus[0].id, "up")).toBe(false);
    expect(moveBookInList(list.id, corpus[1].id, "down")).toBe(false);
    expect(getList(list.id)!.items).toHaveLength(3);
  });

  it("compte les livres et les livres lus", () => {
    const list = makeList("Test — compteurs");
    for (const b of corpus.slice(0, 2)) addBookToList(list.id, b.id);
    const summary = listLists().find((l) => l.id === list.id)!;
    expect(summary.bookCount).toBe(2);
    // Aucun de ces livres n'est marqué lu : le compteur doit valoir 0, pas null.
    expect(summary.readCount).toBe(0);
  });

  it("retrouve les listes qui contiennent un livre", () => {
    const a = makeList("Test — appartenance A");
    const b = makeList("Test — appartenance B");
    addBookToList(a.id, corpus[0].id);
    addBookToList(b.id, corpus[0].id);
    const names = getListsForBook(corpus[0].id).map((l) => l.name);
    expect(names).toContain("Test — appartenance A");
    expect(names).toContain("Test — appartenance B");
  });

  it("supprimer une liste emporte ses entrées et laisse les livres", () => {
    const list = makeList("Test — cascade");
    addBookToList(list.id, corpus[0].id);
    deleteList(list.id);
    created.length = 0;
    expect(getListsForBook(corpus[0].id).map((l) => l.id)).not.toContain(
      list.id
    );
    // Le livre, lui, est toujours en bibliothèque.
    expect(listBooks().some((b) => b.id === corpus[0].id)).toBe(true);
  });
});
