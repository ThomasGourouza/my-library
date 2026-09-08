# Finir la mise en ligne — marche à suivre

Le code est écrit et vérifié en local (`HOSTING_PLAN.md`, étapes 0 à 4 et 7).
Ce qui reste demande un compte Vercel et un jeton GitHub, donc vous.

Comptez **une heure**, dont l'essentiel en attente de Vercel. Les étapes se
suivent dans l'ordre : chacune a un *contrôle* qui doit passer avant la suivante.

**Le seul vrai risque est à l'étape 3**, et il est identifié : personne n'a
encore prouvé qu'un `PUT` d'un corps base64 de ~2 Mo passe. Si ça casse, ça
casse là, en local, sur une branche d'essai — pas en production. Le repli est
décrit à la fin.

---

## 0. Committer et pousser

Rien ne peut être déployé tant que `origin/master` n'a pas le code. Deux
commits, parce que ce sont deux sujets.

```bash
cd /Users/tom/Documents/my-library

# Le ménage est déjà indexé (suppressions du RESUME_PROMPT, des SVG inutilisés,
# des journaux de run committés par erreur, des verrous LibreOffice).
git commit -m "Retirer ce qui n'a plus d'usage"

# Puis l'hébergement.
git add -A
git commit -m "Préparer l'hébergement : magasin asynchrone, backend GitHub, porte par mot de passe"

git push
```

**Contrôle.** `git status` est propre, et `git log --oneline -3` montre les deux
commits. `git diff --stat origin/master master` ne renvoie rien.

---

## 1. Créer le jeton GitHub

Sur github.com : **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**.

| Champ | Valeur |
| --- | --- |
| Token name | `ma-bibliotheque-vercel` |
| Resource owner | `ThomasGourouza` |
| Repository access | **Only select repositories** → `my-library` |
| Permissions → Repository → **Contents** | **Read and write** |
| Expiration | au choix — notez la date, voir « À savoir ensuite » |

**Fine-grained, et limité à ce dépôt.** Un PAT classique de portée `repo`
donnerait l'écriture sur *tous* vos dépôts à une application déployée.

`Metadata: Read-only` s'ajoute tout seul, c'est normal. Copiez le jeton
maintenant : GitHub ne le réaffichera jamais.

**Contrôle.** Le jeton lit bien le dépôt :

```bash
export TOKEN='github_pat_…'
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/vnd.github.raw' \
  'https://api.github.com/repos/ThomasGourouza/my-library/contents/data/library.json?ref=master'
```

Attendu : `200`. Un `401` = jeton mal copié ; un `404` = mauvais dépôt, ou le
jeton n'y a pas accès.

---

## 2. Tirer le mot de passe et le secret

```bash
openssl rand -base64 24   # LIBRARY_PASSWORD       (32 caractères)
openssl rand -hex 32      # LIBRARY_SESSION_SECRET (64 caractères)
```

Le mot de passe est votre seule défense contre la force brute — il n'y a pas de
compteur de tentatives, délibérément : un compteur en mémoire repartirait à zéro
à chaque instance froide. D'où 32 caractères aléatoires, et pas une date de
naissance.

Rangez les deux dans votre gestionnaire de mots de passe **avant** de continuer.

---

## 3. Éprouver le backend GitHub en local, sur une branche d'essai

L'étape qui compte. On écrit pour de vrai dans le dépôt, donc **jamais sur
`master`** tant que ça n'a pas marché une fois.

### Créer la branche

```bash
cd /Users/tom/Documents/my-library
git switch -c essai-hebergement
git push -u origin essai-hebergement
```

### Configurer

Créez `app/.env.local` (gitignoré par `.env*`, il ne partira jamais dans un
commit) :

```bash
cat > app/.env.local <<'EOF'
LIBRARY_BACKEND=github
GITHUB_REPO=ThomasGourouza/my-library
GITHUB_BRANCH=essai-hebergement
GITHUB_TOKEN=github_pat_…
LIBRARY_PASSWORD=…
LIBRARY_SESSION_SECRET=…
EOF
```

Puis, **serveur de développement arrêté** (il occupe le port 3000) :

```bash
cd app
npm run build && npm start        # http://localhost:3000
```

### Les contrôles, dans l'ordre

**a. La porte.** Ouvrir `http://localhost:3000` renvoie sur `/connexion`. Le mot
de passe donne accès ; un mauvais mot de passe affiche « Mot de passe
incorrect ».

