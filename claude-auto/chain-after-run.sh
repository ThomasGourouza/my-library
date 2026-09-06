#!/usr/bin/env bash
# =============================================================================
# Enchaîne un run après un autre, sans jamais les faire tourner en parallèle.
#
#   ./chain-after-run.sh <répertoire-du-run-à-attendre> <lanceur-suivant>
#
# Exemple :
#   nohup ./chain-after-run.sh \
#     claude-auto/runs/20260906-142958-r-viser-les-54-parcours \
#     ./claude-auto/run-ameliorations.sh > /tmp/chain.log 2>&1 &
#
# POURQUOI UN RÉPERTOIRE EN ARGUMENT, ET PAS « LE DERNIER RUN » :
#   le lanceur suivant crée son propre répertoire de run, qui devient aussitôt
#   le plus récent. Un script qui suivrait « le dernier » se mettrait alors à
#   se surveiller lui-même et ne se terminerait jamais. La cible est donc
#   épinglée au démarrage.
#
# CE QU'IL FAIT
#   - attend que le run surveillé passe à DONE, puis lance le suivant ;
#   - n'enchaîne PAS si le run se termine en FAILED_PERMANENT : l'état du dépôt
#     est alors incertain, et lancer une tâche de grande ampleur par-dessus
#     empilerait les problèmes. Il le dit et s'arrête ;
#   - traite WAITING_LIMIT comme une attente normale : le run dort, il repartira.
#
# Journal : claude-auto/chain.log
# Arrêter : pkill -f claude-auto/chain-after-run.sh
# =============================================================================
set -uo pipefail

CIBLE="${1:?Usage: chain-after-run.sh <run-dir> <lanceur-suivant>}"
SUIVANT="${2:?Usage: chain-after-run.sh <run-dir> <lanceur-suivant>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
JOURNAL="$SCRIPT_DIR/chain.log"
INTERVALLE="${CHAIN_INTERVAL:-120}"

# Chemins absolus : le script tourne détaché, sans hypothèse sur le cwd.
case "$CIBLE" in /*) ;; *) CIBLE="$REPO/$CIBLE" ;; esac
case "$SUIVANT" in /*) ;; *) SUIVANT="$REPO/${SUIVANT#./}" ;; esac

dire() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$JOURNAL"; }

notifier() {
  command -v osascript >/dev/null 2>&1 &&
    osascript -e "display notification \"$1\" with title \"Claude auto-run\"" >/dev/null 2>&1 || true
}

[ -d "$CIBLE" ] || { dire "⛔ répertoire de run introuvable : $CIBLE"; exit 2; }
[ -x "$SUIVANT" ] || { dire "⛔ lanceur non exécutable : $SUIVANT"; exit 2; }

dire "👁  chaînage armé — attend $(basename "$CIBLE"), puis lancera $(basename "$SUIVANT")"

precedent=""
while true; do
  statut=$(cat "$CIBLE/status" 2>/dev/null || echo INTROUVABLE)
  [ "$statut" != "$precedent" ] && { dire "   statut : $statut"; precedent="$statut"; }

  case "$statut" in
    DONE)
      dire "✅ run surveillé terminé — lancement de $(basename "$SUIVANT")"
      notifier "Run terminé, enchaînement automatique"
      cd "$REPO" || exit 1
      # Laisse le watchdog du run précédent se retirer avant de démarrer.
      sleep 10
      nohup "$SUIVANT" >> "$SCRIPT_DIR/chain-next.log" 2>&1 &
      dire "🚀 lancé (pid $!) — journal : claude-auto/chain-next.log"
      exit 0
      ;;
    FAILED_PERMANENT)
      dire "⛔ run surveillé en échec définitif — enchaînement ANNULÉ."
      dire "   L'état du dépôt est incertain ; relancer manuellement après examen :"
      dire "   $SUIVANT"
      notifier "⛔ Run en échec : enchaînement annulé"
      exit 1
      ;;
    INTROUVABLE)
      dire "⛔ fichier de statut disparu — enchaînement annulé."
      exit 1
      ;;
  esac

  # RUNNING, WAITING_LIMIT, FAILED : le run vit encore ou dort. On attend.
  # Un run réellement mort est détecté par l'absence de processus.
  if ! pgrep -f "claude-auto/(run|watchdog)\.sh" >/dev/null 2>&1; then
    dire "⛔ plus aucun processus de run alors que le statut est '$statut'."
    dire "   Arrêt sans conclusion : enchaînement annulé."
    notifier "⛔ Run interrompu : enchaînement annulé"
    exit 1
  fi

  sleep "$INTERVALLE"
done
