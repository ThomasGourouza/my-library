# Héberger la bibliothèque en ligne, avec le fichier GitHub comme seule donnée

> Plan d'exécution. Le document de construction initial est `PLAN.md` ; l'état
> courant de l'application est décrit dans `app/README.md`.
>
> **Terminé (9 septembre 2026).** Les huit étapes sont faites et vérifiées, en
> local puis en production sur <https://my-library-phi-six.vercel.app>.
>
> **La question ouverte du plan est tranchée : le `PUT` d'un corps base64 de
> ~2 Mo passe.** Cocher « Lu » en ligne produit un commit sur `master` au nom de
> l'utilisateur, avec un diff d'une seule ligne, en **1,77 s** — dans la
> fourchette « 1 à 2 secondes » annoncée. Le repli vers l'API Git Data décrit à
> l'étape 2 n'a pas eu à servir.
>
> Vérifié aussi en production : la porte (307 vers `/connexion` sans cookie,
> 401 sur les routes d'API), la lecture depuis GitHub (2 038 livres,
> 1 069 auteurs, ⌘K), l'analyse désactivée (403), l'aller-retour dans les deux
> sens, et le fait qu'un commit de données ne déclenche **aucun** déploiement
> (4 déploiements avant et après quatre commits de données).
>
> Deux corrections apparues au déploiement, hors plan : le préréglage de
> framework du projet Vercel était « Other », d'où un `next build` réussi suivi
> d'un « No Output Directory named public » — réglé par `"framework": "nextjs"`
> dans `app/vercel.json` ; et le chemin du fichier de données, calculé au niveau
> module dans `store/file.ts`, faisait tracer le dépôt entier par Turbopack
> (« Encountered unexpected file in NFT list ») — il est désormais calculé dans
> une fonction.
>
> Deux écarts assumés par rapport au texte ci-dessous, tous deux notés à
> l'endroit concerné : `mutate()` prend un second paramètre qui dérive le
> message de commit (les 13 fonctions publiques et les routes, elles, gardent
> leur signature) ; et `src/proxy.ts` vérifie la **signature** du cookie et pas
> seulement sa présence — le proxy tourne sur le runtime Node.js depuis Next 16,
> donc la raison invoquée plus bas (éviter de dupliquer la crypto entre deux
> environnements) ne tient plus, la crypto étant dans un seul module appelé par
> les deux couches. `requireAuth()` reste appelée par les 12 routes mutantes.

## Contexte

La bibliothèque tient dans un seul fichier versionné, `data/library.json`
(~1,5 Mo, 56 800 lignes), que l'application lit et écrit directement sur le
disque. Objectif : **utiliser l'application depuis n'importe où, gratuitement,
la copie de `data/library.json` sur `master` étant la seule source de données** —
l'application déployée la lit et la réécrit sous forme de commit, de sorte que
la bibliothèque est identique en ligne et en local au dernier commit.

Deux faits à connaître avant tout :

- **Le refactor précédent n'est pas committé** — 46 chemins modifiés, 0 commit
  d'avance. `origin/master` contient encore `seed/` et **pas**
  `data/library.json` ; un `GET` de ce chemin sur l'API renvoie 404 aujourd'hui.
  Rien ne peut être déployé avant de committer et pousser. C'est l'étape 0, et
  c'est une décision qui revient à l'utilisateur.
