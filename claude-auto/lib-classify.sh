#!/usr/bin/env bash
# =============================================================================
# Shared failure classification for run.sh and watchdog.sh.
#
#   source lib-classify.sh
#   classify_failure "$LOG"     -> fatal | transient | limit | unknown
#   limit_reset_epoch "$LOG"    -> epoch seconds, or empty
#
# Kept in one file because the two scripts MUST agree: run.sh decides whether to
# sleep in place, the watchdog decides whether to wait or to spend an attempt on
# a diagnose pass. If they disagree, a run either stalls or burns its budget.
#
# WHY THE PATTERNS LOOK LIKE THIS (checked against real logs in ./runs):
#
#   A healthy stream-json event looks like
#     "rate_limit_info":{"status":"allowed","resetsAt":...,"rateLimitType":
#      "five_hour","overageStatus":"rejected","overageDisabledReason":
#      "org_level_disabled","isUsingOverage":false}
#
#   Note "overageStatus":"rejected" — present on EVERY event, healthy ones
#   included, because overage billing is disabled at org level. Matching a bare
#   status":"rejected" (case-insensitively) therefore matches ALL runs. That is
#   why the limit pattern below anchors on the literal "rate_limit_info":{ prefix
#   and never on a naked status field.
#
#   Likewise, prose like "usage limit" appears in ordinary tool output (an agent
#   reading a file about usage limits is not a usage limit), so the prose
#   patterns require the full "…limit reached" wording.
#
#   529 / overloaded_error is server overload, not a quota wall: it belongs to
#   the transient family (short escalating backoff), not to the 5h wait.
# =============================================================================

# Conditions qui ne se répareront pas d'elles-mêmes : réessayer les aggrave
# (20 tentatives brûlées en 4 minutes, vécu). Elles arrêtent le run tout de suite
# avec un motif lisible.
#   « Credit balance is too low » : la facturation API, PAS une fenêtre de 5 h.
#   Une clé API n'a pas de reset horaire — attendre ne sert à rien.
FATAL_RE='credit balance is too low|billing_error|invalid_api_key|authentication_error|"type":"permission_error"|invalid x-api-key'

# Authoritative structured signal + the CLI's own error wordings.
# Safe under grep -i: every alternative carries a distinctive literal prefix.
LIMIT_RE='"rate_limit_info":[{]"status":"rejected"|usage limit reached|session limit reached|5-hour limit reached|rate_limit_error|api_error_status":429|API Error: 429|"error":[{]"type":"rate_limit'

# Hard connection failures that kill the CLI outright, plus server overload.
TRANSIENT_RE='connection (closed|error|refused|reset)|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|network error|overloaded_error|api_error_status":529|API Error: 529'

# Transient is tested first on purpose: its patterns are unambiguous, and a real
# usage limit that co-occurs with a blip is still caught on the next iteration.
classify_failure() {
  local tail_txt
  tail_txt=$(tail -c 4000 "$1" 2>/dev/null)
  # Le fatal passe en premier : aucune des autres classes ne doit le masquer.
  if printf '%s' "$tail_txt" | grep -qiE "$FATAL_RE"; then
    echo fatal
  elif printf '%s' "$tail_txt" | grep -qiE "$TRANSIENT_RE"; then
    echo transient
  elif printf '%s' "$tail_txt" | grep -qiE "$LIMIT_RE"; then
    echo limit
  else
    echo unknown
  fi
}

# Les fenêtres annoncent leur réouverture par "resetsAt": <epoch>.
#
# ATTENTION : il y en a PLUSIEURS. Un événement porte un objet unifiedWindows
# avec au moins five_hour et une fenêtre plus longue (hebdomadaire). Prendre la
# dernière valeur rencontrée — ce que faisait cette fonction — revenait à viser
# la fenêtre lointaine et à dormir des heures alors que celle de 5 h rouvrait
# dans quelques minutes. On retient donc la PLUS PROCHE encore à venir : c'est
# la première contrainte qui se lève, et donc le bon réveil.
limit_reset_epoch() {
  local maintenant
  maintenant=$(date +%s)
  tail -c 4000 "$1" 2>/dev/null \
    | grep -o '"resetsAt":[0-9]*' | cut -d: -f2 \
    | awk -v now="$maintenant" '$1 > now' \
    | sort -n | head -1
}

# Seconds to sleep before retrying a usage limit: until the window reopens (+90s
# of margin), else a blind 15 min. Clamped to 6h so a bogus timestamp cannot
# park a run forever.
limit_sleep_seconds() {
  local reset_at wait_s
  reset_at=$(limit_reset_epoch "$1")
  # Sans horaire de réouverture, on ne peut que réessayer à l'aveugle.
  [ -z "$reset_at" ] && { echo 900; return; }
  wait_s=$(( reset_at - $(date +%s) + 90 ))
  # Quand l'horaire est connu, il fait foi : le plancher de 15 min ne doit pas
  # faire dormir plus longtemps qu'annoncé. Bornes : 60 s pour ne pas boucler,
  # 6 h pour qu'un horodatage aberrant ne gare pas le run pendant des jours.
  [ "$wait_s" -lt 60 ] && wait_s=60
  [ "$wait_s" -gt 21600 ] && wait_s=900
  echo "$wait_s"
}

# Sleep in slices, touching the log each time: a limit wait routinely exceeds
# STUCK_AFTER, and a stale mtime would make the watchdog kill a healthy wait.
sleep_touching_log() {
  local delay="$1" log="$2" slept=0 chunk
  while [ "$slept" -lt "$delay" ]; do
    chunk=$(( delay - slept )); [ "$chunk" -gt 300 ] && chunk=300
    sleep "$chunk"; slept=$(( slept + chunk ))
    touch "$log"
  done
}

# portable "epoch seconds -> HH:MM" (BSD date, then GNU date)
fmt_time() {
  date -r "$1" +%H:%M 2>/dev/null || date -d "@$1" +%H:%M 2>/dev/null || echo "?"
}

# Motif court à afficher pour un échec fatal.
fatal_reason() {
  local t
  t=$(tail -c 4000 "$1" 2>/dev/null)
  if printf '%s' "$t" | grep -qi 'credit balance is too low'; then
    echo "solde de crédit API épuisé (ANTHROPIC_API_KEY). Ce n'est pas une limite de 5 h : rien ne se réinitialisera tout seul."
  elif printf '%s' "$t" | grep -qiE 'invalid_api_key|invalid x-api-key|authentication_error'; then
    echo "authentification refusée (clé API invalide)."
  else
    echo "erreur non récupérable (voir la fin du log)."
  fi
}
