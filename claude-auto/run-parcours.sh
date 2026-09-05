#!/usr/bin/env bash
# =============================================================================
# Rédaction des parcours de lecture, en autonomie et à l'épreuve des limites.
#
#   ./run-parcours.sh
#
# Enveloppe fine autour de run.sh, réglée pour un travail long :
#   - le travail est jalonné (un fichier par parcours + parcours-progress.md +
#     un commit par parcours), donc une reprise repart exactement où ça s'est
#     arrêté plutôt que de tout recommencer ;
#   - une limite d'usage de 5 h n'est pas un échec : run.sh et watchdog.sh
#     dorment jusqu'à "resetsAt" puis relancent, sans consommer de tentative ;
#   - STUCK_AFTER élevé car l'écriture d'un gros fichier unique n'émet rien
#     dans le log pendant de longues minutes (à 600 s le watchdog tuait des
#     runs parfaitement sains).
#
# Suivre :   tail -f claude-auto/runs/<dernier>/run.log
# État   :   cat claude-auto/runs/<dernier>/status
#            (RUNNING | WAITING_LIMIT | DONE | FAILED | FAILED_PERMANENT)
# Arrêter:   pkill -f 'claude-auto/(run|watchdog).sh'
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

PROGRESS="$REPO/claude-auto/parcours-progress.md"
PLAN="${PLAN_FILE:-$HOME/.claude/plans/create-a-new-tab-woolly-frost.md}"

read -r -d '' TASK <<EOF
Rédiger les parcours de lecture restants de la bibliothèque « Ma Bibliothèque »
(dépôt $REPO).

COMMENCE PAR LIRE, DANS CET ORDRE :
  1. $PROGRESS
     C'est la liste des parcours, le protocole détaillé et l'état d'avancement.
     Reprends au PREMIER parcours non coché. Il fait autorité : si un parcours y
     est coché, il est fait, ne le refais pas.
  2. $PLAN  (le plan validé, pour le contexte d'ensemble)
  3. Les deux parcours déjà écrits, qui servent de modèle de forme et de ton :
     app/src/lib/roadmaps/data/lire-avec-les-tout-petits.ts
     app/src/lib/roadmaps/data/classiques-de-l-enfance.ts

OBJECTIF FINAL, NON NÉGOCIABLE : chacun des 2029 livres de la base appartient à
au moins un parcours, et chaque livre porte une note qui explique sa présence.
Le test 'cd app && npm test' le vérifie : il doit finir au vert, y compris le
test de couverture. Le balayage final décrit en fin de $PROGRESS en fait partie.

MÉTHODE : un parcours à la fois, dans l'ordre du fichier de progression. Pour
chacun : requête SQL pour obtenir le périmètre exact (titres et auteurs copiés
tels quels), rédaction du fichier .ts, ajout au registre index.ts, 'npm test',
mise à jour de la case dans $PROGRESS, puis 'git commit'. Ne passe au parcours
suivant qu'une fois celui-ci commité — c'est ce qui rend la reprise possible
après une coupure.

QUALITÉ : les notes sont le cœur du travail. Chacune dit ce que CE livre apporte
à CE parcours et pourquoi à cette place. Pas de remplissage, pas de formule
recyclée, pas de superlatif. Français sobre. Le test refuse les notes trop
courtes ou dupliquées, mais il ne peut pas juger la platitude : c'est à toi.

NE JAMAIS inventer un livre absent de la base : la résolution se fait par nom
d'auteur + titre normalisés, une entrée fantaisiste est signalée en échec par le
test. Si une œuvre pivot manque vraiment, la procédure d'ajout au seed est
décrite dans $PROGRESS.
EOF

cd "$REPO" || exit 1

# MAX_LIMIT_WAITS=24 : jusqu'à ~24 fenêtres de 5 h, soit plusieurs jours
# d'attente cumulée si nécessaire, sans intervention.
MODEL="${MODEL:-opus}" \
STUCK_AFTER="${STUCK_AFTER:-2400}" \
CHECK_INTERVAL="${CHECK_INTERVAL:-120}" \
MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}" \
MAX_LIMIT_WAITS="${MAX_LIMIT_WAITS:-24}" \
MAX_API_RETRIES="${MAX_API_RETRIES:-4}" \
  exec "$SCRIPT_DIR/run.sh" "$TASK"
