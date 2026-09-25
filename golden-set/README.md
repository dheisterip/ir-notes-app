# Golden test set

`cases.json` is a held-out set of dictation/final-note pairs used to score every change to the
generation pipeline (see CLAUDE.md's build order). It is scored by `scripts/score-golden-set.js`
(`npm run score-golden`).

## Rules

- **Never a retrieval source.** Nothing in this directory is read by `lib/storage.js`, the
  training-pairs library, or any generation route. It exists only to be scored against.
- **Never real PHI.** Every `dictation` / `finalNote` here must be synthetic and de-identified —
  same standard as training pairs and test fixtures elsewhere in this repo (CLAUDE.md: "No real
  PHI should ever enter the system, the database, logs, or test fixtures"). Before pushing any
  change to this file, re-scan it for anything that looks like a real name, MRN, accession
  number, or date tied to an actual patient.
- Entries currently ship empty (`dictation`/`finalNote` are `""`). Fill them in with synthetic
  cases by hand — the scoring script skips any case with an empty `dictation` rather than calling
  the pipeline on it, and reports empty `finalNote` cases as having nothing to compare against.

## Running it

```
npm run score-golden            # full report: per-case diffs + summary, written to results/
npm run score-golden -- --summary-only   # writes only the summary (no per-case diff text) to results/
```

The script boots the actual app with `next dev` (a real HTTP round trip through
`middleware.js` → `/api/login` → `/api/parse`, exactly like a browser), so it needs the same
credentials the app needs locally: `ADMIN_PASSWORD`, `JWT_SECRET`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `ANTHROPIC_API_KEY` in `.env.local` (bare values, per CLAUDE.md).
Without them, login fails and every case is reported as `skipped_no_auth` — that's expected, not
a bug in the harness.

## Results history

`results/` is committed on purpose: since these cases are synthetic, the score history over time
(does closeness go up, do measurement mismatches go down, commit over commit) is the actual point
of the golden set. Use `--summary-only` if the full per-case diffs make a particular run too noisy
to want in history.
