'use client'
// app/dashboard/history/page.tsx
import { useState, useEffect } from 'react'

interface Stats {
  user: { name: string; plan: string }
  overview: { totalMessages: number; totalConvos: number; recentConvos: number; reposAnalyzed: number; serversAnalyzed: number; errorsAnalyzed: number }
  today: { used: number; limit: number; remaining: number }
  modeBreakdown: { mode: string; count: number }[]
  last7Days: { date: string; count: number }[]
  errorTypes: { type: string; count: number }[]
  recentSummaries: { id: string; title: string; mode: string; summary: string; updatedAt: string }[]
}

const MODE_ICONS: Record<string, string> = { chat: '💬', error: '🔴', server: '🖥️', repo: '📦' }
const MODE_COLORS: Record<string, string> = {
  chat:   '#4f46e5',
  error:  '#dc2626',
  server: '#7c3aed',
  repo:   '#059669',
}
const ERROR_COLORS: Record<string, string> = {
  'Node.js':    '#68a063',
  'Python':     '#3572a5',
  'Docker':     '#2496ed',
  'Nginx':      '#009639',
  'PostgreSQL': '#336791',
  'Kubernetes': '#326ce5',
  'OOM':        '#dc2626',
  'SSL/TLS':    '#f59e0b',
  'Permissions':'#d97706',
  'Redis':      '#dc382c',
  'CI/CD':      '#f05032',
  'Go':         '#00add8',
  'Java':       '#b07219',
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const h = Math.floor(diff / 3600000), d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'recently'
}

