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
#   STUCK_AFTER=2400      ./run.sh "..."   # seconds with no log output = stuck
#   MAX_ATTEMPTS=5        ./run.sh "..."   # max relaunches before giving up
#   MAX_API_RETRIES=4     ./run.sh "..."   # in-place retries on transient API errors
#   API_RETRY_DELAY=180   ./run.sh "..."   # base delay (s) between those retries
#   MAX_LIMIT_WAITS=24    ./run.sh "..."   # usage-limit waits (own budget, see below)
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
#   - On a 5h usage limit: parks the run (status WAITING_LIMIT), sleeps until the
#     window reopens (read from "resetsAt"), then resumes the same session. Those
#     waits have their OWN budget, so a job spanning several windows never eats
#     the retry budget reserved for network blips.
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

# Failure classification + limit-wait helpers, shared with watchdog.sh so the
# two cannot drift apart. See the comments there for why the patterns are
# shaped the way they are.
# shellcheck source=lib-classify.sh
source "$SCRIPT_DIR/lib-classify.sh"

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
- If you must see or interact with a web UI, drive a real browser with the npm
  playwright package from your scratchpad directory (the chromium build is
  already cached). The mcp__playwright__* tools are NOT connected in a headless
  run — do not wait on them.
- SUBAGENTS: this is a headless one-shot run — ending your turn TERMINATES the
  whole process and KILLS any still-running background tasks (their work is
  lost). Task-completion notifications can NEVER re-invoke you here. Therefore
  ALWAYS launch Agent-tool subagents with run_in_background: false. To run a
  batch concurrently, put the Agent calls as parallel tool uses in ONE message;
  the turn then blocks until all of them finish. Never end your turn while any
  subagent, background shell, or task is still running.
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

# Transient API/network drops ("Connection closed mid-response", ENOTFOUND,
# 429/529, overloaded) kill the headless CLI outright — the agent inside cannot
# retry an error that terminates its own process. Retry here in-place, resuming
# the same session so accumulated context is kept, instead of marking the run
# FAILED (which costs a full watchdog diagnose+relaunch cycle per blip).
MAX_API_RETRIES="${MAX_API_RETRIES:-4}"
API_RETRY_DELAY="${API_RETRY_DELAY:-180}"      # base seconds; scaled by retry number
# A 5h usage limit is not an incident, it is a scheduled wait: it gets its own
# budget so a job spanning several windows cannot exhaust the retry budget that
# exists for genuine network failures.
MAX_LIMIT_WAITS="${MAX_LIMIT_WAITS:-24}"

# Stream through a FIFO so the live display ends cleanly the moment claude exits
# (no lingering `tail -f`), while still capturing claude's own PID for the watchdog.
FIFO="$RUN_DIR/.stream"

# ANTHROPIC_API_KEY prend le pas sur le login claude.ai et facture au solde API.
# On l'écarte par défaut : les runs passent par l'abonnement, seul régime où la
# logique de fenêtre de 5 h ci-dessous a un sens. USE_API_KEY=1 pour l'inverse.
CLAUDE_ENV=(env -u ANTHROPIC_API_KEY)
[ "${USE_API_KEY:-0}" = "1" ] && CLAUDE_ENV=(env)

run_claude() {  # args are prepended claude flags/prompt, e.g.:  "$PROMPT"  or  --resume <id> "<prompt>"
  rm -f "$FIFO"; mkfifo "$FIFO"
  "${CLAUDE_ENV[@]}" claude -p "$@" \
    --dangerously-skip-permissions \
    --verbose \
    --output-format stream-json \
    ${MODEL_ARG[@]+"${MODEL_ARG[@]}"} \
    > "$FIFO" 2>&1 &
  CLAUDE_PID=$!
  echo "$CLAUDE_PID" > "$MAIN_PID_FILE"
  # foreground: tee raw output to the log and show a readable view; ends at EOF
  # (when claude exits or is killed by the watchdog).
  RUN_T0=$(date +%s)
  tee -a "$LOG" < "$FIFO" | pretty
  wait "$CLAUDE_PID"
  RC=$?
  RUN_SECS=$(( $(date +%s) - RUN_T0 ))
  rm -f "$FIFO"
}

RESUME_PROMPT="You were interrupted (transient API/network error, or a usage-limit window that has now reopened) and the session has been resumed. Whatever you were generating when it dropped was NOT applied — briefly re-check on-disk/git state, and if the task mentions a progress/checklist file, re-read it first to see exactly where you stopped. Then continue the task from where you left off. All standing instructions still apply (never wait for human input; launch Agent subagents with run_in_background: false; your FINAL action is writing the report)."

try=1          # budget « erreurs réseau »
limit_waits=0  # budget « limites d'usage », volontairement distinct
run_claude "$PROMPT"
while [ "$RC" -ne 0 ] && [ ! -s "$REPORT" ]; do
  # a failure after a long healthy stretch is a NEW incident — refill the
  # in-place retry budget instead of exhausting it across the whole run
  [ "${RUN_SECS:-0}" -ge 1800 ] && try=1
  case "$(classify_failure "$LOG")" in
    transient)
      [ "$try" -gt "$MAX_API_RETRIES" ] && break
      delay=$(( API_RETRY_DELAY * try ))
      echo "⚠ Transient API/network error (exit=$RC). Retry $try/$MAX_API_RETRIES in ${delay}s..."
      try=$(( try + 1 ))
      ;;
    limit)
      # 5h-window limits announce their reopening in the stream-json
      # ("resetsAt"). Sleep until then instead of burning retries — and
      # ultimately watchdog relaunch attempts — against a hard wall.
      limit_waits=$(( limit_waits + 1 ))
      if [ "$limit_waits" -gt "$MAX_LIMIT_WAITS" ]; then
        echo "⛔ $MAX_LIMIT_WAITS usage-limit waits already spent — giving up."
        break
      fi
      delay=$(limit_sleep_seconds "$LOG")
      # Distinct status: the watchdog must WAIT here, not diagnose and relaunch —
      # a diagnose pass would hit the very same wall and waste an attempt.
      echo "WAITING_LIMIT" > "$STATUS"
      resume_at=$(fmt_time "$(( $(date +%s) + delay ))")
      echo "⏳ Usage limit reached (wait $limit_waits/$MAX_LIMIT_WAITS). Resuming around $resume_at (in ${delay}s)..."
      notify "⏳ Usage limit reached — resuming around $resume_at"
      ;;
    fatal)
      echo "⛔ Échec non récupérable : $(fatal_reason "$LOG")"
      notify "⛔ Run arrêté : $(fatal_reason "$LOG")"
      echo "FAILED_PERMANENT" > "$STATUS"
      break
      ;;
    *)
      break  # unrecognized failure — leave it to the watchdog to diagnose
      ;;
  esac
  sleep_touching_log "$delay" "$LOG"
  echo "RUNNING" > "$STATUS"
  SESS=$(grep -o '"session_id":"[^"]*"' "$LOG" 2>/dev/null | tail -1 | cut -d'"' -f4)
  if [ -n "$SESS" ]; then
    echo "↻ Resuming session $SESS..."
    run_claude --resume "$SESS" "$RESUME_PROMPT"
  else
    run_claude "$PROMPT"
  fi
done

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
