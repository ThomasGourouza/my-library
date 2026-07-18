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
#   STUCK_AFTER=600       # no new log output for this long = considered stuck
#   MAX_ATTEMPTS=5        # max relaunches before giving up permanently
#
# WHAT IT DOES (pure automation, nothing interactive):
#   Every CHECK_INTERVAL seconds it inspects the run:
#     - status == DONE              -> notify, print "DONE", exit 0.
#     - attempts exhausted          -> mark FAILED_PERMANENT, notify, exit 1.
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

CHECK_INTERVAL="${CHECK_INTERVAL:-120}"
STUCK_AFTER="${STUCK_AFTER:-600}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-5}"

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
  claude -p "$FIX_PROMPT" \
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
