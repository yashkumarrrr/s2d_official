'use client'
// app/auth/check-email/page.tsx
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CheckEmailContent() {
  const params   = useSearchParams()
  const email    = params.get('email') || 'your email'
  const [resent, setResent]   = useState(false)
  const [sending, setSending] = useState(false)

  async function resend() {
    setSending(true)
    try {
      await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResent(true)
    } finally { setSending(false) }
  }

  return (
    <div className="auth-root">
      <div className="auth-bg-grid" />
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📬</div>
        <h1 className="auth-title">Check your email</h1>
        <p className="auth-sub" style={{ margin: '0 auto 20px' }}>
          We sent a verification link to<br />
          <strong style={{ color: 'var(--text)' }}>{email}</strong>
        </p>

        <div style={{ background: 'var(--bg-2)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <div style={{ marginBottom: 8 }}>1. Open your email inbox</div>
            <div style={{ marginBottom: 8 }}>2. Find the email from <strong>Step2Dev</strong></div>
            <div>3. Click <strong>"Verify my email →"</strong></div>
          </div>
        </div>

        {!resent ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Didn&apos;t get it?{' '}
            <button onClick={resend} disabled={sending}
              style={{ background: 'none', border: 'none', color: 'var(--indigo)', fontWeight: 700, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              {sending ? 'Sending…' : 'Resend email'}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--emerald)', fontWeight: 600 }}>✓ Email resent!</div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
          Link expires in 24 hours · Check spam folder if not received
        </div>

        <a href="/auth/login" style={{ display: 'block', marginTop: 16, fontSize: 13, color: 'var(--indigo)' }}>
          ← Back to sign in
        </a>
      </div>
    </div>
  )
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div className="auth-root"><div className="auth-card" /></div>}>
      <CheckEmailContent />
    </Suspense>
  )
}
