import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

function fmt(n) { return '$' + (n || 0).toFixed(3) }
function fmtBig(n) { return '$' + (n || 0).toFixed(2) }

export default function AdminPage() {
  var router = useRouter()
  var [dashboard, setDashboard] = useState(null)
  var [users, setUsers] = useState([])
  var [loaded, setLoaded] = useState(false)
  var [newUserPw, setNewUserPw] = useState('')
  var [userMsg, setUserMsg] = useState('')
  var [newAdminPw, setNewAdminPw] = useState('')
  var [adminMsg, setAdminMsg] = useState('')
  var [alertThreshold, setAlertThreshold] = useState('25')
  var [alertEmail, setAlertEmail] = useState('')
  var [settingsMsg, setSettingsMsg] = useState('')
  var [activeTab, setActiveTab] = useState('dashboard')

  useEffect(function() {
    Promise.all([
      fetch('/api/admin?action=dashboard').then(function(r) { return r.json() }),
      fetch('/api/admin?action=users').then(function(r) { return r.json() })
    ]).then(function(results) {
      setDashboard(results[0])
      setUsers(results[1].users || [])
      if (results[0].settings) {
        setAlertThreshold(String(results[0].settings.alert_threshold || 25))
        setAlertEmail(results[0].settings.alert_email || '')
      }
      setLoaded(true)
    }).catch(function() { setLoaded(true) })
  }, [])

  var addUser = async function() {
    if (!newUserPw || newUserPw.length < 6) { setUserMsg('Password must be at least 6 characters'); return }
    var res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_user', password: newUserPw }) })
    var data = await res.json()
    if (res.ok) {
      setUsers(function(prev) { return prev.concat([newUserPw]) })
      setNewUserPw(''); setUserMsg('User added. Total users: ' + data.count)
    } else { setUserMsg(data.error || 'Error') }
    setTimeout(function() { setUserMsg('') }, 3000)
  }

  var removeUser = async function(pw) {
    var res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove_user', password: pw }) })
    if (res.ok) setUsers(function(prev) { return prev.filter(function(u) { return u !== pw }) })
  }

  var updateAdminPw = async function() {
    if (!newAdminPw || newAdminPw.length < 8) { setAdminMsg('Minimum 8 characters'); return }
    var res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_admin_password', password: newAdminPw }) })
    if (res.ok) { setAdminMsg('Admin password updated'); setNewAdminPw('') } else { setAdminMsg('Error updating password') }
    setTimeout(function() { setAdminMsg('') }, 3000)
  }

  var saveSettings = async function() {
    var res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', settings: { alert_threshold: parseFloat(alertThreshold), alert_email: alertEmail } }) })
    if (res.ok) { setSettingsMsg('Settings saved') } else { setSettingsMsg('Error saving') }
    setTimeout(function() { setSettingsMsg('') }, 3000)
  }

  var handleLogout = async function() { await fetch('/api/logout', { method: 'POST' }); router.push('/login') }

  var inp = { width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 8, outline: 'none', background: '#fff' }
  var btnP = { padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
  var btnS = { padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13 }
  var btnD = { padding: '5px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#dc2626' }
  var card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }

  var tabs = [{ key: 'dashboard', label: 'Usage & Cost' }, { key: 'users', label: 'User Management' }, { key: 'settings', label: 'Alert Settings' }]

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{ background: '#0f1b2d', display: 'flex', alignItems: 'center', padding: '0 24px', height: 52 }}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginRight: 'auto' }}>IR Notes — Admin</div>
        <button onClick={function() { router.push('/') }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', fontSize: 12, padding: '5px 12px', borderRadius: 6, marginRight: 8, cursor: 'pointer' }}>Back to App</button>
        <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.45)', fontSize: 12, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' }}>Logout</button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        {!loaded && <p style={{ color: '#6b7280' }}>Loading...</p>}

        {loaded && dashboard && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>This Month</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>{fmtBig(dashboard.this_month.total_cost)}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{dashboard.this_month.total_calls} API calls</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Last Month</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>{fmtBig(dashboard.last_month.total_cost)}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{dashboard.last_month.total_calls} API calls</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Active Users</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>{dashboard.user_count}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Alert at {fmtBig(dashboard.settings.alert_threshold)}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {tabs.map(function(t) {
            return <button key={t.key} onClick={function() { setActiveTab(t.key) }} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400, background: activeTab === t.key ? '#2563eb' : '#e5e7eb', color: activeTab === t.key ? '#fff' : '#374151' }}>{t.label}</button>
          })}
        </div>

        {activeTab === 'dashboard' && loaded && dashboard && (
          <div>
            {Object.keys(dashboard.this_month.by_procedure).length > 0 && (
              <div style={card}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Cost by Procedure — This Month</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Procedure</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Calls</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dashboard.this_month.by_procedure).sort(function(a, b) { return b[1].cost - a[1].cost }).map(function(e) {
                      return (
                        <tr key={e[0]} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 0' }}>{e[0].replace(/_/g, ' ')}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', color: '#6b7280' }}>{e[1].calls}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 500 }}>{fmt(e[1].cost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {Object.keys(dashboard.this_month.by_day).length > 0 && (
              <div style={card}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Daily Usage — This Month</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Calls</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dashboard.this_month.by_day).sort(function(a, b) { return b[0].localeCompare(a[0]) }).map(function(e) {
                      return (
                        <tr key={e[0]} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 0' }}>{e[0]}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', color: '#6b7280' }}>{e[1].calls}</td>
                          <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 500 }}>{fmt(e[1].cost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {dashboard.this_month.total_calls === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>No API calls this month yet.</div>}
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Add User Password</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newUserPw} onChange={function(e) { setNewUserPw(e.target.value) }} placeholder="New user password (min 6 chars)" style={Object.assign({}, inp, { marginBottom: 0 })} onKeyDown={function(e) { if (e.key === 'Enter') addUser() }} />
                <button onClick={addUser} style={Object.assign({}, btnP, { whiteSpace: 'nowrap' })}>Add User</button>
              </div>
              {userMsg && <p style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>{userMsg}</p>}
            </div>

            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Active Users ({users.length})</h3>
              {users.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>No users added yet.</p>}
              {users.map(function(u, i) {
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: 13, fontFamily: 'Courier New,monospace', letterSpacing: 1 }}>{u.slice(0, 3) + '•'.repeat(Math.max(0, u.length - 3))}</span>
                    <button onClick={function() { removeUser(u) }} style={btnD}>Remove</button>
                  </div>
                )
              })}
            </div>

            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Change Admin Password</h3>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>This updates the admin password stored in the database.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="password" value={newAdminPw} onChange={function(e) { setNewAdminPw(e.target.value) }} placeholder="New admin password (min 8 chars)" style={Object.assign({}, inp, { marginBottom: 0 })} />
                <button onClick={updateAdminPw} style={Object.assign({}, btnP, { whiteSpace: 'nowrap' })}>Update</button>
              </div>
              {adminMsg && <p style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>{adminMsg}</p>}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Spend Alert Settings</h3>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Alert threshold ($)</label>
            <input value={alertThreshold} onChange={function(e) { setAlertThreshold(e.target.value) }} placeholder="25" style={inp} />
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Alert email address</label>
            <input type="email" value={alertEmail} onChange={function(e) { setAlertEmail(e.target.value) }} placeholder="your@email.com" style={inp} />
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Email alerts require a RESEND_API_KEY environment variable in Vercel. Sign up free at resend.com.</p>
            <button onClick={saveSettings} style={btnP}>Save Settings</button>
            {settingsMsg && <p style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>{settingsMsg}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