- **Le dépôt est public.** Une fois poussé, toute la bibliothèque, chaque
  analyse Claude et un commit horodaté par clic sur « Lu » sont lisibles par
  n'importe qui sur github.com. Conséquence à assumer explicitement : **le mot
  de passe protège les écritures, pas les lectures.** Soit on l'accepte, soit on
  passe le dépôt en privé avant de déployer (le token fonctionne pareil ; on
  perd en revanche l'historique public comme sauvegarde consultable).

Décisions validées :
1. **En local, l'application garde le fichier local** ; seule l'application
   déployée parle à GitHub.
2. **Une porte par mot de passe partagé** protège l'application déployée.
3. **« Analyse Claude » reste locale** ; les analyses déjà produites s'affichent
   partout.
4. **Un commit par modification.**

Hébergeur : **Vercel Hobby**. Seule offre réellement gratuite qui convienne :
fonctions jusqu'à 300 s, 2 Go de RAM, 1 M d'invocations et 100 Go de trafic par
mois, Next.js 16.2 pleinement supporté, et la licence Hobby autorise
explicitement l'usage personnel non commercial. Render s'endort au bout de
15 min avec ~60 s de réveil documentés ; Cloudflare Workers plafonne à 10 ms de
CPU par requête ; Fly et Railway ne sont plus gratuits.

### Trois corrections à ce que j'ai affirmé en posant les questions

- **Les fonctions Vercel Hobby vont jusqu'à 300 s, pas 10 ni 60.** Les chiffres
  de 10/60 s ne concernent que les projets créés avant le 23/04/2025. Le délai
  n'a donc jamais été ce qui empêche « Analyse Claude » en ligne. Les vrais
  obstacles : la documentation de l'Agent SDK interdit aux tiers de réutiliser
  le login claude.ai, et le mode clé d'API est facturé au token. La conclusion
  retenue est la bonne ; ma raison était fausse.
- **La protection par mot de passe de Vercel n'a jamais été disponible.** Sur
  Hobby, Vercel Authentication ne protège que les URL de preview — « your
  production domain remains publicly accessible » — et Password Protection est
  réservée à Enterprise ou à un module Pro à 150 $/mois. La porte doit donc être
  la nôtre.
- **`PUT /contents` accepte jusqu'à 100 Mo, pas 1 Mo.** La limite de 1 Mo que je
  craignais ne concerne que la lecture, et seulement le type de média JSON
  base64. Écrire 1,5 Mo en un appel ne pose pas de problème.

---

## Architecture

```
                    ┌────────── déployé (Vercel) ─────────────┐
navigateur ─mdp──▶  │ Next 16 · backend GitHub                │ ──▶ API GitHub
                    │   lecture  GET /contents (raw + ETag)   │     master
                    │   écriture PUT /contents (commit)       │ ◀──
                    └─────────────────────────────────────────┘
                                                                    │
                    ┌────────── local (npm run dev) ──────────┐     │ git pull
navigateur ───────▶ │ Next 16 · backend fichier (inchangé)    │ ◀───┘ / push
                    │   ../data/library.json                  │
                    └─────────────────────────────────────────┘
```

### Lecture

`GET /repos/ThomasGourouza/my-library/contents/data/library.json?ref=master`
avec `Accept: application/vnd.github.raw`, `If-None-Match: <etag en cache>` et
`cache: "no-store"`.

- Le type de média `raw` est ce qui porte la limite de lecture à 100 Mo. **Le
  type JSON par défaut renvoie `content: ""` et `encoding: "none"` au-delà de
  1 Mo — silencieusement, en HTTP 200.** Vérifié sur un fichier de 2,66 Mo du
  dépôt : parser cette réponse donne du vide, pas une erreur.
- **L'`ETag` de la réponse *est* le sha du blob.** Vérifié : l'ETag
  `"768a9775bfd5479b7640abe95085353fed88f45b"` était exactement le sha du blob.
  Un seul appel fournit donc les octets *et* le jeton dont l'écriture a besoin.
- **Piège de format, à ne pas rater** : le GET renvoie l'ETag **entre
  guillemets** (parfois préfixé `W/`), alors que `PUT` attend le sha **nu**.
  Garder les deux formes. Envoyer la forme nue en `If-None-Match` : on ne reçoit
  jamais de 304 et on retélécharge 1,5 Mo à chaque lecture. Envoyer la forme
  entre guillemets en `sha` : chaque PUT part en 422.
- Une réponse **sans ETag doit être traitée comme une erreur** : mettre
  `undefined` en cache signifie `If-None-Match: undefined`, donc plus jamais de
  304.
- Un **304 ne compte pas dans le quota** et revient vite (~40 ms sur une
  connexion chaude, ~265 ms à froid) : c'est ce qui rend la revalidation
  abordable.
- **Pas `raw.githubusercontent.com`**, malgré sa simplicité : non documenté,
  limité séparément, et mis en cache CDN ~5 minutes. Lire un fichier vieux de
  cinq minutes, le modifier et le réécrire effacerait silencieusement ce qui
  s'est passé entre-temps.
- **Deux tentatives supplémentaires avec attente** sur la lecture. Aujourd'hui
  `store()` fait `if (!g.__library) throw e` : sur une instance froide, un seul
  GET capricieux suffit à renvoyer 500 sur toutes les pages. C'est l'incident de
  production le plus probable.

### Écriture

`PUT /contents` avec `content` en base64, `sha` = le sha du blob en cache,
`branch: "master"`, et un `message` décrivant l'action. L'identité du commit est
celle du propriétaire du token — donc l'utilisateur.

- La réponse 200 porte `content.sha`, le **nouveau** sha : on le garde comme
  jeton suivant, aucune relecture après écriture.
- Un `sha` périmé renvoie **409**. C'est le compare-and-swap — et contrairement
  au backend fichier, où j'avais trouvé ce contrôle inutile, ici il porte
  vraiment : il y a un `await` réel entre la lecture et l'écriture.
- **L'aller-retour de formatage est neutre** : `JSON.stringify(parse(raw), null, 2) + "\n"`
  redonne le fichier à l'octet près. Les écritures produisent donc de vrais
  petits diffs, pas une réécriture de 56 000 lignes.

### Concurrence — la partie qui peut manger la bibliothèque

Trois chemins de corruption silencieuse, dont deux que je n'avais pas vus.

**1. Le partage d'objet.** `mutate()` fait `const current = store()`, qui rend
**l'objet en cache partagé**. Deux mutations simultanées sur une même instance
ne reçoivent pas deux copies : elles reçoivent le même objet. A modifie, sérialise,
lance un PUT d'une à deux secondes ; B modifie **le même objet**, sérialise (la
modification de A comprise) et part avec le même sha. Le commit de A contient
déjà la modification de B ; B reçoit un 409 et rejoue sa mutation sur un magasin
où son effet est **déjà appliqué**. Le double-effet n'est pas un entrelacement
rare : c'est le comportement normal de deux mutations qui se chevauchent. Et le
chevauchement est facile — `read-checkbox.tsx` garde son état « en cours » par
composant, donc cocher cinq lignes de `/livres` lance cinq PUT concurrents.

