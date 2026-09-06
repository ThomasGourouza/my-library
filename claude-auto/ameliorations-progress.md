# Améliorations autonomes — progression

Branche `ameliorations-autonomes`. Plan et décisions : `ameliorations-plan.md`.

Règle : un chantier à la fois. Après chacun —
`cd app && npm test && npx tsc --noEmit && npm run build`, captures clair +
sombre si l'interface bouge, case cochée, commit. On ne passe au suivant
qu'une fois commité.

## Chantiers

- [x] 1. Restaurer les analyses et biographies perdues (3 + 3)
- [ ] 2. Corriger les 3 problèmes de lint
- [ ] 3. Fusionner les 5 doublons d'œuvres anonymes + garde-fou de test
- [ ] 4. Supprimer le code mort `themes` de `getFilterOptions`
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
