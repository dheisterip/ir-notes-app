import { getTraining, getShared, getUserPrefs, logUsage, checkAndSendAlert } from '../../lib/storage'
import { getUserFromRequest } from '../../lib/auth'
import { findNearestDictation } from '../../lib/retrieval'
import { compareMeasurements } from '../../lib/measurements'

var MODEL = 'claude-sonnet-4-5-20250929'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  var note = req.body.note
  var procedureKey = req.body.procedure_key
  if (!note || !procedureKey) return res.status(400).json({ error: 'Missing fields' })

  var user = await getUserFromRequest(req)
  var uid = user ? user.uid : 'anonymous'

  var results = await Promise.all([getTraining(), getShared(), getUserPrefs(uid)])
  var training = results[0]; var shared = results[1]; var userPrefs = results[2]

  var retrieval = findNearestDictation(training, procedureKey, note)
  if (!retrieval.baseDictation) {
    return res.status(400).json({ error: 'No stored examples to retrieve a base dictation from for this procedure' })
  }

  var procPrefs = userPrefs[procedureKey] || {}
  var hiddenFields = procPrefs.hidden_fields || []
  var hiddenNote = hiddenFields.length > 0 ? '\nOMIT these fields/sections entirely: ' + hiddenFields.join(', ') : ''
  var sharedText = Object.entries(shared).map(function(e) { return '[' + e[0].toUpperCase() + ' - USE VERBATIM]:\n' + e[1] }).join('\n\n')

  var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 3000,
      system: 'You are editing an existing IR PACS dictation to match a new post-procedure note. ' +
        'This is CONSTRAINED EDITING, not free generation: the BASE DICTATION below is a real prior dictation for the ' +
        'same kind of procedure. Edit it against the NEW POST-PROCEDURE NOTE: update clinical values (sizes, sides, ' +
        'vessels, devices, times, volumes) to match the new note, remove steps/sections the new note does not support, ' +
        'insert steps the new note describes that the base dictation lacks. Do NOT rewrite sentences the new note does ' +
        'not contradict — most of the base dictation\'s wording should pass through unchanged. Use PROTECTED TEXT ' +
        'blocks verbatim.' + hiddenNote,
      messages: [{ role: 'user', content:
        'BASE DICTATION (edit this):\n' + retrieval.baseDictation +
        '\n\n---\n\nPROTECTED TEXT (verbatim):\n' + sharedText +
        '\n\n---\n\nNEW POST-PROCEDURE NOTE:\n' + note }],
    }),
  })

  if (!aiRes.ok) {
    var errText = await aiRes.text()
    console.error('Retrieval edit AI call failed:', aiRes.status, errText)
    return res.status(502).json({ error: 'AI edit error: ' + errText.substring(0, 200) })
  }

  var aiData = await aiRes.json()
  var generated = aiData.content.map(function(i) { return i.text || '' }).join('').trim()
  var inTok = (aiData.usage && aiData.usage.input_tokens) || 0
  var outTok = (aiData.usage && aiData.usage.output_tokens) || 0
  var cost = await logUsage('retrieve', procedureKey, inTok, outTok)
  await checkAndSendAlert(cost)

  var warnings = compareMeasurements(note, generated, sharedText)

  return res.json({
    procedure_key: procedureKey,
    generated: generated,
    measurementWarnings: warnings.missing.concat(warnings.unsourced),
    matchScore: retrieval.score,
    matchedExampleId: retrieval.match.id,
    matchedTechniqueTag: retrieval.match.technique_tag || null,
  })
}