**2. Le rejeu.** `moveBookInList` (`lists.ts:171-186`) échange par *index
courant*. Rejoué, il déplace le livre d'un cran de plus. Les créations, elles,
lèvent `DuplicateError` au rejeu : l'utilisateur voit « existe déjà » pour une
écriture qui a réussi.

**3. Les contrôles hors du callback.** Ceux-ci étaient atomiques quand `store()`
était synchrone. `api/authors/[id]/route.ts:73-86` enchaîne `getAuthor` →
`countBooksByAuthor` → `deleteAuthor`, et `deleteAuthor` ne revérifie rien. Une
suppression d'auteur concurrente d'un ajout de livre laisse des livres orphelins
→ `assertIntegrity` lève à la **lecture suivante** → toutes les pages en 500
jusqu'à correction manuelle du JSON. Même forme dans `api/books/route.ts:48` et
`api/books/[id]/route.ts:58`, où `queries.ts` fait `s.authors.find(...)!`.

**Les quatre corrections, toutes courtes, et qui *réduisent* le code :**

1. **Un mutex de mutation dans le processus** — une chaîne de promesses :
   `chain = chain.then(() => doMutate(fn))`. Un utilisateur, une instance : les
   409 deviennent quasi impossibles et le partage d'objet disparaît.
2. **Ne pas rejouer du tout.** Sur 409 : vider le cache et renvoyer un 409
   « La bibliothèque a changé, réessayez ». Tous les clients affichent déjà
   `json.error` en toast. Cela supprime *toute* la question du rejeu — donc plus
   besoin de restructurer `moveBookInList`, ni d'écrire une mécanique de
   tentatives avec attente exponentielle.
