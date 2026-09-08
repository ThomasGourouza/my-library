#!/usr/bin/env bash
# =============================================================================
# Amélioration générale de l'application, en autonomie totale.
#
#   ./run-ameliorations.sh
#
# Lancé automatiquement par chain-after-run.sh à la fin du run de révision des
# parcours — jamais en parallèle.
#
# Tom est absent et ne répondra à aucune question. Le run doit donc trancher
# lui-même chaque arbitrage et consigner ses décisions, sans jamais attendre.
#
# Suivre :   tail -f claude-auto/runs/<dernier>/run.log
# Décisions: cat claude-auto/ameliorations-plan.md
# Avancement: cat claude-auto/ameliorations-progress.md
# Arrêter:   pkill -f 'claude-auto/(run|watchdog).sh'
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

PLAN="$REPO/claude-auto/ameliorations-plan.md"
PROGRESS="$REPO/claude-auto/ameliorations-progress.md"

read -r -d '' TASK <<EOF
Améliorer l'application « Ma Bibliothèque » (dépôt $REPO, application Next.js
dans app/) sur tous les plans qui te paraissent améliorables.

La demande, dans les mots de Tom :

  « Que reste-t-il à améliorer ? Sur tous les plans, UI/UX, fonctionnalités et
  features, livres et données, et d'autres plans encore qui te semblent
  améliorables. Améliore cette app de la meilleure des façons sur tous les plans
  qui te semblent améliorables. Ajoute des features qui te paraissent
  importantes et utiles et fais tout ce que tu veux d'autre pour améliorer
  l'app (sauf si ça engage des actions ou des paiements de ma part). Fais tout
  ce que tu peux faire complètement de façon autonome. »

TOM EST ABSENT. Il ne répondra à aucune question. Tu ne peux donc jamais
attendre, ni demander un arbitrage, ni t'arrêter faute de réponse. Chaque fois
qu'une question se pose, tranche toi-même en choisissant l'option la plus
défendable, et consigne la question ET ta réponse dans $PLAN. Ce fichier est
ta trace de décision : à son retour, Tom doit pouvoir lire ce que tu as décidé
en son absence et pourquoi.

DÉROULEMENT

1. BRANCHE. Commence par créer une branche depuis l'état courant :
   git checkout -b ameliorations-autonomes
   Tout le travail s'y fait. Ne touche jamais à master.

2. AUDIT, puis PLAN. Avant d'écrire du code, examine l'application et dresse un
   plan écrit dans $PLAN. Couvre au minimum : UI/UX, fonctionnalités
   manquantes, qualité des données de la bibliothèque, accessibilité,
   performance, qualité du code et des tests, documentation. Classe ce que tu
   trouves par valeur réelle pour l'usage, pas par facilité. Le plan liste aussi
   ce que tu as décidé de NE PAS faire, et pourquoi.

3. PROGRESSION. Crée $PROGRESS : la liste des chantiers retenus, avec une case
   à cocher chacun. Tiens-la à jour. C'est ce qui permet de reprendre après une
   coupure ou une limite d'usage.

4. EXÉCUTION. Un chantier à la fois. Après chacun : vérifications ci-dessous,
   case cochée, commit. Ne passe au suivant qu'une fois commité.

CE QUI EST INTERDIT, SANS EXCEPTION

- Toute action qui engage Tom : achat, abonnement, création de compte, service
  externe payant, déploiement, envoi de courriel ou de message, publication.
- Toute dépendance nécessitant une clé d'API ou un paiement.
- Détruire des données : data/library.json EST la bibliothèque, versionnée et
  écrite en direct par l'appli. Analyses, biographies, état de lecture et
  listes y sont. On ne la régénère pas, on ne l'écrase pas : on la modifie via
  l'appli, et on commit le résultat.
- Modifier master, réécrire l'historique, forcer un push.
- Casser l'existant : le tableau des livres, les parcours, les priorités et la
  case Lu fonctionnent et sont testés. Une amélioration qui régresse n'en est
  pas une.

VÉRIFICATION, À CHAQUE CHANTIER

  cd app && npm test && npx tsc --noEmit && npm run build

Le lint a 3 problèmes préexistants (dont une erreur dans main-nav.tsx) : ne pas
les aggraver, et les corriger est en soi une amélioration légitime. Pour toute
modification visible, vérifie le rendu réel avec le playwright npm depuis ton
scratchpad, en thème clair ET sombre — les captures sont la seule preuve qu'une
amélioration d'interface en est une.

CONTEXTE UTILE POUR NE PAS PERDRE DE TEMPS

- app/AGENTS.md impose de lire node_modules/next/dist/docs/ avant d'écrire du
  code : cette version de Next a des ruptures par rapport à ce que tu crois
  savoir.
- La base compte ~2044 livres et 1069 auteurs. Elle contient des doublons
  connus non traités : Gilgamesh, Beowulf et Tristan existent en double sous
  des auteurs anonymes différents. Les fusionner proprement est un chantier de
  données légitime — la méthode est dans le commit 38273e1.
- Le tableau des livres a 13 colonnes et aucun sélecteur de colonnes ; il rend
  2044 lignes sans virtualisation.
- La fonctionnalité « Analyse Claude » existe et n'a été utilisée que sur
  3 livres.
- Aucun écran ne permet de créer ou modifier un parcours.
- getFilterOptions() renvoie des thèmes que plus personne n'utilise.

Ce ne sont que des pistes constatées, pas une liste de courses : ton audit doit
aller plus loin, et tu es libre d'ignorer celles qui te paraissent peu utiles.

FIN. Quand tu estimes le travail abouti, écris le rapport final demandé par les
instructions permanentes. Il doit dire ce qui a été amélioré, comment tu l'as
vérifié, quelles décisions tu as prises seul, et ce que tu recommandes à Tom de
regarder en premier à son retour.
EOF

cd "$REPO" || exit 1

MODEL="${MODEL:-opus}" \
STUCK_AFTER="${STUCK_AFTER:-2400}" \
CHECK_INTERVAL="${CHECK_INTERVAL:-120}" \
MAX_ATTEMPTS="${MAX_ATTEMPTS:-20}" \
MAX_LIMIT_WAITS="${MAX_LIMIT_WAITS:-24}" \
MAX_API_RETRIES="${MAX_API_RETRIES:-4}" \
  exec "$SCRIPT_DIR/run.sh" "$TASK"
