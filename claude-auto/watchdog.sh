#!/usr/bin/env bash
# =============================================================================
# Watchdog / supervisor for the autonomous Claude runner.
#
# It is auto-launched by run.sh in the background. You normally do NOT run it
# yourself, but you can:
#   ./watchdog.sh /absolute/path/to/runs/<run-dir>
#
# Optional environment overrides (same names as run.sh):
#   CHECK_INTERVAL=120    # how often to poll (seconds)
#   STUCK_AFTER=2400      # no new log output for this long = considered stuck
#                         # NOTE: keep this LARGE. Subagents that write one big
#                         # file (e.g. a 150KB cleaned chunk) emit NOTHING to
#                         # the stream-json log for the whole response — easily
#                         # 10-20+ min of legitimate silence. 600s kills
#                         # healthy runs mid-write.
#   MAX_ATTEMPTS=5        # max relaunches before giving up permanently
#   MAX_LIMIT_WAITS=24    # max 5h-usage-limit waits (own budget, see below)
#
# WHAT IT DOES (pure automation, nothing interactive):
#   Every CHECK_INTERVAL seconds it inspects the run:
#     - status == DONE              -> notify, print "DONE", exit 0.
#     - attempts exhausted          -> mark FAILED_PERMANENT, notify, exit 1.
#     - status == WAITING_LIMIT     -> run.sh is already sleeping until the usage
#                                      window reopens; leave it alone.
#     - trouble caused by a 5h USAGE LIMIT -> wait until the window reopens, then
#       relaunch WITHOUT consuming an attempt and WITHOUT the diagnose pass. A
#       usage limit is not a bug: diagnosing it would hit the same wall and burn
#       an attempt for nothing. This is what used to force manual restarts.
#     - status == FAILED, OR running but run.log has been silent for STUCK_AFTER
#       seconds (i.e. stuck):
#         1. kill the stuck claude process,
#         2. run a headless `claude -p` pass that reads the log, DIAGNOSES the
#            blocker and APPLIES a fix (env/deps/config/locks/state),
#         3. relaunch run.sh in the SAME run directory (no second watchdog),
#         4. keep watching.
#   Repeats until the run completes successfully or attempts run out.
# =============================================================================
set -uo pipefail

RUN_DIR="${1:?Usage: watchdog.sh <run-dir>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Shared with run.sh so both agree on what a usage limit actually looks like.
# shellcheck source=lib-classify.sh
source "$SCRIPT_DIR/lib-classify.sh"

CHECK_INTERVAL="${CHECK_INTERVAL:-120}"
STUCK_AFTER="${STUCK_AFTER:-2400}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-5}"
MAX_LIMIT_WAITS="${MAX_LIMIT_WAITS:-24}"

LOG="$RUN_DIR/run.log"
STATUS="$RUN_DIR/status"
MAIN_PID_FILE="$RUN_DIR/main.pid"
ATTEMPT_FILE="$RUN_DIR/attempt"
TASK=$(cat "$RUN_DIR/task.txt" 2>/dev/null || echo "")

notify() {
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$1\" with title \"Claude auto-run\"" >/dev/null 2>&1 || true
  fi
  echo "🔔 $1"
}

# portable "last modified" epoch seconds (macOS then Linux)
mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

read_status()  { cat "$STATUS"      2>/dev/null || echo "UNKNOWN"; }
read_attempt() { cat "$ATTEMPT_FILE" 2>/dev/null || echo "1"; }

limit_waits=$(cat "$RUN_DIR/limit_waits" 2>/dev/null || echo 0)

echo "👁  Watchdog started for: $RUN_DIR  (interval=${CHECK_INTERVAL}s, stuck_after=${STUCK_AFTER}s, max_attempts=${MAX_ATTEMPTS})"

