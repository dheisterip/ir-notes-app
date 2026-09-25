# CLAUDE.md

## What this app is

A de-identified post-procedure dictation aid for interventional radiology. The physician enters a raw dictation, and the app generates a finished procedure note that requires minimal editing before signing. Patient identifiers appear only as placeholders (e.g. `[PATIENT NAME]`, `[MRN]`) that are filled in locally after copying the note. No real PHI should ever enter the system, the database, logs, or test fixtures.

Main features:
- Note builder with procedure auto-detection (template-based and training-only procedures).
- Training pairs: a raw dictation and the ideal final note, stored per procedure.
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

## Working rules

- Before editing, read the relevant routes and helpers and summarize the plan. For multi-file changes, wait for approval.
- Keep changes small and reviewable; one feature per branch.
- Run `npm run build` before declaring anything done. It must pass cleanly.
- Deterministic logic (parsing numbers, matching notes, filling slots, validation) belongs in plain TypeScript/JavaScript, not in LLM calls.
- When LLM output contains clinical values (sizes, vessels, doses, times), treat code as the source of truth and verify the values; never trust the model to preserve them.
- Test data must be synthetic and de-identified.
- Don't add new dependencies without asking.

## Product direction: notes as close to final as possible

The core goal is not "a note in David's style" but "a note requiring minimal edits before signing." Generic style-matching (few-shot training pairs as prompt examples) produced notes that were broad and dropped or altered dictated specifics (e.g. a 6 mm balloon size). The fix is to generate by editing David's own closest prior final note, not by writing fresh prose from a skeleton.

### Two distinct roles: dictation vs. final note

- **Raw dictation is always the query, never stored as reusable text.** At training/seeding time, a dictation is paired with a final note so the matcher learns how David's dictation phrasing maps to his note phrasing. At generation time, a new dictation is only what gets matched against — it does not become part of the retrieval library.
- **Final post-procedure notes are the library.** Every note entered during seeding, or captured later from David's corrections (see Learning loop), becomes a candidate base note. Retrieval always pulls the *note* half of a stored pair, never the dictation half.
- **Per-case flow:** new dictation → matched against the dictation half of stored pairs for that procedure variant → closest pair's *final note* is pulled as the base → LLM edits that base note against the new dictation (values updated, unperformed steps dropped, new steps inserted) → measurement validator checks the result against the new dictation.
- Existing training pairs (raw note + ideal dictation) already fit this shape without reformatting; "retrieval library" is simply the more accurate name for them going forward.

### Design: nearest-note retrieval + constrained editing

1. **Golden test set (build first).** 5–10 de-identified dictation/final-note pairs, held out from training, used to score every subsequent change. This replaces vague "is it closer?" judgment with a repeatable comparison.
2. **Measurement validator (deterministic, no LLM).** Normalize and compare every measurement (balloon/stent diameter x length, French size, wire diameter, atm, fluoro time, contrast volume, etc.) in the dictation against the generated note. Flag MISSING (dictated, absent from note) and UNSOURCED (in note, not dictated) with source context. Advisory banner in the UI; never blocks copying/editing.
3. **Procedure variants.** Split broad procedure categories into tighter variants (e.g. iliac vs. fem-pop vs. tibial angioplasty; with/without atherectomy, stent, or closure device). Matching and templates operate at the variant level, not the broad category.
4. **Nearest-note retrieval.** For a new dictation, find the most similar prior final note for that variant (same technique, similar vessels/devices). Existing technique-matching logic is the starting point.
5. **Constrained editing, not free generation.** The LLM edits the retrieved base note: updates values from the new dictation, removes steps that didn't happen, inserts steps that did (pulled from the segment library when the base note lacks them). It must not rewrite untouched sentences. Most of the note's wording should pass through unchanged.
6. **Segment library** (fallback for uncommon events). Ideal notes are decomposed on save into fixed / parameterized (with slots) / conditional / free-narrative segments, tagged by triggering event and aligned to the dictation span that produced them. Stored per user and per procedure variant. Used to supply phrasing for events the nearest base note doesn't cover.
7. **Learning loop.** Store both the generated note and what David actually signs. Diff them. Each correction becomes a new training example automatically, and the diff size per procedure is a running measure of whether the system is improving.
8. **Coding checklist.** Per-procedure-variant checklist of elements required to support CPT coding (vessel territory, lesion, most intensive treatment, selective catheterization, imaging interpretation, complications). Flags missing elements alongside the measurement validator.
9. **Learned-template review page.** The base note(s) and learned segments per variant should be visible and directly editable/lockable by David — not a hidden, model-derived artifact.
10. **PHI scrubbing.** Now more urgent: whole final notes are stored verbatim as training/base data. Names, MRNs, dates, and accession numbers must be stripped before anything is saved.

### Build order

1. Golden test set + scoring script
2. Measurement validator
3. Nearest-note retrieval + constrained editing
4. Capture-corrections learning loop
5. Segment library for inserted/uncommon events
6. Learned-template review page
7. Coding checklist

Existing training pairs should be reprocessed through the segment decomposition step (5) rather than discarded.
