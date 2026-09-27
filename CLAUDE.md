# CLAUDE.md

## What this app is

A de-identified note-generation aid for interventional radiology. David types a brief post-procedure note into Epic (EMR) right after a case, pastes that into this app, and the app generates a full PACS dictation (the detailed, billing-grade note) that he revises and submits for billing. Patient identifiers appear only as placeholders (e.g. `[PATIENT NAME]`, `[MRN]`) that are filled in locally after copying the note. No real PHI should ever enter the system, the database, logs, or test fixtures.

## Terminology (do not confuse these — get this backwards and every design doc drifts)

- **Post-procedure note** = the brief note David types into Epic right after a case. This is the app's INPUT/query. Short, informal, clinical shorthand.
- **PACS dictation** = the full, detailed note David dictates into PACS for billing/coding (vessel territory, devices/sizes, technique, findings, impression). This is what the app GENERATES as output. Long, formal, structured for coding.
- **Workflow:** David types brief post-procedure note in Epic → pastes into this app → app matches it against a library of prior PACS dictations → generates a new PACS dictation → David revises and submits for billing.
- Legacy code/data field names are inverted from this terminology (see below) — don't assume a field name tells you which kind of text it holds; check actual content.

Main features:
- Note builder with procedure auto-detection (template-based and training-only procedures).
- Training pairs: a post-procedure note and its corresponding ideal PACS dictation, stored per procedure.
- Shared text components (moderate sedation, radiation safety, consent) that update globally.
- Three-tier templates: Personal → Universal → Community.
- Per-user field preferences with visibility toggles; unfilled fields are omitted from the note.
- Admin dashboard with user management and API cost tracking.

## Stack: hard constraints (do not change without asking)

- **Next.js 14.2.x, Pages Router.** Next.js 15 silently crashed during webpack compilation on Vercel. Do not upgrade, and do not introduce App Router patterns.
- **Deployed on Vercel.** Test auth against the production URL; cookie auth fails on preview deployment URLs.
- **Upstash Redis via direct REST API calls.** Do not add the Upstash SDK. Reuse the existing Redis helper functions.
- **Auth:** `jose` for JWT. Middleware (Edge Runtime) checks cookie existence only. Full JWT verification happens in Node.js API routes. Moving verification into middleware caused login redirect loops.
- **AI:** Anthropic API (Claude Sonnet) for parsing and generation. Log token usage through the existing cost-tracking path for any new API call.
- **Environment variables must be bare values**, never `KEY=VALUE` strings. This broke Upstash and the Anthropic key silently before. If something fails with no error, check env var format first.
- A weekly Vercel cron pings Upstash to keep it awake. Don't remove it.

## Environment variable names

Confirmed via `vercel env ls` against the real project (all 7 are set as Secret type on
Production and Preview — Secret-type values can't be pulled by `vercel env pull`, only listed by
name; get real values from the Vercel dashboard, not the CLI):

- `ADMIN_PASSWORD` — the login password. **Not `SITE_PASSWORD`** — easy to guess wrong when
  hand-typing `.env.local`, and the app fails with a plain "Incorrect password" (no hint that the
  var name itself is wrong) if it's missing.
- `JWT_SECRET`
- `ANTHROPIC_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ALERT_EMAIL`
- `RESEND_API_KEY`

## Working rules

- Before editing, read the relevant routes and helpers and summarize the plan. For multi-file changes, wait for approval.
- Keep changes small and reviewable; one feature per branch.
- Run `npm run build` before declaring anything done. It must pass cleanly.
- Deterministic logic (parsing numbers, matching notes, filling slots, validation) belongs in plain TypeScript/JavaScript, not in LLM calls.
- When LLM output contains clinical values (sizes, vessels, doses, times), treat code as the source of truth and verify the values; never trust the model to preserve them.
- Test data must be synthetic and de-identified.
- Don't add new dependencies without asking.

## Product direction: PACS dictations as close to final as possible

The core goal is not "a dictation in David's style" but "a PACS dictation requiring minimal edits before billing submission." Generic style-matching (few-shot training pairs as prompt examples) produced dictations that were broad and dropped or altered specifics from the post-procedure note (e.g. a 6 mm balloon size). The fix is to generate by editing David's own closest prior PACS dictation, not by writing fresh prose from a skeleton.

### Two distinct roles: post-procedure note vs. PACS dictation