while true; do
  sleep "$CHECK_INTERVAL"

  st=$(read_status)

  if [ "$st" = "DONE" ]; then
    notify "✅ Task completed: $TASK"
    echo "✅ DONE — watchdog exiting."
    exit 0
  fi

  if [ "$st" = "FAILED_PERMANENT" ]; then
    echo "⛔ Already marked FAILED_PERMANENT — watchdog exiting."
    exit 1
  fi

  # run.sh handles the wait itself while it is still alive: stay out of its way.
  if [ "$st" = "WAITING_LIMIT" ]; then
    continue
  fi

  attempt=$(read_attempt)

  # --- decide whether the run is in trouble ---------------------------------
  trouble=0
  reason=""
  if [ "$st" = "FAILED" ]; then
    trouble=1
    reason="run reported FAILED"
  elif [ "$st" = "RUNNING" ]; then
    now=$(date +%s)
    last=$(mtime "$LOG")
    idle=$(( now - last ))
    if [ "$idle" -ge "$STUCK_AFTER" ]; then
      trouble=1
      reason="no log output for ${idle}s (>= ${STUCK_AFTER}s)"
    fi
  fi

  [ "$trouble" -eq 0 ] && continue

  # --- un échec fatal ne se répare pas en relançant --------------------------
  if [ "$(classify_failure "$LOG")" = "fatal" ]; then
    echo "FAILED_PERMANENT" > "$STATUS"
    notify "⛔ Run arrêté : $(fatal_reason "$LOG")"
    echo "⛔ Échec non récupérable : $(fatal_reason "$LOG")"
    exit 1
  fi

  # --- a usage limit is a wait, not a failure -------------------------------
  # Relaunch when the window reopens, without spending an attempt and without
  # the diagnose pass (which would hit the very same wall).
  if [ "$(classify_failure "$LOG")" = "limit" ]; then
    limit_waits=$(( limit_waits + 1 ))
    if [ "$limit_waits" -gt "$MAX_LIMIT_WAITS" ]; then
      echo "FAILED_PERMANENT" > "$STATUS"
      notify "⛔ Giving up after $MAX_LIMIT_WAITS usage-limit waits: $TASK"
      exit 1
    fi

    pid=$(cat "$MAIN_PID_FILE" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true; sleep 5; kill -9 "$pid" 2>/dev/null || true
    fi

    delay=$(limit_sleep_seconds "$LOG")

    echo "WAITING_LIMIT" > "$STATUS"
    echo "$limit_waits" > "$RUN_DIR/limit_waits"
    resume_at=$(fmt_time "$(( $(date +%s) + delay ))")
    notify "⏳ Usage limit reached — auto-resuming around $resume_at"
    echo "⏳ Usage limit (wait $limit_waits/$MAX_LIMIT_WAITS). Sleeping ${delay}s, resuming around $resume_at."

    sleep_touching_log "$delay" "$LOG"

    echo "🔁 Window reopened — relaunching (attempt $attempt, unchanged)..."
    OUT_DIR="$RUN_DIR" NO_WATCHDOG=1 ATTEMPT="$attempt" \
      nohup "$SCRIPT_DIR/run.sh" "$TASK" >> "$RUN_DIR/run.terminal.log" 2>&1 &
    sleep 5
    continue
  fi

  # --- give up if we've tried too many times --------------------------------
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "FAILED_PERMANENT" > "$STATUS"
    notify "⛔ Giving up after $attempt attempts: $TASK"
    echo "⛔ Max attempts ($MAX_ATTEMPTS) reached — watchdog exiting."
    exit 1
  fi

  echo "⚠  Trouble detected ($reason). Intervening — attempt $attempt."

  # --- 1. kill the stuck process --------------------------------------------
  pid=$(cat "$MAIN_PID_FILE" 2>/dev/null || echo "")
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "   killing stuck process $pid..."
    kill "$pid" 2>/dev/null || true
    sleep 5
    kill -9 "$pid" 2>/dev/null || true
  fi

  # --- 2. diagnose + fix with a headless claude pass ------------------------
  echo "🔧 Diagnosing and fixing with Claude..."
  FIX_PROMPT=$(cat <<EOF
An unattended autonomous task got stuck or failed and was just killed.

Original task: $TASK
Project directory: $SCRIPT_DIR
The run log is at: $LOG  (read its tail to see what happened).

Your job: figure out WHY it stalled or failed, then APPLY a concrete fix so the
next attempt can make progress — e.g. install a missing dependency, fix a broken
config, clear a stale lock or leftover process, repair corrupted state, adjust
the environment. Do NOT redo the whole task; only unblock it.

You are fully autonomous and have ALL permissions. Never ask questions.
Append a short note of what you found and fixed to: $RUN_DIR/fixes.md
EOF
)
  env -u ANTHROPIC_API_KEY claude -p "$FIX_PROMPT" \
    --dangerously-skip-permissions \
    --verbose \
    --output-format stream-json \
    >> "$RUN_DIR/fix.log" 2>&1 || true

  # --- 3. relaunch the main run (same dir, no second watchdog) --------------
  next=$(( attempt + 1 ))
  echo "🔁 Relaunching main run (attempt $next)..."
  OUT_DIR="$RUN_DIR" NO_WATCHDOG=1 ATTEMPT="$next" \
    nohup "$SCRIPT_DIR/run.sh" "$TASK" >> "$RUN_DIR/run.terminal.log" 2>&1 &

  # give the relaunched run a moment to reset status/log before next poll
  sleep 5
done
