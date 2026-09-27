/**
 * Standalone unit tests for lib/retrieval.js. No network, no framework — plain node:assert.
 * Run: node tests/retrieval.test.js (or `npm test`, once wired into the test script list).
 * All note/dictation strings below are synthetic and de-identified.
 */
const assert = require('node:assert/strict')

async function main() {
  const { scoreMatch, findNearestDictation } = await import('../lib/retrieval.js')

  const tests = []
  const test = (name, fn) => tests.push({ name, fn })

  // ---------- scoreMatch ----------

  test('identical raw_note and technique_tag scores 1.0', () => {
    const note = 'GSV access. RFA ablation after tumescent. 55 cm'
    const example = { raw_note: note, technique_tag: note }
    const score = scoreMatch(note, example)
    assert.equal(score, 1)
  })

  test('identical raw_note with a differently-worded technique_tag scores high but not 1.0', () => {
    // 0.7 weight on raw_note (full match) + 0.3 weight on technique_tag (partial overlap only)
    const note = 'GSV access. RFA ablation after tumescent. 55 cm'
    const example = { raw_note: note, technique_tag: 'R GSV RFA ablation' }
    const score = scoreMatch(note, example)
    assert.ok(score > 0.8 && score < 1, 'expected a high-but-partial score, got ' + score)
  })

  test('no word overlap scores 0', () => {
    const score = scoreMatch('renal artery stenting bilateral', { raw_note: 'thyroid biopsy under ultrasound', technique_tag: 'thyroid FNA' })
    assert.equal(score, 0)
  })

  test('partial overlap scores between 0 and 1', () => {
    const score = scoreMatch('GSV ablation right leg with sclerotherapy', { raw_note: 'GSV ablation right leg', technique_tag: 'venous ablation' })
    assert.ok(score > 0 && score < 1, 'expected a partial score, got ' + score)
  })

  test('technique_tag overlap contributes even with a very different raw_note', () => {
    const withTagMatch = scoreMatch('GSV RFA ablation', { raw_note: 'completely unrelated wording here', technique_tag: 'GSV RFA ablation' })
    const withoutTagMatch = scoreMatch('GSV RFA ablation', { raw_note: 'completely unrelated wording here', technique_tag: 'unrelated tag words' })
    assert.ok(withTagMatch > withoutTagMatch)
  })

  // ---------- findNearestDictation ----------

  const training = {
    gsv_venous_ablation: {
      examples: [
        { id: '1', technique_tag: 'R GSV RFA ablation with sclerotherapy', raw_note: 'GSV ablation-right. RFA ablation after tumescent. 55 cm. Sclero used on varicosities.', ideal_dictation: 'FULL DICTATION A' },
        { id: '2', technique_tag: 'R GSV RFA ablation', raw_note: 'GSV ablation-right. RFA ablation after tumescent. 30 cm.', ideal_dictation: 'FULL DICTATION B' },
      ],
    },
    test: { examples: [{ id: 't1', technique_tag: 'test', raw_note: 'test', ideal_dictation: 'test' }] },
  }

  test('returns the single best-matching example\'s ideal_dictation as baseDictation', () => {
    const note = 'GSV ablation right leg. RFA ablation after tumescent. 55 cm. Sclerotherapy of varicosities performed.'
    const result = findNearestDictation(training, 'gsv_venous_ablation', note)
    assert.equal(result.match.id, '1')
    assert.equal(result.baseDictation, 'FULL DICTATION A')
    assert.ok(result.score > 0)
  })

  test('picks the other example when the note is closer to it', () => {
    const note = 'GSV ablation right leg. RFA ablation after tumescent. 30 cm.'
    const result = findNearestDictation(training, 'gsv_venous_ablation', note)
    assert.equal(result.match.id, '2')
    assert.equal(result.baseDictation, 'FULL DICTATION B')
  })

  test('test/test_2/test_3 procedure keys are excluded even if they have examples', () => {
    const result = findNearestDictation(training, 'test', 'test note')
    assert.equal(result.match, null)
    assert.equal(result.baseDictation, null)
    assert.equal(result.score, 0)
  })

  test('a procedure key with no stored examples returns a null match', () => {
    const result = findNearestDictation(training, 'nonexistent_key', 'some note')
    assert.equal(result.match, null)
    assert.equal(result.baseDictation, null)
  })

  test('a missing/empty procedureKey returns a null match', () => {
    const result = findNearestDictation(training, '', 'some note')
    assert.equal(result.match, null)
  })

  // ---------- runner ----------

  let pass = 0, fail = 0
  for (const t of tests) {
    try { t.fn(); pass++; console.log('  ok   ' + t.name) }
    catch (e) { fail++; console.log('  FAIL ' + t.name); console.log('       ' + e.message) }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed')
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error('Test harness crashed:', e); process.exit(1) })