3. **`assertIntegrity(current)` AVANT l'écriture**, dans `mutate()`. C'est la
   ligne la plus utile du plan : aujourd'hui la validation n'a lieu qu'à la
   lecture, donc l'application peut committer un fichier qu'elle refusera
   ensuite de relire. ~1 ms sur 3 100 enregistrements. Cela transforme
   « application définitivement à terre, corriger le JSON à la main dans
   l'éditeur GitHub » en « une requête échouée avec un message en français ».
4. **Déplacer les contrôles d'existence *dans* les callbacks** de `mutate`
   (trois déplacements d'une ligne). Cela ferme la fenêtre et rend les callbacks
   corrects par construction.

`nextId` (`store.ts:222`) reste sûr **parce qu'il est calculé dans le callback** :
après relecture, `maxId + 1` dépasse l'horodatage à la seconde. Le sortir du
callback produirait des identifiants en double, donc `assertIntegrity`, donc des
500 permanents. À ne pas « optimiser ».

### Amplification des lectures

Gratuite aujourd'hui (cache sur `mtime`), elle devient un aller-retour réseau
par appel. Comptes vérifiés : `/` fait **3** appels à `store()`
(`dashboard.ts:88`, `:89` via le paramètre par défaut de `resolveLibrary`, `:91`) ;
`POST /api/lists/[id]/items` en fait **4 + une écriture** (`route.ts:27`, `:41`,
le `mutate`, puis `getList`) ; cinq pages interrogent la donnée dans
`generateMetadata` **et** dans le corps ; `/parcours/[slug]` indexe deux fois
2 038 livres.

**Correction : un plancher de fraîcheur dans le magasin** — si le cache a été
revalidé il y a moins d'une seconde, le rendre sans GET conditionnel. Une ligne.
Cela ramène chaque page à **un** aller-retour, borne l'obsolescence à 1 s,
plafonne les lectures à ~60/min contre 5 000/h autorisées, et fonctionne
identiquement dans les pages, les routes, `generateMetadata` et le job d'analyse.
`mutate()` remet le compteur à zéro après un PUT réussi, donc relire ce qu'on
vient d'écrire reste exact sur la même instance.

**`React.cache()` n'est pas la solution : c'est un no-op dans les Route
Handlers.** Vérifié dans le React livré — `if (!dispatcher) return fn.apply(null, arguments)`,
sans erreur ni avertissement, et `createCacheScope` est absent des bundles
`app-route`. Il dédupliquerait la paire `generateMetadata`+page et ne ferait
**rien** dans les 12 routes mutantes ni dans `api/search` : il marche là où on le
teste et échoue en silence là où vivent les 4 lectures du chemin d'écriture.

**À supprimer au passage, gain immédiat même sans déploiement :** le paramètre
par défaut `resolveLibrary(books = listBooks())` (`roadmaps/resolve.ts:75`), qui
fait résoudre la bibliothèque deux fois sur `/`. Les appelants passent `books`.

### Modes de défaillance à traiter

- **Échec réseau, 5xx, 403/429 de quota** → continuer à servir le dernier état
  valide, ne pas avancer l'ETag, respecter `Retry-After`.
- **Sélection de backend erronée.** Sur Vercel, `FILE` pointe vers un chemin
  inexistant et le système de fichiers est en lecture seule : un `GITHUB_REPO`
  absent ou mal orthographié sélectionnerait donc silencieusement le backend
  fichier et renverrait ENOENT sur toutes les pages. **Détecter
  `process.env.VERCEL` et échouer franchement**, en nommant la variable
  manquante.
- **Token absent ou expiré** → message explicite nommant la variable, pas un 500
  opaque. Un PAT peut expirer ; c'est le symptôme qu'on rencontrera.
- **`assertIntegrity` qui lève** met désormais l'application *déployée* à terre.
  Cela reste le bon comportement — servir le mauvais livre sous la bonne URL est
  pire — et la correction (2) ci-dessus fait que cela ne peut plus venir de
  l'application elle-même. La page d'erreur doit dire quoi faire : corriger le
  fichier et pousser.
- **Pas de `.bak` sur ce backend, et inutile** : l'historique git *est* la
  sauvegarde, et chaque écriture est un commit révocable.
- **Propriété inverse agréable** : la donnée étant lue à l'exécution, corriger un
  `library.json` cassé dans l'éditeur web GitHub répare la production sans
  redéployer.

### Synchrone → asynchrone

`store()` et `mutate()` renvoient des promesses. **33 fichiers**, et la frontière
est plus clémente qu'il n'y paraît : **aucun composant client n'appelle une
fonction de données** (les 34 fichiers `"use client"` n'importent depuis `@/lib`
que des types), et les 9 routes d'API sont déjà `async`.

Ce qui n'est pas un simple `await` :

| Endroit | Pourquoi |
| --- | --- |
| `src/lib/roadmaps/resolve.ts:75` | appel de données dans un **paramètre par défaut**, impossible à `await`. Supprimé (voir ci-dessus). |
| 7 composants de page synchrones | `app/page.tsx`, `livres/page.tsx`, `livres/nouveau/page.tsx`, `auteurs/page.tsx`, `listes/page.tsx`, `parcours/page.tsx` → ajouter `async`. Tous ont déjà un `loading.tsx`. |
| `src/app/listes/page.tsx:9` | l'appel est en ligne dans le JSX — le sortir dans une const. |
| 4 `const books = listBooks()` au niveau module (tests) | `library.test.ts:17`, `lists.test.ts:24`, `roadmaps.test.ts:23`, `priorities.test.ts:18` → `await` de haut niveau ; plus `library.test.ts:62` (un `store()` dans un `it()`). |
| `scripts/parcours-metrics.ts:16` | envelopper dans un `async main()`. |
| `store.ts:10-12` | le commentaire « Tout est synchrone… rien ne peut s'intercaler » devient **faux**, y compris pour le backend fichier. À réécrire, sinon il induira le prochain lecteur exactement dans le bug ci-dessus. |

**Pas de paramètre `message` sur `mutate()`.** Les 13 fonctions qui mutent
connaissent déjà l'intention (`createBook` a le titre et l'auteur) : le message
se dérive sur place, sans toucher une seule signature ni une seule route.

