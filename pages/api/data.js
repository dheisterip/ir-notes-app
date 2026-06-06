import { getShared, setShared, getTemplates, setTemplates, getTraining, setTraining } from '../../lib/storage'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [shared, templates, training] = await Promise.all([getShared(), getTemplates(), getTraining()])
    return res.json({ shared, templates, training })
  }
  if (req.method === 'POST') {
    const body = req.body
    const errors = []
    if (body.shared !== undefined) {
      try { await setShared(body.shared) } catch(e) { errors.push('shared: ' + e.message) }
    }
    if (body.templates !== undefined) {
      try { await setTemplates(body.templates) } catch(e) { errors.push('templates: ' + e.message) }
    }
    if (body.training !== undefined) {
      try { await setTraining(body.training) } catch(e) { errors.push('training: ' + e.message) }
    }
    if (errors.length > 0) {
      console.error('Save errors:', errors)
      return res.status(500).json({ ok: false, errors: errors })
    }
    return res.json({ ok: true })
  }
  res.status(405).end()
}