- **Post-procedure note is always the query, never stored as reusable output text.** At training/seeding time, a post-procedure note is paired with the PACS dictation it produced, so the matcher learns how David's brief-note phrasing maps to his dictation phrasing. At generation time, a new post-procedure note is only what gets matched against — it does not become part of the retrieval library.
- **PACS dictations are the library.** Every dictation entered during seeding, or captured later from David's corrections (see Learning loop), becomes a candidate base dictation. Retrieval always pulls the *PACS dictation* half of a stored pair, never the post-procedure-note half.
- **Per-case flow:** new post-procedure note → matched against the post-procedure-note half of stored pairs for that procedure variant → closest pair's *PACS dictation* is pulled as the base → LLM edits that base dictation against the new post-procedure note (values updated, unperformed steps dropped, new steps inserted) → measurement validator checks the result against the new post-procedure note.
- **Legacy field names are inverted — verify before trusting them.** `lib/storage.js`'s `getTraining()` shape is `examples: [{id, technique_tag, raw_note, ideal_dictation}]`. If `raw_note` holds the brief Epic-style note and `ideal_dictation` holds the full PACS dictation, the field *direction* is correct despite the confusing names — `raw_note` = query, `ideal_dictation` = library. Confirm this against real stored examples before writing any matching code; do not assume from the names alone.
- `golden-set/cases.json` uses explicit field names to avoid this confusion: `postProcedureNote` (brief, Epic — the query) and `pacsDictation` (full, billing — the target/library). Any older cases using `dictation`/`finalNote` field names need to be re-checked and relabeled, since those names were used ambiguously earlier in this project and may be backwards.

### Design: nearest-dictation retrieval + constrained editing

1. **Golden test set (build first).** 5–10 de-identified post-procedure-note/PACS-dictation pairs, held out from training, used to score every subsequent change. This replaces vague "is it closer?" judgment with a repeatable comparison.
2. **Measurement validator (deterministic, no LLM).** Normalize and compare every measurement (balloon/stent diameter x length, French size, wire diameter, atm, fluoro time, contrast volume, etc.) in the post-procedure note against the generated PACS dictation. Flag MISSING (in the note, absent from the dictation) and UNSOURCED (in the dictation, not in the note) with source context. Advisory banner in the UI; never blocks copying/editing.
3. **Procedure variants.** Split broad procedure categories into tighter variants (e.g. iliac vs. fem-pop vs. tibial angioplasty; with/without atherectomy, stent, or closure device). Matching and templates operate at the variant level, not the broad category.
4. **Nearest-dictation retrieval.** For a new post-procedure note, find the most similar prior PACS dictation for that variant (same technique, similar vessels/devices). Existing technique-matching logic is the starting point.
5. **Constrained editing, not free generation.** The LLM edits the retrieved base dictation: updates values from the new post-procedure note, removes steps that didn't happen, inserts steps that did (pulled from the segment library when the base dictation lacks them). It must not rewrite untouched sentences. Most of the dictation's wording should pass through unchanged.
6. **Segment library** (fallback for uncommon events). Ideal PACS dictations are decomposed on save into fixed / parameterized (with slots) / conditional / free-narrative segments, tagged by triggering event and aligned to the post-procedure-note span that produced them. Stored per user and per procedure variant. Used to supply phrasing for events the nearest base dictation doesn't cover.
7. **Learning loop.** Store both the generated PACS dictation and what David actually submits for billing. Diff them. Each correction becomes a new training example automatically, and the diff size per procedure is a running measure of whether the system is improving.
8. **Coding checklist.** Per-procedure-variant checklist of elements required to support CPT coding (vessel territory, lesion, most intensive treatment, selective catheterization, imaging interpretation, complications). Flags missing elements alongside the measurement validator.
9. **Learned-template review page.** The base dictation(s) and learned segments per variant should be visible and directly editable/lockable by David — not a hidden, model-derived artifact.
10. **PHI scrubbing.** Now more urgent: whole PACS dictations are stored verbatim as training/base data. Names, MRNs, dates, and accession numbers must be stripped before anything is saved.

### Build order

1. Golden test set + scoring script
2. Measurement validator
3. Nearest-dictation retrieval + constrained editing
4. Capture-corrections learning loop
5. Segment library for inserted/uncommon events
6. Learned-template review page
7. Coding checklist

Existing training pairs should be reprocessed through the segment decomposition step (5) rather than discarded, once the field-direction check in step 3 above confirms which stored field holds which kind of text.
