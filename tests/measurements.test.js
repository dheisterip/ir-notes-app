/**
 * Standalone unit tests for lib/measurements.js. No golden-set dependency, no network,
 * no framework — plain node:assert. Run: node tests/measurements.test.js (or `npm test`).
 * All dictation/note strings below are synthetic and de-identified.
 */
const assert = require('node:assert/strict')

async function main() {
  const { preprocessSpokenNumbers, extractMeasurements, compareMeasurements } =
    await import('../lib/measurements.js')

  const tests = []
  const test = (name, fn) => tests.push({ name, fn })

  // ---------- normalizer ----------

  test('spoken "six by forty" -> "6 by 40"', () => {
    assert.equal(preprocessSpokenNumbers('a six by forty balloon'), 'a 6 by 40 balloon')
  })

  test('spoken "six millimeter" -> "6 millimeter"', () => {
    assert.equal(preprocessSpokenNumbers('a six millimeter sheath'), 'a 6 millimeter sheath')
  })

  test('spoken "five French" -> "5 French"', () => {
    assert.equal(preprocessSpokenNumbers('a five French sheath'), 'a 5 French sheath')
  })

  test('spoken "point oh one four" -> "0.014"', () => {
    assert.equal(preprocessSpokenNumbers('a point oh one four wire'), 'a 0.014 wire')
  })

  test('spoken "two point five" -> "2.5"', () => {
    assert.equal(preprocessSpokenNumbers('inflated to two point five atm'), 'inflated to 2.5 atm')
  })

  test('written forms normalize to the same canonical key', () => {
    const forms = ['6 x 40', '6x40', 'six by forty']
    const keys = forms.map((f) => extractMeasurements(f + ' mm balloon').find((m) => m.type === 'balloon').key)
    assert.deepEqual(new Set(keys), new Set(['balloon:6x40']))
  })

  test('French written forms normalize to the same canonical key', () => {
    const forms = ['5 French', '5 Fr', '5F']
    const keys = forms.map((f) => extractMeasurements('a ' + f + ' sheath').find((m) => m.type === 'french').key)
    assert.deepEqual(new Set(keys), new Set(['fr:5']))
  })

  // ---------- comparator ----------

  test('a 6 mm balloon dropped from the note is flagged MISSING', () => {
    const dictation = 'A 6 mm balloon was used to angioplasty the lesion.'
    const note = 'Balloon angioplasty of the lesion was performed without complication.'
    const { missing, unsourced } = compareMeasurements(dictation, note, '')
    assert.equal(missing.length, 1)
    assert.equal(missing[0].kind, 'missing')
    assert.equal(missing[0].severity, 'high')
    assert.match(missing[0].message, /6 mm.*dictated, not found in note/)
    assert.equal(unsourced.length, 0)
  })

  test('a 5 mm substituted for a dictated 6 mm is flagged both ways', () => {
    const dictation = 'A 6 mm balloon was advanced across the lesion.'
    const note = 'A 5 mm balloon was advanced across the lesion.'
    const { missing, unsourced } = compareMeasurements(dictation, note, '')
    assert.equal(missing.length, 1)
    assert.equal(missing[0].key, 'mm:6')
    assert.equal(unsourced.length, 1)
    assert.equal(unsourced[0].key, 'mm:5')
    assert.equal(unsourced[0].kind, 'unsourced')
  })

  test('"six by forty" in dictation matches "6 x 40 mm" in the note (no mismatch)', () => {
    const dictation = 'We used a six by forty balloon across the stenosis.'
    const note = 'A 6 x 40 mm balloon was inflated across the stenosis.'
    const { missing, unsourced } = compareMeasurements(dictation, note, '')
    assert.equal(missing.length, 0)
    assert.equal(unsourced.length, 0)
  })

  test('mL and cc are treated as equal', () => {
    const dictation = '120 mL of contrast was administered.'
    const note = '120 cc of contrast was administered.'
    const { missing, unsourced } = compareMeasurements(dictation, note, '')
    assert.equal(missing.length, 0)
    assert.equal(unsourced.length, 0)
  })

  test('fixed boilerplate numbers from shared text do not trigger UNSOURCED', () => {
    const dictation = 'Angioplasty was performed. Moderate sedation was given.'
    const note =
      'Angioplasty was performed.\n' +
      'Moderate sedation was administered under direct supervision, with vitals checked every 5 minutes throughout the procedure.'
    const shared =
      'Moderate sedation was administered under direct supervision, with vitals checked every 5 minutes throughout the procedure.'
    const { unsourced } = compareMeasurements(dictation, note, shared)
    assert.equal(unsourced.length, 0)
  })

  test('a genuinely new number in the note (not boilerplate) still triggers UNSOURCED', () => {
    const dictation = 'Angioplasty was performed.'
    const note = 'Angioplasty was performed with a 7 mm balloon.'
    const shared = 'Moderate sedation was given, vitals checked every 5 minutes.'
    const { unsourced } = compareMeasurements(dictation, note, shared)
    assert.equal(unsourced.length, 1)
    assert.equal(unsourced[0].key, 'mm:7')
  })

  test('bracketed placeholders, CPT codes, and dates are excluded entirely', () => {
    const note = 'Patient [PATIENT NAME], MRN [MRN], seen on 09/25/2026. CPT 37228. Fluoro time {{fluoroscopy_time}} minutes.'
    const found = extractMeasurements(note)
    assert.equal(found.length, 0)
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
