# Ma Bibliothèque

Application web locale pour une bibliothèque personnelle de ~2 000 livres :
parcourir, filtrer, hiérarchiser, suivre ce qui est lu, et faire produire par
Claude un résumé, une analyse et une biographie d'auteur à la demande.

Mono-utilisateur, et adossée à un seul fichier JSON versionné,
`../data/library.json`. Elle tourne de deux façons : **en local**, où elle lit et
écrit ce fichier sur le disque, et **en ligne**, où elle lit et réécrit la copie
qui est sur `master` — chaque modification devient un commit. Voir
[En ligne](#en-ligne).

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
| `npm run deploy` (ou `./deploy.sh`) | Redéploie en production, contrôles compris |

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
  suivant, sans redémarrage : `src/lib/store.ts` revalide la source avant
  chaque lecture — le `mtime` du fichier en local, un GET conditionnel en
  ligne. Une seconde de fraîcheur au plus (cf. `FRESH_MS`), ce qui évite qu'une
  page qui lit trois fois fasse trois allers-retours.
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
| `/connexion` | Mot de passe — n'apparaît qu'en ligne (cf. [En ligne](#en-ligne)) |

`⌘K` (ou `Ctrl+K`) ouvre une recherche transverse depuis n'importe quelle page.

En local uniquement, un bouton **⟳** dans la barre de navigation lance un
`git pull` (`POST /api/pull`) et rafraîchit la page : c'est le moyen de
récupérer, sans quitter l'application, ce que l'application déployée a committé.
Il n'apparaît pas en ligne, et la route y répond 403 — elle exécute une
commande, elle n'a rien à faire ailleurs que sur le poste local.

## En ligne

L'application déployée lit et écrit **la copie de `data/library.json` qui est
sur `master`**, via l'API GitHub. La bibliothèque est donc identique en ligne et
en local au dernier commit, sans base de données ni synchronisation à écrire.

> **URL** : <https://my-library-phi-six.vercel.app>
>
> C'est le *domaine de production*. L'autre alias,
> `my-library-thomas-gourouza.vercel.app`, est protégé par l'authentification
> Vercel (celle du compte, pas la nôtre) et renvoie sur un SSO : c'est le
> comportement documenté de l'offre Hobby, qui protège les URL de déploiement
> mais laisse le domaine de production public. C'est donc bien **notre** porte
> qui garde l'URL ci-dessus.

### Les deux backends, et comment ils sont choisis

`src/lib/store.ts` choisit une fois pour toutes, sans configuration en local :

| Backend | Choisi quand | Lecture | Écriture |
| --- | --- | --- | --- |
| `store/file.ts` | par défaut | `../data/library.json` sur le disque | temporaire + `rename` atomique |
| `store/github.ts` | `GITHUB_REPO` est défini (ou `LIBRARY_BACKEND=github`) | `GET /contents` conditionnel (`If-None-Match`) | `PUT /contents`, soit un commit |

Sur Vercel, un `GITHUB_REPO` absent ou mal orthographié **échoue franchement en
nommant la variable manquante**, plutôt que de retomber en silence sur un
backend fichier qui n'a ni `data/` ni disque inscriptible.

### Les cinq variables

| Variable | Rôle |
| --- | --- |
| `GITHUB_TOKEN` | PAT à granularité fine, limité à ce dépôt, `Contents: read and write` |
| `GITHUB_REPO` | `ThomasGourouza/my-library` |
| `GITHUB_BRANCH` | `master` |
| `LIBRARY_PASSWORD` | la porte ; un mot de passe aléatoire de 32 caractères |
| `LIBRARY_SESSION_SECRET` | signe le cookie de session |

Aucune ne porte le préfixe `NEXT_PUBLIC_` : elles restent côté serveur. Les deux
dernières suffisent à activer la porte — poser les deux en local permet de la
tester (`npm run build && npm start`).

### Le mot de passe protège les écritures, pas les lectures

**Le dépôt est public.** Toute la bibliothèque, chaque analyse produite par
Claude et un commit horodaté par clic sur « Lu » sont lisibles par n'importe qui
sur github.com. La porte empêche un inconnu de *modifier* la bibliothèque — pas
de la lire à la source. Pour fermer aussi la lecture, il faut passer le dépôt en
privé ; le token fonctionne pareil, on perd l'historique public comme sauvegarde
consultable.

### Déployer

Root Directory `app`, les cinq variables, puis :

```bash
./deploy.sh          # le code — les données, elles, n'ont rien à déployer
```

`deploy.sh` enchaîne ce qu'il faut faire à chaque fois, et surtout vérifie ce
qui peut donner un déploiement « réussi » mais faux : un `app/.env.local` qui
partirait dans l'archive, du code non committé, ou des **commits de données non
poussés** — le site lit `master` sur GitHub, pas votre disque, et ne les verrait
donc jamais. Puis tests, types, lint, build local (une erreur trouvée en
quinze secondes plutôt qu'en consommant un déploiement), déploiement, et
contrôle que le site répond vraiment. `export LIBRARY_PASSWORD=…` avant de le
lancer pour que le contrôle final aille jusqu'à se connecter et compter les
livres.

Deux échappatoires : `--tel-quel` pour déployer malgré des modifications non
committées, `--rapide` pour sauter tests, types et lint.

`app/vercel.json` porte `git.deploymentEnabled: false` : **un commit de données
ne déclenche aucun déploiement.** Sans cela, cocher une case redéploierait
l'application — ce qui redémarre les instances et vide leur cache mémoire à
chaque clic. Le revers assumé : un changement de *code* se livre à la main, avec
la commande ci-dessus.

### Tirer avant de modifier

En local, `git pull` avant de toucher à la bibliothèque. L'application déployée
commite à chaque modification ; deux copies divergentes du même fichier de
56 000 lignes se résolvent à la main. Si le fichier a des modifications non
committées, `git pull` refuse de s'exécuter — c'est le garde-fou, pas un
obstacle à contourner.

Deux conséquences moins évidentes :

- **Un conflit d'écriture n'est jamais rejoué.** Si la branche a bougé entre la
  lecture et l'écriture, GitHub répond 409, rien n'est écrasé, et l'interface
  affiche « La bibliothèque a changé entre-temps ». Rejouer automatiquement
  déplacerait un livre d'un cran de trop, ou ferait dire « existe déjà » d'une
  création qui a réussi.
- **Un `library.json` cassé se répare sans redéployer.** La donnée est lue à
  l'exécution : la corriger dans l'éditeur web de GitHub remet la production
  d'aplomb.

### Ce qui reste local

« Analyse Claude » ne s'exécute qu'en local, où la session Claude Code est
accessible : en ligne le bouton disparaît et `POST …/analysis` renvoie 403. Les
analyses **déjà produites s'affichent partout** — elles sont dans le fichier.

## Pile technique

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui ·
un fichier JSON versionné chargé en mémoire (`src/lib/store.ts`), sur le disque
ou dans le dépôt · TanStack Table & Virtual · Vitest ·
`@anthropic-ai/claude-agent-sdk` pour « Analyse Claude ».

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
├─ proxy.ts             la porte par mot de passe, en amont de tout
└─ lib/
   ├─ store.ts           le magasin : revalidation, mutex, intégrité
   ├─ store/file.ts      backend local — le fichier sur le disque
   ├─ store/github.ts    backend en ligne — GET conditionnel, PUT = commit
   ├─ session.ts         signature et vérification du cookie (sans Next)
   ├─ auth.ts            `requireAuth()` pour les 12 routes mutantes
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
  modification atteigne bien le disque ;
- **backend GitHub** (`lib/store/github.test.ts`) — `fetch` remplacé, pour tenir
  les deux erreurs muettes de ce backend : le type de média `raw` (sans lui,
  l'API tronque à 1 Mo en répondant 200) et les deux formes de l'ETag (nue pour
  le `sha` d'un `PUT`, entre guillemets pour `If-None-Match`).

## « Analyse Claude »

**Local uniquement** : le bouton n'apparaît que sur l'installation locale, et
`POST /api/books/[id]/analysis` renvoie 403 en ligne. Deux raisons, et la
seconde est la vraie : la documentation de l'Agent SDK interdit aux tiers de
réutiliser le login claude.ai, et une instance serverless peut être gelée dès la
réponse envoyée — or `runAnalysis` travaille une minute après le 202. Les
analyses déjà écrites, elles, s'affichent partout.

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
