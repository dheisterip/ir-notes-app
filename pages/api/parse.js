import { getTemplates, getTraining, getShared, logUsage, checkAndSendAlert } from '../../lib/storage'

function scoreSimilarity(note, keywords) {
  if (!keywords || keywords.length === 0) return 0
  var noteL = note.toLowerCase()
  var hits = keywords.filter(function(kw) { return noteL.indexOf(kw.toLowerCase()) !== -1 }).length
  return hits / keywords.length
}

function fillTemplate(tmpl, vars, shared) {
  var out = tmpl
  out = out.replace(/\{\{shared:(\w+)\}\}/g, function(_, k) { return shared[k] || '[[shared:' + k + ']]' })
  Object.entries(vars).forEach(function(entry) {
    out = out.replace(new RegExp('\\{\\{' + entry[0] + '\\}\\}', 'g'), entry[1] || '{{' + entry[0] + '}}')
  })
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { note } = req.body
  if (!note || typeof note !== 'string' || note.length > 20000) return res.status(400).json({ error: 'Invalid note' })

  const [templates, training, shared] = await Promise.all([getTemplates(), getTraining(), getShared()])

  // Build full procedure list: templates + training-only procedures
  var allProcs = {}
  Object.entries(templates).forEach(function(e) { allProcs[e[0]] = { name: e[1].name, keywords: e[1].keywords || [], has_template: true } })
  Object.entries(training).forEach(function(e) { if (!allProcs[e[0]]) allProcs[e[0]] = { name: e[1].name || e[0], keywords: [], has_template: false } })

  var procList = Object.entries(allProcs).map(function(e) { return e[0] + ': ' + e[1].name + (e[1].keywords.length ? ' (' + e[1].keywords.slice(0,5).join(', ') + ')' : '') }).join('\n')

  // Detect procedure + extract variables in one call
  var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You are an IR procedure note parser. Return ONLY valid JSON, no markdown, no backticks.',
      messages: [{ role: 'user', content: 'Identify the procedure and extract variables.\n\nPROCEDURES:\n' + procList + '\n\nReturn JSON:\n{"procedure_key":"key","procedure_name":"name","variables":{"date":"","physician":"","patient_name":"","mrn":"","side":"","access_site":"","access_vessel":"","catheter_type":"","catheter_length":"","catheter_french":"","catheter_lumens":"","catheter_tip_position":"","port_type":"","suture_type":"","gauge":"","sheath_size":"","fluoroscopy_time":"","radiation_mgy":"","radiation_dap":"","moderate_sedation_time":"","indication":"","complications":"None","impression":"","pre_abi":"","post_abi":"","post_pulses":"","contrast_volume":"","contrast_type":"","closure_method":"","pe_classification":"","device_type":"","treatment_duration":"","collection_location":"","collection_size":"","guidance_modality":"","patient_position":"","initial_output":"","fluid_character":""}}\n\nNOTE:\n' + note }]
    })
  })

  if (!aiRes.ok) return res.status(502).json({ error: 'AI error' })
  const aiData = await aiRes.json()
  const txt = aiData.content.map(function(i) { return i.text || '' }).join('').replace(/```json|```/g, '').trim()
  var parsed
  try { parsed = JSON.parse(txt) } catch { return res.status(500).json({ error: 'Failed to parse AI response' }) }

  const inTok = aiData.usage?.input_tokens || 0
  const outTok = aiData.usage?.output_tokens || 0
  const proc = allProcs[parsed.procedure_key]
  const hasTemplate = proc ? proc.has_template : true

  if (!hasTemplate) {
    // Training-only: generate full note from training examples
    const procTraining = training[parsed.procedure_key]
    if (!procTraining || !procTraining.examples || procTraining.examples.length === 0) {
      const totalCost = await logUsage('parse', parsed.procedure_key, inTok, outTok)
      await checkAndSendAlert(totalCost)
      return res.json({ procedure_key: parsed.procedure_key, procedure_name: parsed.procedure_name, variables: {}, has_template: false, generated: '', no_examples: true })
    }

    var examples = procTraining.examples.slice(0, 5)
    var exText = examples.map(function(ex, i) { return 'EXAMPLE ' + (i+1) + ' [' + (ex.technique_tag || 'general') + ']:\nRAW: ' + ex.raw_note + '\nIDEAL: ' + ex.ideal_dictation }).join('\n\n---\n\n')
    var sharedText = Object.entries(shared).map(function(e) { return '[' + e[0].toUpperCase() + ' - VERBATIM]:\n' + e[1] }).join('\n\n')

    var genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 3000,
        system: 'Generate IR procedure notes matching the physician\'s exact dictation style. Use protected text verbatim.',
        messages: [{ role: 'user', content: 'Generate a procedure note matching my style.\n\nMY STYLE EXAMPLES:\n' + exText + '\n\nPROTECTED TEXT (verbatim):\n' + sharedText + '\n\nRAW DICTATION:\n' + note }]
      })
    })

    const genData = await genRes.json()
    const generated = genData.content.map(function(i) { return i.text || '' }).join('')
   totalCost = await logUsage('parse', parsed.procedure_key, inTok + (genData.usage?.input_tokens || 0), outTok + (genData.usage?.output_tokens || 0))
    return res.json({ procedure_key: parsed.procedure_key, procedure_name: parsed.procedure_name, variables: {}, has_template: false, generated: generated })
  }

  // Template-based: fill template with extracted variables
  const tmpl = templates[parsed.procedure_key]
  const filled = tmpl ? fillTemplate(tmpl.template, parsed.variables || {}, shared) : ''
  const totalCost = await logUsage('parse', parsed.procedure_key, inTok, outTok)
  await checkAndSendAlert(totalCost)
  return res.json({ procedure_key: parsed.procedure_key, procedure_name: parsed.procedure_name, variables: parsed.variables || {}, has_template: true, generated: filled })
}
