# Révision des parcours — état d'avancement

Fichier de reprise. **À relire en premier** à chaque (re)démarrage, et à mettre à
jour après CHAQUE parcours. Il fait autorité sur ce qui reste à faire : le run
peut être interrompu par une limite d'usage de 5 h et redémarrer des heures plus
tard.

## Le renversement

Les parcours ont été écrits sous une contrainte qui n'existe plus : un test
exigeait que **tout** livre appartienne à au moins un parcours. Résultat mesuré :
un livre spécialisé apparaissait 1,06 fois — exactement une fois, parce qu'il
fallait le caser. 67 % des entrées sont des livres complémentaires ou
spécialisés, et le balayage final a déversé ~199 livres en treize passes.

**Le seul critère est maintenant la pertinence réelle du livre pour l'objectif
du parcours.** Un livre qui ne sert aucun objectif reste en bibliothèque, hors
parcours, et c'est un résultat normal. Ne jamais chercher où « caser » un livre.

La question à poser pour chaque livre déjà présent :
**« qu'est-ce que ce parcours perd si je le retire ? »**
Si la réponse est « rien de précis », il sort.

## Ce que les tests exigent désormais (`cd app && npm test`)

Ils ne poussent plus les livres dedans, ils les tiennent dehors :

- **≤ 20 % d'entrées `specialise`** par parcours (exception nommée :
  `le-mythe-arthurien`, où cette littérature *est* le sujet) ;
- **≥ 6 entrées `essentiel` ou `important`** — la colonne vertébrale (exceptions
  nommées : les deux parcours jeunesse, jugés sur un autre axe) ;
- **≥ 8 entrées** par parcours ;
- notes **≥ 110 caractères**, jamais recyclées d'un livre à l'autre ;
- toute entrée doit résoudre vers un livre réel (attrape les fautes de frappe).

La priorité de chaque livre se lit dans `app/src/lib/priorities/data/*.ts`. Elle
est un **indice, pas une règle** : un livre `specialise` a sa place là où c'est
précisément le sujet ; un livre `essentiel` n'a rien à faire dans un parcours
qu'il ne sert pas.

## Protocole par parcours

1. Lire l'objectif (`goal`) et la description du parcours. Ils restent la
   référence — sauf pour les parcours marqués « reconstruire ».
2. Confronter chaque livre à cet objectif. Retirer, ajouter, réordonner.
   Vérifier qu'aucune note restante ne cite un livre qu'on vient de retirer.
3. Réécrire les notes touchées ; le reste des notes est conservé tel quel.
4. `cd app && npm test`
5. Mettre à jour la case ici, puis `git commit`.
6. Ne passer au suivant qu'une fois commité — c'est ce qui rend la reprise
   possible.

## Mesures de référence (avant révision)

`npx tsx scripts/parcours-metrics.ts` depuis `app/` :
54 parcours · 2508 entrées · 2044/2044 livres couverts · tailles 16/41/100 ·
ratio parcours/livre : essentiel 1,90 · important 1,44 · complémentaire 1,16 ·
**spécialisé 1,06**. Attendu après révision : 900-1200 livres couverts, 38-45
parcours, et l'effondrement du 1,06.

---

## Parcours

### À supprimer
- [x] `la-bataille-des-idees` — 0 % essentiel, 0 % important, 85 % spécialisé,
      40 livres exclusifs tous complémentaires ou spécialisés. Créé pendant le
      balayage pour absorber le trop-plein. Retirer le fichier, l'import et
      l'entrée du registre `index.ts` ; récupérer au plus 5-6 titres réellement
      polémiques dans `grands-essais-et-art-de-penser` reconstruit.

### À reconstruire (l'objectif reste, le contenu est refait)
- [x] `initiation-a-la-philosophie` — 72 % spécialisé, 7 E+I sur 47. Doit devenir
      l'un des plus **petits** parcours : 12-15 textes d'entrée, rien d'autre.
- [x] `geopolitique-du-monde-contemporain` — 0 % essentiel, 52 % spécialisé,
      contient un atlas et un manuel de relations internationales.
- [x] `comprendre-l-univers` — 92 % complémentaire+spécialisé.
- [x] `les-mathematiques` — 86 %.
- [x] `histoire-et-philosophie-des-sciences` — 76 %.
- [x] `le-vivant` — 73 %.
- [x] `histoire-de-france` — cinq biographies de De Gaulle à la suite puis quatre
      Mitterrand : inventaire de rayon.
- [x] `civilisations-et-longue-duree` — 78 %, et deux paires de doublons non
      détectés dans les quatre dernières positions.
- [x] `propagande-et-theories-du-complot` — recentrer sur les œuvres d'analyse
      (Bernays, Ellul, Chomsky et Herman, Lippmann, Le Bon). Les textes
      négationnistes et conspirationnistes sortent : ils restent en
      bibliothèque, mais « ordre de lecture recommandé » n'est pas la forme
      juste pour eux. Quelques titres peuvent rester en cas d'école si la note
      les nomme comme tels.
