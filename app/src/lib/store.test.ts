/**
 * Le chemin d'écriture du magasin, et la règle qu'il ne doit plus jamais
 * enfreindre : **une mutation ne part jamais d'un état périmé**.
 *
 * Ce test existe parce que le contraire est arrivé. Un `git pull` avait ramené
 * quatre livres cochés « Lu » depuis l'application déployée ; une analyse
 * Claude s'est terminée dans la seconde qui suivait ; `mutate()`, servi par le
 * plancher de fraîcheur, a réécrit le fichier entier à partir de l'objet
 * d'avant le pull. Les quatre coches ont disparu sans le moindre message.
 *
 * Le plancher de fraîcheur reste bon pour les lectures — il borne l'obsolescence
 * affichée. Sur une écriture, qui réécrit tout le fichier, il détruit ce que la
 * lecture a manqué.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { listBooks, updateBook } from "@/lib/queries";

const FICHIER = () => process.env.LIBRARY_DATA_PATH!;
const lire = () => JSON.parse(fs.readFileSync(FICHIER(), "utf-8"));

/**
 * Écrit le fichier dans le dos du magasin, comme le ferait `git pull`, et force
 * un `mtime` distinct : c'est lui qui sert de jeton au backend fichier, et deux
 * écritures dans la même milliseconde passeraient pour un fichier inchangé.
 */
function ecrireDehors(mutation: (data: ReturnType<typeof lire>) => void): void {
  const data = lire();
  mutation(data);
  fs.writeFileSync(FICHIER(), JSON.stringify(data, null, 2) + "\n");
  const futur = new Date(Date.now() + 1000);
  fs.utimesSync(FICHIER(), futur, futur);
}

describe("magasin — chemin d'écriture", () => {
  it("une mutation ne peut pas écraser une modification arrivée entre-temps", async () => {
    const livres = await listBooks();
    const cible = livres[0];
    const voisin = livres[1];
    const notesCible = cible.notes;
    const notesVoisin = voisin.notes;

    // La lecture ci-dessus vient de remplir le cache : tout ce qui suit se
    // passe donc à l'intérieur de la seconde de fraîcheur, c'est-à-dire dans la
    // fenêtre exacte où le bug se produisait.
    ecrireDehors((data) => {
      const b = data.books.find((x: { id: number }) => x.id === voisin.id);
      b.notes = "arrivé par git pull";
    });

    await updateBook(cible.id, { notes: "écrit par l'application" });

    const surDisque = lire();
    const relu = (id: number) =>
      surDisque.books.find((b: { id: number }) => b.id === id).notes;

    // Sans le correctif, cette ligne échoue : la note du voisin est revenue à
    // sa valeur d'avant, effacée par une écriture partie du cache.
    expect(relu(voisin.id)).toBe("arrivé par git pull");
    // Et la mutation demandée, elle, a bien eu lieu.
    expect(relu(cible.id)).toBe("écrit par l'application");

    // Remise en état : les autres fichiers de test lisent le même corpus.
    await updateBook(cible.id, { notes: notesCible });
    ecrireDehors((data) => {
      const b = data.books.find((x: { id: number }) => x.id === voisin.id);
      b.notes = notesVoisin;
    });
  });
});
