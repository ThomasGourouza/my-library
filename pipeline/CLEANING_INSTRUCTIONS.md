# Instructions de nettoyage — agents parallèles

Tu nettoies UN chunk de données brutes de la bibliothèque personnelle de Tom
(`pipeline/output/chunks/<chunk>.json`) et tu écris le résultat dans
`pipeline/output/cleaned/<chunk>.json` (même nom de fichier). Tu travailles seul
sur ton chunk ; d'autres agents traitent les autres chunks en parallèle avec ces
mêmes instructions. Un merge déterministe fusionnera ensuite les sorties
(les auteurs identiques entre chunks sont réconciliés par nom normalisé —
utilise donc le nom canonique exact de chaque auteur).

## Format d'entrée

`{"chunk": "...", "kind": "authors"|"titles", "records": [...]}` — chaque record :

```json
{"id":"r0042","source":"library-organized.ods","sheet":"philosophie","row":57,
 "kind":"pair|author_only|title_only|dash_pair|bare",
 "author":"...","title":"...","theme":null,"genre":null,"courant":null,
 "period":null,"birthYear":null,"deathYear":null,"notes":null,
 "categoryHint":"Littérature","audienceHint":"enfants|null","sectionHint":"...|null",
 "authorOnly":false,"uncertain":false,"raw":"texte original"}
```

- `kind: pair` — couple auteur/titre déjà aligné (mais titre possiblement fautif).
- `kind: author_only` — ligne auteur sans œuvre (voir règle d'enrichissement).
- `kind: dash_pair` — ligne `X - Y` dont l'ordre auteur/titre est INCONNU : à toi
  de déterminer lequel est l'auteur (ex. « Au bonheur des dames - Zola » →
  auteur Émile Zola, titre Au bonheur des dames).