**Pas d'`interface StorageBackend`** avec deux implémentations : deux fonctions
et un `if` dans `store.ts`. Une implémentation par environnement, choisie une
fois.

### Authentification

- `src/proxy.ts` (Next 16 a renommé Middleware → Proxy) ne vérifie que la
  **présence** du cookie et redirige sinon — le « contrôle optimiste » que
  décrit la documentation. **La vérification HMAC réelle vit dans un seul
  helper appelé par les routes.** Cela évite la question Edge/Node runtime et
  la duplication de la crypto entre deux environnements.
- Cookie : `<exp>.<hmac(secret, exp)>`, `HttpOnly; Secure; SameSite=Lax; Path=/`,
  comparaison en temps constant, expiration vérifiée. Signer une constante
  donnerait un jeton éternel non révocable. `SameSite=Lax` tient lieu du jeton
  CSRF absent — les 12 routes acceptent du JSON sans contrôle d'origine.
  **`Max-Age` long (30 jours)** : une expiration en cours de session ferait
  échouer silencieusement les `router.refresh()`.
- Matcher : exempter `/connexion`, la route de login, `/_next/static`,
  `/_next/image`, `/favicon.ico` — et **ne pas** exempter `/api`.
- `requireAuth()` sur les **12 routes mutantes** : `POST /api/authors`,
  `PUT`+`DELETE /api/authors/[id]`, `POST /api/books`,
  `PUT`+`DELETE /api/books/[id]`, `POST /api/books/[id]/analysis` (facile à
  oublier : elle écrit via `runAnalysis`), `POST /api/lists`,
  `PUT`+`DELETE /api/lists/[id]`, `POST`+`DELETE /api/lists/[id]/items`.
  Aucune Server Action n'existe, donc aucun autre chemin d'écriture.
