# Améliorations autonomes — audit, plan et décisions

Branche : `ameliorations-autonomes` (partie de `parcours-de-lecture`, commit `e114e54`).
Rédigé le 6 septembre 2026. Tom est absent : chaque question rencontrée est
tranchée ici, avec sa raison.

---

## 1. État constaté

Mesures prises sur la base réelle (`app/data/library.db`) et le code au départ.

| Mesure | Valeur |
| --- | --- |
| Livres | 2 043 |
| Auteurs | 1 069 |
| Livres marqués « Lu » | **0** |
| Livres avec analyse Claude | **0** (3 attendues) |
| Auteurs avec biographie | **0** (3 attendues) |
| Parcours | 53, 1 546 entrées |
| Colonnes du tableau des livres | 13, aucune masquable, aucune virtualisation |
| Tests | 15, tous verts (2 fichiers : parcours, priorités) |
| Lint | 3 problèmes (1 erreur `main-nav.tsx`, 2 avertissements) |
| `tsc --noEmit` | propre |

Complétude des colonnes (sur 2 043 livres) : `theme` nul à **79 %**,
`courant` à 48 %, `publicationYear` à 25 %, `notes` à 75 %.
Sur 1 069 auteurs : `birthYear` nul pour 128, `nationality` pour 50.

### 1.1 Régression de données à réparer en priorité

`seed/generated-content.json` contient 3 analyses (Crime et Châtiment, 1984,
À la recherche du temps perdu) et 3 biographies (Dostoïevski, Orwell, Proust),
sauvegardées le 6 septembre à 09:26. La base a été reseedée à 12:45 **sans
exécuter la restauration**. Le contenu n'est donc plus visible dans l'app alors
qu'il existe sur disque. C'est exactement le scénario que
`src/db/generated-content.ts` était censé couvrir, et il a été à moitié appliqué.

### 1.2 Doublons d'œuvres anonymes

Cinq œuvres existent deux fois sous deux auteurs anonymes différents :

| Œuvre | Auteur A | Auteur B |
| --- | --- | --- |
| L'Épopée de Gilgamesh | Anonyme | Anonyme (épopée mésopotamienne) |
| Beowulf | Anonyme (épopée médiévale) | Anonyme (œuvre médiévale) |
| La Chanson des Nibelungen | Anonyme (épopée médiévale) | Anonyme (œuvre médiévale) |
| La Mort le Roi Artu | Anonyme (Cycle de la Vulgate) | Anonyme (œuvre médiévale) |
| Tristan et Iseut / Iseult | Anonyme (légende médiévale) | Anonyme (œuvre médiévale) |

Rien dans le code ne les détecte : la contrainte d'unicité porte sur
(titre, auteur), et ces paires ont des auteurs distincts. Le tableau les affiche
donc deux fois, avec des parcours et des priorités éclatés entre les deux.

### 1.3 Code mort

`getFilterOptions()` calcule `themes` (202 valeurs distinctes) : aucune vue ne
le consomme depuis que le filtre Thème a disparu de `books-view`. Un
`SELECT DISTINCT` inutile à chaque rendu de `/livres` **et** de `/auteurs`.

---

## 2. Ce qui manque, classé par valeur d'usage

L'app sert à **choisir quoi lire** dans un corpus que personne n'épuisera.
Le classement suit cette question, pas la facilité de mise en œuvre.

### Valeur haute

1. **Aucune vue d'ensemble.** `/` redirige vers `/livres`. Rien ne répond à
   « où j'en suis », « que me reste-t-il d'essentiel », « quel parcours est
   entamé ». C'est le manque le plus coûteux : les 2 043 lignes sont un
   inventaire, pas une aide à la décision.
2. **Aucune progression de lecture.** La case « Lu » est stockée et filtrable,
   mais aucun écran ne l'agrège. Un parcours de 30 livres n'affiche pas
   « 7 / 30 lus », et rien ne dit quel est le prochain livre à lire.
3. **Le tableau principal est difficile à exploiter.** 13 colonnes qui débordent
   horizontalement (les colonnes Parcours et Public sont hors écran à
   1 440 px), aucune possibilité d'en masquer, 2 043 lignes rendues d'un bloc.
4. **Aucune recherche globale.** Pour aller à un auteur, il faut passer par
   l'onglet Auteurs et retaper. `cmdk` est déjà installé et inutilisé en tant
   que palette.
5. **Données fausses** : les 5 doublons ci-dessus, et les analyses perdues.

### Valeur moyenne

6. **Aucune liste personnelle.** Les 53 parcours sont du contenu éditorial
   versionné ; Tom ne peut rien composer lui-même (« à lire cet été »,
   « offerts »). C'est la vraie demande derrière « aucun écran ne permet de
   créer ou modifier un parcours ».
