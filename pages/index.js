import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { DEFAULT_SHARED, DEFAULT_TEMPLATES } from '../lib/defaults'

var HIGH_VAR_DEFAULTS = ['peripheral_angiogram','pulmonary_thrombectomy','dialysis_access','venoplasty','thrombolysis','vertebroplasty','embolization','mesenteric_angiogram']

function fillTemplate(tmpl, vars, shared) {
  var out = tmpl
  out = out.replace(/\{\{shared:(\w+)\}\}/g, function(_, k) { return shared[k] || '[[shared:' + k + ']]' })
  Object.entries(vars).forEach(function(e) { out = out.replace(new RegExp('\\{\\{' + e[0] + '\\}\\}', 'g'), e[1] || '{{' + e[0] + '}}') })
  return out
}

function HighlightedNote(props) {
  var parts = props.text.split(/(\{\{[^}]+\}\})/g)
  return (
    <pre style={{ fontFamily: 'Courier New,monospace', fontSize: 12, lineHeight: 1.85, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {parts.map(function(p, i) {
        return /^\{\{[^}]+\}\}$/.test(p)
          ? <span key={i} style={{ color: '#dc2626', background: '#fef2f2', borderRadius: 3, padding: '0 3px' }}>{p.slice(2, -2)}</span>
          : p
      })}
    </pre>
  )
}

