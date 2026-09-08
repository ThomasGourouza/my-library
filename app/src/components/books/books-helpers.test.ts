/**
 * Logique d'affichage de la liste des livres : ordre des périodes, groupement,
 * et sérialisation du sélecteur de colonnes. Rien ici ne touche à la base ;
 * tout est vérifiable sur des objets construits à la main.
 */
import { describe, expect, it } from "vitest";
import type { BookWithRoadmaps } from "@/lib/roadmaps/queries";
import { PERIODS } from "@/lib/validation";
import {
  COLUMN_IDS,
  SORTABLE_COLUMNS,
  compareBooks,
  compareText,
  sortBooks,
  COLUMN_LABELS,
  DEFAULT_HIDDEN_COLUMNS,
  EMPTY_FILTERS,
  FILTER_KEYS,
  FILTER_LABELS,
  LOCKED_COLUMNS,
  groupBooks,
  isSortableColumn,
  parseHiddenColumns,
  periodRank,
  serializeHiddenColumns,
} from "./books-helpers";

/** Livre minimal : seuls les champs que ces fonctions regardent. */
function book(partial: Partial<BookWithRoadmaps> & { title: string }) {
  return {
    id: Math.floor(Math.random() * 1e6),
    titleNormalized: partial.title.toLowerCase(),
    category: "Littérature",
    genre: null,
    courant: null,
    theme: null,
    period: null,
    publicationYear: null,
    audience: "adultes",
    originalLanguage: null,
    notes: null,
    summary: null,
    analysis: null,
    analysisGeneratedAt: null,
    enriched: false,
    read: false,
    authorId: 1,
    createdAt: "",
    author: {
      id: 1,
      name: "Auteur",
      nameNormalized: "auteur",
      birthYear: null,
      deathYear: null,
      nationality: null,
      language: null,
      mainGenre: null,
      mainField: null,
      period: null,
      notes: null,
      bio: null,
      bioGeneratedAt: null,
      createdAt: "",
      },
    roadmaps: [],
    priority: null,
    ...partial,
  } as BookWithRoadmaps;
}

describe("periodRank", () => {
  it("suit l'ordre chronologique et non l'alphabétique", () => {
    // C'est tout l'intérêt : « XIXe siècle » vient avant « XVIe siècle » en
    // tri alphabétique, ce qui est faux.
    expect(periodRank("XVIe siècle")).toBeLessThan(periodRank("XIXe siècle"));
    expect(periodRank("Antiquité")).toBe(0);
    expect(periodRank(PERIODS[PERIODS.length - 1])).toBe(PERIODS.length - 1);
  });

  it("range les valeurs inconnues ou absentes en dernier", () => {
    expect(periodRank(null)).toBe(PERIODS.length);
    expect(periodRank("Renaissance")).toBe(PERIODS.length);
  });
});

describe("groupBooks", () => {
  const corpus = [
    book({ title: "Nana", period: "XIXe siècle", genre: "Roman" }),
    book({ title: "Germinal", period: "XIXe siècle", genre: "Roman" }),
    book({ title: "L’Iliade", period: "Antiquité", genre: "Épopée" }),
    book({ title: "Sans période", period: null, genre: null }),
  ];

  it("groupe par période dans l'ordre chronologique", () => {
    const groups = groupBooks(corpus, "period");
    expect(groups.map((g) => g.label)).toEqual([
      "Antiquité",
      "XIXe siècle",
      "Non renseigné",
    ]);
  });

  it("met les livres sans valeur dans un groupe « Non renseigné », en dernier", () => {
    const groups = groupBooks(corpus, "genre");
    expect(groups[groups.length - 1].label).toBe("Non renseigné");
    expect(groups[groups.length - 1].books).toHaveLength(1);
  });

  it("trie les livres de chaque groupe par titre", () => {
    const xixe = groupBooks(corpus, "period").find(
      (g) => g.label === "XIXe siècle"
    )!;
    expect(xixe.books.map((b) => b.title)).toEqual(["Germinal", "Nana"]);
  });

  it("n'oublie aucun livre", () => {
    for (const key of ["period", "genre", "category", "author"] as const) {
      const total = groupBooks(corpus, key).reduce(
        (n, g) => n + g.books.length,
        0
      );
      expect(total, `groupement par ${key}`).toBe(corpus.length);
    }
  });
});

