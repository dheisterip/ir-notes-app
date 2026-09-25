#!/usr/bin/env node
/**
 * Scores golden-set/cases.json against the live generation pipeline.
 *
 * Boots the real app with `next dev` and calls it over HTTP (login -> /api/parse), the same way
 * the browser does, so it exercises middleware/auth exactly like production. See
 * golden-set/README.md for what it needs (env vars) and what --summary-only changes.
 *
 * STUB: the measurement comparison below is a placeholder regex, not the real deterministic
 * measurement validator (CLAUDE.md build order step 2). It exists only to prove out the report
 * shape; replace compareMeasurementsStub() with the real module once it exists.
 */
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.join(__dirname, '..')
const CASES_PATH = path.join(ROOT, 'golden-set', 'cases.json')
const RESULTS_DIR = path.join(ROOT, 'golden-set', 'results')
const PORT = process.env.GOLDEN_SET_PORT || 4319
const BASE = 'http://127.0.0.1:' + PORT
const SUMMARY_ONLY = process.argv.includes('--summary-only')
const READY_TIMEOUT_MS = 60000

// ---------- dependency-free comparison helpers ----------

function tokenizeWords(text) {
  return (text || '').toLowerCase().match(/[a-z0-9.]+/g) || []
}

function wordOverlapPct(a, b) {
  const wa = new Set(tokenizeWords(a))
  const wb = new Set(tokenizeWords(b))
  if (wa.size === 0 && wb.size === 0) return null
  const union = new Set([...wa, ...wb])
  if (union.size === 0) return null
  let shared = 0
  wa.forEach(function (w) { if (wb.has(w)) shared++ })
  return Math.round((shared / union.size) * 1000) / 10
}

function levenshtein(a, b) {
  a = a || ''; b = b || ''
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev; prev = curr; curr = tmp
  }
  return prev[n]
}

function editDistancePct(a, b) {
  a = a || ''; b = b || ''
  if (!a && !b) return null
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return null
  return Math.round((1 - levenshtein(a, b) / maxLen) * 1000) / 10
}

// Simple LCS-based line diff -> [{type: 'same'|'added'|'removed', line}]
function lineDiff(aText, bText) {
  const a = (aText || '').split('\n')
  const b = (bText || '').split('\n')
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, function () { return new Array(n + 1).fill(0) })
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  let i = 0, j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ type: 'same', line: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'removed', line: a[i] }); i++ }
    else { out.push({ type: 'added', line: b[j] }); j++ }
  }
  while (i < m) { out.push({ type: 'removed', line: a[i] }); i++ }
  while (j < n) { out.push({ type: 'added', line: b[j] }); j++ }
  return out
}

// ---------- STUB measurement extraction (placeholder for the real validator) ----------

const MEASUREMENT_STUB_RE = /\b\d+(\.\d+)?\s?(mm|cm|fr|french|ml|cc|atm|mgy|gauge|min|minutes|sec|seconds)\b/gi

function extractMeasurementsStub(text) {
  return ((text || '').match(MEASUREMENT_STUB_RE) || [])
    .map(function (m) { return m.toLowerCase().replace(/\s+/g, ' ').trim() })
}

function compareMeasurementsStub(dictation, note) {
  const dictated = extractMeasurementsStub(dictation)
  const noted = extractMeasurementsStub(note)
  return {
    dictated: dictated,
    noted: noted,
    missing: dictated.filter(function (m) { return noted.indexOf(m) === -1 }),
    unsourced: noted.filter(function (m) { return dictated.indexOf(m) === -1 }),
  }
}

// ---------- server lifecycle + HTTP calls ----------

function spawnServer() {
  const bin = path.join(ROOT, 'node_modules', '.bin', 'next')
  return spawn(bin, ['dev', '-p', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { NEXT_TELEMETRY_DISABLED: '1' }),
  })
}

async function waitForReady(deadline) {
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + '/login')
      if (r.status) return true
    } catch (e) { /* not up yet */ }
    await new Promise(function (r) { setTimeout(r, 500) })
  }
  return false
}

async function login() {
  const res = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.GOLDEN_SET_PASSWORD || process.env.ADMIN_PASSWORD || '' }),
  })
  const setCookie = res.headers.get('set-cookie')
  const data = await res.json().catch(function () { return {} })
  if (!res.ok || !setCookie) return { ok: false, reason: data.error || ('login failed: HTTP ' + res.status) }
  return { ok: true, cookie: setCookie.split(';')[0] }
}