export default function IRApp() {
  var router = useRouter()
  var [view, setView] = useState('main')
  var [isAdmin, setIsAdmin] = useState(false)
  var [shared, setShared] = useState({})
  var [templates, setTemplates] = useState({})
  var [training, setTraining] = useState({})
  var [loaded, setLoaded] = useState(false)
  var [note, setNote] = useState('')
  var [processing, setProcessing] = useState(false)
  var [refining, setRefining] = useState(false)
  var [generated, setGenerated] = useState('')
  var [detectedProc, setDetectedProc] = useState('')
  var [hasTemplate, setHasTemplate] = useState(true)
  var [vars, setVars] = useState({})
  var [selectedKey, setSelectedKey] = useState('')
  var [copied, setCopied] = useState(false)
  var [parseError, setParseError] = useState('')
  var [refinedWith, setRefinedWith] = useState(0)
  var [editTmpl, setEditTmpl] = useState(null)
  var [localTemplates, setLocalTemplates] = useState({})
  var [editShared, setEditShared] = useState(null)
  var [localShared, setLocalShared] = useState({})
  var [newTmplKey, setNewTmplKey] = useState('')
  var [newTmplName, setNewTmplName] = useState('')
  var [newTmplKw, setNewTmplKw] = useState('')
  var [newTmplText, setNewTmplText] = useState('')
  var [newSharedKey, setNewSharedKey] = useState('')
  var [pwMsg, setPwMsg] = useState('')
  var [trainingProc, setTrainingProc] = useState('')
  var [showAddEx, setShowAddEx] = useState(false)
  var [showAddProc, setShowAddProc] = useState(false)
  var [newProcName, setNewProcName] = useState('')
  var [newTag, setNewTag] = useState('')
  var [newRaw, setNewRaw] = useState('')
  var [newIdeal, setNewIdeal] = useState('')
  var [expandedEx, setExpandedEx] = useState(null)

  useEffect(function() {
    // Check role from cookie/session
    fetch('/api/data')
      .then(function(r) { return r.json() })
      .then(function(d) {
        setShared(d.shared); setLocalShared(d.shared)
        setTemplates(d.templates); setLocalTemplates(d.templates)
        setTraining(d.training || {}); setLoaded(true)
      })
      .catch(function() {
        setShared(DEFAULT_SHARED); setLocalShared(DEFAULT_SHARED)
        setTemplates(DEFAULT_TEMPLATES); setLocalTemplates(DEFAULT_TEMPLATES)
        setLoaded(true)
      })
    // Check if admin by trying admin endpoint
    fetch('/api/admin?action=settings').then(function(r) { if (r.ok) setIsAdmin(true) }).catch(function() {})
  }, [])

  var saveData = useCallback(function(updates) {
    return fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
  }, [])

  var regenNote = useCallback(function(v, key, sh) {
    var tmpl = templates[key]
    if (tmpl) setGenerated(fillTemplate(tmpl.template, v, sh !== undefined ? sh : shared))
  }, [templates, shared])

  var handleProcess = async function() {
    if (!note.trim()) return
    setProcessing(true); setGenerated(''); setDetectedProc(''); setVars({}); setSelectedKey(''); setParseError(''); setRefinedWith(0); setHasTemplate(true)
    try {
      var res = await fetch('/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note }) })
      var data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Parse failed')
      setDetectedProc(data.procedure_name || 'Unknown')
      setSelectedKey(data.procedure_key)
      setHasTemplate(data.has_template !== false)
      setVars(data.variables || {})
      if (data.no_examples) {
        setGenerated('No training examples found for this procedure. Add examples in the Training tab, then try again.')
      } else if (data.generated) {
        setGenerated(data.generated)
      } else if (data.has_template !== false) {
        var tmpl = templates[data.procedure_key]
        setGenerated(tmpl ? fillTemplate(tmpl.template, data.variables || {}, shared) : 'No template found.')
      }
    } catch(e) { setParseError(e.message) }
    setProcessing(false)
  }

  var handleRefine = async function() {
    if (!generated || !selectedKey) return
    setRefining(true)
    try {
      var res = await fetch('/api/refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note_text: generated, procedure_key: selectedKey }) })
      var data = await res.json()
      if (data.note) { setGenerated(data.note); setRefinedWith(data.examples_used || 0) }
    } catch(e) { console.error(e) }
    setRefining(false)
  }

  var handleVarChange = function(k, v) {
    var updated = Object.assign({}, vars, { [k]: v }); setVars(updated); regenNote(updated, selectedKey, shared)
  }

  var handleProcSelect = function(k) {
    setSelectedKey(k)
    if (templates[k]) { setGenerated(fillTemplate(templates[k].template, vars, shared)); setHasTemplate(true) }
  }

  var handleLogout = async function() { await fetch('/api/logout', { method: 'POST' }); router.push('/login') }

  // Training helpers
  var getAllProcedures = function() {
    var all = {}
    Object.entries(templates).forEach(function(e) { all[e[0]] = { name: e[1].name, has_template: true } })
    Object.entries(training).forEach(function(e) { if (!all[e[0]]) all[e[0]] = { name: e[1].name || e[0], has_template: false } })
    return all
  }

  var saveTrainingExample = function() {
    if (!trainingProc || !newTag || !newRaw || !newIdeal) return
    var current = training[trainingProc] || { name: getAllProcedures()[trainingProc]?.name || trainingProc, high_variability: HIGH_VAR_DEFAULTS.indexOf(trainingProc) !== -1, examples: [] }
    var ex = { id: Date.now().toString(), technique_tag: newTag, raw_note: newRaw, ideal_dictation: newIdeal }
    var updated = Object.assign({}, training)
    updated[trainingProc] = Object.assign({}, current, { examples: (current.examples || []).concat([ex]) })
    setTraining(updated); saveData({ training: updated })
    setNewTag(''); setNewRaw(''); setNewIdeal(''); setShowAddEx(false)
  }

  var deleteExample = function(procKey, exId) {
    var current = training[procKey]; if (!current) return
    var updated = Object.assign({}, training)
    updated[procKey] = Object.assign({}, current, { examples: current.examples.filter(function(e) { return e.id !== exId }) })
    setTraining(updated); saveData({ training: updated })
  }

  var toggleHighVar = function(procKey) {
    var current = training[procKey] || { examples: [] }
    var updated = Object.assign({}, training)
    updated[procKey] = Object.assign({}, current, { high_variability: !current.high_variability })
    setTraining(updated); saveData({ training: updated })
  }

  var addNewProc = function() {
    if (!newProcName.trim()) return
    var key = newProcName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    var updated = Object.assign({}, training)
    updated[key] = { name: newProcName.trim(), high_variability: false, has_template: false, examples: [] }
    setTraining(updated); saveData({ training: updated })
    setTrainingProc(key); setNewProcName(''); setShowAddProc(false)
  }

  var deleteTrainingProc = function(key) {
    if (!confirm('Delete all training examples for this procedure?')) return
    var updated = Object.assign({}, training)
    delete updated[key]
    setTraining(updated); saveData({ training: updated })
    if (trainingProc === key) setTrainingProc('')
  }

  if (!loaded) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#6b7280' }}>Loading...</p></div>

  var inp = { width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 8, outline: 'none', background: '#fff' }
  var ta = Object.assign({}, inp, { fontFamily: 'Courier New,monospace', fontSize: 12, resize: 'vertical', lineHeight: 1.7 })
  var btnP = { padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
  var btnS = { padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13 }
  var btnD = { padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#dc2626' }
  var card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }

  var NAV = [
    { key: 'main', label: 'Note Builder' },
    { key: 'training', label: 'Training' },
    { key: 'templates', label: 'Templates' },
    { key: 'shared', label: 'Shared Text' },
    { key: 'settings', label: 'Settings' },
  ]

  var navBtnBase = { border: 'none', fontSize: 13, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }

  function TopBar() {
    return (
      <div style={{ background: '#0f1b2d', display: 'flex', alignItems: 'center', padding: '0 16px', height: 52, gap: 4, flexShrink: 0 }}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginRight: 'auto' }}>IR Notes</div>
        {NAV.map(function(n) {
          return <button key={n.key} onClick={function() { setView(n.key) }} style={Object.assign({}, navBtnBase, { background: view === n.key ? 'rgba(37,99,235,0.3)' : 'transparent', color: view === n.key ? '#93c5fd' : 'rgba(255,255,255,0.55)' })}>{n.label}</button>
        })}
        {isAdmin && <button onClick={function() { router.push('/admin') }} style={Object.assign({}, navBtnBase, { background: 'rgba(124,58,237,0.3)', color: '#c4b5fd' })}>Admin</button>}
        <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.45)', fontSize: 12, padding: '5px 10px', borderRadius: 6, marginLeft: 8, cursor: 'pointer' }}>Logout</button>
      </div>
    )
  }

  if (view === 'main') {
    var filledVars = Object.entries(vars).filter(function(e) { return e[1] })
    var procTraining = training[selectedKey]
    var hasTrainingEx = procTraining && procTraining.examples && procTraining.examples.length > 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
        <TopBar />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f9fafb' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>Paste Procedure Note</div>
              <select value={selectedKey} onChange={function(e) { handleProcSelect(e.target.value) }} style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, background: '#fff', outline: 'none' }}>
                <option value="">Select template manually</option>
                {Object.entries(templates).map(function(e) { return <option key={e[0]} value={e[0]}>{e[1].name}</option> })}
              </select>
            </div>
            <textarea value={note} onChange={function(e) { setNote(e.target.value) }}
              style={{ flex: 1, width: '100%', border: 'none', outline: 'none', padding: '14px 16px', fontSize: 13, resize: 'none', background: 'transparent', lineHeight: 1.6 }}
              placeholder="Paste your post-procedure dictation here. Claude will identify the procedure and extract all variables automatically." />
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
              <button onClick={handleProcess} disabled={processing || !note.trim()} style={{ width: '100%', padding: 10, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: processing || !note.trim() ? 0.5 : 1, marginBottom: 8 }}>
                {processing ? 'Processing...' : 'Generate Template'}
              </button>
              {generated && hasTrainingEx && hasTemplate && (
                <button onClick={handleRefine} disabled={refining} style={{ width: '100%', padding: 10, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: refining ? 0.5 : 1 }}>
                  {refining ? 'Refining...' : 'Refine with My Style'}
                </button>
              )}
              {detectedProc && <div style={{ marginTop: 8, padding: '7px 12px', background: '#dcfce7', borderRadius: 8, fontSize: 12, color: '#15803d' }}>Detected: {detectedProc} {!hasTemplate && <span style={{ color: '#7c3aed' }}>(training-only)</span>}</div>}
              {refinedWith > 0 && <div style={{ marginTop: 6, padding: '7px 12px', background: '#ede9fe', borderRadius: 8, fontSize: 12, color: '#7c3aed' }}>Style applied from {refinedWith} example{refinedWith > 1 ? 's' : ''}</div>}
              {parseError && <div style={{ marginTop: 8, padding: '7px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{parseError}</div>}
            </div>
            {hasTemplate && filledVars.length > 0 && (
              <div style={{ overflowY: 'auto', maxHeight: 220, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>Extracted Variables</div>
                {filledVars.map(function(e) {
                  return (
                    <div key={e[0]} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f3f4f6', padding: '0 16px' }}>
                      <span style={{ fontSize: 10, color: '#9ca3af', width: 110, flexShrink: 0, textTransform: 'uppercase' }}>{e[0].replace(/_/g, ' ')}</span>
                      <input value={e[1]} onChange={function(ev) { handleVarChange(e[0], ev.target.value) }} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, padding: '7px 0' }} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>Generated Note</span>
              {generated && <button onClick={function() { navigator.clipboard.writeText(generated) }} style={{ fontSize: 12, padding: '5px 10px', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>Copy</button>}
            </div>
            {generated
              ? <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}><HighlightedNote text={generated} /></div>
              : <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{ fontSize: 48, opacity: 0.2 }}>📄</div>
                  <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>Paste a procedure note and click Generate. Works for all procedures — template-based and training-only.</p>
                </div>
            }
          </div>
        </div>
      </div>
    )
  }

  if (view === 'training') {
    var allProcs = getAllProcedures()
    var selTraining = trainingProc ? (training[trainingProc] || { name: allProcs[trainingProc]?.name, high_variability: HIGH_VAR_DEFAULTS.indexOf(trainingProc) !== -1, examples: [] }) : null
    var canAdd = selTraining && (selTraining.high_variability || (selTraining.examples || []).length < 5)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
        <TopBar />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #e5e7eb', overflowY: 'auto', background: '#f9fafb' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Procedure Library</span>
              <button onClick={function() { setShowAddProc(!showAddProc) }} style={{ fontSize: 11, padding: '3px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>+ New</button>
            </div>
            {showAddProc && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
                <input value={newProcName} onChange={function(e) { setNewProcName(e.target.value) }} placeholder="Procedure name" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 5, padding: '6px 8px', fontSize: 12, outline: 'none', marginBottom: 6 }} onKeyDown={function(e) { if (e.key === 'Enter') addNewProc() }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={addNewProc} style={{ flex: 1, padding: '5px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Add</button>
                  <button onClick={function() { setShowAddProc(false); setNewProcName('') }} style={{ flex: 1, padding: '5px', border: '1px solid #d1d5db', borderRadius: 4, background: 'transparent', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{ padding: '8px 0' }}>
              {Object.entries(allProcs).map(function(e) {
                var k = e[0]; var p = e[1]
                var exCount = training[k] ? (training[k].examples || []).length : 0
                return (
                  <div key={k} onClick={function() { setTrainingProc(k); setShowAddEx(false); setExpandedEx(null) }}
                    style={{ padding: '9px 16px', cursor: 'pointer', background: trainingProc === k ? '#eff6ff' : 'transparent', borderLeft: trainingProc === k ? '3px solid #2563eb' : '3px solid transparent' }}>
                    <div style={{ fontSize: 13, color: '#111', fontWeight: trainingProc === k ? 600 : 400 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                      {exCount} example{exCount !== 1 ? 's' : ''} {!p.has_template && <span style={{ color: '#7c3aed' }}>· training-only</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {!trainingProc && (
              <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏥</div>
                <p style={{ fontSize: 14 }}>Select a procedure from the list to manage training examples.</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Click + New to add any procedure not in the list.</p>
              </div>
            )}
            {trainingProc && selTraining && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>{allProcs[trainingProc]?.name || trainingProc}</h3>
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {(selTraining.examples || []).length} example{(selTraining.examples || []).length !== 1 ? 's' : ''} · {selTraining.high_variability ? 'Unlimited capacity' : 'Up to 5 examples'}
                      {!allProcs[trainingProc]?.has_template && <span style={{ color: '#7c3aed', marginLeft: 6 }}>· Training-only procedure</span>}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>High-variability</span>
                      <button onClick={function() { toggleHighVar(trainingProc) }} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: selTraining.high_variability ? '#7c3aed' : '#d1d5db', position: 'relative' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 3, left: selTraining.high_variability ? 23 : 3, transition: 'left 0.15s' }} />
                      </button>
                    </div>
                    {!allProcs[trainingProc]?.has_template && <button onClick={function() { deleteTrainingProc(trainingProc) }} style={Object.assign({}, btnD, { fontSize: 12 })}>Delete Procedure</button>}
                  </div>
                </div>
                {(selTraining.examples || []).length === 0 && <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>No examples yet. Click Add Example to get started.</div>}
                {(selTraining.examples || []).map(function(ex) {
                  return (
                    <div key={ex.id} style={card}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{ex.technique_tag || 'No tag'}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{(ex.raw_note || '').length} chars raw</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={function() { setExpandedEx(expandedEx === ex.id ? null : ex.id) }} style={btnS}>{expandedEx === ex.id ? 'Collapse' : 'View'}</button>
                          <button onClick={function() { deleteExample(trainingProc, ex.id) }} style={btnD}>Delete</button>
                        </div>
                      </div>
                      {expandedEx === ex.id && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Raw Note</div>
                          <pre style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, fontSize: 11, fontFamily: 'Courier New,monospace', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', marginBottom: 10 }}>{ex.raw_note}</pre>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Ideal Dictation</div>
                          <pre style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 10, fontSize: 11, fontFamily: 'Courier New,monospace', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{ex.ideal_dictation}</pre>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!showAddEx && canAdd && (
                  <button onClick={function() { setShowAddEx(true) }} style={Object.assign({}, btnP, { marginTop: 8 })}>+ Add Example</button>
                )}
                {!canAdd && !selTraining.high_variability && (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>5-example limit reached. Enable High-variability for unlimited examples.</div>
                )}
                {showAddEx && (
                  <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: 16, marginTop: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>New Training Example</h4>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Technique Tag</label>
                    <input value={newTag} onChange={function(e) { setNewTag(e.target.value) }} placeholder="e.g. SFA atherectomy + tibial PTA, or bilateral iliac stent" style={inp} />
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Raw Note (what you paste in)</label>
                    <textarea value={newRaw} onChange={function(e) { setNewRaw(e.target.value) }} placeholder="Paste a real raw procedure note here..." style={Object.assign({}, ta, { minHeight: 140 })} />
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#15803d', display: 'block', marginBottom: 4 }}>Ideal Dictation (the output you want)</label>
                    <textarea value={newIdeal} onChange={function(e) { setNewIdeal(e.target.value) }} placeholder="Paste your ideal finished dictation here..." style={Object.assign({}, ta, { minHeight: 200, background: '#f0fdf4', borderColor: '#bbf7d0' })} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={saveTrainingExample} disabled={!newTag || !newRaw || !newIdeal} style={Object.assign({}, btnP, { opacity: !newTag || !newRaw || !newIdeal ? 0.5 : 1 })}>Save Example</button>
                      <button onClick={function() { setShowAddEx(false); setNewTag(''); setNewRaw(''); setNewIdeal('') }} style={btnS}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (view === 'templates') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Procedure Templates</h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Structured templates for common procedures. Use double curly braces for variables and shared blocks.</p>
          {Object.entries(localTemplates).map(function(e) {
            var k = e[0]; var t = e[1]
            return (
              <div key={k} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={function() { setEditTmpl(editTmpl === k ? null : k) }} style={btnS}>{editTmpl === k ? 'Close' : 'Edit'}</button>
                    <button onClick={function() { var u = Object.assign({}, localTemplates); delete u[k]; setLocalTemplates(u); setTemplates(u); saveData({ templates: u }); if (editTmpl === k) setEditTmpl(null) }} style={btnD}>Delete</button>
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>{(t.keywords || []).map(function(kw) { return <span key={kw} style={{ fontSize: 10, padding: '3px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 99, color: '#6b7280', marginRight: 4, display: 'inline-block' }}>{kw}</span> })}</div>
                {editTmpl === k && (
                  <div>
                    <input defaultValue={(t.keywords || []).join(', ')} placeholder="Keywords (comma separated)" onChange={function(ev) { setLocalTemplates(function(prev) { var u = Object.assign({}, prev); u[k] = Object.assign({}, prev[k], { keywords: ev.target.value.split(',').map(function(x) { return x.trim() }).filter(Boolean) }); return u }) }} style={inp} />
                    <textarea value={localTemplates[k].template} onChange={function(ev) { setLocalTemplates(function(prev) { var u = Object.assign({}, prev); u[k] = Object.assign({}, prev[k], { template: ev.target.value }); return u }) }} style={Object.assign({}, ta, { minHeight: 300 })} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={function() { setTemplates(localTemplates); saveData({ templates: localTemplates }); setEditTmpl(null) }} style={btnP}>Save</button>
                      <button onClick={function() { setEditTmpl(null) }} style={btnS}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: 16, marginTop: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Load New Template</h4>
            <input placeholder="Key (no spaces, e.g. ivc_filter)" value={newTmplKey} onChange={function(e) { setNewTmplKey(e.target.value.replace(/\s/g, '_').toLowerCase()) }} style={inp} />
            <input placeholder="Procedure name" value={newTmplName} onChange={function(e) { setNewTmplName(e.target.value) }} style={inp} />
            <input placeholder="Keywords (comma separated)" value={newTmplKw} onChange={function(e) { setNewTmplKw(e.target.value) }} style={inp} />
            <textarea placeholder="Paste your baseline template text here..." value={newTmplText} onChange={function(e) { setNewTmplText(e.target.value) }} style={Object.assign({}, ta, { minHeight: 160 })} />
            <button onClick={function() { if (newTmplKey && newTmplName && newTmplText) { var u = Object.assign({}, localTemplates); u[newTmplKey] = { name: newTmplName, keywords: newTmplKw.split(',').map(function(x) { return x.trim() }).filter(Boolean), template: newTmplText }; setLocalTemplates(u); setTemplates(u); saveData({ templates: u }); setNewTmplKey(''); setNewTmplName(''); setNewTmplKw(''); setNewTmplText('') } }} style={btnP}>Add Template</button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'shared') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
        <TopBar />
        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Shared Text Components</h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Edit once — updates apply to every template and are injected verbatim during style refinement.</p>
          {Object.entries(localShared).map(function(e) {
            var k = e[0]; var v = e[1]
            return (
              <div key={k} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{k.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase() })}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={function() { setEditShared(editShared === k ? null : k) }} style={btnS}>{editShared === k ? 'Close' : 'Edit'}</button>
                    <button onClick={function() { var u = Object.assign({}, localShared); delete u[k]; setLocalShared(u); setShared(u); saveData({ shared: u }); if (editShared === k) setEditShared(null) }} style={btnD}>Delete</button>
                  </div>
                </div>
                <code style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 8 }}>shared:{k}</code>
                {editShared === k
                  ? <div>
                      <textarea value={localShared[k]} onChange={function(ev) { setLocalShared(function(prev) { return Object.assign({}, prev, { [k]: ev.target.value }) }) }} style={Object.assign({}, ta, { minHeight: 120 })} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={function() { setShared(localShared); saveData({ shared: localShared }); setEditShared(null) }} style={btnP}>Save</button>
                        <button onClick={function() { setEditShared(null) }} style={btnS}>Cancel</button>
                      </div>
                    </div>
                  : <pre style={{ fontFamily: 'Courier New,monospace', fontSize: 11, color: '#6b7280', whiteSpace: 'pre-wrap', background: '#f9fafb', padding: 10, borderRadius: 6, maxHeight: 80, overflow: 'hidden' }}>{v}</pre>
                }
              </div>
            )
          })}
          <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: 16, marginTop: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add Shared Component</h4>
            <input placeholder="Key name (no spaces, e.g. post_procedure_care)" value={newSharedKey} onChange={function(e) { setNewSharedKey(e.target.value.replace(/\s/g, '_').toLowerCase()) }} style={inp} />
            <button onClick={function() { if (newSharedKey) { var u = Object.assign({}, localShared); u[newSharedKey] = 'Enter shared text here...'; setLocalShared(u); setShared(u); saveData({ shared: u }); setEditShared(newSharedKey); setNewSharedKey('') } }} style={btnP}>Add Component</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
      <TopBar />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Settings</h2>
        <div style={Object.assign({}, card, { marginBottom: 16 })}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Change Password</h4>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>Admin password: update ADMIN_PASSWORD in Vercel dashboard. User passwords: managed in the Admin page.</p>
          {pwMsg && <p style={{ fontSize: 12, color: '#16a34a', marginBottom: 8 }}>{pwMsg}</p>}
          <button onClick={function() { setPwMsg('Go to Vercel dashboard, Settings, Environment Variables, update ADMIN_PASSWORD, then Redeploy.') }} style={btnP}>Show Instructions</button>
        </div>
        <div style={card}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Reset to Defaults</h4>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>Restore all built-in templates and shared text. Training examples and users are not affected.</p>
          <button onClick={function() { setShared(DEFAULT_SHARED); setLocalShared(DEFAULT_SHARED); setTemplates(DEFAULT_TEMPLATES); setLocalTemplates(DEFAULT_TEMPLATES); saveData({ shared: DEFAULT_SHARED, templates: DEFAULT_TEMPLATES }) }} style={Object.assign({}, btnD, { padding: '7px 14px' })}>Reset Templates and Shared Text</button>
        </div>
      </div>
    </div>
  )
}
