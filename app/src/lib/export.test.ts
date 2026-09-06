/**
 * L'export produit un fichier que personne ne relira ligne à ligne : si
 * l'échappement est faux, on ne s'en aperçoit qu'une fois les colonnes
 * décalées dans le tableur. Ces cas figent les règles de la RFC 4180.
 */
import { describe, expect, it } from "vitest";
import { toCsv, toJson, type ExportColumn } from "./export";

interface Row {
  titre: string;
  lu: boolean;
  annee: number | null;
}

const columns: ExportColumn<Row>[] = [
  { header: "Titre", value: (r) => r.titre },
  { header: "Lu", value: (r) => r.lu },
  { header: "Année", value: (r) => r.annee },
];

describe("toCsv", () => {
  it("écrit l'en-tête puis une ligne par enregistrement, en CRLF", () => {
    const csv = toCsv(columns, [{ titre: "Germinal", lu: false, annee: 1885 }]);
    expect(csv).toBe("Titre,Lu,Année\r\nGerminal,non,1885\r\n");
  });

  it("met entre guillemets tout champ contenant une virgule", () => {
    // Cas réel du corpus : sans cela, la ligne gagne une colonne.
    const csv = toCsv(columns, [
      { titre: "Rome, ou la fin du monde", lu: true, annee: null },
    ]);
    expect(csv.split("\r\n")[1]).toBe('"Rome, ou la fin du monde",oui,');
  });

  it("double les guillemets internes", () => {
    const csv = toCsv(columns, [{ titre: 'Le « Grand » Jeu"', lu: false, annee: null }]);
    expect(csv.split("\r\n")[1]).toBe('"Le « Grand » Jeu""",non,');
  });

  it("met entre guillemets un champ contenant un saut de ligne", () => {
    const csv = toCsv(columns, [{ titre: "Deux\nlignes", lu: false, annee: null }]);
    expect(csv).toContain('"Deux\nlignes"');
  });

  it("rend une valeur absente par une cellule vide, pas par « null »", () => {
    const csv = toCsv(columns, [{ titre: "X", lu: false, annee: null }]);
    expect(csv.split("\r\n")[1]).toBe("X,non,");
  });

  it("produit un fichier d'en-tête seul quand il n'y a aucune ligne", () => {
    expect(toCsv(columns, [])).toBe("Titre,Lu,Année\r\n");
  });
});

describe("toJson", () => {
  it("clé = en-tête lisible, valeur absente = null", () => {
    const parsed = JSON.parse(
      toJson(columns, [{ titre: "Nana", lu: true, annee: null }])
    );
    expect(parsed).toEqual([{ Titre: "Nana", Lu: true, Année: null }]);
  });
});
