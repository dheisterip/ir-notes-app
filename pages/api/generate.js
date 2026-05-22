import { getTraining, getShared } from '../../lib/storage'

var GENERATE_COST = 0.03

function scoreSimilarity(noteText, techniqueTag) {
  var noteWords = noteText.toLowerCase().split(/\W+/).filter(Boolean)
  var tagWords = (techniqueTag || '').toLowerCase().split(/\W+/).filter(Boolean)
  if (tagWords.length === 0) return 0
  var matches = tagWords.filter(function(w) { return noteWords.indexOf(w) !== -1 }).length
  return matches / tagWords.length
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  var noteText = req.body.note_text
  var procedureKey = req.body.procedure_key
  var procedureName = req.body.procedure_name

  if (!noteText || !procedureKey) return res.status(400).json({ error: 'Missing fields' })

  var training = await getTraining()
  var shared = await getShared()
  var procTraining = training[procedureKey]

  if (!procTraining || !procTraining.examples || procTraining.examples.length === 0) {
    return res.status(400).json({ error: 'No training examples for this procedure' })
  }

  var scored = procTraining.examples.map(function(ex) {
    return { ex: ex, score: scoreSimilarity(noteText, ex.technique_tag || '') }
  })
  scored.sort(function(a, b) { return b.score - a.score })
  var top = scored.slice(0, 3)
  if (top.every(function(item) { return item.score === 0 })) top = scored.slice(0, Math.min(2, scored.length))

  var examplesText = top.map(function(item, i) {
    return 'EXAMPLE ' + (i + 1) + ' [Technique: ' + (item.ex.technique_tag || 'general') + ']\n\nRAW NOTE:\n' + item.ex.raw_note + '\n\nIDEAL DICTATION:\n' + item.ex.ideal_dictation
  }).join('\n\n---\n\n')

  var sharedText = Object.entries(shared).map(function(entry) {
    return 'PROTECTED BLOCK [' + entry[0] + '] - COPY THIS VERBATIM:\n' + entry[1]
  }).join('\n\n')

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: 'You are an interventional radiology dictation assistant. Generate a complete formal procedure note for ' + procedureName + ' based on the physician\'s raw notes and matching their exact dictation style from the examples provided. RULES: (1) Match style, structure, and phrasing exactly. (2) Use PROTECTED BLOCKS verbatim. (3) Keep all clinical values from the raw note. (4) Do not invent clinical information. (5) Generate a complete, polished procedure note ready for the medical record.',
      messages: [{ role: 'user', content: 'My ideal dictation style examples:\n\n' + examplesText + '\n\n---\n\nProtected text blocks (use verbatim):\n\n' + sharedText + '\n\n---\n\nGenerate a complete procedure note from this raw note:\n\n' + noteText }]
    })
  })

  if (!response.ok) return res.status(502).json({ error: 'AI error' })

  var data = await response.json()
  var text = data.content.map(function(i) { return i.text || '' }).join('')

  fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ procedure: procedureKey, call_type: 'generate', est_cost: GENERATE_COST }) }).catch(function() {})

  return res.json({ note: text, examples_used: top.length })
}
