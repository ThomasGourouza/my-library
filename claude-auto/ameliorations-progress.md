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
- [x] 5. Tableau des livres : sélecteur de colonnes persisté dans l'URL
- [x] 6. Tableau des livres : virtualisation des lignes
- [x] 7. Accessibilité (aria-sort, lignes au clavier, lien d'évitement)
- [x] 8. Progression de lecture dans les parcours
- [x] 9. Tableau de bord d'accueil sur `/`
- [x] 10. Palette de commandes globale (⌘K / Ctrl+K)
- [x] 11. Filtres d'auteurs synchronisés à l'URL
- [x] 12. Listes personnelles (créer, ordonner, supprimer)
- [x] 13. Export CSV / JSON de la bibliothèque
- [x] 14. Visibilité de « Analyse Claude »
- [x] 15. Tests unitaires manquants
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
- **5 ✔** Menu « Colonnes » (10/13 par défaut), état écrit dans `cols=`.
  Trois colonnes masquées d'origine : Courant, Thème, Langue originale. Le
  titre n'est pas masquable. Largeur du tableau ramenée de 1 894 à 1 565 px
  (titres et auteurs bornés, en-têtes raccourcis, parcours au-delà de deux
  repliés en « +N »), et les pages de liste occupent maintenant toute la
  largeur de l'écran (1 230 → 1 390 px utiles à 1 440). Deux défauts trouvés
  au passage et corrigés : le sélecteur « Grouper par » restait vide jusqu'à
  l'hydratation, et l'espace manquait avant le compteur des groupes.
- **6a ✔** Synchronisation de l'URL par `window.history.replaceState` au lieu
  de `router.replace`. Mesuré avant/après sur `/livres` en tapant « proust » :
  8 requêtes RSC et 8 Mo de charge utile → 0 et 0. Le serveur resérialisait les
  2 038 livres à chaque caractère tapé. Même correction sur `/parcours`.
- **6b ✔** Virtualisation avec `@tanstack/react-virtual`. Mesures au
  navigateur : 2 038 lignes dans le DOM → 28 ; taper « proust » dans la
  recherche passe de 16,3 s à 3,3 s (dont 0,7 s de frappe simulée et 1,5 s
  d'attente fixe). Tri, filtres, case « Lu » et en-tête collant vérifiés en
  clair et en sombre ; la barre de défilement garde sa taille réelle
  (83 468 px).
- **7 ✔** Lien d'évitement (première tabulation, vérifiée au clavier),
  `aria-sort` sur les en-têtes des deux tableaux, contraste du badge
  « Spécialisé » remonté de 2,71:1 à 4,74:1 en clair (4,22 → 7,66 en sombre),
  en-tête utilisable à 390 px (la bascule de thème était hors écran),
  en-tête aligné sur le contenu élargi (marque et titre à 24 px tous les deux).
- **8 ✔** Progression de lecture : barre + « x / n lus » sur chaque carte de
  parcours, filtre d'avancement (À commencer / En cours / Terminé) avec
  effectifs, et sur la page d'un parcours la progression, le prochain livre à
  lire dans l'ordre et le surlignage des livres déjà lus. Vérifié à l'écran en
  marquant temporairement 4 livres comme lus (« 3 lus sur 14 · 21 % »,
  « Prochain à lire : 2. Apprendre à vivre »), puis remis à 0 : aucune donnée
  de lecture inventée n'est laissée en base.
- **9 ✔** Tableau de bord sur `/` (remplace la redirection vers `/livres`) :
  4 tuiles, progression par rang de priorité, répartition par catégorie,
  parcours en cours ou suggestions de départ, essentiels non lus les plus
  cités, analyses Claude existantes. Tout est cliquable vers la liste filtrée
  correspondante. Vérifié à l'écran dans les deux thèmes, en 1440 et 390 px,
  avec 6 livres marqués lus puis avec 0 (état réel) : la page tient les deux.
  Onglet nommé « Accueil » — « Vue d'ensemble » faisait passer la navigation
  sur deux lignes en mobile.
- **10 ✔** Palette de commandes globale (⌘K / Ctrl+K, et un bouton
  « Rechercher » dans l'en-tête). Cherche d'un coup livres, auteurs et
  parcours via `GET /api/search`. Vérifié au navigateur : « nietz » →
  6 livres + 1 auteur, navigation au clavier, Entrée ouvre la fiche, les deux
  raccourcis fonctionnent, en clair et en sombre. Un bug attrapé à la
  vérification : l'alias SQL `rank` n'existe pas dans ORDER BY côté SQLite,
  la route renvoyait 500.
- **11 ✔** Page Auteurs mise au niveau de la page Livres : recherche, cinq
  filtres et tri écrits dans l'URL (`?q=a&mainField=…&sort=bookCount.asc`,
  rechargée et vérifiée), même mise en page pleine hauteur avec en-tête
  collant, et virtualisation — 1 069 lignes dans le DOM → 30.
- **12 ✔** « Mes listes » : nouvelles tables `lists` / `list_items` (créées par
  `drizzle-kit push`, base sauvegardée avant, 2 038 livres et 3 analyses
  intacts après), API REST complète, page `/listes`, page de détail avec
  renommage, réordonnancement et suppression, et un bouton « Listes » sur la
  fiche de chaque livre. Les listes survivent à `npm run db:reseed` : vérifié
  en aller-retour complet (1/1 liste, 2/2 entrées, ordre conservé). La liste de
  démonstration utilisée pour la vérification a été supprimée — la base rendue
  à Tom n'a aucune liste inventée.
- **13 ✔** Export CSV et JSON de la vue filtrée, sur les livres et sur les
  auteurs. Vérifié en téléchargeant réellement les fichiers : « zola » →
  8 lignes + en-tête, BOM UTF-8 (les accents s'ouvrent correctement dans un
  tableur), guillemets RFC 4180, fins de ligne CRLF, JSON valide relu et
  reparsé.
- **14 ✔** « Analyse Claude » devient visible : filtre Analysé / Non analysé
  sur la liste des livres (vérifié : 3 sur 2 038), marqueur discret à côté du
  titre, colonne « Analyse Claude » dans l'export, et sur la fiche d'un auteur
  sans biographie un lien direct vers un de ses livres au lieu d'une consigne.
  Aucune analyse n'a été générée : cela consommerait le quota d'abonnement de
  Tom, c'est à lui de décider.
- **15 ✔** 15 → 61 tests (7 fichiers). Nouveaux : `normalize`, `export`,
  `books-helpers`, `lists`. Les tests tournent désormais sur une copie jetable
  de la base (`vitest.global-setup.ts`), ce qui rend possible de tester les
  écritures des listes sans jamais toucher aux données de Tom — vérifié : la
  base réelle a toujours 0 liste et 2 038 livres après la suite.
