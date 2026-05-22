import { getUsers, addUser, removeUser, getUsage, getAlertSettings, setAlertSettings, getCurrentMonth } from '../../lib/storage'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { action, month } = req.query
    if (action === 'users') {
      const users = await getUsers()
      return res.json({ users: users.map(function(u) { return { id: u.id, label: u.label, created: u.created } }) })
    }
    if (action === 'usage') {
      const m = month || getCurrentMonth()
      const prev = getPrevMonth(m)
      const [current, previous, settings] = await Promise.all([getUsage(m), getUsage(prev), getAlertSettings()])
      return res.json({ current: current, previous: previous, month: m, settings: settings })
    }
    if (action === 'settings') {
      const settings = await getAlertSettings()
      return res.json(settings)
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  if (req.method === 'POST') {
    const { action } = req.body
    if (action === 'add_user') {
      const result = await addUser(req.body.password, req.body.label)
      return res.json(result)
    }
    if (action === 'remove_user') {
      await removeUser(req.body.id)
      return res.json({ ok: true })
    }
    if (action === 'update_settings') {
      const current = await getAlertSettings()
      await setAlertSettings(Object.assign({}, current, { threshold: req.body.threshold, email: req.body.email }))
      return res.json({ ok: true })
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.status(405).end()
}

function getPrevMonth(ym) {
  var parts = ym.split('-')
  var y = parseInt(parts[0]); var m = parseInt(parts[1])
  m--; if (m === 0) { m = 12; y-- }
  return y + '-' + String(m).padStart(2, '0')
}