async function callParse(cookie, note) {
  try {
    const res = await fetch(BASE + '/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ note: note }),
    })
    const data = await res.json().catch(function () { return {} })
    if (!res.ok || data.error) return { ok: false, reason: data.error || ('HTTP ' + res.status) }
    return { ok: true, generated: data.generated || '', noExamples: !!data.no_examples, procedureKey: data.procedure_key }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

// ---------- orchestration ----------

function isNum(x) { return typeof x === 'number' && !Number.isNaN(x) }
function avg(arr) { return arr.length ? Math.round((arr.reduce(function (a, b) { return a + b }, 0) / arr.length) * 10) / 10 : null }
function sum(arr) { return arr.reduce(function (a, b) { return a + b }, 0) }

async function main() {
  const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'))
  fs.mkdirSync(RESULTS_DIR, { recursive: true })

  console.log('Booting next dev on port ' + PORT + ' ...')
  const server = spawnServer()
  let serverErr = ''
  server.stderr.on('data', function (d) { serverErr += d.toString() })

  const results = []
  let authInfo = { ok: false, reason: 'not attempted' }

  try {
    const up = await waitForReady(Date.now() + READY_TIMEOUT_MS)
    if (!up) throw new Error('dev server did not become ready within ' + (READY_TIMEOUT_MS / 1000) + 's\n' + serverErr.slice(-1000))

    authInfo = await login()
    console.log(authInfo.ok
      ? 'Auth: OK'
      : 'Auth: FAILED (' + authInfo.reason + ') — every case will be marked skipped_no_auth. Expected without .env.local; see golden-set/README.md.')

    for (const c of cases) {
      const result = { id: c.id, procedureVariant: c.procedureVariant }

      if (!c.dictation || !c.dictation.trim()) {
        result.status = 'skipped_empty_case'
        results.push(result)
        console.log('  ' + c.id + ' (' + c.procedureVariant + '): skipped (empty dictation)')
        continue
      }
      if (!authInfo.ok) {
        result.status = 'skipped_no_auth'
        results.push(result)
        console.log('  ' + c.id + ' (' + c.procedureVariant + '): skipped (no auth)')
        continue
      }

      const gen = await callParse(authInfo.cookie, c.dictation)
      if (!gen.ok) {
        result.status = 'generation_failed'
        result.reason = gen.reason
        results.push(result)
        console.log('  ' + c.id + ' (' + c.procedureVariant + '): generation FAILED — ' + gen.reason)
        continue
      }
      if (gen.noExamples) {
        result.status = 'no_training_examples'
        results.push(result)
        console.log('  ' + c.id + ' (' + c.procedureVariant + '): no training examples for this procedure yet')
        continue
      }

      result.generated = gen.generated
      if (!c.finalNote || !c.finalNote.trim()) {
        result.status = 'generated_no_golden_note'
        results.push(result)
        console.log('  ' + c.id + ' (' + c.procedureVariant + '): generated, but no finalNote to compare against yet')
        continue
      }

      result.status = 'scored'
      result.closenessWordOverlapPct = wordOverlapPct(gen.generated, c.finalNote)
      result.closenessEditDistancePct = editDistancePct(gen.generated, c.finalNote)
      result.measurements = compareMeasurementsStub(c.dictation, gen.generated)
      if (!SUMMARY_ONLY) result.diff = lineDiff(c.finalNote, gen.generated)
      results.push(result)
      console.log('  ' + c.id + ' (' + c.procedureVariant + '): scored — word-overlap ' +
        result.closenessWordOverlapPct + '%, edit-distance ' + result.closenessEditDistancePct + '%')
    }
  } finally {
    server.kill('SIGTERM')
  }

  const scored = results.filter(function (r) { return r.status === 'scored' })
  const summary = {
    ranAt: new Date().toISOString(),
    totalCases: cases.length,
    authOk: authInfo.ok,
    authReason: authInfo.ok ? null : authInfo.reason,
    byStatus: results.reduce(function (acc, r) { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {}),
    scoredCases: scored.length,
    avgWordOverlapPct: avg(scored.map(function (r) { return r.closenessWordOverlapPct }).filter(isNum)),
    avgEditDistancePct: avg(scored.map(function (r) { return r.closenessEditDistancePct }).filter(isNum)),
    totalMeasurementMissing: sum(scored.map(function (r) { return r.measurements.missing.length })),
    totalMeasurementUnsourced: sum(scored.map(function (r) { return r.measurements.unsourced.length })),
  }

  console.log('\n--- Summary ---')
  console.log(JSON.stringify(summary, null, 2))

  const stamp = summary.ranAt.replace(/[:.]/g, '-')
  const outPath = path.join(RESULTS_DIR, stamp + (SUMMARY_ONLY ? '-summary' : '') + '.json')
  const payload = SUMMARY_ONLY
    ? { summary: summary, cases: results.map(function (r) {
        return { id: r.id, procedureVariant: r.procedureVariant, status: r.status,
                 closenessWordOverlapPct: r.closenessWordOverlapPct, closenessEditDistancePct: r.closenessEditDistancePct }
      }) }
    : { summary: summary, cases: results }
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
  console.log('\nWrote ' + outPath)
}

main().catch(function (e) {
  console.error('Harness crashed:', e)
  process.exit(1)
})