7. **Filtres d'auteurs non partageables** : `authors-view` ne synchronise pas
   l'URL, contrairement à `books-view`. Un rechargement perd tout.
8. **Aucun export.** La bibliothèque est prisonnière de l'app.
9. **« Analyse Claude » invisible** : rien n'indique quels livres en ont une,
   et la biographie ne se lance que depuis une fiche livre.

### Valeur basse mais bon marché

10. Lint : 1 erreur + 2 avertissements.
11. Tests : rien ne couvre `books-helpers` (groupement, tri, filtres),
    `normalize`, ni les schémas de validation.
12. `README.md` est le boilerplate `create-next-app`, jamais réécrit.
13. Accessibilité : lignes de tableau cliquables sans équivalent clavier,
    pas de `aria-sort` sur les en-têtes, pas de lien d'évitement.

---

## 3. Chantiers retenus

Dans l'ordre d'exécution. Chacun se termine par
`npm test && npx tsc --noEmit && npm run build`, une capture en thème clair et
sombre s'il touche l'interface, et un commit.

| # | Chantier | Plan visé |
| --- | --- | --- |
| 1 | Restaurer les analyses et biographies perdues | données |
| 2 | Corriger les 3 problèmes de lint | qualité |
| 3 | Fusionner les 5 doublons d'œuvres anonymes + garde-fou de test | données |
| 4 | Supprimer le code mort `themes` de `getFilterOptions` | qualité |
| 5 | Tableau des livres : sélecteur de colonnes, persisté dans l'URL | UI/UX |
| 6 | Tableau des livres : virtualisation des lignes | performance |
| 7 | Accessibilité du tableau (`aria-sort`, lignes au clavier, lien d'évitement) | a11y |
| 8 | Progression de lecture dans les parcours (liste + détail + prochain livre) | fonctionnalité |
| 9 | Tableau de bord d'accueil sur `/` | fonctionnalité |
| 10 | Palette de commandes globale (⌘K / Ctrl+K) | UI/UX |
| 11 | Filtres d'auteurs synchronisés à l'URL | UI/UX |
| 12 | Listes personnelles (créer, renommer, ordonner, supprimer) | fonctionnalité |
| 13 | Export CSV / JSON de la bibliothèque | fonctionnalité |
| 14 | Visibilité de « Analyse Claude » (indicateur, filtre, bio depuis l'auteur) | fonctionnalité |
| 15 | Tests unitaires manquants | qualité |
| 16 | README réel + documentation des commandes | documentation |

---

## 4. Décisions prises seul

Chaque question rencontrée, et ce que j'ai tranché.

### Q1. Faut-il un écran de création/édition des parcours ?

**Non — mais la demande sous-jacente est satisfaite autrement (chantier 12).**

Les 53 parcours sont du contenu rédigé, versionné dans
`src/lib/roadmaps/data/*.ts`, et tenu par 8 tests (longueur minimale, colonne
vertébrale, part d'ouvrages spécialisés, notes uniques d'au moins 110 signes).
Un formulaire web qui régénère ces fichiers TypeScript contournerait à la fois
la revue et ces garde-fous, et la moindre erreur de sérialisation casserait la
compilation de toute l'app. Le rapport risque/valeur est mauvais.

À la place, j'ajoute des **listes personnelles** stockées en base : Tom crée,
renomme, ordonne et supprime ses propres listes de lecture depuis l'interface,
sans toucher au corpus éditorial. Il obtient la capacité qui lui manque
(composer un chemin de lecture à lui) sans fragiliser ce qui marche.

### Q2. Faut-il générer les analyses Claude manquantes (2 040 livres) ?

**Non.** Chaque analyse consomme le quota d'abonnement de Tom. Générer en masse
serait précisément « engager des actions de sa part ». Je restaure les 3 qui
existent déjà et je rends la fonctionnalité plus visible (chantier 14), pour
qu'il déclenche lui-même ce qu'il veut.

### Q3. Quelle entrée conserver pour chaque doublon ?

**L'entrée la mieux renseignée, et l'auteur au libellé le plus précis.**
Concrètement : « Anonyme (épopée mésopotamienne) » l'emporte sur « Anonyme »,
« Anonyme (Cycle de la Vulgate) » sur « Anonyme (œuvre médiévale) », etc. Un
libellé qui décrit la nature du texte vaut mieux qu'un fourre-tout. Pour
Tristan, l'orthographe conservée est « Tristan et Iseut » (celle de l'édition
Bédier et du parcours arthurien), sous « Anonyme (légende médiévale) ».
Les notes, priorités et entrées de parcours des deux côtés sont fusionnées, pas
perdues — méthode du commit `38273e1`.

### Q4. Faut-il ajouter une dépendance de virtualisation ?

**Oui : `@tanstack/react-virtual`.** MIT, sans clé d'API, sans compte, du même
éditeur que `@tanstack/react-table` déjà utilisé. Écrire une fenêtre de rendu à
la main pour économiser 14 Ko serait du code maison à maintenir pour un
problème résolu.

### Q5. Où stocker le choix des colonnes visibles ?

**Dans l'URL**, comme les filtres, le tri et le mode de vue. C'est la convention
déjà en place dans `books-view`, elle rend l'état partageable, et elle évite
d'introduire un second mécanisme de persistance (`localStorage`) qui
divergerait. Seules les colonnes **masquées** sont écrites, pour garder les URL
courtes.

### Q6. Les listes personnelles survivent-elles à `npm run db:seed` ?

**Oui, par obligation.** `db:seed` vide `authors` et `books` et réattribue tous
les identifiants. Les listes sont donc sauvegardées et restaurées par
`src/db/generated-content.ts`, **par clé naturelle** (`normalizeKey(auteur)` +
`normalizeKey(titre)`), exactement comme les analyses et l'état de lecture.
C'est la règle explicite du dépôt : jamais par identifiant.

### Q7. Le tableau de bord remplace-t-il la redirection de `/` ?

**Oui.** Une redirection vers `/livres` est un aveu qu'il n'y a rien à dire en
arrivant. L'onglet « Livres » reste le premier de la navigation et un clic sur
le logo mène désormais au tableau de bord.

### Q8. Faut-il retirer la colonne « Thème » (79 % vide) ?

**Non, mais elle est masquée par défaut** grâce au chantier 5. Retirer une
colonne détruit de l'information ; la masquer par défaut la sort du chemin sans
rien perdre. En revanche l'option de filtre `themes` calculée et jamais
consommée est bien supprimée : c'est du code mort, pas de la donnée.

### Q9. Faut-il remplacer `force-dynamic` par du cache ?

**Non.** L'app est mono-utilisateur, locale, et écrit en base à chaque case
cochée. Le coût d'une requête SQLite synchrone sur 2 000 lignes est de l'ordre
de la milliseconde ; introduire un cache créerait des incohérences d'affichage
après une modification pour un gain nul. Le vrai coût de `/livres` est le rendu
de 2 043 lignes dans le DOM, que le chantier 6 traite.

### Q10. Faut-il compléter les 509 années de publication manquantes ?

**Non.** Les remplir depuis mes connaissances produirait des dates plausibles
mais invérifiables, mêlées à des données issues des sources de Tom. Une donnée
fausse mais crédible coûte plus cher qu'une donnée absente. Les livres
« Ajout Claude » sont déjà marqués comme tels ; je n'étends pas ce mécanisme à
des champs individuels.

---

## 5. Ce que je ne fais pas, et pourquoi

- **Éditeur de parcours en base** → Q1.
- **Génération massive d'analyses Claude** → Q2.
- **Complétion automatique des métadonnées manquantes** → Q10.
- **Couvertures de livres / images.** Suppose un service externe (Open Library,
  Google Books) : appels réseau sortants depuis l'app de Tom, et une
  dépendance à un service que je ne peux ni tester durablement ni garantir.
- **Authentification, multi-utilisateur, déploiement.** Hors sujet pour une app
  locale à un seul utilisateur, et le déploiement est explicitement interdit.
- **Migration vers un autre stockage (Postgres, ORM différent).** L'existant
  fonctionne ; un changement d'infrastructure sans besoin est une régression
  déguisée.
- **Refonte graphique.** La charte shadcn/Tailwind en place est cohérente et
  correcte en clair comme en sombre. J'améliore la densité d'information, pas
  l'esthétique.
- **Internationalisation.** L'app est en français par décision d'origine
  (`PLAN.md`) ; l'ouvrir à d'autres langues n'a aucun usage ici.
- **Retirer les 3 doublons de titre légitimes** (« Phèdre » de Racine, Platon et
  Sénèque ; « Fables » d'Ésope, Krylov et La Fontaine ; etc.) : ce sont des
  œuvres différentes d'auteurs différents, pas des doublons.

---

## 6. Journal des décisions en cours de route

Les questions rencontrées pendant l'exécution, et ce que j'ai tranché.

**Q11. Quelle entrée conserver pour Gilgamesh ?** Les deux portaient la même
catégorie et la même période ; seule « Anonyme (épopée mésopotamienne) » avait
un thème et une note. C'est elle qui est conservée. Règle appliquée aux cinq
fusions : tout champ vide chez l'entrée conservée est repris de l'absorbée, et
la priorité retenue est la plus haute des deux — l'œuvre est la même, le rang le
plus généreux est celui qui a été posé en connaissance du texte. Une exception
nommée : la langue des Nibelungen passe d'« allemand » à « moyen haut-allemand ».

**Q12. Que faire de l'auteur « Anonyme » devenu presque vide ?** Il ne portait
plus que le Jin Ping Mei. Renommé « Anonyme (roman chinois) » : un fourre-tout
sans qualificatif attire les œuvres qui n'ont pas trouvé leur place, et c'est
exactement comme cela que le doublon Gilgamesh était né.

**Q13. Le tableau doit-il occuper toute la largeur de l'écran ?** Oui, mais lui
seul. `<main>` reste borné à 80 rem — au-delà, une ligne de texte devient
pénible à suivre, ce qui vaut pour les fiches, les parcours et les formulaires.
Une page qui est d'abord un tableau se déclare `data-wide` et lève la borne pour
elle. À 1 440 px, la zone utile passe de 1 230 à 1 390 px.

**Q14. L'export doit-il respecter le tri affiché ?** Non, seulement les filtres.
Dupliquer dans l'export les règles de tri multi-colonnes de la table ferait deux
vérités à tenir, alors qu'un fichier se retrie dans le tableur. Le menu annonce
explicitement l'ordre du fichier, pour que ce ne soit pas une surprise.

**Q15. Les tests doivent-ils écrire dans la base de Tom ?** Non, jamais. Ils
tournent désormais sur une copie jetable (`VACUUM INTO`, régénérée à chaque
exécution). C'est ce qui a rendu possible de tester les écritures des listes ;
sans cela, la seule option honnête aurait été de ne pas les tester.

**Q16. Fallait-il normaliser les 129 apostrophes droites du corpus ?** Oui, mais
au bon endroit. Les corriger dans les fichiers de seed aurait déplacé 365 lignes
sans empêcher le problème de revenir. La correction est faite à la porte
d'entrée : `seed.ts` applique `normalizeText` à tous les champs texte, comme les
routes d'API le faisaient déjà. Un test refuse maintenant toute apostrophe
droite dans les champs affichés.

**Q17. Le tableau de bord doit-il inventer des indicateurs ?** Non. Tant que
rien n'est marqué « Lu », il affiche des zéros et bascule de « Parcours en
cours » à « Par où commencer ». Aucune donnée de lecture n'a été inventée : les
quelques livres cochés pour vérifier les captures ont été décochés ensuite, et
la liste de démonstration des listes personnelles a été supprimée.

**Q18. Le sélecteur de colonnes masque quoi par défaut ?** Thème, Courant et
Langue originale : les deux premières sont les colonnes les moins renseignées du
corpus (79 % et 48 % de vide), la troisième ne sert pas à décider quoi lire.
`cols` n'apparaît dans l'URL que si l'on s'écarte de ce choix.

---

## 7. Chantiers ajoutés en cours de route

Non prévus au plan initial, décidés à partir de ce que l'exécution a révélé.

| # | Chantier | Pourquoi |
| --- | --- | --- |
| 6a | URL synchronisée par `history.replaceState` | Mesure : taper « proust » coûtait 8 requêtes RSC, 8 Mo et 15 s |
| 17 | Typographie normalisée au seed | Les filtres proposaient deux fois « Liberté d'expression » |
| 18 | Squelettes de chargement des trois nouvelles pages | Les autres routes en avaient déjà |
| 19 | Fiche auteur : priorité, case « Lu », année | On ne pouvait pas y choisir quoi lire |

---

## 8. Mesures, avant et après

| | Avant | Après |
| --- | --- | --- |
| Livres | 2 043 (5 doublons) | 2 038 |
| Analyses visibles | 0 (3 perdues) | 3 |
| Biographies visibles | 0 (3 perdues) | 3 |
| Problèmes de lint | 3 (dont 1 erreur) | 0 |
| Tests | 15 | 62 |
| Fichiers de test | 2 | 7 |
| Lignes du tableau dans le DOM | 2 038 | 28 |
| Lignes du tableau des auteurs | 1 069 | 30 |
| Taper « proust » dans la recherche | 16,3 s, 8 Mo de RSC | 3,3 s, 0 Mo |
| Largeur du tableau à 1 440 px | 1 894 px (déborde de 664) | 1 565 px, zone utile 1 390 |
| Contraste du badge « Spécialisé » | 2,71:1 (échec AA) | 4,74:1 |
| `SELECT DISTINCT` par page de liste | 7 | 2 (livres) / 4 (auteurs) |
| Courants distincts | 325 | 324 |
| Thèmes distincts | 202 | 201 |
| Écrans | 4 | 6 (+ palette ⌘K) |
