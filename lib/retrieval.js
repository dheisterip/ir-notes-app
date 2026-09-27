/**
 * Nearest-dictation retrieval (CLAUDE.md "Design" step 4). Pure, no LLM call: scores stored
 * training examples' raw_note (the brief post-procedure note half) against a new post-procedure
 * note, and returns the single best match's ideal_dictation (the full PACS dictation half) as
 * the base dictation for constrained editing.
 */

const EXCLUDED_PROCEDURE_KEYS = new Set(['test', 'test_2', 'test_3'])

function words(text) {
  return (text || '').toLowerCase().match(/[a-z0-9]+/g) || []
}

/** Fraction of queryWords found in targetWords (0 if either side is empty). */
function overlapScore(queryWords, targetWords) {
  if (queryWords.length === 0 || targetWords.length === 0) return 0
  const targetSet = new Set(targetWords)
  const matches = queryWords.filter((w) => targetSet.has(w)).length
  return matches / queryWords.length
}

/**
 * Keyword/technique_tag overlap between a new post-procedure note and one stored example.
 * Weighted mostly on raw_note (comparing brief note to brief note, the better signal for
 * "closest prior case"), with technique_tag as a secondary signal.
 */
export function scoreMatch(postProcedureNote, example) {
  const noteWords = words(postProcedureNote)
  const rawNoteScore = overlapScore(noteWords, words(example.raw_note))
  const tagScore = overlapScore(noteWords, words(example.technique_tag))
  return Math.round((0.7 * rawNoteScore + 0.3 * tagScore) * 1000) / 1000
}

/**
 * Best-matching stored example for procedureKey, or a null match if there's nothing to
 * retrieve from (no examples, or procedureKey is one of the placeholder/test keys).
 */
export function findNearestDictation(training, procedureKey, postProcedureNote) {
  if (!procedureKey || EXCLUDED_PROCEDURE_KEYS.has(procedureKey)) {
    return { match: null, score: 0, baseDictation: null }
  }
  const proc = (training || {})[procedureKey]
  const examples = (proc && proc.examples) || []
  if (examples.length === 0) return { match: null, score: 0, baseDictation: null }

  let best = null
  let bestScore = -1
  for (const ex of examples) {
    const s = scoreMatch(postProcedureNote, ex)
    if (s > bestScore) { bestScore = s; best = ex }
  }
  return { match: best, score: bestScore, baseDictation: best ? best.ideal_dictation : null }
}
