'use client'
// app/auth/login/page.tsx
import { useState, useEffect } from 'react'

export default function LoginPage() {
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [done, setDone]     = useState(false)

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => window.location.replace('/dashboard/aria'), 200)
      return () => clearTimeout(t)
    }
  }, [done])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      setDone(true)
    } catch { setError('Connection failed. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-root">
      <div className="auth-bg-grid" />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">AI</div>
          <span className="auth-logo-text">Step2Dev</span>
          <span className="auth-logo-badge">Beta</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in with your email — no password, no friction</p>

        <div className="auth-features">
          {['40-year DevOps expertise on demand','Error analysis with exact fix commands','GitHub repo security grading','4-week conversation memory'].map(f => (
            <div key={f} className="auth-feature">
              <div className="auth-feature-dot" />
              <span>{f}</span>
            </div>
          ))}
        </div>

        {done ? (
          <div className="auth-success">
            <div className="auth-success-icon">✓</div>
            <p style={{ fontWeight: 600, color: 'var(--text)' }}>Signed in successfully!</p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Redirecting to ARIA…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Email address</label>
              <input type="email" className="input-3d auth-input"
                placeholder="you@company.com"
                value={email} onChange={e => setEmail(e.target.value)}
                disabled={loading} autoFocus required />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn-3d auth-btn" disabled={loading || !email.trim()}>
              {loading ? <span className="auth-spinner" /> : 'Sign In →'}
            </button>
          </form>
        )}

        <p className="auth-footer-link">
          No account?{' '}
          <a href="/auth/register" className="auth-link">Create one free</a>
        </p>
      </div>
    </div>
  )
}
