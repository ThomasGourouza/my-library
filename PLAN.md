# Ma Bibliothèque — Personal Library App

## Context

Tom has ~2,300 raw rows of book data spread across two LibreOffice spreadsheets and a markdown file in `/Users/tom/Documents/my-library` — heavily duplicated, partially wrong, inconsistently structured (one sheet has Author/Title reversed, one has parallel side-by-side tables, hundreds of junk/author-only rows, WhatsApp-paste artifacts). He wants a polished, professional library web app that uses **all** of this data — deduplicated, corrected, and enriched — with full CRUD for books and authors, multiple browse modes, fine-grained filtering/sorting, and an on-demand "Analyse Claude" feature that generates a summary, deep analysis, and author biography per book. Build should leverage many parallel agents.

**Confirmed decisions:** Next.js (App Router) + SQLite/Drizzle + Tailwind/shadcn-ui · Claude Agent SDK (reuses local Claude Code login, no API key) · UI in **French** · author-only rows → create author **and** add their 1–3 best-known works (`enriched: true`).

**Source data (read-only, never modified):**
- `liste livres final.ods` — 6 sheets, ~570 author-centric rows, 9 rich columns (Auteur, Œuvres, Thème, Genre, Courant, Période, naissance/décès, Notes). Multi-work cells to split; `—` gaps.
- `library-organized.ods` — 4 messy sheets (~1,865 rows): `contes` (parallel columns, children's books + classics list), `histoire…` (columns reversed, WhatsApp-paste junk), `romans_poesie_theatre` (1,320 rows, period-header junk, author-only rows, typos, apostrophe-variant dupes), `philosophie` (439 rows, mixed formats).
- `bibliothèque vision du monde.md` — 7 philosophical worldview categories → extra "vision du monde" dimension.

Expected after cleaning: ~800–1,600 unique books, ~400–800 authors.

Environment verified: Node 22, Python 3.13 (stdlib parses .ods), Claude Code logged in; Agent SDK `query()` supports `outputFormat: {type:'json_schema'}`.

## Repository layout

```
/Users/tom/Documents/my-library/
├── *.ods, *.md                 # sources — untouched
├── pipeline/                   # extract.py, preclean.py, chunk.py, merge.py,
│   ├── CLEANING_INSTRUCTIONS.md  # shared prompt for parallel cleaning agents
│   └── output/                 # raw/, records.jsonl, chunks/, cleaned/, merged.json
├── seed/                       # authors.json, books.json (canonical, committed)
└── app/                        # Next.js (src dir, App Router)
    ├── data/library.db         # gitignored, rebuilt via db:push + db:seed
    └── src/
        ├── db/{schema.ts, index.ts, seed.ts}
        ├── lib/{validation.ts, normalize.ts, queries.ts}
        ├── lib/analysis/{prompt.ts, run.ts}
        ├── app/livres/…  app/auteurs/…  app/api/…
        └── components/{ui/, books/, authors/}
```

`next.config.ts`: `serverExternalPackages: ['better-sqlite3']`. Git init at repo root; `.gitignore` covers node_modules, .next, *.db, `.~lock*`.

## Database schema (Drizzle → `app/src/db/schema.ts`)

- **`authors`**: id, name, nameNormalized (unique — lowercase/no accents, dedup+search key), birthYear/deathYear (negative = av. J.-C.), nationality, language, mainGenre, mainField, period, notes, **bio** + bioGeneratedAt (Claude-generated), timestamps.
- **`books`**: id, title, titleNormalized, authorId FK (NOT NULL — anonymous works get authors like "Homère", "Anonyme (œuvre médiévale)"), category, genre, courant, theme, period, publicationYear, audience (default `adultes`), worldview (nullable), originalLanguage, notes, **summary**, **analysis** + analysisGeneratedAt, `enriched` bool (added from model knowledge), timestamps. Unique `(titleNormalized, authorId)`; indexes on authorId/category/period/worldview/audience.
- **`analysis_jobs`**: bookId, status (`running|done|error`), error, startedAt/finishedAt — progress tracking only; results always persist on books/authors rows.

Const arrays (validated by zod, not DB CHECKs): CATEGORIES (6 sheet-derived), AUDIENCES (`enfants|adolescents|adultes|tous`), WORLDVIEWS (7 from the .md), PERIODS (Antiquité → XXIe siècle). Single author FK (co-authors → notes); single worldview column. Use `drizzle-kit push` (no migration files).

## API (route handlers, zod-validated; pages read via `lib/queries.ts` directly)

- Books: `GET/POST /api/books` (filters: search, category, genre, period, audience, worldview, authorId, sort), `GET/PUT/DELETE /api/books/[id]`. POST accepts `authorId` **or** inline `newAuthor`.
- Analysis: `POST /api/books/[id]/analysis` → 202 `{jobId}` (409 if job running < 5 min — staleness guard); `GET` polls status, returns persisted fields when done.
- Authors: `GET/POST /api/authors` (with book counts), `GET/PUT/DELETE /api/authors/[id]`. DELETE returns 409 with count if books exist.

## Pages (French UI)

- **Layout**: nav "Ma Bibliothèque" with tabs **Livres | Auteurs**; Sonner toasts; `lang="fr"`.
- **/livres**: server component loads all books+authors → client `BookTable` (TanStack Table). Toolbar: accent-insensitive search, multi-select filter popovers (Catégorie, Genre, Période, Public, Vision du monde, Courant) with badge chips + "Réinitialiser"; multi-sort (shift-click + preset combos); **view toggle Tableau | Groupé** with "Grouper par" select (Auteur, Genre, Période, Catégorie, Public, Vision du monde) → accordion sections with counts. URL-synced state.
- **/livres/[id]**: card with linked author, badge row, notes; `AnalysisPanel` — button "Analyse Claude" → spinner "Génération en cours…" → sections **Résumé / Analyse approfondie / Biographie de l'auteur** (react-markdown) + "Régénérer"; Modifier/Supprimer (AlertDialog).
- **/livres/nouveau, /livres/[id]/modifier**: `BookForm` (react-hook-form + zod), author Combobox with "Créer l'auteur « X »" inline option.
- **/auteurs**: table (Nom, Dates, Nationalité, Langue, Genre principal, Domaine, Nb livres), filters + search. **/auteurs/[id]**: identity card, Biographie, "Livres de cet auteur" (bidirectional links). AuthorForm create/edit.

## Analyse Claude flow (`lib/analysis/run.ts`)

POST → insert running job → fire-and-forget async run → 202. Run: load book+author; `includeBio = author.bio == null` (**bio reuse rule**); call Agent SDK `query({prompt: French prompt with known metadata, options: {tools: [], maxTurns: 1, outputFormat: {type:'json_schema', schema}}})` — no API key, inherits local Claude Code auth; parse structured JSON (defensive fallback: extract first `{…}` from text); single transaction: update book summary/analysis, and if includeBio update author bio + fill-only-if-null enrichment (nationality, language, dates, mainGenre, mainField). Client polls every 2 s (SWR) → `router.refresh()` on done. Schema: `{summary, analysis, authorBio?, authorInfo?}` (~200-word résumé, ~500-word analyse, ~250-word bio, all French). Re-check `code.claude.com/docs/en/agent-sdk/typescript` at build time for exact option names.

## Data pipeline

1. **`extract.py`** (Python stdlib zipfile+ElementTree, handles `number-columns-repeated`) → `raw/<sheet>.json` ×10 + `raw/worldviews.json` from the .md.
2. **`preclean.py`** → uniform `records.jsonl`: normalize (NFC, apostrophes, accents-for-keys-only); split multi-work cells on top-level commas (protect "Debt: The First 5,000 Years"); un-reverse the histoire sheet; split contes parallel tables (cols A/B → `audienceHint: enfants`; cols E/F with running theme headers); strip WhatsApp prefixes; classify philosophie rows (pair / bare author ± dates / bare title / junk); flag `author_only` and `uncertain`.
3. **`chunk.py`** → ~12 chunks of ~180 records cut **on author boundaries** (makes parallel dedup safe) + one `chunk-titles.json` for author-less titles.
4. **Parallel cleaning agents** (one per chunk, shared `CLEANING_INSTRUCTIONS.md`): fix typos to canonical French titles ("illiade et odysee" → *L'Iliade* + *L'Odyssée*), resolve uncertain rows, dedup within chunk, fill missing fields from model knowledge, author-only rows → author + 1–3 best-known works (`enriched: true`, never invent otherwise), assign audience/category → `cleaned/chunk-NN.json` in exact seed schema.
5. **`merge.py`** → exact dedup on (normAuthor, normTitle), cross-chunk author merge (prefer non-null; provenance priority: liste-livres-final > messy sheets), apply worldviews, fuzzy near-dup detection (SequenceMatcher ≥ 0.90, initials-tolerant) → `merged.json` + `near-duplicates.json`.
6. **Final review agent**: resolve near-dups, harmonize genre vocab (≤ ~40 genres), verify worldview mapping → `seed/authors.json` + `seed/books.json`.
7. **`validate.py`** (hard gate, non-zero exit on failure): enum membership, FK resolution, uniqueness, date sanity, count windows (800–1,600 books / 400–800 authors), prints 20-book sample.
8. **`db/seed.ts`** (`npm run db:seed`, tsx): transactional wipe+insert, computes normalized columns, idempotent.

## Build phases (parallel agent fan-out)

- **Phase 0 (sequential)**: git init → create-next-app → shadcn init + components → deps (drizzle-orm, better-sqlite3, zod, react-hook-form, @tanstack/react-table, swr, react-markdown, @anthropic-ai/claude-agent-sdk, tsx) → **write frozen contracts**: schema.ts, validation.ts, normalize.ts, queries.ts signatures, layout shell → db:push → tiny fixture seed (5 authors/8 books) → commit. Contracts don't change without coordination.
- **Phase 1 (4 parallel)**: W1 pipeline code (extract/preclean/chunk + run) · W2 /livres list (BookTable, filters, view modes) · W3 book detail + CRUD + api/books · W4 authors (list/detail/forms/api).
- **Phase 2 (~13 parallel)**: W5.1–12 data-cleaning agents (one per chunk) · W6 analysis feature (lib/analysis, analysis route, AnalysisPanel).
- **Phase 3 (sequential)**: merge → review agent → validate (loop to green) → commit seed → db:seed real data → integration pass with 1,000+ rows.
- **Phase 4 (sequential)**: polish (skeletons, density, French copy, dark mode) → full verification → final commit.

## Verification

- **Pipeline**: validate.py green + scripted spot-checks (Iliade/Odyssée exactly once under Homère; an author-only row got 1–3 enriched books; La Rochefoucauld → worldview cynique; contes → audience enfants; zero `—`/empty strings; apostrophe dupes collapsed).
- **Build**: `npm run build` clean; delete DB → push+seed reproduces identical counts.
- **API round-trip** (curl): create author → create book → filtered GET finds it → PUT → DELETE author 409 while book exists → delete book → delete author 200.
- **Browser E2E** (agent-driven/Playwright): accent-insensitive search "dosto"; worldview filter existentialiste; Groupé par Période accordion; create book with inline author; bidirectional book↔author links; **Analyse Claude** on a Dostoïevski book (three French sections render, persist across server restart), second book of same author reuses bio (bioGeneratedAt unchanged); delete flows with confirmation.
- **Unit (vitest, minimal)**: normalize.ts + preclean classifiers against ~15 real fixture rows.

## Risks

- Multi-work comma-splitting misfires → cleaning agents + unique index catch residuals.
- Agent SDK option drift → defensive JSON parse + doc check at build time.
- LibreOffice lock files present → ask user to close LibreOffice before pipeline run (extraction reads zip directly regardless).
- Cleaning-agent hallucination → instructions forbid inventing titles except capped author-only enrichment; validation prints samples.
