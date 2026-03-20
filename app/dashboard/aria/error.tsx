'use client'
// app/dashboard/aria/error.tsx
import { useEffect } from 'react'

export default function AriaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[ARIA Error]', error) }, [error])
  return (
    <div className="aria-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="card-3d" style={{ maxWidth: 440, padding: '40px 36px', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          {error.message || 'ARIA encountered an unexpected error.'}
        </p>
        <button className="btn-3d" onClick={reset}>Try Again</button>
      </div>
    </div>
  )
}