- **Fuite à corriger** : `envSansCleApi()` (`analysis/run.ts:54-59`) recopie tout
  `process.env` dans le sous-processus Claude, moins les deux clés Anthropic.
  Y ajouter `GITHUB_TOKEN` et le secret d'authentification. `allowedTools: []`
  rend la chose inexploitable aujourd'hui, mais un token d'écriture n'a rien à
  faire dans cet environnement.
- **Token** : PAT à granularité fine limité à `ThomasGourouza/my-library`,
  `Contents: read+write`. Un PAT classique de portée `repo` pourrait écrire dans
  tous les dépôts.
- **Force brute** : la réponse n'est pas du code, c'est un mot de passe aléatoire
  de 32 caractères.
- Les 10 `fetch("/api/…")` côté client ne changent pas : même origine et chemins
  relatifs, donc le cookie part tout seul.

### « Analyse Claude » en ligne

`ANALYSIS_ENABLED` n'est vrai que sur le backend fichier.

- `AnalysisPanel` reçoit un prop `disabled` (un seul appel,
  `livres/[id]/page.tsx:153`) et affiche une note « génération disponible en
  local » à la place du bouton.
- **Et surtout : neutraliser la clé SWR** (`useSWR(disabled ? null : url, …)`,
  comme le fait déjà `add-to-list.tsx:53`). Aujourd'hui `analysis-panel.tsx:56`
  déclenche un GET **à chaque affichage d'une fiche livre**, soit une invocation
  et une lecture complète de la bibliothèque de plus, pour des champs déjà
  présents dans `book`. On supprime donc une lecture inutile par page vue en
  même temps que le bouton mort.
