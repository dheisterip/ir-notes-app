import { getTraining, getShared, logUsage, checkAndSendAlert } from '../../lib/storage'

function scoreSimilarity(rawNote, techniqueTag) {
  var noteWords = rawNote.toLowerCase().split(/\W+/).filter(Boolean)
  var tagWords = (techniqueTag || '').toLowerCase().split(/\W+/).filter(Boolean)
  if (tagWords.length === 0) return 0
  return tagWords.filter(function(w) { return noteWords.indexOf(w) !== -1 }).length / tagWords.length
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { note_text, procedure_key } = req.body
  if (!note_text || !procedure_key) return res.status(400).json({ error: 'Missing fields' })

  const [training, shared] = await Promise.all([getTraining(), getShared()])
  const procTraining = training[procedure_key]
  if (!procTraining || !procTraining.examples || procTraining.examples.length === 0) {
    return res.json({ note: note_text, used_training: false })
  }

  var scored = procTraining.examples.map(function(ex) { return { ex: ex, score: scoreSimilarity(note_text, ex.technique_tag) } })
  scored.sort(function(a, b) { return b.score - a.score })
  var top = scored.slice(0, 3)

  var exText = top.map(function(item, i) { return 'EXAMPLE ' + (i+1) + ' [' + (item.ex.technique_tag || 'general') + ']:\nRAW: ' + item.ex.raw_note + '\nIDEAL: ' + item.ex.ideal_dictation }).join('\n\n---\n\n')
  var sharedText = Object.entries(shared).map(function(e) { return '[' + e[0].toUpperCase() + ' - USE VERBATIM]:\n' + e[1] }).join('\n\n')

  var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 3000,
      system: 'Rewrite IR procedure notes to exactly match the physician\'s dictation style. Use protected text verbatim. Never invent clinical data.',
      messages: [{ role: 'user', content: 'Rewrite this note to match my style exactly.\n\nMY STYLE:\n' + exText + '\n\nPROTECTED TEXT (verbatim):\n' + sharedText + '\n\nNOTE TO REWRITE:\n' + note_text }]
    })
  })

  if (!aiRes.ok) return res.status(502).json({ error: 'AI error' })
  const aiData = await aiRes.json()
  const text = aiData.content.map(function(i) { return i.text || '' }).join('')
  const totalCost = await logUsage('refine', procedure_key, aiData.usage?.input_tokens || 0, aiData.usage?.output_tokens || 0)
  await checkAndSendAlert(totalCost)
  return res.json({ note: text, used_training: true, examples_used: top.length })
}
