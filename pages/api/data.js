import { getShared, setShared, getTemplates, setTemplates, getTraining, setTraining } from '../../lib/storage'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const [shared, templates, training] = await Promise.all([getShared(), getTemplates(), getTraining()])
    return res.json({ shared, templates, training })
  }
  if (req.method === 'POST') {
    const body = req.body
    if (body.shared !== undefined) await setShared(body.shared)
    if (body.templates !== undefined) await setTemplates(body.templates)
    if (body.training !== undefined) await setTraining(body.training)
    return res.json({ ok: true })
  }
  res.status(405).end()
}
