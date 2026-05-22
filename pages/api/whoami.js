import { jwtVerify } from 'jose'

export default async function handler(req, res) {
  var token = req.cookies.ir_session
  if (!token) return res.json({ role: 'user' })
  try {
    var secret = new TextEncoder().encode(process.env.JWT_SECRET)
    var result = await jwtVerify(token, secret)
    return res.json({ role: result.payload.role || 'user' })
  } catch(e) { return res.json({ role: 'user' }) }
}