export default function HistoryPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/aria/stats').then(r => r.ok ? r.json() : null).then(d => {
      setStats(d); setLoading(false)
    })
  }, [])

  const maxDay = stats ? Math.max(...stats.last7Days.map(d => d.count), 1) : 1
  const maxError = stats ? Math.max(...stats.errorTypes.map(e => e.count), 1) : 1
  const totalModes = stats ? stats.modeBreakdown.reduce((a, b) => a + b.count, 0) || 1 : 1

  return (
    <div className="servers-root">
      <div className="servers-topbar">
        <div className="servers-topbar-left">
          <a href="/dashboard/aria" className="servers-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to ARIA
          </a>
          <div>
            <h1 className="servers-title">Usage & History</h1>
            <p className="servers-sub">Your ARIA activity, error patterns, and usage stats</p>
          </div>
        </div>
        <a href="/dashboard/aria" className="btn-3d" style={{ textDecoration: 'none', fontSize: 13 }}>
          🤖 Open ARIA
        </a>
      </div>

      <div className="servers-body">
        {loading ? (
          <div className="servers-loading">
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 14, marginBottom: 10 }} />)}
          </div>
        ) : !stats ? (
          <div className="servers-empty">
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <h3>No data yet</h3>
            <p>Start chatting with ARIA to see your stats here</p>
          </div>
        ) : (
          <>
            {/* Today's usage */}
            <div className="hist-today-card card-3d stagger-1">
              <div className="hist-today-left">
                <div className="hist-today-label">Today&apos;s Usage</div>
                <div className="hist-today-num">{stats.today.used} <span>/ {stats.today.limit === 9999 ? '∞' : stats.today.limit}</span></div>
                <div className="hist-today-plan">
                  <span className={`hist-plan-badge ${stats.user.plan}`}>{stats.user.plan.toUpperCase()}</span>
                  {stats.user.plan === 'free' && stats.today.remaining < 5 && (
                    <span className="hist-warning">⚠️ Only {stats.today.remaining} messages left today</span>
                  )}
                  {stats.user.plan === 'free' && (
                    <a href="#" className="hist-upgrade-link">Upgrade to Pro for unlimited →</a>
                  )}
                </div>
              </div>
              <div className="hist-today-bar-wrap">
                <div className="hist-today-bar">
                  <div className="hist-today-fill" style={{
                    width: `${Math.min((stats.today.used / (stats.today.limit === 9999 ? stats.today.used || 1 : stats.today.limit)) * 100, 100)}%`,
                    background: stats.today.remaining < 5 ? 'var(--red)' : stats.today.remaining < 10 ? 'var(--amber)' : 'var(--indigo)',
                  }} />
                </div>
                <div className="hist-today-bar-labels">
                  <span>0</span>
                  <span>{stats.today.remaining > 0 ? `${stats.today.remaining} remaining` : 'Limit reached'}</span>
                  <span>{stats.today.limit === 9999 ? '∞' : stats.today.limit}</span>
                </div>
              </div>
            </div>

            {/* Overview stats */}
            <div className="hist-overview-grid stagger-2">
              {[
                { label: 'Total messages', value: stats.overview.totalMessages, icon: '💬' },
                { label: 'Errors analyzed',  value: stats.overview.errorsAnalyzed,  icon: '🔴' },
                { label: 'Repos scanned',   value: stats.overview.reposAnalyzed,   icon: '📦' },
                { label: 'Servers analyzed', value: stats.overview.serversAnalyzed, icon: '🖥️' },
              ].map((s, i) => (
                <div key={i} className="hist-stat-card card-3d">
                  <div className="hist-stat-icon">{s.icon}</div>
                  <div className="hist-stat-num">{s.value.toLocaleString()}</div>
                  <div className="hist-stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="hist-charts-row stagger-3">
              {/* 7-day bar chart */}
              <div className="card-3d hist-chart-card">
                <div className="hist-chart-title">Messages — Last 7 Days</div>
                <div className="hist-bar-chart">
                  {(() => {
                    const days: { date: string; count: number }[] = []
                    for (let i = 6; i >= 0; i--) {
                      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
                      const found = stats.last7Days.find(x => x.date === d)
                      days.push({ date: d, count: found?.count ?? 0 })
                    }
                    return days.map((d, i) => (
                      <div key={i} className="hist-bar-col">
                        <div className="hist-bar-val">{d.count || ''}</div>
                        <div className="hist-bar" style={{ height: `${Math.max((d.count / maxDay) * 120, d.count > 0 ? 8 : 3)}px`, background: d.count > 0 ? 'var(--indigo)' : 'var(--bg-3)' }} />
                        <div className="hist-bar-label">{fmt(d.date).split(' ')[0]} {fmt(d.date).split(' ')[1]}</div>
                      </div>
                    ))
                  })()}
                </div>
              </div>

              {/* Mode breakdown */}
              <div className="card-3d hist-chart-card">
                <div className="hist-chart-title">Conversations by Mode</div>
                <div className="hist-modes">
                  {stats.modeBreakdown.map((m, i) => (
                    <div key={i} className="hist-mode-row">
                      <span className="hist-mode-icon">{MODE_ICONS[m.mode] || '💬'}</span>
                      <span className="hist-mode-name" style={{ textTransform: 'capitalize' }}>{m.mode}</span>
                      <div className="hist-mode-bar-wrap">
                        <div className="hist-mode-bar">
                          <div style={{ width: `${(m.count / totalModes) * 100}%`, height: '100%', background: MODE_COLORS[m.mode] || 'var(--indigo)', borderRadius: 3, transition: 'width .5s ease' }} />
                        </div>
                      </div>
                      <span className="hist-mode-count">{m.count}</span>
                    </div>
                  ))}
                  {stats.modeBreakdown.length === 0 && (
                    <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No conversations yet</div>
                  )}
                </div>
              </div>
            </div>

            {/* Error types */}
            {stats.errorTypes.length > 0 && (
              <div className="card-3d stagger-4" style={{ padding: 24 }}>
                <div className="hist-chart-title" style={{ marginBottom: 20 }}>Top Error Types Fixed</div>
                <div className="hist-error-grid">
                  {stats.errorTypes.slice(0, 8).map((e, i) => (
                    <div key={i} className="hist-error-item">
                      <div className="hist-error-header">
                        <div className="hist-error-dot" style={{ background: ERROR_COLORS[e.type] || 'var(--indigo)' }} />
                        <span className="hist-error-type">{e.type}</span>
                        <span className="hist-error-count">{e.count}×</span>
                      </div>
                      <div className="hist-error-bar-outer">
                        <div className="hist-error-bar-inner" style={{ width: `${(e.count / maxError) * 100}%`, background: ERROR_COLORS[e.type] || 'var(--indigo)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent summaries */}
            {stats.recentSummaries.length > 0 && (
              <div className="card-3d stagger-5" style={{ padding: 24 }}>
                <div className="hist-chart-title" style={{ marginBottom: 16 }}>Recent Conversation Summaries</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {stats.recentSummaries.map(s => (
                    <a key={s.id} href="/dashboard/aria" className="hist-summary-item">
                      <span className="hist-summary-icon">{MODE_ICONS[s.mode] || '💬'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="hist-summary-title">{s.title}</div>
                        <div className="hist-summary-text">{s.summary}</div>
                      </div>
                      <div className="hist-summary-time">{timeAgo(s.updatedAt)}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
