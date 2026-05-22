export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'ir_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/')
  res.json({ ok: true })
}
