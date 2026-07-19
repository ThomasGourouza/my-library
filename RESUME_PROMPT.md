# Resume prompt — paste this to a fresh Claude Code session

Copy everything in the block below into a new Claude Code session (run from
`/Users/tom/Documents/my-library`) whenever the autonomous build has stopped
because it hit the account's usage limit.

---

You are resuming an autonomous build of a personal library web app in this repo
(`/Users/tom/Documents/my-library`). The full spec is in `PLAN.md`. The build is
run unattended by the `autonomous-runner` skill, which launches `claude` headless
via `./claude-auto/run.sh` with a watchdog. It has repeatedly stopped for one
reason only: **the account hits its rolling 5-hour usage limit** ("You've hit your
session limit · resets <time> (Europe/Paris)", HTTP 429, org overage disabled).
Nothing in the build itself is broken. Do the following:

1. **Diagnose the last run.** Find the newest run directory:
   `ls -t claude-auto/runs/ | head -1`. Read its `status` and `run.terminal.log`.
   If the failure text says "hit your session limit / resets …", it's the usage
   limit — not a code bug. Confirm by grepping the run's `run.log` for
   `"api_error_status":429`.

2. **Kill any stale watchdog** from that run so it can't keep burning attempts:
   `kill -9 $(cat claude-auto/runs/<dir>/watchdog.pid)` (ignore errors), and
   `pgrep -f "claude-auto/runs/<dir>"` — kill anything still alive.

3. **Check the quota reset time vs. now** (`TZ=Europe/Paris date`). The failure
   message names the reset time. **If the quota has NOT reset yet, do not relaunch**
   — relaunching just 429s instantly and wastes attempts. Instead tell the user
   the reset time and stop, OR schedule a background launcher that `sleep`s until
   ~5 min after the reset, then runs the launch command in step 5.

4. **Confirm nothing is lost.** `git -C /Users/tom/Documents/my-library log --oneline`
   shows committed phases (Phase 0 = scaffold+contracts, Phase 1 = UI+API+analysis+
   pipeline scripts, etc.). `git status` shows uncommitted progress. Also check
   `ls pipeline/output/cleaned/` (how many of the 15 chunks in
   `pipeline/output/chunks/` are cleaned) and `ls seed/` (empty until Phase 3).

5. **Relaunch, once the quota is available**, from the repo root:

   ```
   cd /Users/tom/Documents/my-library
   CHECK_INTERVAL=900 MAX_ATTEMPTS=20 nohup ./claude-auto/run.sh "<RESUME TASK below>" >/dev/null 2>&1 &
   ```

   Use this as `<RESUME TASK>` (adjust the state summary to match what git/ls show):

   > Resume building PLAN.md (repo root). Phases already COMMITTED are shown in
   > `git log`. Prior runs kept hitting the account's 5-hour usage limit — this is
   > not a code failure. First run `git status` and `ls pipeline/output/cleaned/`
   > to see exactly what remains. Then continue, committing after EACH step so
   > progress is never lost: (1) verify the app builds (`cd app && npm run build`),
   > fix if broken, commit any pending work. (2) Phase 2 — run parallel cleaning
   > agents for every remaining chunk in `pipeline/output/chunks/` →
   > `pipeline/output/cleaned/` following `pipeline/CLEANING_INSTRUCTIONS.md` and the
   > seed schema in `app/src/db/schema.ts`; finish the analysis feature if
   > incomplete; commit. (3) Phase 3 — `python pipeline/merge.py` → final review →
   > `python pipeline/validate.py` (loop until exit 0) → write `seed/authors.json` +
   > `seed/books.json` → `cd app && npm run db:seed` with real data; commit.
   > (4) Phase 4 — polish + full E2E verification per PLAN.md (build clean, API
   > round-trip, browser checks incl. Analyse Claude persistence and author-bio
   > reuse); commit. On any 429 / usage limit, `sleep 900` and retry the SAME step
   > — NEVER mark the run failed for a rate limit. Do not redo committed work.
   > Never modify the `.ods` / `.md` source files.

6. **Report** the new run directory, the follow command
   (`tail -f claude-auto/runs/<new-dir>/run.log`), and stop. The run continues on
   its own.

Key facts: source files (`liste livres final.ods`, `library-organized.ods`,
`bibliothèque vision du monde.md`) are read-only. The app lives in `app/`
(Next.js + SQLite/Drizzle + shadcn). Claude analysis uses the Agent SDK (local
Claude Code login, no API key). UI is in French. Because each phase commits, the
remaining work only ever shrinks across resumes.
