#!/usr/bin/env bash
# Tests for lib-classify.sh. Run: ./test-classify.sh
# Fixtures are copied from real stream-json seen in ./runs/*/run.log.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=lib-classify.sh
source ./lib-classify.sh

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

check() { # check <name> <expected> <log-content>
  printf '%s' "$3" > "$TMP/log"
  got=$(classify_failure "$TMP/log")
  if [ "$got" = "$2" ]; then
    pass=$(( pass + 1 )); printf '  ok   %-46s -> %s\n' "$1" "$got"
  else
    fail=$(( fail + 1 )); printf '  FAIL %-46s -> %s (attendu %s)\n' "$1" "$got" "$2"
  fi
}

HEALTHY='{"type":"assistant","message":{"content":[{"type":"text","text":"Je continue."}]},"rate_limit_info":{"status":"allowed","unifiedRateLimitFallbackAvailable":false,"resetsAt":1784409600,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false}}'

REJECTED='{"type":"assistant","message":{"content":[]},"rate_limit_info":{"status":"rejected","unifiedRateLimitFallbackAvailable":false,"resetsAt":1784430000,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false}}'

# The agent reading its own memory file: prose about limits is not a limit.
MEMORY='{"type":"user","message":{"content":[{"type":"tool_result","content":"1\t- [Autonomous runs hit usage limits](autonomous-runs-hit-usage-limits.md) - 5h session limits kill long runs; resume = commit uncommitted work + spaced retries"}]}}'

echo "classify_failure :"
check "événement sain (overageStatus rejected)"      unknown   "$HEALTHY"
check "limite réelle (rate_limit_info rejected)"     limit     "$REJECTED"
check "fichier mémoire évoquant les limites"         unknown   "$MEMORY"
check "sain + mémoire (aucun échec réel)"            unknown   "$HEALTHY$MEMORY"
check "coupure réseau"                               transient 'Error: Connection closed mid-response'
check "ENOTFOUND"                                    transient '{"error":"getaddrinfo ENOTFOUND api.anthropic.com"}'
check "529 surcharge serveur"                        transient '{"type":"result","subtype":"error","api_error_status":529}'
check "overloaded_error"                             transient '{"error":{"type":"overloaded_error"}}'
check "429"                                          limit     '{"type":"result","api_error_status":429}'
check "message CLI en clair"                         limit     'Claude usage limit reached. Your limit will reset at 3pm.'
check "erreur inconnue"                              unknown   'TypeError: undefined is not a function'
check "log vide"                                     unknown   ''
# A blip during an exhausted window: transient wins, the limit is caught next round.
check "réseau + limite (réseau prioritaire)"         transient "$REJECTED"$'\n''socket hang up'

echo
echo "limit_reset_epoch / limit_sleep_seconds :"
printf '%s' "$REJECTED" > "$TMP/log"
got=$(limit_reset_epoch "$TMP/log")
if [ "$got" = "1784430000" ]; then
  pass=$(( pass + 1 )); echo "  ok   resetsAt extrait                              -> $got"
else
  fail=$(( fail + 1 )); echo "  FAIL resetsAt extrait                              -> $got (attendu 1784430000)"
fi

# resetsAt in the past (old log) must fall back to the 15 min floor, not a negative sleep.
printf '%s' '{"rate_limit_info":{"status":"rejected","resetsAt":1000000000}}' > "$TMP/log"
got=$(limit_sleep_seconds "$TMP/log")
if [ "$got" = "900" ]; then
  pass=$(( pass + 1 )); echo "  ok   resetsAt passé -> plancher 900s              -> $got"
else
  fail=$(( fail + 1 )); echo "  FAIL resetsAt passé -> plancher 900s              -> $got (attendu 900)"
fi

# A window reopening in ~2h must produce a sleep close to 2h, not the floor.
future=$(( $(date +%s) + 7200 ))
printf '%s' "{\"rate_limit_info\":{\"status\":\"rejected\",\"resetsAt\":$future}}" > "$TMP/log"
got=$(limit_sleep_seconds "$TMP/log")
if [ "$got" -ge 7200 ] && [ "$got" -le 7300 ]; then
  pass=$(( pass + 1 )); echo "  ok   fenêtre dans 2h -> sommeil ~7290s            -> $got"
else
  fail=$(( fail + 1 )); echo "  FAIL fenêtre dans 2h                              -> $got (attendu ~7290)"
fi

# Absurd timestamp must not park the run for days.
printf '%s' '{"rate_limit_info":{"status":"rejected","resetsAt":99999999999}}' > "$TMP/log"
got=$(limit_sleep_seconds "$TMP/log")
if [ "$got" = "900" ]; then
  pass=$(( pass + 1 )); echo "  ok   resetsAt aberrant -> plancher 900s           -> $got"
else
  fail=$(( fail + 1 )); echo "  FAIL resetsAt aberrant                            -> $got (attendu 900)"
fi

# Le heredoc du prompt dans run.sh n'est volontairement PAS quoté (il interpole
# $REPORT). Conséquence : un accent grave ou un $(...) dans le texte y serait
# exécuté au lancement. Déjà arrivé une fois — d'où ce garde-fou.
echo
echo "run.sh — sûreté du heredoc de prompt :"
prompt_block=$(awk '/^PROMPT=\$\(cat <<EOF$/{f=1;next} f&&/^EOF$/{exit} f' ../claude-auto/run.sh 2>/dev/null \
  || awk '/^PROMPT=\$\(cat <<EOF$/{f=1;next} f&&/^EOF$/{exit} f' ./run.sh)
if printf '%s' "$prompt_block" | grep -q '`'; then
  fail=$(( fail + 1 )); echo "  FAIL accent grave dans le prompt (serait exécuté)"
elif printf '%s' "$prompt_block" | grep -q '\$('; then
  fail=$(( fail + 1 )); echo "  FAIL substitution \$(...) dans le prompt"
elif [ -z "$prompt_block" ]; then
  fail=$(( fail + 1 )); echo "  FAIL bloc de prompt introuvable dans run.sh"
else
  pass=$(( pass + 1 )); echo "  ok   aucun accent grave ni \$(...) dans le prompt"
fi

echo
echo "$pass réussis, $fail échoués"
[ "$fail" -eq 0 ]
