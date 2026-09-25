/**
 * Deterministic measurement normalizer / extractor / comparator. No LLM calls.
 * Pure and dependency-free (no imports) so the later structured-extraction pass can reuse the
 * normalizer without pulling in anything else.
 */

// ---------- spoken-number preprocessing ----------

const ONES = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const DIGIT_WORDS = new Set(['zero', 'oh', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'])
const WHOLE_WORDS = new Set([...Object.keys(ONES), ...Object.keys(TENS), 'hundred', 'and'])

function wordsToNumber(words) {
  let current = 0
  let any = false
  for (const w of words) {
    if (w === 'and') continue
    if (w === 'hundred') { current = (current || 1) * 100; any = true; continue }
    if (w in ONES) { current += ONES[w]; any = true; continue }
    if (w in TENS) { current += TENS[w]; any = true; continue }
  }
  return any ? current : null
}

function tokenize(text) {
  return text.match(/[A-Za-z]+|[^A-Za-z\s]+|\s+/g) || []
}
function isWord(tok) { return !!tok && /^[A-Za-z]+$/.test(tok) }
function isSpace(tok) { return !!tok && /^\s+$/.test(tok) }

/** Read a run of space-separated digit-words starting at toks[start] (start must be a digit
 * word, not a space). Returns {digits, end} where end is the index just past the last digit
 * word consumed (never past a trailing space with nothing after it). */
function readDigitWords(toks, start) {
  const digits = []
  let p = start
  while (isWord(toks[p]) && DIGIT_WORDS.has(toks[p].toLowerCase())) {
    digits.push(String(ONES[toks[p].toLowerCase()]))
    p++
    if (isSpace(toks[p]) && isWord(toks[p + 1]) && DIGIT_WORDS.has(toks[p + 1].toLowerCase())) p++
    else break
  }
  return { digits, end: p }
}

/** Convert spoken number phrases ("six", "point oh one four", "two point five") to digits. */
function preprocessSpokenNumbers(text) {
  const toks = tokenize(text)
  const out = []
  let i = 0
  while (i < toks.length) {
    const tok = toks[i]
    const lower = isWord(tok) ? tok.toLowerCase() : ''

    if (isWord(tok) && WHOLE_WORDS.has(lower)) {
      let j = i
      const wholeWords = []
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (isWord(toks[j]) && WHOLE_WORDS.has(toks[j].toLowerCase())) {
          wholeWords.push(toks[j].toLowerCase())
          j++
          if (isSpace(toks[j]) && isWord(toks[j + 1]) && WHOLE_WORDS.has(toks[j + 1].toLowerCase())) { j++; continue }
          break
        }
        break
      }
      const wholeVal = wordsToNumber(wholeWords)

      let k = j
      let fraction = ''
      if (isSpace(toks[k]) && isWord(toks[k + 1]) && toks[k + 1].toLowerCase() === 'point') {
        let p = k + 2
        if (isSpace(toks[p])) p++
        const read = readDigitWords(toks, p)
        if (read.digits.length) { fraction = read.digits.join(''); k = read.end }
      }

      if (wholeVal !== null || fraction) {
        out.push((wholeVal !== null ? String(wholeVal) : '0') + (fraction ? '.' + fraction : ''))
        i = k
        continue
      }
    }

    if (lower === 'point') {
      let p = i + 1
      if (isSpace(toks[p])) p++
      const read = readDigitWords(toks, p)
      if (read.digits.length) { out.push('0.' + read.digits.join('')); i = read.end; continue }
    }

    out.push(tok)
    i++
  }
  return out.join('')
}

// ---------- exclusion masking (placeholders, CPT codes, dates) ----------

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december'
const EXCLUDE_PATTERNS = [
  /\{\{[^}]*\}\}/g,                                    // {{field}} template slots
  /\[\[[^\]]*\]\]/g,                                   // [[shared:x]] substitution markers
  /\[[^\]]*\]/g,                                       // [PATIENT NAME], [MRN], etc.
  /\bCPT\b[\s:#-]*\d{4,5}\b/gi,                         // CPT 37228
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,                     // 9/25/2026
  /\b\d{4}-\d{2}-\d{2}\b/g,                             // 2026-09-25
  new RegExp('\\b(' + MONTHS + ')\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}\\b', 'gi'),
]

function maskExcludedSpans(text) {
  let out = text
  for (const re of EXCLUDE_PATTERNS) {
    out = out.replace(re, function (m) { return ' '.repeat(m.length) })
  }
  return out
}

// ---------- unit-anchored extraction patterns (priority order matters) ----------

