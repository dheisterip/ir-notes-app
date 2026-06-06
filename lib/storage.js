import { DEFAULT_SHARED, DEFAULT_TEMPLATES } from './defaults'
import { createHash } from 'crypto'

const SHARED_KEY = 'ir_shared_components'
const TEMPLATES_KEY = 'ir_templates'
const TRAINING_KEY = 'ir_training'
const USERS_KEY = 'ir_users'
const ALERT_KEY = 'ir_alert_settings'

function hashPw(pw) {
  return createHash('sha256').update(pw + 'ir_notes_2024').digest('hex')
}

async function redisGet(key) {
  try {
    const res = await fetch(
      process.env.UPSTASH_REDIS_REST_URL + '/get/' + key,
      { headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN }, cache: 'no-store' }
    )
    const data = await res.json()
    if (data.error) { console.error('Upstash GET error:', data.error); return null }
    return data.result ? JSON.parse(data.result) : null
  } catch (e) { console.error('redisGet error:', e); return null }
}

async function redisSet(key, value) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['SET', key, JSON.stringify(value)]),
  })
  const data = await res.json()
  if (data.error) throw new Error('Upstash error: ' + data.error)
  return data.result
}

export async function getShared() { return (await redisGet(SHARED_KEY)) ?? DEFAULT_SHARED }
export async function setShared(data) { await redisSet(SHARED_KEY, data) }
export async function getTemplates() { return (await redisGet(TEMPLATES_KEY)) ?? DEFAULT_TEMPLATES }
export async function setTemplates(data) { await redisSet(TEMPLATES_KEY, data) }
export async function getTraining() { return (await redisGet(TRAINING_KEY)) ?? {} }
export async function setTraining(data) { await redisSet(TRAINING_KEY, data) }

export async function getUsers() { return (await redisGet(USERS_KEY)) ?? [] }

export async function addUser(password, label) {
  const users = await getUsers()
  const hash = hashPw(password)
  if (users.find(function(u) { return u.hash === hash })) return { ok: false, error: 'Password already exists' }
  users.push({ id: Date.now().toString(), hash: hash, label: label || 'User', created: new Date().toISOString() })
  await redisSet(USERS_KEY, users)
  return { ok: true }
}

export async function removeUser(id) {
  const users = await getUsers()
  await redisSet(USERS_KEY, users.filter(function(u) { return u.id !== id }))
}

export async function validatePassword(password) {
  if (password === process.env.ADMIN_PASSWORD) return { role: 'admin' }
  const users = await getUsers()
  const hash = hashPw(password)
  const user = users.find(function(u) { return u.hash === hash })
  if (user) return { role: 'user', id: user.id }
  return null
}

export function getCurrentMonth() {
  const now = new Date()
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
}

export async function logUsage(type, procedure, inputTokens, outputTokens) {
  try {
    const month = getCurrentMonth()
    const key = 'ir_usage:' + month
    const existing = (await redisGet(key)) ?? { calls: [], total_cost: 0 }
    const cost = parseFloat(((inputTokens * 3 + outputTokens * 15) / 1000000).toFixed(6))
    existing.calls.push({ ts: new Date().toISOString(), type: type, procedure: procedure || 'unknown', input_tokens: inputTokens, output_tokens: outputTokens, cost: cost })
    existing.total_cost = parseFloat(existing.calls.reduce(function(sum, c) { return sum + c.cost }, 0).toFixed(6))
    await redisSet(key, existing)
    return existing.total_cost
  } catch(e) { console.error('logUsage error:', e); return 0 }
}

export async function getUsage(yearMonth) {
  return (await redisGet('ir_usage:' + yearMonth)) ?? { calls: [], total_cost: 0 }
}

export async function getAlertSettings() {
  return (await redisGet(ALERT_KEY)) ?? { threshold: 25, email: process.env.ALERT_EMAIL || '', sent_months: [] }
}

export async function setAlertSettings(settings) { await redisSet(ALERT_KEY, settings) }

export async function checkAndSendAlert(totalCost) {
  if (!process.env.RESEND_API_KEY) return
  try {
    const settings = await getAlertSettings()
    if (!settings.email) return
    const month = getCurrentMonth()
    if ((settings.sent_months || []).includes(month)) return
    if (totalCost < settings.threshold) return
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'IR Notes <onboarding@resend.dev>',
        to: [settings.email],
        subject: 'IR Notes: $' + settings.threshold + ' usage alert',
        html: '<h2>IR Notes Usage Alert</h2><p>Monthly spend has exceeded $' + settings.threshold + '.</p><p><strong>Current total: $' + totalCost.toFixed(2) + '</strong></p>'
      })
    })
    settings.sent_months = (settings.sent_months || []).concat([month])
    await setAlertSettings(settings)
  } catch(e) { console.error('Alert error:', e) }
}
