import { jwtVerify } from 'jose'

export async function getUserFromRequest(req) {
  try {
    const cookieHeader = req.headers.cookie || ''
    const match = cookieHeader.match(/ir_session=([^;]+)/)
    if (!match) return null
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(match[1], secret)
    return { role: payload.role, uid: payload.uid || 'admin' }
  } catch { return null }
}
