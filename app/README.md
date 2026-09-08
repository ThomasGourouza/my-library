# Ma Bibliothèque

Application web locale pour une bibliothèque personnelle de ~2 000 livres :
parcourir, filtrer, hiérarchiser, suivre ce qui est lu, et faire produire par
Claude un résumé, une analyse et une biographie d'auteur à la demande.

Mono-utilisateur. Pas d'authentification, pas de déploiement : elle se lance en
local et lit un seul fichier JSON versionné, `../data/library.json`.

## Démarrer

```bash
npm install
npm run dev          # http://localhost:3000
```

Il n'y a rien à construire ni à remplir : `../data/library.json` **est** la
bibliothèque. Il est versionné, et l'application l'écrit à chaque
modification — cocher « Lu », créer un livre, lancer une analyse. Voir
[Données](#données).

## Commandes

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build de production, puis service |
| `npm test` | Vitest, sur une copie jetable de la base |
| `npm run lint` | ESLint (doit rester à zéro problème) |
| `npx tsc --noEmit` | Vérification de types |
| `npx tsx scripts/parcours-metrics.ts` | Mesures du corpus de parcours |

## Données

Tout tient dans `../data/library.json` : auteurs, livres, analyses,
biographies, case « Lu », listes personnelles. Un seul fichier, versionné,
réécrit en entier à chaque modification (temporaire + `rename` atomique, donc
jamais de version tronquée sur le disque).

Il est **hors de `app/`** : il remplace l'ancien dossier `seed/`, il vit à côté
du `pipeline/` qui l'a produit, et `app/` ne contient ainsi que du code.

Ce que cela change au quotidien :

- **On le commit comme du code.** `git push` d'un poste, `git pull` de
  l'autre, et la bibliothèque est identique — analyses et listes comprises.
- **Serveur tournant, un `git pull` est pris en compte** au rafraîchissement
  suivant, sans redémarrage : `src/lib/store.ts` compare le `mtime` du fichier
  avant chaque lecture.
- **Sur un second poste, `git pull` avant de modifier.** Deux machines qui
  ajoutent un livre chacune sans se synchroniser produisent un conflit sur ce
  fichier, à résoudre à la main. Le tri par clé naturelle est là pour que ces
  conflits restent rares et lisibles.
- **Si le fichier a des modifications non committées, `git pull` refuse de
  s'exécuter.** C'est le meilleur garde-fou du dispositif : il force à
  committer ou à ranger avant de tirer. Ne pas chercher à le contourner.
- `data/library.json.bak` est la version précédente, écrite à chaque
  modification : un niveau d'annulation pour ce que git ne protège pas encore.
  Il est gitignoré.

## Écrans

| Route | Contenu |
| --- | --- |
| `/` | Vue d'ensemble : progression, priorités, catégories, quoi lire ensuite |
| `/livres` | Les 2 038 livres — tableau virtualisé ou vue groupée, 8 filtres, sélecteur de colonnes, export |
| `/livres/[id]` | Fiche : métadonnées, parcours, listes, « Analyse Claude » |
| `/auteurs`, `/auteurs/[id]` | Idem côté auteurs, avec la biographie générée |
| `/parcours`, `/parcours/[slug]` | Les 53 parcours de lecture et leur progression |
| `/listes`, `/listes/[id]` | Listes personnelles : créer, ordonner, supprimer |

`⌘K` (ou `Ctrl+K`) ouvre une recherche transverse depuis n'importe quelle page.

## Pile technique

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui ·
un fichier JSON versionné chargé en mémoire (`src/lib/store.ts`) · TanStack
Table & Virtual · Vitest · `@anthropic-ai/claude-agent-sdk` pour
« Analyse Claude ».

Pas de base de données, pas d'ORM : 2 038 livres et 1 069 auteurs se lisent en
8 ms et se filtrent en mémoire. Un moteur coûterait plus en synchronisation
qu'il ne ferait gagner en requêtes.

`app/AGENTS.md` le rappelle et il vaut pour les humains aussi : **cette version
de Next a des ruptures d'API**. Lire `node_modules/next/dist/docs/` avant
d'écrire du code, plutôt que de se fier à ce qu'on croit savoir.

## Organisation

```
src/
├─ app/                  routes (App Router) et routes d'API
├─ components/
│  ├─ books/ authors/ roadmaps/ lists/ dashboard/   par domaine
│  └─ ui/                shadcn — modifié à la marge seulement
└─ lib/
   ├─ store.ts           le fichier de données : lecture, écriture, intégrité
   ├─ types.ts           la forme des données (types seuls)
   ├─ queries.ts         livres et auteurs : lecture, écriture, unicité
   ├─ normalize.ts       clés de recherche et de déduplication
   ├─ validation.ts      vocabulaires contrôlés et schémas zod
   ├─ priorities/        échelle de priorité (données rédigées + résolution)
   ├─ roadmaps/          parcours de lecture (données rédigées + résolution)
   ├─ lists.ts           listes personnelles
   └─ analysis/          prompt, exécution et suivi de « Analyse Claude »
```

## Quatre règles à connaître avant de toucher au code

**1. Le contenu éditorial est du code, pas de la donnée.** Les 53 parcours
(`lib/roadmaps/data/`) et l'échelle de priorité (`lib/priorities/data/`) sont
des fichiers TypeScript versionnés, relus et tenus par des tests. Ils ne sont
pas dans le fichier de données et aucun écran ne les modifie : ce sont des
textes rédigés, pas des
vues dérivées des métadonnées — les colonnes qui auraient pu servir de fil
conducteur sont trop lacunaires (`theme` vide à 79 %). Ce que l'utilisateur
compose lui-même, ce sont les **listes**, qui sont dans le fichier de données.

**2. Le contenu éditorial désigne les livres par clé naturelle, pas par
identifiant.** Les identifiants sont désormais stables et versionnés —
`/livres/42` est le même livre sur tous les postes, on peut s'en servir et le
partager. Mais parcours et priorités continuent d'écrire
`normalizeKey(auteur) + normalizeKey(titre)`, pour deux raisons : un fichier de
parcours doit se lire et se relire, et c'est ce qui rend réparable une
collision d'identifiants après une fusion git.

**3. Les clés `*Normalized` sont dérivées, jamais stockées.** Elles portent la
recherche, la déduplication et la résolution des parcours, et `store.ts` les
recalcule depuis `name`/`title` à chaque chargement — elles ne peuvent donc
plus se désynchroniser. Le revers : toute fonction qui crée un enregistrement
doit les poser elle-même, car les composants client les lisent
(`books-view.tsx`, `books-table.tsx`, `authors-view.tsx`).

**4. Plus aucun moteur ne garantit quoi que ce soit.** Unicité, clés
étrangères, clés primaires : tout est tenu par `src/lib/store.ts` (qui vérifie
identifiants uniques et auteurs résolus à chaque chargement, et échoue fort) et
par `library.test.ts`. Le fichier est modifiable à la main et fusionnable par
git : ces deux-là sont ce qui vous sépare d'une bibliothèque incohérente.
Noter aussi que l'unicité porte sur (titre, auteur) — la même œuvre sous deux
auteurs différents passe, ce qui est arrivé pour cinq œuvres anonymes.

## Tests

`npm test` tourne sur une **copie** de `../data/library.json`, refaite à chaque
exécution par `vitest.global-setup.ts`. Les tests peuvent donc écrire sans
risque, et ils lisent le vrai corpus — les garde-fous des parcours n'ont de
sens que sur les vraies lignes. Une copie simple suffit : le fichier est
remplacé d'un seul `rename`, on n'en lit jamais une version partielle.

Quatre familles :

- **corpus** (`lib/library.test.ts`) — doublons, intégrité référentielle, valeurs creuses ;
- **contenu rédigé** (`lib/roadmaps/`, `lib/priorities/`) — résolution, forme, calibration ;
- **mécanique pure** (`lib/normalize`, `lib/export`, `components/books/books-helpers`) ;
- **écriture** (`lib/lists`) — cycle de vie, ordre, cascade, et le fait que la
  modification atteigne bien le disque.

## « Analyse Claude »

Le bouton d'une fiche livre lance `runAnalysis`, qui appelle l'Agent SDK avec la
**session Claude Code locale** : pas de clé d'API, pas de facturation à part.
Le travail est suivi par une `Map` en mémoire (`src/lib/analysis/jobs.ts`) :
l'état d'un job ne survit pas à un redémarrage, et n'a pas à le faire — le
résultat, lui, est écrit dans le fichier. L'interface interroge
`/api/books/[id]/analysis` toutes les deux secondes tant qu'un job tourne, et
un job « running » de plus de cinq minutes est considéré comme mort.

La biographie n'est produite qu'une fois par auteur, avec la première analyse
d'un de ses livres.

Une règle à connaître si vous touchez à `run.ts` : l'appel à l'agent dure une
minute, et le fichier peut avoir changé entre-temps. Toute écriture doit donc
retrouver ses enregistrements **par identifiant, dans le magasin que
`mutate()` fournit** — jamais via un objet lu avant l'`await`. C'est la règle
que la transaction SQL tenait à sa place.
