import { getShared } from '../../lib/storage'

export default async function handler(req, res) {
  try {
    await getShared()
    res.json({ ok: true, ts: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
