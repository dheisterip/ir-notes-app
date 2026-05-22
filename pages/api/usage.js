import { logUsage, getUsageThisMonth, getSettings, getLastAlertTime, setLastAlertTime } from '../../lib/storage'

async function sendAlert(totalCost, threshold, alertEmail) {
  if (!process.env.RESEND_API_KEY || !alertEmail) return
  var now = Date.now()
  var lastAlert = await getLastAlertTime()
  var oneDay = 24 * 60 * 60 * 1000
  if (now - lastAlert < oneDay) return
  await setLastAlertTime(now)

  var month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'IR Notes <onboarding@resend.dev>',
      to: alertEmail,
      subject: 'IR Notes: Monthly spend alert - $' + totalCost.toFixed(2),
      html: '<h2>IR Notes Spend Alert</h2><p>Your IR Notes app has reached <strong>$' + totalCost.toFixed(2) + '</strong> in API costs for ' + month + '.</p><p>Your alert threshold is set at $' + threshold + '.</p><p>Log into your admin panel to review usage.</p>'
    })
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  var entry = {
    ts: new Date().toISOString(),
    procedure: req.body.procedure || 'unknown',
    call_type: req.body.call_type || 'parse',
    est_cost: req.body.est_cost || 0
  }

  var log = await logUsage(entry)
  var totalCost = log.reduce(function(acc, e) { return acc + (e.est_cost || 0) }, 0)
  var settings = await getSettings()

  if (totalCost >= settings.alert_threshold && settings.alert_email) {
    sendAlert(totalCost, settings.alert_threshold, settings.alert_email).catch(function(e) { console.error('Alert error:', e) })
  }

  return res.json({ ok: true, month_total: totalCost })
}
