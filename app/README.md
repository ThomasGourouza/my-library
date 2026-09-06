# Ma Bibliothèque

Application web locale pour une bibliothèque personnelle de ~2 000 livres :
parcourir, filtrer, hiérarchiser, suivre ce qui est lu, et faire produire par
Claude un résumé, une analyse et une biographie d'auteur à la demande.

Mono-utilisateur, mono-poste. Pas d'authentification, pas de déploiement : elle
se lance en local et lit une base SQLite posée à côté d'elle.

## Démarrer

```bash
npm install
npm run db:push      # crée/actualise le schéma dans data/library.db
npm run db:reseed    # remplit depuis ../seed, en préservant le contenu généré
npm run dev          # http://localhost:3000
```

`data/library.db` n'est pas versionnée : elle se reconstruit depuis
`../seed/*.json`. En revanche, ce que le seed ne contient pas — analyses,
biographies, case « Lu », listes personnelles — vit dans
`../seed/generated-content.json`, qui l'est.

## Commandes

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build de production, puis service |
| `npm test` | Vitest, sur une copie jetable de la base |
| `npm run lint` | ESLint (doit rester à zéro problème) |
| `npx tsc --noEmit` | Vérification de types |
| `npm run db:push` | Applique `src/db/schema.ts` à la base |
| `npm run db:reseed` | **Sauvegarde → seed → restauration**, en un bloc |
| `npx tsx scripts/parcours-metrics.ts` | Mesures du corpus de parcours |

> ⚠️ Ne jamais lancer `npm run db:seed` seul. Il vide `authors` et `books`, ce
> qui efface au passage les analyses, les biographies, les cases « Lu » et les
> entrées de listes — aucune de ces données n'est dans les fichiers de seed.
> `db:reseed` encadre le seed par la sauvegarde et la restauration.

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
SQLite via better-sqlite3 + Drizzle · TanStack Table & Virtual · Vitest ·
`@anthropic-ai/claude-agent-sdk` pour « Analyse Claude ».

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
├─ db/
│  ├─ schema.ts          source de vérité du schéma (Drizzle)
│  ├─ seed.ts            vide et réinsère authors + books
│  └─ generated-content.ts  sauvegarde/restaure ce que le seed ne connaît pas
└─ lib/
   ├─ queries.ts         accès en lecture, filtrage et tri côté SQL
   ├─ normalize.ts       clés de recherche et de déduplication
   ├─ validation.ts      vocabulaires contrôlés et schémas zod
   ├─ priorities/        échelle de priorité (données rédigées + résolution)
   ├─ roadmaps/          parcours de lecture (données rédigées + résolution)
   ├─ lists.ts           listes personnelles (en base)
   └─ analysis/          prompt et exécution de « Analyse Claude »
```

## Quatre règles à connaître avant de toucher au code

**1. Le contenu éditorial est du code, pas de la donnée.** Les 53 parcours
(`lib/roadmaps/data/`) et l'échelle de priorité (`lib/priorities/data/`) sont
des fichiers TypeScript versionnés, relus et tenus par des tests. Ils ne sont
pas en base et aucun écran ne les modifie : ce sont des textes rédigés, pas des
vues dérivées des métadonnées — les colonnes qui auraient pu servir de fil
conducteur sont trop lacunaires (`theme` vide à 79 %). Ce que l'utilisateur
compose lui-même, ce sont les **listes**, qui vivent en base.

**2. Jamais de référence par identifiant vers un livre.** `db:seed` vide et
réinsère les tables : toutes les clés primaires changent. Parcours, priorités et
sauvegardes désignent les livres par `normalizeKey(auteur) + normalizeKey(titre)`
— la même fonction qui alimente `titleNormalized` et `nameNormalized` en base.

**3. Les colonnes `*Normalized` portent la recherche et la déduplication.**
Elles ne sont jamais affichées. Une valeur écrite sans passer par
`normalizeText` / `normalizeKey` rend le livre introuvable sans rien casser
d'apparent — `src/lib/library.test.ts` vérifie qu'elles restent en phase.

**4. L'unicité en base ne voit pas tous les doublons.** La contrainte porte sur
(titre, auteur) : la même œuvre sous deux auteurs différents passe. C'est arrivé
pour cinq œuvres anonymes ; `library.test.ts` monte la garde depuis.

## Tests

`npm test` tourne sur une **copie** de `data/library.db`, fabriquée à chaque
exécution par `vitest.global-setup.ts` (`VACUUM INTO`, cohérent même si l'appli
tourne). Les tests peuvent donc écrire sans risque, et ils lisent le vrai
corpus — les garde-fous des parcours n'ont de sens que sur les vraies lignes.

Quatre familles :

- **corpus** (`lib/library.test.ts`) — doublons, colonnes normalisées, valeurs creuses ;
- **contenu rédigé** (`lib/roadmaps/`, `lib/priorities/`) — résolution, forme, calibration ;
- **mécanique pure** (`lib/normalize`, `lib/export`, `components/books/books-helpers`) ;
- **écriture** (`lib/lists`) — cycle de vie, ordre, cascade.

## « Analyse Claude »

Le bouton d'une fiche livre lance `runAnalysis`, qui appelle l'Agent SDK avec la
**session Claude Code locale** : pas de clé d'API, pas de facturation à part.
Le travail est suivi par la table `analysis_jobs` ; l'interface interroge
`/api/books/[id]/analysis` toutes les deux secondes tant qu'un job tourne, et
un job « running » de plus de cinq minutes est considéré comme mort.

La biographie n'est produite qu'une fois par auteur, avec la première analyse
d'un de ses livres.
