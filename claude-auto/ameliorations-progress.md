# Améliorations autonomes — progression

Branche `ameliorations-autonomes`. Plan et décisions : `ameliorations-plan.md`.

Règle : un chantier à la fois. Après chacun —
`cd app && npm test && npx tsc --noEmit && npm run build`, captures clair +
sombre si l'interface bouge, case cochée, commit. On ne passe au suivant
qu'une fois commité.

## Chantiers

- [x] 1. Restaurer les analyses et biographies perdues (3 + 3)
- [x] 2. Corriger les 3 problèmes de lint
- [x] 3. Fusionner les 5 doublons d'œuvres anonymes + garde-fou de test
- [x] 4. Supprimer le code mort `themes` de `getFilterOptions`
- [ ] 5. Tableau des livres : sélecteur de colonnes persisté dans l'URL
- [ ] 6. Tableau des livres : virtualisation des lignes
- [ ] 7. Accessibilité (aria-sort, lignes au clavier, lien d'évitement)
- [ ] 8. Progression de lecture dans les parcours
- [ ] 9. Tableau de bord d'accueil sur `/`
- [ ] 10. Palette de commandes globale (⌘K / Ctrl+K)
- [ ] 11. Filtres d'auteurs synchronisés à l'URL
- [ ] 12. Listes personnelles (créer, ordonner, supprimer)
- [ ] 13. Export CSV / JSON de la bibliothèque
- [ ] 14. Visibilité de « Analyse Claude »
- [ ] 15. Tests unitaires manquants
- [ ] 16. README réel

## Journal

- Audit terminé, plan et progression écrits. Base de départ mesurée :
  2 043 livres, 1 069 auteurs, 0 lu, 0 analyse en base, 15 tests verts,
  3 problèmes de lint, `tsc` propre.
- **1 ✔** `npx tsx src/db/generated-content.ts restore` → 3/3 analyses,
  3/3 biographies revenues en base. Vérifié à l'écran sur
  `/livres/8726` (Crime et Châtiment), clair et sombre. Ajout d'un script
  `npm run db:reseed` qui enchaîne sauvegarde + seed + restauration, pour que
  l'oubli qui a causé la perte ne soit plus possible.
- **2 ✔** `npx eslint` ne renvoie plus rien (0 problème contre 1 erreur +
  2 avertissements). L'erreur de `main-nav.tsx` est corrigée sur le fond : la
  bascule de thème choisit son icône en CSS et n'a plus d'état « monté ».
  Vérifié au navigateur : exactement une icône visible en clair comme en sombre.
- **3 ✔** 5 fusions : Gilgamesh, Beowulf, La Chanson des Nibelungen, La Mort le
  Roi Artu, Tristan et Iseut. 2 043 → 2 038 livres. Aucun parcours n'a eu à
  être touché : les 53 pointaient déjà tous sur l'entrée conservée. L'auteur
  fourre-tout « Anonyme » devient « Anonyme (roman chinois) ». Nouveau fichier
  `src/lib/library.test.ts` (4 tests) pour que le cas ne revienne pas.
  19 tests verts, `validate.py` vert, lint et build propres.
- **4 ✔** `getFilterOptions()` devient `getBookFilterOptions()` (2 requêtes) et
  `getAuthorFilterOptions()` (4). L'option `themes`, calculée à chaque rendu et
  consommée par personne, disparaît. `/livres` et `/auteurs` ne font plus que
  les `SELECT DISTINCT` qui les concernent : 7 par page → 2 et 4.
  `authors-view` partage désormais le type au lieu d'en redéclarer un.
