#!/usr/bin/env bash
# =============================================================================
# Shared failure classification for run.sh and watchdog.sh.
#
#   source lib-classify.sh
#   classify_failure "$LOG"     -> transient | limit | unknown
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
  if printf '%s' "$tail_txt" | grep -qiE "$TRANSIENT_RE"; then
    echo transient
  elif printf '%s' "$tail_txt" | grep -qiE "$LIMIT_RE"; then
    echo limit
  else
    echo unknown
  fi
}

# 5h windows announce their reopening as "resetsAt": <epoch seconds>.
limit_reset_epoch() {
  tail -c 4000 "$1" 2>/dev/null | grep -o '"resetsAt":[0-9]*' | tail -1 | cut -d: -f2
}

# Seconds to sleep before retrying a usage limit: until the window reopens (+90s
# of margin), else a blind 15 min. Clamped to 6h so a bogus timestamp cannot
# park a run forever.
limit_sleep_seconds() {
  local reset_at wait_s delay=900
  reset_at=$(limit_reset_epoch "$1")
  if [ -n "$reset_at" ]; then
    wait_s=$(( reset_at - $(date +%s) + 90 ))
    if [ "$wait_s" -gt "$delay" ] && [ "$wait_s" -le 21600 ]; then delay="$wait_s"; fi
  fi
  echo "$delay"
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