**b. La lecture.** `/livres` affiche **2 038 livres**. `⌘K` trouve « dosto ».
Une liste vide ou une page en erreur = le backend GitHub ne lit pas ; le message
exact est dans le terminal où tourne `npm start`, et il nomme la variable en
cause.

**c. L'analyse est bien désactivée.** Sur une fiche livre, le bouton « Analyse
Claude » a disparu, remplacé par « Génération disponible sur l'installation
locale ». Une analyse déjà écrite s'affiche toujours. Et :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:3000/api/books/587/analysis
```

Attendu : `401` sans cookie (la porte), `403` avec — jamais `202`.

**d. L'écriture — le test qui décide.** Dans l'interface, cochez « Lu » sur un
livre. C'est ici que le `PUT` de ~2 Mo passe ou ne passe pas.

```bash
git fetch origin essai-hebergement
git log --oneline -3 origin/essai-hebergement
git show --stat origin/essai-hebergement
```

Attendu : un commit **à votre nom**, intitulé par exemple
`Crime et Châtiment — lu`, et un diff **d'une seule ligne**. Un diff de
56 000 lignes voudrait dire que l'aller-retour de formatage n'est pas neutre —
arrêtez tout et dites-le moi.

Si l'interface affiche une erreur à la place : allez voir « Si le `PUT` de 2 Mo
échoue » à la fin.

**e. Les 304 fonctionnent.** C'est ce qui rend la lecture abordable, et une
erreur ici est parfaitement silencieuse : tout marche, mais chaque page
retélécharge 1,5 Mo.

```bash
quota() { curl -s -H "Authorization: Bearer $TOKEN" https://api.github.com/rate_limit \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['resources']['core']['remaining'])"; }

quota                     # avant
# rechargez /livres cinq ou six fois, en laissant 2 s entre chaque
quota                     # après
```

Attendu : le compteur ne bouge quasiment pas (un 304 ne consomme pas de quota).
S'il perd 5 ou 6 points, les lectures conditionnelles ne prennent pas.

**f. Le conflit d'écriture** *(optionnel — le chemin de code est déjà couvert par
`src/lib/store/github.test.ts`, et il est difficile à provoquer à la main
précisément parce que le mutex et la revalidation le rendent rare)*. Pour le
voir en vrai : lancez une **deuxième** instance sur un autre port avec le même
`.env.local`, chargez une page sur chacune (les deux mettent alors le même sha
en cache), puis cochez « Lu » sur la première et, moins d'une seconde plus tard,
sur la deuxième. Celle-ci doit afficher « La bibliothèque a changé entre-temps.
Rechargez la page et réessayez. » — et surtout, ne rien écraser.

### Refermer l'essai

```bash
cd /Users/tom/Documents/my-library
git switch master
git merge essai-hebergement          # récupère les commits de test, ou :
# git branch -D essai-hebergement && git push origin --delete essai-hebergement
```

Si vous gardez les commits d'essai, décochez les livres cochés pour revenir à
l'état voulu.

**Puis supprimez `app/.env.local`** :

```bash
rm app/.env.local
```

C'est important, et c'est la décision 1 du plan : **en local, l'application
garde le fichier local**. Seule l'application déployée parle à GitHub, et elle
tient ses variables de Vercel, pas de ce fichier. Le laisser en place ferait
passer votre `npm run dev` par l'API GitHub — 1 à 2 secondes par clic, et un
commit à chaque case cochée.

*(Les tests, eux, ne lisent pas `.env.local` : `npm test` reste sur sa copie
jetable quoi qu'il arrive.)*

---

## 4. Déployer sur Vercel

Sur vercel.com : **Add New → Project → Import** le dépôt `my-library`.

| Réglage | Valeur |
| --- | --- |
| **Root Directory** | **`app`** — pas la racine du dépôt |
| Framework Preset | Next.js (détecté) |

`data/` est **hors** du Root Directory, et c'est sans conséquence : le build ne
lit jamais le fichier de données.

Puis **Settings → Environment Variables**, les cinq, en **Production** :

| Variable | Valeur |
| --- | --- |
| `GITHUB_TOKEN` | le jeton de l'étape 1 |
| `GITHUB_REPO` | `ThomasGourouza/my-library` |
| `GITHUB_BRANCH` | `master` |
| `LIBRARY_PASSWORD` | le mot de passe de l'étape 2 |
| `LIBRARY_SESSION_SECRET` | le secret de l'étape 2 |

Aucune ne porte le préfixe `NEXT_PUBLIC_` : elles restent côté serveur.

Déployez :

```bash
cd /Users/tom/Documents/my-library/app
npx vercel --prod
```

`app/vercel.json` porte `git.deploymentEnabled: false`, ce qui coupe les
déploiements **déclenchés par un push** — sans quoi cocher une case
redéploierait l'application, redémarrant les instances et vidant leur cache à
chaque clic. `vercel --prod` est un déploiement manuel : il passe malgré ce
réglage. C'est voulu, et c'est le prix à payer — le code se livre désormais à la
main.

**Contrôle.** Le site s'ouvre sur la page de connexion ; le mot de passe donne
accès ; `/livres` affiche 2 038 livres ; `⌘K` fonctionne.

---

## 5. L'aller-retour, qui est tout l'objet

**En ligne → local.** Cochez « Lu » sur un livre depuis le site déployé, puis :

```bash
cd /Users/tom/Documents/my-library
git pull
git show --stat
npm --prefix app run dev      # la même case est cochée en local
```

**Local → en ligne.** Modifiez un livre en local, committez, poussez, puis
rechargez le site déployé : la modification y est.

**Et le déploiement ne s'est pas déclenché.** Dans Vercel → Deployments : les
commits de données des deux paragraphes ci-dessus n'ont produit **aucun**
déploiement. Si ce n'est pas le cas, `vercel.json` n'est pas lu — vérifiez que
le Root Directory est bien `app`.

---

## 6. Finir la documentation

Dans `app/README.md`, section **En ligne**, remplacez :

```
> **URL** : à renseigner après le premier `vercel --prod` (le déploiement
> lui-même n'est pas encore fait).
```

par l'URL réelle. Puis committez et poussez.

---

## Si le `PUT` de 2 Mo échoue

Le symptôme : la lecture marche, l'écriture renvoie une erreur (souvent 422) à
l'étape 3d. La documentation GitHub annonce 100 Mo pour `PUT /contents`, mais ne
le garantit pas, et des rapports signalent des refus bien en dessous.

Le repli est prévu et **ne touche qu'un fichier**, `src/lib/store/github.ts` :
remplacer l'appel unique par l'**API Git Data**, en quatre appels qui ne posent
plus de question de taille —

1. `POST /git/blobs` — le contenu, en base64 → un `sha` de blob ;
2. `POST /git/trees` — un arbre basé sur celui du commit courant, où
   `data/library.json` pointe vers ce blob ;
3. `POST /git/commits` — un commit sur cet arbre, parent = `master` ;
4. `PATCH /git/refs/heads/master` — avancer la branche, **sans** `force` : c'est
   ce qui remplace le compare-and-swap du `sha`, et qui doit continuer à lever
   `StaleWriteError`.

Le reste — jetons, ETag, plancher de fraîcheur, mutex, porte, analyse — est
inchangé. Dites-le moi et je le fais ; les tests de
`src/lib/store/github.test.ts` sont à réécrire pour la nouvelle forme.

---

## À savoir ensuite

- **Le dépôt est public.** Toute la bibliothèque, chaque analyse, et désormais
  un commit horodaté par clic sur « Lu » sont lisibles par n'importe qui. Le mot
  de passe protège **les écritures, pas les lectures**. Pour fermer aussi la
  lecture : passer le dépôt en privé — le jeton fonctionne pareil, on perd
  l'historique public comme sauvegarde consultable.
- **Comptez 1 à 2 secondes par clic** en ligne, contre ~10 ms en local : chaque
  modification est un corps de 2,1 Mo et un commit. La case « Lu » réagit tout
  de suite (elle est optimiste), la page se stabilise après.
- **Le jeton expire.** Le jour venu, toutes les pages tomberont ; le message
  dans les journaux Vercel nommera `GITHUB_TOKEN`. Regénérez, remplacez la
  variable, redéployez.
- **`.git` grossit d'environ une copie compressée par modification.** Quelques
  milliers d'éditions et l'historique pèsera plus que la donnée. La sortie de
  secours, si ce jour arrive : déplacer analyses et biographies dans un second
  fichier.
- **Tirer avant de modifier**, en local. Si le fichier a des modifications non
  committées, `git pull` refuse — c'est le garde-fou du dispositif, pas un
  obstacle à contourner.
- **Un `library.json` cassé se répare sans redéployer** : la donnée est lue à
  l'exécution, donc la corriger dans l'éditeur web de GitHub remet la production
  d'aplomb.