- `kind: bare` / `title_only` — texte seul : identifie s'il s'agit d'un titre
  (retrouve alors l'auteur réel grâce à tes connaissances), d'un nom d'auteur
  (→ traite comme author_only), ou d'un déchet à écarter.
- `uncertain: true` — vérifie avec un soin particulier.
- `raw` — texte source d'origine, pour contexte.

## Format de sortie (EXACT — validé par un script strict)

```json
{
  "chunk": "chunk-NN.json",
  "authors": [
    {"key":"fedor-dostoievski","name":"Fédor Dostoïevski","birthYear":1821,
     "deathYear":1881,"nationality":"russe","language":"russe",
     "mainGenre":"Roman","mainField":"Littérature","period":"XIXe siècle",
     "notes":null}
  ],
  "books": [
    {"title":"Crime et Châtiment","authorKey":"fedor-dostoievski",
     "category":"Littérature","genre":"Roman","courant":"Réalisme russe",
     "theme":null,"period":"XIXe siècle","publicationYear":1866,
     "audience":"adultes","worldview":null,"originalLanguage":"russe",
     "notes":null,"enriched":false,
     "sourceSheets":["library-organized.ods/romans,_poesie_et_theatre"]}
  ],
  "dropped": [
    {"id":"r0042","raw":"300","reason":"artefact sans signification fiable"}
  ]
}
```

## Règles

### Auteurs
1. **Nom canonique français** : « Fédor Dostoïevski », « Léon Tolstoï »,
   « Homère », « Frères Grimm ». Corrige typos et variantes (« dumezil » →
   « Georges Dumézil » ; « laurence sterne » → « Laurence Sterne »). Prénom +
   nom, majuscules correctes, accents corrects.
2. `key` : slug kebab-case sans accents du nom canonique
   (« François de La Rochefoucauld » → `francois-de-la-rochefoucauld`).
   Déterministe : même auteur ⇒ même clé dans tous les chunks.
3. Complète depuis tes connaissances les champs manquants quand tu es sûr :
   `birthYear`/`deathYear` (années négatives = av. J.-C. : Platon `-428`/`-348`),
   `nationality` (adjectif féminin minuscule : « française », « russe »,
   « américaine »), `language` (langue principale d'écriture : « français »,
   « anglais », « grec ancien »), `mainGenre` (genre dominant), `mainField`
   (une des 6 catégories, celle qui domine son œuvre), `period` (voir enum).
   En cas de doute réel, laisse `null`. N'INVENTE JAMAIS de dates pour un
   auteur obscur ou incertain.
4. Œuvres anonymes : crée un auteur dédié — « Homère » pour l'Iliade/Odyssée,
   « Anonyme (œuvre médiévale) » pour le Roman de Renart, « Anonyme (chanson de
   geste) », « Anonyme » en dernier recours. Textes bibliques → auteur
   « Anonyme (texte biblique) ».
5. Personne réelle non-écrivain citée comme référence (ex. rangée déchet) :
   n'en fais PAS un auteur sans livre — chaque auteur émis doit avoir ≥ 1 livre
   dans ta sortie.

### Livres
6. **Titre canonique français** quand l'œuvre a une traduction française
   consacrée : « illiade et odysee » → DEUX livres « L'Iliade » et
   « L'Odyssée » ; « robisson crusoe » → « Robinson Crusoé » ; « guliver » →
   « Les Voyages de Gulliver ». Les titres non traduits restent en langue
   originale (« Debt: The First 5,000 Years »). Apostrophe typographique « ' »,
   majuscules à la française (premier mot + noms propres).
7. Une ligne titre générique (« contes » sous Perrault) → titre canonique
   (« Contes de ma mère l'Oye » ou « Contes », selon l'usage consacré ; pour un
   recueil générique utilise « Contes »).
8. Sépare les cellules multi-œuvres restantes (ex. « Comédies : Le Songe d'une
   nuit d'été, Beaucoup de bruit pour rien » → livres distincts). Une œuvre en
   plusieurs tomes reste UN livre.
9. **Dédoublonne dans ton chunk** : même œuvre sous variantes (« Iliade » /
   « L'Iliade » / « illiade », apostrophes différentes) ⇒ UN seul livre, fusion
   des métadonnées (garde les infos les plus riches ; concatène les
   `sourceSheets`). Deux traductions/titres alternatifs de la même œuvre
   (« Contes de ma mère l'Oye » vs « Histoires ou contes du temps passé ») ⇒
   un seul livre, note l'alternative dans `notes`.
10. **Règle d'enrichissement** (la SEULE autorisation d'ajouter des livres) :
    pour un record `author_only`, crée l'auteur ET ajoute ses 1 à 3 œuvres les
    plus célèbres avec `"enriched": true`. Jamais plus de 3. Pour tout autre
    record, n'ajoute AUCUN livre qui ne figure pas dans les données.
    `enriched: false` pour tout livre présent dans les données sources.
11. Champs livre, complète depuis tes connaissances quand tu es sûr :
    - `category` (OBLIGATOIRE, exactement une valeur de l'enum ci-dessous ;
      `categoryHint` est un indice, corrige-le si le livre appartient
      manifestement à une autre catégorie — bcp de philosophie traîne dans la
      feuille romans).
    - `genre` : vocabulaire court et réutilisable (Roman, Essai, Poésie,
      Théâtre, Conte, Nouvelle, Biographie, Autobiographie, Mémoires, Épopée,
      Traité, Dialogue, Maximes, Correspondance, Journal, Chanson de geste,
      Bande dessinée, Histoire, Vulgarisation, Manuel…). Vise la sobriété, un
      harmonisateur final réduira à ≤ 40 genres.
    - `courant` : mouvement/école si pertinent (Romantisme, Réalisme,
      Existentialisme, Stoïcisme…), sinon null.
    - `theme` : thème dominant si évident, sinon null.
    - `period` : période de l'ŒUVRE (enum ci-dessous), pas de l'auteur si
      différent. `publicationYear` : première publication (négatif = av. J.-C.),
      null si incertain.
    - `audience` : `enfants` si `audienceHint: enfants` OU livre manifestement
      jeunesse ; `tous` pour les classiques lisibles à tout âge type contes de
      Perrault/Grimm, fables, Petit Prince ; sinon `adultes`. (`adolescents`
      si clairement young-adult.)
    - `originalLanguage` : langue d'écriture originale.
    - `worldview` : laisse `null` (appliqué par le merge).
    - `notes` : contexte utile de la source (colonne Notes, sectionHint
      pertinent) ou remarque de nettoyage courte. Sinon null.
12. `sourceSheets` : liste des `source.ods/sheet` d'où viennent les records
    fusionnés dans ce livre. Pour un livre `enriched`, mets la feuille du
    record author_only d'origine.

### Déchets
13. Écarte dans `dropped` (avec `id`, `raw`, `reason`) : artefacts WhatsApp
    résiduels, notes de lecture sans œuvre identifiable, doublons exacts
    (mentionne l'id gardé), références trop vagues pour être identifiées avec
    confiance. En cas de doute raisonnable sur une vraie œuvre, GARDE-la avec
    une note plutôt que de la supprimer.

### Enums (exactes, sensibles à la casse)

- `category` : `Littérature` | `Philosophie & psychologie` | `Histoire` |
  `Sciences géopolitiques` | `Sciences` | `Mathématiques`
- `audience` : `enfants` | `adolescents` | `adultes` | `tous`
- `period` (auteur et livre) : `Antiquité` | `Moyen Âge` | `XVIe siècle` |
  `XVIIe siècle` | `XVIIIe siècle` | `XIXe siècle` | `XXe siècle` |
  `XXIe siècle` — choisis LA période principale (pas de « XXe–XXIe »).
  Sources : « Classicisme » → `XVIIe siècle`, « Renaissance » → `XVIe siècle`.
- `mainField` : mêmes valeurs que `category`.

### Cohérence
14. Chaque `authorKey` de `books` doit avoir son entrée dans `authors` du même
    fichier. Chaque auteur émis a ≥ 1 livre. Aucun doublon
    (authorKey, titre normalisé) dans ta sortie. JSON strict UTF-8, `null`
    explicites, pas de champs supplémentaires ni manquants.
15. Ne modifie AUCUN autre fichier que `pipeline/output/cleaned/<ton-chunk>.json`.
