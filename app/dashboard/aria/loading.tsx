// app/dashboard/aria/loading.tsx
export default function AriaLoading() {
  return (
    <div className="aria-root">
      <div className="skeleton" style={{ width: 260, height: '100vh', borderRadius: 0 }} />
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="skeleton" style={{ height: 64, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 48, borderRadius: 10 }} />
        <div className="skeleton" style={{ flex: 1, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
      </div>
    </div>
  )
}
