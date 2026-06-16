import { getTraining, getShared, getUserPrefs, logUsage, checkAndSendAlert } from '../../lib/storage'
import { getUserFromRequest } from '../../lib/auth'

var REQUIRED_FIELDS = ['date','physician','patient_name','mrn','indication','complications','impression']

function smartOmit(text, hiddenFields) {
  hiddenFields = hiddenFields || []
  var lines = text.split('\n')
  var result = lines.filter(function(line) {
    var matches = line.match(/\{\{([^}]+)\}\}/g)
    if (!matches) return true
    var fieldNames = matches.map(function(m) { return m.slice(2,-2) })
    var hasRequired = fieldNames.some(function(f) { return REQUIRED_FIELDS.indexOf(f) !== -1 })
    if (hasRequired) return true
    return false
  })
  if (hiddenFields.length > 0) {
    result = result.filter(function(line) {
      return !hiddenFields.some(function(f) {
        var pattern = new RegExp(f.replace(/_/g, '[_ ]'), 'i')
        return pattern.test(line)
      })
    })
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function scoreSimilarity(rawNote, techniqueTag) {
  var noteWords = rawNote.toLowerCase().split(/\W+/).filter(Boolean)
  var tagWords = (techniqueTag || '').toLowerCase().split(/\W+/).filter(Boolean)
  if (tagWords.length === 0) return 0
  return tagWords.filter(function(w) { return noteWords.indexOf(w) !== -1 }).length / tagWords.length
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  var noteText = req.body.note_text
  var procedureKey = req.body.procedure_key
  if (!noteText || !procedureKey) return res.status(400).json({ error: 'Missing fields' })

  var user = await getUserFromRequest(req)
  var uid = user ? user.uid : 'anonymous'

  var results = await Promise.all([getTraining(), getShared(), getUserPrefs(uid)])
  var training = results[0]; var shared = results[1]; var userPrefs = results[2]

  var procTraining = training[procedureKey]
  if (!procTraining || !procTraining.examples || procTraining.examples.length === 0) {
    return res.json({ note: noteText, used_training: false })
  }

  var scored = procTraining.examples.map(function(ex) { return { ex: ex, score: scoreSimilarity(noteText, ex.technique_tag) } })
  scored.sort(function(a, b) { return b.score - a.score })
  var top = scored.slice(0, 3)

  var exText = top.map(function(item, i) { return 'EXAMPLE ' + (i+1) + ' [' + (item.ex.technique_tag || 'general') + ']:\nRAW: ' + item.ex.raw_note + '\nIDEAL: ' + item.ex.ideal_dictation }).join('\n\n---\n\n')
  var sharedText = Object.entries(shared).map(function(e) { return '[' + e[0].toUpperCase() + ' - USE VERBATIM]:\n' + e[1] }).join('\n\n')

  var procPrefs = userPrefs[procedureKey] || {}
  var hiddenFields = procPrefs.hidden_fields || []
  var hiddenNote = hiddenFields.length > 0 ? '\nOMIT these fields entirely: ' + hiddenFields.join(', ') : ''

  var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929', max_tokens: 3000,
      system: 'Rewrite IR procedure notes to match the physician\'s exact style. Use protected text verbatim. SMART OMISSION: omit any section not supported by the note content (fellows, residents, APPs if not mentioned; contrast volume if not recorded; etc.).' + hiddenNote,
      messages: [{ role: 'user', content: 'Rewrite to match my style.\n\nMY STYLE:\n' + exText + '\n\nPROTECTED TEXT (verbatim):\n' + sharedText + '\n\nNOTE TO REWRITE:\n' + noteText }]
    })
  })

  if (!aiRes.ok) return res.status(502).json({ error: 'AI error' })
  var aiData = await aiRes.json()
  var text = aiData.content.map(function(i) { return i.text || '' }).join('')
  text = smartOmit(text, hiddenFields)
  var cost = await logUsage('refine', procedureKey, (aiData.usage && aiData.usage.input_tokens) || 0, (aiData.usage && aiData.usage.output_tokens) || 0)
  await checkAndSendAlert(cost)
  return res.json({ note: text, used_training: true, examples_used: top.length })
}
