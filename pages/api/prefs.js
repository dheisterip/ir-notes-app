import { getUserPrefs, setUserPrefs, getPersonalTemplates, setPersonalTemplates } from '../../lib/storage'
import { getUserFromRequest } from '../../lib/auth'

export default async function handler(req, res) {
  const user = await getUserFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  const uid = user.uid

  if (req.method === 'GET') {
    const [prefs, personal] = await Promise.all([getUserPrefs(uid), getPersonalTemplates(uid)])
    return res.json({ prefs, personal, role: user.role })
  }

  if (req.method === 'POST') {
    const { prefs, personal } = req.body
    if (prefs !== undefined) await setUserPrefs(uid, prefs)
    if (personal !== undefined) await setPersonalTemplates(uid, personal)
    return res.json({ ok: true })
  }

  res.status(405).end()
}