- [x] `grands-essais-et-art-de-penser` — était le « filet de sécurité » déclaré.
      Reconstruire autour de l'objectif réel : travailler la forme essai.
- [x] `recits-de-soi` — 100 % de ses livres exclusifs sont C ou S.
- [x] `nouvelles-et-formes-breves` — 94 %.
- [x] `arts-et-musique` — 41 % spécialisé, créé pendant le balayage.
- [x] `philosophie-morale-et-art-de-vivre` — 49 % spécialisé.
- [x] `textes-sacres-et-tradition` — 39 %.
- [x] `vision-geopolitique` — 47 %, la vision qui a pris le plus de dette.
- [x] `guerres-et-totalitarismes-du-xxe` — 36 % ; c'est ici que se trouvent
      Faurisson, Irving, Verrall et Bardèche, qui sortent (voir ci-dessus).

### À élaguer (le contenu est bon, la traîne ne l'est pas)
- [x] `le-theatre` — 100 entrées, fin construite : élagage léger seulement.
- [x] `philosophie-contemporaine` — finit sur deux monographies de sociologie
      sans rapport.
- [x] `le-monde-anglo-saxon` — les 15 dernières positions dégénèrent en romans
      d'aéroport.
- [x] `le-roman-russe`
- [x] `roman-francais-xxe` — un bloc québécois déversé en positions 79-81, deux
      essais en 83-84 dans un parcours de romans.
- [x] `romantisme-francais` — des poèmes isolés catalogués comme livres en 57-59
      et 62-64.
- [x] `rationalisme-et-lumieres`
- [x] `les-maitres-du-soupcon`
- [x] `litterature-contemporaine`
- [x] `la-poesie`
- [x] `realisme-et-naturalisme`
- [x] `sources-moyen-age-renaissance`
- [x] `economie-et-critique-du-capitalisme`
- [x] `chine-et-japon`
- [x] `phenomenologie-et-existentialisme`
- [x] `vision-chretienne`
- [x] `vision-aristocratique`
- [x] `psychologie-et-connaissance-de-soi`
- [x] `science-fiction-et-anticipation`
- [ ] `le-mythe-arthurien` — Markale *est* le sujet, mais 13 titres du même
      auteur restent trop : garder les plus utiles.
- [ ] `le-grand-siecle`
- [ ] `lumieres-litteraires`
- [ ] `premiers-grands-romans`
- [x] `le-vivant` *(déjà listé en reconstruction)*

### Conservés, vérification rapide seulement
- [ ] `comprendre-la-puissance` — le plus sain hors visions (24 % E, 36 % I).
- [ ] `les-fondations-grecques`
- [ ] `philosophie-antique-et-medievale`
- [ ] `rome-et-le-stoicisme`
- [ ] `vision-cynique` · `vision-classique` · `vision-existentialiste` ·
      `vision-scientifique` — mélange de priorités déjà sain, notes les plus
      longues du corpus.
- [ ] `lettres-allemandes` · `mediterranee-et-amerique-latine` ·
      `europe-du-nord-et-centrale` — 0 à 6 % de spécialisé.
- [ ] `lire-avec-les-tout-petits` · `classiques-de-l-enfance` — **ne pas vider** :
      l'échelle de priorité est adulte, un album illustré y est structurellement
      « complémentaire ». Les juger sur leur propre axe.

### Créations éventuelles
Autorisées si un objectif réel apparaît pendant la révision et qu'aucun parcours
existant ne le porte. Ne pas en créer pour recueillir des livres orphelins :
c'est exactement l'erreur qu'on corrige.

### Doublons à traiter au passage
- [x] Harari : *Nexus* et *Nexus: A Brief History of Information Networks* — même
      livre, deux fiches. Fusionnés : la fiche anglaise est retirée du seed, de
      la base et du fichier de priorités ; « Nexus » est conservé (langue
      d'origine et thème correctement renseignés). 2044 → 2043 livres.
- [x] Strauss & Howe : *The Fourth Turning* et *The Fourth Turning Is Here*.
      **Ce ne sont pas des doublons** : *The Fourth Turning* (Strauss et Howe,
      1997) et *The Fourth Turning Is Here* (Howe seul, 2023) sont deux livres
      distincts, à vingt-six ans d'écart. Aucune fusion faite ; les deux fiches
      restent en bibliothèque. Ils sortent en revanche de
      `civilisations-et-longue-duree`, où Spengler et Toynbee portent déjà la
      thèse des cycles avec plus de poids.

### Clôture
- [ ] `npm test` au vert, `npx tsc --noEmit`, `npm run build`.
- [ ] `npx tsx scripts/parcours-metrics.ts "APRÈS révision"` et reporter les
      chiffres dans le rapport final, en regard des mesures de référence.
