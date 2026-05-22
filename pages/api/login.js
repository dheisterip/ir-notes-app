import { validatePassword } from '../../lib/storage'
import { SignJWT } from 'jose'

const attempts = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, start: now }
  if (now - entry.start > 15 * 60 * 1000) { attempts.set(ip, { count: 1, start: now }); return false }
  entry.count++; attempts.set(ip, entry)
  return entry.count > 10
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const ip = req.headers['x-forwarded-for'] || 'unknown'
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })

  const { password } = req.body
  const result = await validatePassword(password)
  if (!result) return res.status(401).json({ error: 'Incorrect password' })

  const secret = new TextEncoder().encode(process.env.JWT_SECRET)
  const token = await new SignJWT({ role: result.role, uid: result.id || 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret)

  res.setHeader('Set-Cookie', 'ir_session=' + token + '; HttpOnly; Secure; SameSite=Lax; Max-Age=43200; Path=/')
  res.json({ ok: true, role: result.role })
}