const PATTERNS = [
  {
    type: 'fluoro',
    re: /\bfluoro(?:scopy)?\s*time\s*(?:of|is|was|:)?\s*(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\s*(?:(\d+(?:\.\d+)?)\s*(?:seconds?|secs?))?\b/gi,
    build: function (m) {
      const min = parseFloat(m[1]); const sec = m[2] ? parseFloat(m[2]) : 0
      const total = Math.round((min * 60 + sec) * 10) / 10
      return { key: 'fluoro:' + total, label: 'fluoro time ' + min + ' min' + (m[2] ? ' ' + sec + ' sec' : '') }
    },
  },
  {
    type: 'fluoro',
    re: /\bfluoro(?:scopy)?\s*time\s*(?:of|is|was|:)?\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?)\b/gi,
    build: function (m) { const total = Math.round(parseFloat(m[1]) * 10) / 10; return { key: 'fluoro:' + total, label: 'fluoro time ' + m[1] + ' sec' } },
  },
  {
    type: 'mgy',
    re: /\b(\d+(?:\.\d+)?)\s*-?\s*mgy\b/gi,
    build: function (m) { return { key: 'mgy:' + parseFloat(m[1]), label: m[1] + ' mGy' } },
  },
  {
    type: 'volume',
    re: /\b(\d+(?:\.\d+)?)\s*-?\s*(?:ml|milliliters?|cc|cubic centimeters?)\b/gi,
    build: function (m) { return { key: 'volume:' + parseFloat(m[1]), label: m[1] + ' mL' } },
  },
  {
    type: 'gauge',
    re: /\b(\d+(?:\.\d+)?)\s*-?\s*(?:gauge|ga)\b/gi,
    build: function (m) { return { key: 'gauge:' + parseFloat(m[1]), label: m[1] + ' gauge' } },
  },
  {
    type: 'french',
    re: /\b(\d+(?:\.\d+)?)(?:\s*-?\s*(?:french|fr)\b|F\b)/gi,
    build: function (m) { return { key: 'fr:' + parseFloat(m[1]), label: m[1] + ' Fr' } },
  },
  {
    type: 'atm',
    re: /\b(\d+(?:\.\d+)?)\s*-?\s*atm\b/gi,
    build: function (m) { return { key: 'atm:' + parseFloat(m[1]), label: m[1] + ' atm' } },
  },
  {
    type: 'wire',
    re: /\b(0?\.\d{2,3})(?:\s*(?:inch|in|"))?\b/gi,
    build: function (m) { return { key: 'wire:' + parseFloat(m[1]), label: parseFloat(m[1]) + '" wire' } },
  },
  {
    type: 'balloon',
    re: /\b(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:mm)?\b/gi,
    build: function (m) { return { key: 'balloon:' + parseFloat(m[1]) + 'x' + parseFloat(m[2]), label: m[1] + ' x ' + m[2] + ' mm balloon/stent' } },
  },
  {
    type: 'mm',
    re: /\b(\d+(?:\.\d+)?)\s*-?\s*(?:mm|millimeters?)\b/gi,
    build: function (m) { return { key: 'mm:' + parseFloat(m[1]), label: m[1] + ' mm' } },
  },
  {
    type: 'cm',
    re: /\b(\d+(?:\.\d+)?)\s*-?\s*(?:cm|centimeters?)\b/gi,
    build: function (m) { return { key: 'cm:' + parseFloat(m[1]), label: m[1] + ' cm' } },
  },
]

/** All normalized measurements in `text`, each with a comparable key, a display label, and context. */
export function extractMeasurements(text) {
  if (!text) return []
  const pre = preprocessSpokenNumbers(text)
  let working = maskExcludedSpans(pre)
  const found = []
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0
    let m
    while ((m = pattern.re.exec(working))) {
      const start = m.index, end = start + m[0].length
      const built = pattern.build(m)
      if (built) {
        const ctxStart = Math.max(0, start - 40)
        const ctxEnd = Math.min(pre.length, end + 40)
        found.push(Object.assign({ type: pattern.type }, built, {
          match: m[0].trim(),
          context: pre.slice(ctxStart, ctxEnd).trim(),
        }))
      }
      working = working.slice(0, start) + ' '.repeat(end - start) + working.slice(end)
    }
  }
  return found
}

function dedupeByKey(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    if (!seen.has(item.key)) { seen.add(item.key); out.push(item) }
  }
  return out
}

/**
 * Compare measurements dictated vs. what landed in the generated note.
 * sharedText: the raw (unfilled) shared-component text, used to exclude fixed boilerplate
 * numbers from the UNSOURCED list. Filled template slots still compare normally, since a
 * `{{field}}` placeholder has no digit until it's filled.
 */
export function compareMeasurements(dictationText, noteText, sharedText) {
  const dictated = dedupeByKey(extractMeasurements(dictationText || ''))
  const noted = dedupeByKey(extractMeasurements(noteText || ''))
  const boilerplateKeys = new Set(extractMeasurements(sharedText || '').map(function (x) { return x.key }))
  const dictatedKeys = new Set(dictated.map(function (x) { return x.key }))
  const notedKeys = new Set(noted.map(function (x) { return x.key }))

  const missing = dictated
    .filter(function (d) { return !notedKeys.has(d.key) })
    .map(function (d) {
      return { type: d.type, key: d.key, phrase: d.label, context: d.context, kind: 'missing',
               severity: 'high', message: d.label + ' dictated, not found in note' }
    })

  const unsourced = noted
    .filter(function (n) { return !dictatedKeys.has(n.key) && !boilerplateKeys.has(n.key) })
    .map(function (n) {
      return { type: n.type, key: n.key, phrase: n.label, context: n.context, kind: 'unsourced',
               severity: 'medium', message: n.label + ' in note, not found in dictation (possible hallucination)' }
    })

  return { missing: missing, unsourced: unsourced }
}

export { preprocessSpokenNumbers }
