#!/usr/bin/env bash
# =============================================================================
# Autonomous Claude Code runner
#
# HOW TO RUN:
#   ./run.sh "describe the task in plain language"
#
# Optional environment overrides:
#   MODEL=opus            ./run.sh "..."   # pick a model (else the default)
#   NO_WATCHDOG=1         ./run.sh "..."   # do not launch the watchdog
#   OUT_DIR=/some/path    ./run.sh "..."   # reuse an existing run directory
#   CHECK_INTERVAL=120    ./run.sh "..."   # watchdog poll seconds
#   STUCK_AFTER=600       ./run.sh "..."   # seconds with no log output = stuck
#   MAX_ATTEMPTS=5        ./run.sh "..."   # max relaunches before giving up
#
# WHAT IT DOES:
#   - Runs `claude` fully autonomously and non-interactively. It is granted ALL
#     permissions (--dangerously-skip-permissions): it acts as if you had
#     approved every prompt. It never waits for human input.
#   - Has access to all your skills and MCP servers (including the Playwright
#     MCP, so it can drive a browser / see a UI when needed).
#   - Streams readable logs to your terminal and to run.log.
#   - Makes Claude write report.md describing everything it did.
#   - Launches watchdog.sh in the background to auto-recover if the run stalls.
#   - Prints a "DONE" banner (and fires a desktop notification) when finished.
#
# Artifacts for each run live under:  ./runs/<timestamp>-<task-slug>/
# Follow a run live with:             tail -f ./runs/<...>/run.log
# =============================================================================
set -uo pipefail

TASK="${1:-}"
if [ -z "$TASK" ]; then
  echo "Usage: ./run.sh \"task description\"" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- resolve the run directory -----------------------------------------------
if [ -n "${OUT_DIR:-}" ]; then
  RUN_DIR="$OUT_DIR"
else
  SLUG=$(printf '%s' "$TASK" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -cs 'a-z0-9' '-' \
    | cut -c1-40 \
    | sed 's/^-//; s/-$//')
  [ -z "$SLUG" ] && SLUG="task"
  STAMP=$(date +%Y%m%d-%H%M%S)
  RUN_DIR="$SCRIPT_DIR/runs/$STAMP-$SLUG"
fi
mkdir -p "$RUN_DIR"

LOG="$RUN_DIR/run.log"
REPORT="$RUN_DIR/report.md"
STATUS="$RUN_DIR/status"            # RUNNING | DONE | FAILED | FAILED_PERMANENT
MAIN_PID_FILE="$RUN_DIR/main.pid"   # PID of the running claude process
TASK_FILE="$RUN_DIR/task.txt"
ATTEMPT_FILE="$RUN_DIR/attempt"

printf '%s' "$TASK" > "$TASK_FILE"
echo "RUNNING" > "$STATUS"
echo "${ATTEMPT:-1}" > "$ATTEMPT_FILE"

# --- desktop notification (best effort, macOS) -------------------------------
notify() {
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$1\" with title \"Claude auto-run\"" >/dev/null 2>&1 || true
  fi
}

# --- the wrapped prompt: task + standing autonomous instructions -------------
PROMPT=$(cat <<EOF
$TASK

--- STANDING INSTRUCTIONS (always apply) ---
- You are running fully autonomously and non-interactively. Make reasonable
  decisions on your own and keep going; NEVER ask a question or wait for human
  input. If something is ambiguous, pick the most sensible option and proceed.
- You have ALL permissions. Use whatever tools, skills, and MCP servers you need.
- If you must see or interact with a web UI, use the Playwright MCP
  (the mcp__playwright__* tools) to drive a real browser.
- When the task is complete, write a thorough Markdown report to:
    $REPORT
  The report MUST cover: the goal, every step you took, the commands/tools/skills
  used, files created or changed, problems you hit and how you solved them, and
  the final result with how you verified it.
- Writing $REPORT must be your FINAL action. Do not finish without it.
EOF
)

# --- launch the watchdog (singleton; skipped on relaunch) --------------------
if [ "${NO_WATCHDOG:-0}" != "1" ]; then
  if [ ! -f "$RUN_DIR/watchdog.pid" ] || ! kill -0 "$(cat "$RUN_DIR/watchdog.pid" 2>/dev/null)" 2>/dev/null; then
    nohup "$SCRIPT_DIR/watchdog.sh" "$RUN_DIR" >> "$RUN_DIR/watchdog.log" 2>&1 &
    echo "$!" > "$RUN_DIR/watchdog.pid"
  fi
fi

echo "============================================================"
echo " Autonomous run started"
echo "   task : $TASK"
echo "   dir  : $RUN_DIR"
echo "   log  : $LOG"
echo "   follow: tail -f \"$LOG\""
echo "============================================================"
echo

# --- best-effort pretty printer for stream-json ------------------------------
pretty() {
  if command -v jq >/dev/null 2>&1; then
    jq -rRC --unbuffered '
      (fromjson? // empty) as $e
      | if   ($e.type == "assistant") then
            ( $e.message.content[]?
              | if .type == "text" then .text
                elif .type == "tool_use" then "🔧 " + .name
                else empty end )
        elif ($e.type == "result") then
            "—— result: " + ($e.subtype // "done")
        else empty end
    ' 2>/dev/null
  else
    cat
  fi
}

# --- run claude headless -----------------------------------------------------
MODEL_ARG=()
[ -n "${MODEL:-}" ] && MODEL_ARG=(--model "$MODEL")

# Stream through a FIFO so the live display ends cleanly the moment claude exits
# (no lingering `tail -f`), while still capturing claude's own PID for the watchdog.
FIFO="$RUN_DIR/.stream"
rm -f "$FIFO"; mkfifo "$FIFO"

claude -p "$PROMPT" \
  --dangerously-skip-permissions \
  --verbose \
  --output-format stream-json \
  ${MODEL_ARG[@]+"${MODEL_ARG[@]}"} \
  > "$FIFO" 2>&1 &
CLAUDE_PID=$!
echo "$CLAUDE_PID" > "$MAIN_PID_FILE"

# foreground: tee raw output to the log and show a readable view; ends at EOF
# (when claude exits or is killed by the watchdog).
tee -a "$LOG" < "$FIFO" | pretty

wait "$CLAUDE_PID"
RC=$?
rm -f "$FIFO"

# --- outcome -----------------------------------------------------------------
if [ "$RC" -eq 0 ] && [ -s "$REPORT" ]; then
  echo "DONE" > "$STATUS"
  echo
  echo "============================================================"
  echo " ✅ DONE — task completed."
  echo "   report: $REPORT"
  echo "============================================================"
  notify "✅ Done: $TASK"
else
  echo "FAILED" > "$STATUS"
  echo
  echo "============================================================"
  echo " ⚠ Run ended without success (exit=$RC, report present=$([ -s "$REPORT" ] && echo yes || echo no))."
  echo "   The watchdog will diagnose, fix, and relaunch automatically."
  echo "   Follow: tail -f \"$LOG\""
  echo "============================================================"
fi
