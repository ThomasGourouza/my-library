#!/usr/bin/env bash
# =============================================================================
# Révision des parcours sous le seul critère de pertinence, en autonomie et à
# l'épreuve des limites d'usage.
#
#   ./run-revision.sh
#
# Enveloppe fine sur run.sh, qui porte tout le mécanisme de reprise : sommeil
# jusqu'à "resetsAt" sur une limite de 5 h, reprise de session, watchdog qui
# attend au lieu de consommer une tentative.
#
# Un lanceur distinct de run-parcours.sh parce que la tâche est l'inverse de la
# précédente : celle-là devait couvrir toute la bibliothèque, celle-ci doit
# retirer ce que cette contrainte y avait entassé. Réutiliser l'ancien texte
# reviendrait à redemander le remplissage.
#
# Suivre :   tail -f claude-auto/runs/<dernier>/run.log
# État   :   cat claude-auto/runs/<dernier>/status
#            (RUNNING | WAITING_LIMIT | DONE | FAILED | FAILED_PERMANENT)
# Arrêter:   pkill -f 'claude-auto/(run|watchdog).sh'
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

PROGRESS="$REPO/claude-auto/parcours-revision-progress.md"
PLAN="${PLAN_FILE:-$HOME/.claude/plans/create-a-new-tab-woolly-frost.md}"

read -r -d '' TASK <<EOF
Réviser les 54 parcours de lecture de la bibliothèque « Ma Bibliothèque »
(dépôt $REPO) sous un critère qui a changé.

COMMENCE PAR LIRE, DANS CET ORDRE :
  1. $PROGRESS
     Il contient le renversement de critère, le protocole, les seuils exigés par
     les tests, et la liste des parcours avec ce qu'il faut faire de chacun.
     Reprends au PREMIER parcours non coché ; s'il est coché, il est fait.
  2. $PLAN  (le plan validé, pour le contexte et les mesures)

LE RENVERSEMENT : les parcours ont été écrits sous une contrainte qui exigeait
que TOUT livre de la bibliothèque appartienne à au moins un parcours. Cette
contrainte est supprimée. Le seul critère est désormais la pertinence réelle
d'un livre pour l'objectif du parcours qui l'accueille.

Un livre qui ne sert aucun objectif reste en bibliothèque, SANS parcours, et
c'est un résultat normal et attendu. Ne cherche jamais où « caser » un livre.
Ne crée jamais un parcours pour recueillir des orphelins — c'est précisément
l'erreur qu'on corrige. La couverture n'est plus mesurée par les tests.

La question à poser pour chaque livre déjà présent dans un parcours :
« qu'est-ce que ce parcours perd si je le retire ? ». Si la réponse est
« rien de précis », il sort.

LES TESTS ONT ÉTÉ INVERSÉS. Ils ne poussent plus les livres dedans, ils les
tiennent dehors : au plus 20 % d'entrées spécialisées par parcours, au moins
6 livres essentiels ou importants, au moins 8 entrées, notes d'au moins 110
caractères et jamais recyclées. 'cd app && npm test' doit finir au vert à la
fin de la révision ; en cours de route ses échecs te disent quels parcours
restent à traiter.

MÉTHODE : un parcours à la fois, dans l'ordre du fichier de progression. Pour
chacun : relire l'objectif, confronter chaque livre à cet objectif, retirer,
ajouter, réordonner, réécrire les notes touchées, vérifier qu'aucune note
restante ne cite un livre retiré, 'npm test', cocher la case, 'git commit'.
Ne passe au suivant qu'une fois commité — c'est ce qui rend la reprise possible.

QUALITÉ : une note dit ce que CE livre apporte à CE parcours et pourquoi à cette
place. Pas de justification par adjacence (« du même auteur », « le pendant de »,
« complète la série »), et jamais par l'état de la fiche en base. Français sobre.

NE JAMAIS inventer un livre absent de la base : la résolution se fait par nom
d'auteur + titre normalisés, une entrée fantaisiste échoue au test.
EOF

cd "$REPO" || exit 1

MODEL="${MODEL:-opus}" \
STUCK_AFTER="${STUCK_AFTER:-2400}" \
CHECK_INTERVAL="${CHECK_INTERVAL:-120}" \
MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}" \
MAX_LIMIT_WAITS="${MAX_LIMIT_WAITS:-24}" \
MAX_API_RETRIES="${MAX_API_RETRIES:-4}" \
  exec "$SCRIPT_DIR/run.sh" "$TASK"
