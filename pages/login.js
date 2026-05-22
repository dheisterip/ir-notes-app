import { useState } from 'react'
import { useRouter } from 'next/router'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok) { router.push('/') }
      else { setError(data.error || 'Login failed') }
    } catch { setError('Network error. Please try again.') }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f8' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '40px 36px', width: 320, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
        <div style={{ width: 56, height: 56, background: '#0f1b2d', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>IR Procedure Notes</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 28 }}>Interventional Radiology Template System</p>
        <input
          type="password"
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, textAlign: 'center', marginBottom: 8, outline: 'none' }}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          autoFocus
        />
        {error && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{error}</p>}
        <button
          onClick={handleLogin}
          disabled={loading || !password}
          style={{ width: '100%', padding: 11, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, marginTop: 4, opacity: loading || !password ? 0.6 : 1 }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}