describe("sélecteur de colonnes", () => {
  it("chaque colonne a un libellé, et aucun libellé n'est orphelin", () => {
    expect(Object.keys(COLUMN_LABELS).sort()).toEqual([...COLUMN_IDS].sort());
  });

  it("le titre n'est jamais masquable", () => {
    expect(LOCKED_COLUMNS).toContain("title");
    expect(parseHiddenColumns("title,theme")).not.toContain("title");
  });

  it("absence de paramètre = configuration par défaut", () => {
    expect(parseHiddenColumns(null)).toEqual([...DEFAULT_HIDDEN_COLUMNS]);
  });

  it("paramètre vide = toutes les colonnes affichées", () => {
    // Distinct de l'absence : c'est ce qui permet de tout afficher et de
    // partager l'URL.
    expect(parseHiddenColumns("")).toEqual([]);
  });

  it("ignore les identifiants inconnus", () => {
    expect(parseHiddenColumns("theme,inexistante")).toEqual(["theme"]);
  });

  it("n'écrit rien dans l'URL quand l'état est celui par défaut", () => {
    expect(serializeHiddenColumns([...DEFAULT_HIDDEN_COLUMNS])).toBeNull();
    // Même ensemble, autre ordre : toujours l'état par défaut.
    expect(
      serializeHiddenColumns([...DEFAULT_HIDDEN_COLUMNS].reverse())
    ).toBeNull();
  });

  it("fait l'aller-retour sans perte", () => {
    const hidden = parseHiddenColumns("roadmaps,theme");
    const written = serializeHiddenColumns(hidden)!;
    expect(parseHiddenColumns(written)).toEqual(hidden);
  });
});

describe("filtres et tri", () => {
  it("chaque clé de filtre a un libellé et une entrée vide", () => {
    for (const key of FILTER_KEYS) {
      expect(FILTER_LABELS[key], key).toBeTruthy();
      expect(EMPTY_FILTERS[key], key).toEqual([]);
    }
    expect(Object.keys(EMPTY_FILTERS).sort()).toEqual([...FILTER_KEYS].sort());
  });

  it("ne valide comme triables que les colonnes qui existent", () => {
    expect(isSortableColumn("title")).toBe(true);
    expect(isSortableColumn("inexistante")).toBe(false);
  });
});

describe("tri partagé table / liste mobile", () => {
  it("place les valeurs nulles en dernier en croissant, en tête en décroissant", () => {
    // Un livre sans genre ne s'intercale pas au milieu de l'alphabet. En
    // décroissant il passe devant, parce que le comparateur est simplement
    // inversé — c'est exactement ce que fait TanStack dans la table, faute de
    // `sortUndefined`. Les traiter autrement ici ferait diverger l'ordre entre
    // la liste mobile et la table, ce qui serait pire que la bizarrerie.
    const rows = [
      book({ title: "sans", genre: null }),
      book({ title: "roman", genre: "Roman" }),
      book({ title: "essai", genre: "Essai" }),
    ];
    expect(sortBooks(rows, "genre", false).map((b) => b.title)).toEqual([
      "essai",
      "roman",
      "sans",
    ]);
    expect(sortBooks(rows, "genre", true).map((b) => b.title)).toEqual([
      "sans",
      "roman",
      "essai",
    ]);
  });

  it("trie les périodes chronologiquement, pas alphabétiquement", () => {
    const rows = [
      book({ title: "c", period: "XIXe siècle" }),
      book({ title: "a", period: "XVIe siècle" }),
      book({ title: "b", period: "XVIIe siècle" }),
    ];
    expect(sortBooks(rows, "period", false).map((b) => b.title)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("met les non lus d'abord en tri croissant", () => {
    const rows = [book({ title: "lu", read: true }), book({ title: "pas lu" })];
    expect(sortBooks(rows, "read", false).map((b) => b.title)).toEqual([
      "pas lu",
      "lu",
    ]);
  });

  it("départage par titre, donc l'ordre est stable", () => {
    // Même catégorie pour les trois : seul le titre les sépare, et il doit
    // les séparer de la même façon à chaque rendu.
    const rows = [
      book({ title: "c" }),
      book({ title: "a" }),
      book({ title: "b" }),
    ];
    expect(sortBooks(rows, "category", false).map((b) => b.title)).toEqual([
      "a",
      "b",
      "c",
    ]);
    // Y compris en descendant : la clé principale s'inverse, le titre non.
    expect(sortBooks(rows, "category", true).map((b) => b.title)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("sait comparer chaque colonne déclarée triable", () => {
    // Garde-fou d'exhaustivité : une colonne ajoutée à SORTABLE_COLUMNS sans
    // branche dans compareBooks renverrait undefined et casserait le tri.
    const a = book({ title: "a" });
    const b = book({ title: "b" });
    for (const column of SORTABLE_COLUMNS) {
      expect(typeof compareBooks(a, b, column)).toBe("number");
    }
  });

  it("compare le texte selon la collation française", () => {
    // « é » se classe avec « e », pas après « z ».
    expect(compareText("école", "zèbre")).toBeLessThan(0);
    expect(compareText(null, "a")).toBeGreaterThan(0);
    expect(compareText(null, null)).toBe(0);
  });
});
