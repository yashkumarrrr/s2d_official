'use client'
// app/auth/register/page.tsx
import { useState, useEffect } from 'react'

export default function RegisterPage() {
  const [name, setName]     = useState('')
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
    if (!name.trim() || !email.trim()) return
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Registration failed'); return }
      if (data.needsVerification) {
        window.location.replace('/auth/check-email?email=' + encodeURIComponent(email.trim()))
        return
      }
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
          <span className="auth-logo-badge">Free</span>
        </div>

        <h1 className="auth-title">Meet ARIA</h1>
        <p className="auth-sub">Your AI Senior DevOps Engineer — 40 years of experience, available 24/7</p>

        <div className="auth-features">
          {['Chat, debug, analyze — all in one place','Paste errors and get copy-paste fixes','Scan any GitHub repo for security issues','Remembers your infrastructure context'].map(f => (
            <div key={f} className="auth-feature">
              <div className="auth-feature-dot" />
              <span>{f}</span>
            </div>
          ))}
        </div>

        {done ? (
          <div className="auth-success">
            <div className="auth-success-icon">✓</div>
            <p style={{ fontWeight: 600, color: 'var(--text)' }}>Account created!</p>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Taking you to ARIA…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Full name</label>
              <input type="text" className="input-3d auth-input"
                placeholder="Alex Johnson"
                value={name} onChange={e => setName(e.target.value)}
                disabled={loading} autoFocus required minLength={2} />
            </div>
            <div className="auth-field">
              <label className="auth-label">Work email</label>
              <input type="email" className="input-3d auth-input"
                placeholder="you@company.com"
                value={email} onChange={e => setEmail(e.target.value)}
                disabled={loading} required />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn-3d auth-btn" disabled={loading || !name.trim() || !email.trim()}>
              {loading ? <span className="auth-spinner" /> : 'Create Free Account →'}
            </button>
          </form>
        )}

        <p className="auth-footer-link">
          Already have an account?{' '}
          <a href="/auth/login" className="auth-link">Sign in</a>
        </p>
      </div>
    </div>
  )
}
