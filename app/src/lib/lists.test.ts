/**
 * Listes de lecture : le seul module qui écrive en base depuis l'interface.
 *
 * Ces tests créent et suppriment de vrais enregistrements — ils tournent sur la
 * copie jetable montée par `vitest.global-setup.ts`, jamais sur la base de
 * l'utilisateur. Chaque test nettoie derrière lui pour rester indépendant.
 *
 * Tout est asynchrone depuis que le magasin peut avoir une source distante ;
 * les tests, eux, gardent le backend fichier via `LIBRARY_DATA_PATH`. Une
 * écriture refusée se vérifie donc avec `rejects.toThrow`, et non plus avec un
 * `expect(() => …).toThrow` qui ne verrait jamais qu'une promesse.
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

// Des livres NON LUS, et c'est nécessaire : le test des compteurs vérifie
// qu'une liste fraîche affiche « 0 lu ». Prendre les premiers venus rendait ce
// test dépendant de ce que l'utilisateur a coché depuis l'application — il a
// commencé à s'en servir, et le test est tombé.
const corpus = (await listBooks()).filter((b) => !b.read).slice(0, 4);
const created: number[] = [];

async function makeList(name: string) {
  const list = await createList({ name });
  created.push(list.id);
  return list;
}

afterEach(async () => {
  for (const id of created.splice(0)) await deleteList(id);
});

describe("listes — cycle de vie", () => {
  it("crée, relit et supprime une liste", async () => {
    const list = await makeList("Test — cycle de vie");
    expect((await getList(list.id))?.name).toBe("Test — cycle de vie");
    expect((await listLists()).some((l) => l.id === list.id)).toBe(true);
    expect(await deleteList(list.id)).toBe(true);
    expect(await getList(list.id)).toBeUndefined();
    created.length = 0;
  });

  it("refuse deux listes dont les noms ne diffèrent que par les accents", async () => {
    await makeList("Été");
    // La contrainte porte sur le nom normalisé : « Ete » et « Été » sont la
    // même liste pour qui la cherche.
    // createList lève avant d'enregistrer l'identifiant : rien à nettoyer de
    // plus que « Été », dont afterEach s'occupe.
    await expect(makeList("ete")).rejects.toThrow(DuplicateError);
  });

  it("renomme, mais pas sur le nom d'une autre liste", async () => {
    const list = await makeList("Test — avant");
    // Se renommer soi-même passe : la vérification d'unicité s'exclut.
    expect((await updateList(list.id, { name: "Test — après" }))?.name).toBe(
      "Test — après"
    );
    expect((await getList(list.id))?.name).toBe("Test — après");

    const other = await makeList("Test — occupé");
    await expect(
      updateList(list.id, { name: "Test — occupé" })
    ).rejects.toThrow(DuplicateError);
    expect((await getList(other.id))?.name).toBe("Test — occupé");
  });

  it("écrit sur le disque, pas seulement en mémoire", async () => {
    // Le seul test du nouveau mécanisme : tous les autres passeraient sur un
    // magasin qui ne serait jamais persisté.
    const list = await makeList("Test — persistance");
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
  it("ajoute en fin de liste et ignore un doublon", async () => {
    const list = await makeList("Test — contenu");
    expect(await addBookToList(list.id, corpus[0].id)).toBe(true);
    expect(await addBookToList(list.id, corpus[1].id)).toBe(true);
    // Deuxième ajout du même livre : sans effet, et sans erreur.
    expect(await addBookToList(list.id, corpus[0].id)).toBe(false);

    const items = (await getList(list.id))!.items;
    expect(items.map((i) => i.book.id)).toEqual([corpus[0].id, corpus[1].id]);
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });

  it("retire un livre et renumérote ce qui reste", async () => {
    const list = await makeList("Test — retrait");
    for (const b of corpus.slice(0, 3)) await addBookToList(list.id, b.id);
    expect(await removeBookFromList(list.id, corpus[0].id)).toBe(true);
    // Le trou laissé en base ne doit pas se voir : « n°1 » veut toujours dire
    // « le premier ».
    expect((await getList(list.id))!.items.map((i) => i.position)).toEqual([1, 2]);
    expect(await removeBookFromList(list.id, corpus[0].id)).toBe(false);
  });

  it("déplace un livre d'un cran, sans sortir des bornes", async () => {
    const list = await makeList("Test — ordre");
    for (const b of corpus.slice(0, 3)) await addBookToList(list.id, b.id);

    expect(await moveBookInList(list.id, corpus[2].id, "up")).toBe(true);
    expect((await getList(list.id))!.items.map((i) => i.book.id)).toEqual([
      corpus[0].id,
      corpus[2].id,
      corpus[1].id,
    ]);

    // Monter le premier ou descendre le dernier ne fait rien et ne casse rien.
    expect(await moveBookInList(list.id, corpus[0].id, "up")).toBe(false);
    expect(await moveBookInList(list.id, corpus[1].id, "down")).toBe(false);
    expect((await getList(list.id))!.items).toHaveLength(3);
  });

  it("compte les livres et les livres lus", async () => {
    const list = await makeList("Test — compteurs");
    for (const b of corpus.slice(0, 2)) await addBookToList(list.id, b.id);
    const summary = (await listLists()).find((l) => l.id === list.id)!;
    expect(summary.bookCount).toBe(2);
    // Aucun de ces livres n'est marqué lu : le compteur doit valoir 0, pas null.
    expect(summary.readCount).toBe(0);
  });

  it("retrouve les listes qui contiennent un livre", async () => {
    const a = await makeList("Test — appartenance A");
    const b = await makeList("Test — appartenance B");
    await addBookToList(a.id, corpus[0].id);
    await addBookToList(b.id, corpus[0].id);
    const names = (await getListsForBook(corpus[0].id)).map((l) => l.name);
    expect(names).toContain("Test — appartenance A");
    expect(names).toContain("Test — appartenance B");
  });

  it("supprimer une liste emporte ses entrées et laisse les livres", async () => {
    const list = await makeList("Test — cascade");
    await addBookToList(list.id, corpus[0].id);
    await deleteList(list.id);
    created.length = 0;
    expect((await getListsForBook(corpus[0].id)).map((l) => l.id)).not.toContain(
      list.id
    );
    // Le livre, lui, est toujours en bibliothèque.
    expect((await listBooks()).some((b) => b.id === corpus[0].id)).toBe(true);
  });
});
