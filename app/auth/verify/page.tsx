'use client'
// app/auth/verify/page.tsx
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function VerifyContent() {
  const params = useSearchParams()
  const token  = params.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    // Hit the API route which sets cookie and redirects
    window.location.href = `/api/auth/verify?token=${token}`
  }, [token])

  return (
    <div className="auth-root">
      <div className="auth-bg-grid" />
      <div className="auth-card" style={{ textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <span className="auth-spinner" style={{ width: 36, height: 36, borderWidth: 3, borderColor: 'var(--border-2)', borderTopColor: 'var(--indigo)' }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Verifying your email…</h2>
            <p style={{ fontSize: 14, color: 'var(--text-2)' }}>This takes just a second</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Invalid or expired link</h2>
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 20 }}>This link may have expired (24 hours) or already been used.</p>
            <a href="/auth/register" className="btn-3d" style={{ textDecoration: 'none' }}>Create new account →</a>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="auth-root"><div className="auth-card" /></div>}>
      <VerifyContent />
    </Suspense>
  )
}
