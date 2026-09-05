# Parcours de lecture — état d'avancement

Fichier de reprise. **À relire en premier** à chaque (re)démarrage, et à mettre à
jour après CHAQUE parcours terminé. Il est la seule source de vérité sur ce qui
reste à faire : le run peut être interrompu à tout moment par une limite d'usage
de 5 h et redémarrer des heures plus tard.

## Protocole par parcours

1. Récupérer le périmètre exact depuis la base :
   `sqlite3 -separator ' | ' app/data/library.db "SELECT a.name, b.title, … WHERE …"`
   Les titres et noms d'auteur doivent être **copiés tels quels** (apostrophes
   typographiques `’` comprises) : c'est la clé de résolution.
2. Écrire `app/src/lib/roadmaps/data/<slug>.ts` sur le modèle des deux parcours
   déjà faits (`lire-avec-les-tout-petits.ts`, `classiques-de-l-enfance.ts`).
   Ordre de lecture réfléchi, pas l'ordre SQL. Une `note` par livre : ce qu'il
   apporte **à ce parcours-là**, et pourquoi à cette place. Jamais de formule
   passe-partout — le test refuse les notes de moins de 40 caractères et les
   notes identiques d'un livre à l'autre.
3. Ajouter l'import et l'entrée dans `app/src/lib/roadmaps/index.ts`.
4. `cd app && npm test` — le test de résolution attrape toute faute de frappe.
   Le test de couverture reste rouge jusqu'au dernier parcours : c'est normal,
   il sert de compteur (« N livre(s) sans parcours sur 2029 »).
5. `git add -A && git commit` avec un message court, puis cocher la case ici.

## Règles de fond

- Français, ton sobre. Le lecteur est adulte et cultivé ; pas de superlatifs.
- Un livre peut appartenir à plusieurs parcours (c'est souhaitable).
- `minAge` doit apparaître dans `ageLabel` (« Dès 16 ans » → 16 ; « 7-12 ans » → 7).
- `description` : 3-5 phrases, > 80 caractères, dit à qui s'adresse le parcours
  et selon quelle logique il progresse.
- Ne jamais inventer un livre absent de la base. S'il manque une œuvre pivot,
  l'ajouter à `seed/authors.json` + `seed/books.json` (jeu de clés **exact** :
  12 clés livre, 10 clés auteur, `null` jamais `""`), puis
  `python3 pipeline/validate.py` et `npm run db:seed`, puis
  `npx tsx src/db/generated-content.ts restore` — le reseed efface les analyses
  Claude, la restauration les remet.

## Parcours

### Jeunesse et famille
- [x] `lire-avec-les-tout-petits` — 3-7 ans — 19 livres
- [x] `classiques-de-l-enfance` — 7-12 ans — 20 livres
- [x] `premiers-grands-romans` — 12-16 ans — `audience='tous'` + classiques abordables

### Littérature française
- [x] `sources-moyen-age-renaissance` — Littérature, Moyen Âge + XVIe siècle
- [x] `le-grand-siecle` — Littérature, XVIIe siècle
- [x] `lumieres-litteraires` — Littérature, XVIIIe siècle
- [x] `romantisme-francais` — Littérature, XIXe, romantisme/symbolisme
- [x] `realisme-et-naturalisme` — Littérature, XIXe, roman réaliste et naturaliste
- [x] `roman-francais-xxe` — Littérature, XXe, langue française
- [x] `litterature-contemporaine` — Littérature, XXIe siècle
- [x] `la-poesie` — `genre='Poésie'`, toutes périodes
- [x] `le-theatre` — `genre='Théâtre'`, toutes périodes

### Littératures du monde
- [x] `le-roman-russe` — `original_language='russe'` (hors jeunesse déjà couverte)
- [x] `le-monde-anglo-saxon` — `original_language='anglais'`
- [x] `lettres-allemandes` — allemand
- [x] `chine-et-japon` — chinois, japonais
- [x] `mediterranee-et-amerique-latine` — italien, espagnol, portugais
- [x] `europe-du-nord-et-centrale` — norvégien, danois, suédois, tchèque, polonais, hongrois…

### Antiquité et fondations
- [x] `les-fondations-grecques` — `original_language='grec ancien'`
- [x] `rome-et-le-stoicisme` — latin
- [x] `textes-sacres-et-tradition` — `genre='Texte religieux'`, théologie, hébreu/arabe
- [x] `le-mythe-arthurien` — Jean Markale, matière de Bretagne, Chrétien de Troyes

### Philosophie et connaissance de soi
- [x] `initiation-a-la-philosophie` — sélection d'entrée, tous siècles
- [x] `philosophie-antique-et-medievale` — Philosophie, Antiquité + Moyen Âge
- [x] `rationalisme-et-lumieres` — Philosophie, XVIe-XVIIIe
- [x] `les-maitres-du-soupcon` — Philosophie, XIXe (Marx, Nietzsche, Freud et leur postérité)
- [x] `phenomenologie-et-existentialisme` — Philosophie, XXe
- [ ] `philosophie-contemporaine` — Philosophie, XXe-XXIe restant
- [ ] `philosophie-morale-et-art-de-vivre` — morale pratique, sagesse
- [ ] `psychologie-et-connaissance-de-soi` — psychologie, psychanalyse, développement

### Politique, histoire, société
- [ ] `comprendre-la-puissance` — classiques du politique
- [ ] `geopolitique-du-monde-contemporain` — Sciences géopolitiques, XXIe
- [ ] `economie-et-critique-du-capitalisme`
- [ ] `histoire-de-france`
- [ ] `guerres-et-totalitarismes-du-xxe`
- [ ] `civilisations-et-longue-duree`

### Sciences
- [ ] `comprendre-l-univers` — physique, cosmologie
- [ ] `le-vivant` — évolution, biologie, écologie
- [ ] `les-mathematiques` — catégorie Mathématiques
- [ ] `histoire-et-philosophie-des-sciences`

### Visions du monde
Source : `bibliothèque vision du monde.md` à la racine du dépôt (les 7 catégories
et leurs auteurs de référence). C'est ce document qui alimentait l'ancienne
colonne « Vision du monde », supprimée du tableau au profit de ces parcours.
- [ ] `vision-cynique` — l'intérêt et la puissance structurent le réel
- [ ] `vision-chretienne` — misère et grandeur de l'homme
- [ ] `vision-aristocratique` — hiérarchie, dépassement, noblesse
- [ ] `vision-classique` — mesure, raison, équilibre des pouvoirs
- [ ] `vision-scientifique` — déterminismes biologiques, économiques, psychiques
- [ ] `vision-existentialiste` — liberté radicale, angoisse, absurde
- [ ] `vision-geopolitique` — longue durée, rapports de force, civilisations

### Formes et pratiques de lecture
- [ ] `recits-de-soi` — Mémoires, Autobiographie, Journal, Correspondance, Biographie
- [ ] `nouvelles-et-formes-breves` — Nouvelle, Conte (adulte), Fable, Maximes
- [ ] `science-fiction-et-anticipation`
- [ ] `grands-essais-et-art-de-penser` — essais restants, filet de sécurité

### Balayage final (obligatoire)
- [ ] Lancer `npm test`, récupérer la liste des livres non couverts, et rattacher
      **chacun** au parcours existant le plus pertinent (en ajoutant l'entrée et
      sa note). Répéter jusqu'à ce que le test de couverture passe au vert.
      Aucun livre ne doit rester orphelin — c'est l'exigence centrale.
