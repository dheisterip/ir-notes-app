import { getEffectiveTemplates, getTraining, getShared, getUserPrefs, logUsage, checkAndSendAlert } from '../../lib/storage'
import { getUserFromRequest } from '../../lib/auth'

var REQUIRED_FIELDS = ['date','physician','patient_name','mrn','indication','complications','impression','procedure_description']
var MODEL = 'claude-sonnet-4-5-20250929'

function fillTemplate(tmpl, vars, shared) {
  var out = tmpl
  out = out.replace(/\{\{shared:(\w+)\}\}/g, function(_, k) { return shared[k] || '[[shared:' + k + ']]' })
  Object.entries(vars).forEach(function(e) { out = out.replace(new RegExp('\\{\\{' + e[0] + '\\}\\}', 'g'), e[1] || '{{' + e[0] + '}}') })
  return out
}

function smartOmit(text, hiddenFields) {
  hiddenFields = hiddenFields || []
  var lines = text.split('\n')
  var result = lines.filter(function(line) {
    var matches = line.match(/\{\{([^}]+)\}\}/g)
    if (!matches) return true
    var fieldNames = matches.map(function(m) { return m.slice(2,-2) })
    var hasRequired = fieldNames.some(function(f) { return REQUIRED_FIELDS.indexOf(f) !== -1 })
    return hasRequired
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  var note = req.body.note
  if (!note || typeof note !== 'string' || note.length > 20000) return res.status(400).json({ error: 'Invalid note' })

  var user = await getUserFromRequest(req)
  var uid = user ? user.uid : 'anonymous'

  var results = await Promise.all([
    getEffectiveTemplates(uid), getTraining(), getShared(), getUserPrefs(uid)
  ])
  var templates = results[0]; var training = results[1]; var shared = results[2]; var userPrefs = results[3]

  var allProcs = {}
  Object.entries(templates).forEach(function(e) { allProcs[e[0]] = { name: e[1].name, keywords: e[1].keywords || [], has_template: true } })
  Object.entries(training).forEach(function(e) { if (!allProcs[e[0]]) allProcs[e[0]] = { name: e[1].name || e[0], keywords: [], has_template: false } })

  var procList = Object.entries(allProcs).map(function(e) {
    return e[0] + ': ' + e[1].name + (e[1].keywords.length ? ' (' + e[1].keywords.slice(0,5).join(', ') + ')' : '')
  }).join('\n')

  var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1500,
      system: 'You are an IR procedure note parser. Return ONLY valid JSON, no markdown.',
      messages: [{ role: 'user', content: 'Identify procedure and extract variables.\n\nPROCEDURES:\n' + procList + '\n\nReturn JSON:\n{"procedure_key":"key","procedure_name":"name","variables":{"date":"","physician":"","patient_name":"","mrn":"","side":"","access_site":"","access_vessel":"","catheter_type":"","catheter_length":"","catheter_french":"","catheter_lumens":"","catheter_tip_position":"","port_type":"","suture_type":"","gauge":"","sheath_size":"","fluoroscopy_time":"","radiation_mgy":"","radiation_dap":"","moderate_sedation_time":"","indication":"","complications":"None","impression":"","pre_abi":"","post_abi":"","post_pulses":"","contrast_volume":"","contrast_type":"","closure_method":"","pe_classification":"","device_type":"","treatment_duration":"","collection_location":"","collection_size":"","guidance_modality":"","patient_position":"","initial_output":"","fluid_character":""}}\n\nLeave fields empty string if not mentioned.\n\nNOTE:\n' + note }]
    })
  })

  if (!aiRes.ok) {
    var errText = await aiRes.text()
    console.error('First AI call failed:', aiRes.status, errText)
    return res.status(502).json({ error: 'AI detection error: ' + errText.substring(0, 200) })
  }
  var aiData = await aiRes.json()
  var txt = aiData.content.map(function(i) { return i.text || '' }).join('').replace(/```json|```/g, '').trim()
  var parsed
  try { parsed = JSON.parse(txt) } catch (e) {
    console.error('JSON parse error:', e.message, 'raw:', txt.substring(0, 500))
    return res.status(500).json({ error: 'Failed to parse AI JSON response' })
  }

  var inTok = (aiData.usage && aiData.usage.input_tokens) || 0
  var outTok = (aiData.usage && aiData.usage.output_tokens) || 0
  var proc = allProcs[parsed.procedure_key]
  var hasTemplate = proc ? proc.has_template : true
  var cost = 0
  var procPrefs = userPrefs[parsed.procedure_key] || {}
  var hiddenFields = procPrefs.hidden_fields || []

  if (!hasTemplate) {
    var procTraining = training[parsed.procedure_key]
    if (!procTraining || !procTraining.examples || procTraining.examples.length === 0) {
      cost = await logUsage('parse', parsed.procedure_key, inTok, outTok)
      await checkAndSendAlert(cost)
      return res.json({ procedure_key: parsed.procedure_key, procedure_name: parsed.procedure_name, variables: {}, has_template: false, generated: '', no_examples: true })
    }

    var examples = procTraining.examples.slice(0, 5)
    var exText = examples.map(function(ex, i) { return 'EXAMPLE ' + (i+1) + ' [' + (ex.technique_tag || 'general') + ']:\nRAW: ' + ex.raw_note + '\nIDEAL: ' + ex.ideal_dictation }).join('\n\n---\n\n')
    var sharedText = Object.entries(shared).map(function(e) { return '[' + e[0].toUpperCase() + ' - VERBATIM]:\n' + e[1] }).join('\n\n')
    var hiddenNote = hiddenFields.length > 0 ? '\nOMIT these fields entirely: ' + hiddenFields.join(', ') : ''

    var genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 3000,
        system: 'Generate IR procedure notes matching the physician style. Use protected text verbatim. SMART OMISSION: omit any section not supported by the raw note (e.g. if fellows not mentioned, omit that line).' + hiddenNote,
        messages: [{ role: 'user', content: 'Generate a procedure note matching my style.\n\nMY STYLE EXAMPLES:\n' + exText + '\n\nPROTECTED TEXT (verbatim):\n' + sharedText + '\n\nRAW DICTATION:\n' + note }]
      })
    })

    if (!genRes.ok) {
      var genErr = await genRes.text()
      console.error('Generation AI call failed:', genRes.status, genErr)
      return res.status(502).json({ error: 'AI generation error: ' + genErr.substring(0, 200) })
    }

    var genData = await genRes.json()
    var generated = genData.content.map(function(i) { return i.text || '' }).join('')
    generated = smartOmit(generated, hiddenFields)
    var genIn = (genData.usage && genData.usage.input_tokens) || 0
    var genOut = (genData.usage && genData.usage.output_tokens) || 0
    cost = await logUsage('parse', parsed.procedure_key, inTok + genIn, outTok + genOut)
    await checkAndSendAlert(cost)
    return res.json({ procedure_key: parsed.procedure_key, procedure_name: parsed.procedure_name, variables: {}, has_template: false, generated: generated })
  }

  var tmpl = templates[parsed.procedure_key]
  var filled = tmpl ? fillTemplate(tmpl.template, parsed.variables || {}, shared) : ''
  filled = smartOmit(filled, hiddenFields)
  cost = await logUsage('parse', parsed.procedure_key, inTok, outTok)
  await checkAndSendAlert(cost)
  return res.json({ procedure_key: parsed.procedure_key, procedure_name: parsed.procedure_name, variables: parsed.variables || {}, has_template: true, generated: filled })
}