- `POST /api/books/[id]/analysis` renvoie 403 avec un message clair.
- À noter pour l'avenir : `void runAnalysis(...)` après un 202 n'est de toute
  façon pas viable en serverless (l'instance peut être gelée dès la réponse), et
  la `Map` de jobs est par instance. La fonctionnera ne pourra pas être activée
  en ligne sans déplacer l'état des jobs.

### Configuration de déploiement — et la boucle à éviter

**Chaque écriture est un commit sur `master`, et Vercel déploie par défaut à
chaque push.** Sans précaution, cocher une case redéploie l'application — ce qui
au passage redémarre toutes les instances et vide le cache mémoire.

`app/vercel.json` :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": { "deploymentEnabled": false }
}
```

Cela empêche le déploiement d'être **déclenché**, donc les commits de données ne
coûtent rien. Les changements de code se déploient à la demande avec
`vercel --prod`.

> Variante si l'on préfère garder le déploiement automatique du code : laisser
> `deploymentEnabled` et mettre l'Ignored Build Step à `git diff --quiet HEAD^ HEAD ./`
> (la commande s'exécute **dans le Root Directory**, donc un commit qui ne touche
> que `data/` ne touche rien sous `app/` → sortie 0 → build ignoré ; et un `HEAD^`
> absent fait sortir git en 128, donc non nul, donc on build — l'échec va dans le
> bon sens). Le défaut : la documentation précise que « canceled builds are
> counted as full deployments … still count towards your deployment quotas », donc
> chaque écriture de données consomme un des 100 déploiements quotidiens. Ne pas
> écrire cette commande à la main : la polarité inversée est facile à obtenir et
> se traduit par un premier déploiement qui ne livre rien.

- **Root Directory = `app`.** `data/` est en dehors, et c'est sans conséquence :
  le build ne lit jamais le fichier de données. Vérifié — `npm run build` réussit
  avec `data/library.json` renommé, et ne crée rien.
- Variables d'environnement : `GITHUB_TOKEN`, `GITHUB_REPO=ThomasGourouza/my-library`,
  `GITHUB_BRANCH=master`, `LIBRARY_PASSWORD`, `LIBRARY_SESSION_SECRET`.
  Chiffrées au repos, et côté serveur uniquement puisqu'aucune ne porte le
  préfixe `NEXT_PUBLIC_`.

### Le coût réel, dit franchement

Chaque écriture, c'est un corps de 2,1 Mo en base64, un commit, puis un
`router.refresh()` qui relit. Comptons **1 à 2 secondes par clic** en ligne,
contre ~10 ms en local. `ReadCheckbox` étant optimiste, la case réagit
instantanément, mais la page ne se stabilise qu'après une seconde ou deux. C'est
le prix de cette architecture ; autant le savoir d'avance.

---

## Fichiers

| Fichier | Changement |
| --- | --- |
| `src/lib/store.ts` | `store()` / `mutate()` asynchrones ; mutex de mutation ; `assertIntegrity` avant écriture ; plancher de fraîcheur ; choix du backend explicite. |
| `src/lib/store/file.ts` *(nouveau)* | le comportement actuel, tel quel. Utilisé en local et par les tests. |
| `src/lib/store/github.ts` *(nouveau)* | GET conditionnel `raw`, `PUT /contents`, gestion des deux formes d'ETag, 409 → erreur claire, tentatives sur la lecture, `Retry-After`. |
| `src/lib/queries.ts`, `src/lib/lists.ts` | `async` ; messages de commit dérivés sur place ; contrôles d'existence déplacés dans les callbacks. |
| `src/lib/dashboard.ts`, `src/lib/roadmaps/{queries,resolve}.ts` | `async` ; suppression du paramètre par défaut de `resolveLibrary`. |
| `src/lib/analysis/run.ts` | `await` ; secrets retirés de `envSansCleApi()`. |
| 9 × `src/app/api/**/route.ts` | `await` ; `requireAuth()` sur les 12 routes mutantes ; 403 sur l'analyse. |
| 13 × `src/app/**/page.tsx` | `async` où nécessaire ; sortir l'appel en ligne de `listes/page.tsx`. |
| `src/proxy.ts`, `src/app/connexion/page.tsx`, `src/lib/auth.ts` *(nouveaux)* | la porte par mot de passe. |
| `src/components/books/analysis-panel.tsx` | prop `disabled` + clé SWR neutralisée. |
| `app/vercel.json` *(nouveau)* | `git.deploymentEnabled: false`. |
| 4 fichiers de test, `scripts/parcours-metrics.ts` | niveau module → `await` de haut niveau / `async main()`. Les tests gardent le backend fichier via `LIBRARY_DATA_PATH`, donc `vitest.global-setup.ts` est inchangé. |

---

## Déroulé

`npx tsc --noEmit` et `npm run lint` propres après chaque étape ; `npm test` vert
à partir de l'étape 1.

**0. Committer et pousser le refactor précédent.** Décision de l'utilisateur.
Rien ne fonctionne contre un `origin/master` sans `data/library.json`.

**1. Passage à l'asynchrone, backend fichier seul.** Ni GitHub ni
authentification. Grosse étape mécanique, entièrement vérifiable en local, et
qui embarque les gains valables sans déploiement (mutex, `assertIntegrity` avant
écriture, contrôles dans les callbacks, suppression du paramètre par défaut).
*Contrôle :* `npm test` vert (63 tests) ; `npm run dev` ; parcourir toutes les
pages ; créer / modifier / supprimer, réordonner une liste, cocher « Lu » ;
`git diff data/library.json` montre les mêmes petits diffs qu'avant ;
`npx tsx scripts/parcours-metrics.ts` sort les mêmes chiffres (53 parcours,
1 546 entrées, 1 152/2 038 couverts).

**2. Backend GitHub, exercé en local.** `LIBRARY_BACKEND=github` avec un PAT
dans `.env.local`, contre une **branche d'essai**, pas `master`.
*Contrôle, et c'est le seul point invérifiable avant essai :* un `PUT` d'un corps
base64 de 2,01 Mo doit passer. La documentation dit 100 Mo mais ne garantit rien,
et un rapport signale des 422 bien en dessous. En cas d'échec, replier sur l'API
Git Data (blob → tree → commit → ref, 4 appels, plus de question de taille) — le
reste du plan est inchangé. Puis : la lecture fonctionne, une écriture apparaît
comme commit sur la branche d'essai, un `sha` volontairement périmé donne un 409
avec un message clair, et un ETag mal formé est détecté (envoyer la forme nue en
`If-None-Match` doit se voir : on cesse de recevoir des 304).

**3. Authentification.** `proxy.ts`, `/connexion`, `requireAuth()`.
*Contrôle en local :* toute page redirige sans cookie ; les 12 routes mutantes
renvoient 401 ; un cookie falsifié est rejeté ; un cookie expiré est rejeté ;
`/connexion` et les assets restent accessibles.

**4. Analyse.** Prop `disabled`, clé SWR neutralisée, 403.
*Contrôle :* en backend fichier le bouton fonctionne de bout en bout ; en backend
GitHub le bouton a disparu, `POST` renvoie 403, une analyse existante s'affiche
toujours, et une fiche livre ne déclenche **plus** de GET d'analyse.

**5. Déploiement.** Importer le dépôt sur Vercel, Root Directory `app`, les cinq
variables, `vercel.json`, `vercel --prod`.
*Contrôle :* le site s'ouvre derrière le mot de passe ; `/livres` affiche 2 038
livres ; ⌘K fonctionne ; cocher « Lu » en ligne → un commit apparaît sur `master`
à votre nom avec le bon message, et `git pull` en local montre exactement ce
diff d'une ligne.

**6. L'aller-retour qui est tout l'objet.** Modifier en ligne, `git pull` en
local, `npm run dev` → données identiques. Puis modifier en local, committer,
pousser, recharger l'application déployée → données identiques. Enfin vérifier
qu'un commit de données n'a **pas** déclenché de déploiement Vercel.

**7. Documentation.** `app/README.md` gagne une section **En ligne** : l'URL, les
deux backends et comment ils sont choisis, les cinq variables, `vercel --prod`
pour le code, pourquoi les commits de données ne déploient pas, la règle
« tirer avant de modifier », et le fait que **le dépôt étant public, le mot de
passe protège les écritures et non les lectures**.

---

## Plafonds connus

- **~500 requêtes générant du contenu par heure** (limite secondaire GitHub), et
  GitHub *recommande* au plus **6 pushes par minute et par dépôt**. Un usage
  humain en est loin ; un script les dépasserait. Le backend respecte
  `Retry-After` plutôt que d'insister.
- **Croissance du dépôt.** Chaque écriture committe 1,5 Mo, donc l'historique
  grossit d'environ une copie compressée par modification. Quelques milliers
  d'éditions et `.git` pèse plus que la donnée. La sortie de secours reste de
  déplacer les analyses dans un second fichier.
- **Le fichier est public**, et au-dessus du 1 Mo *recommandé* par GitHub pour un
  objet : il ne s'affiche ni ne se compare dans l'interface web.
- **Pas d'usage hors ligne de l'application déployée**, et en local il faut
  `git pull` avant de modifier. Si le fichier a des modifications non
  committées, `git pull` refuse — ce qui reste le meilleur garde-fou du
  dispositif.
- **Le plafond des analyses** de la tâche précédente mord maintenant deux fois :
  à couverture complète le fichier ferait ~10 Mo, ce qui est à la fois une
  écriture lente et bien plus proche du point où `PUT /contents` est signalé
  comme capricieux.
- **Les listes sont vides aujourd'hui** (0 enregistrement) : 6 des 13 mutations
  et 5 des 12 routes mutantes n'ont encore aucune donnée derrière elles.
