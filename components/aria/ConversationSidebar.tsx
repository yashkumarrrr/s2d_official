'use client'
// components/aria/ConversationSidebar.tsx
import { useState, useCallback } from 'react'

interface Convo {
  id: string; title: string; mode: string
  summary: string | null; updatedAt: string; messageCount: number
}
interface Props {
  conversations: Convo[]
  activeId: string | null
  onSelect: (id: string, mode: string) => void
  onDelete: (id: string) => void
  onNewChat: () => void
  userName: string
  onLogout: () => void
}

const MODE_ICONS: Record<string,string> = { chat:'💬', error:'🔴', server:'🖥️', repo:'📦' }
const MODE_LABELS: Record<string,string> = { chat:'Chat', error:'Error', server:'Server', repo:'Repo' }

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff/60000), h = Math.floor(m/60), days = Math.floor(h/24)
  if (days > 6) return new Date(d).toLocaleDateString('en',{month:'short',day:'numeric'})
  if (days > 0) return `${days}d ago`
  if (h   > 0) return `${h}h ago`
  if (m   > 0) return `${m}m ago`
  return 'just now'
}

function groupConvos(convos: Convo[]): Record<string, Convo[]> {
  const g: Record<string,Convo[]> = {}
  const now = Date.now()
  for (const c of convos) {
    const diff = now - new Date(c.updatedAt).getTime()
    const key = diff < 86400000 ? 'Today'
      : diff < 172800000 ? 'Yesterday'
      : diff < 604800000 ? 'This Week'
      : 'Older'
    if (!g[key]) g[key] = []
    g[key].push(c)
  }
  return g
}

const ORDER = ['Today','Yesterday','This Week','Older']

export default function ConversationSidebar({ conversations, activeId, onSelect, onDelete, onNewChat, userName, onLogout }: Props) {
  const [deleting, setDeleting] = useState<string|null>(null)
  const [hovered,  setHovered]  = useState<string|null>(null)

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleting(id)
    try {
      const res = await fetch(`/api/aria/conversations/${id}`, { method: 'DELETE' })
      if (res.ok) onDelete(id)
    } finally { setDeleting(null) }
  }, [onDelete])

  const grouped = groupConvos(conversations)

  return (
    <div className="aria-sidebar">
      {/* Header */}
      <div className="aria-sidebar-header">
        <div className="aria-sidebar-brand">
          <div className="aria-avatar-sm">AI</div>
          <div>
            <div className="aria-sidebar-title">ARIA</div>
            <div className="aria-sidebar-sub">Senior DevOps Engineer</div>
          </div>
        </div>
        <button className="aria-new-btn" onClick={onNewChat} title="New chat" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Quick-mode nav */}
      <div className="aria-mode-nav">
        {Object.entries(MODE_LABELS).map(([mode,label]) => (
          <button key={mode} className="aria-mode-nav-btn" onClick={onNewChat} type="button">
            <span>{MODE_ICONS[mode]}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="aria-sidebar-divider" />
      <div className="aria-history-label">History</div>

      {/* Conversation list */}
      <div className="aria-conversations-list">
        {conversations.length === 0 ? (
          <div className="aria-empty-history">
            <div style={{fontSize:28,marginBottom:8,opacity:.5}}>💬</div>
            <div style={{fontWeight:600,color:'var(--text-2)',marginBottom:4}}>No conversations yet</div>
            <div>Start a chat to get going</div>
          </div>
        ) : ORDER.map(group => {
          const items = grouped[group]
          if (!items?.length) return null
          return (
            <div key={group}>
              <div className="aria-group-label">{group}</div>
              {items.map((c,i) => (
                <div
                  key={c.id}
                  className={`aria-conv-item${activeId === c.id ? ' active' : ''}`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                  onClick={() => onSelect(c.id, c.mode)}
                  onMouseEnter={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span className="aria-conv-icon">{MODE_ICONS[c.mode] || '💬'}</span>
                  <div className="aria-conv-info">
                    <div className="aria-conv-title">{c.title}</div>
                    <div className="aria-conv-meta">
                      <span>{timeAgo(c.updatedAt)}</span>
                      <span>·</span>
                      <span>{c.messageCount} msgs</span>
                    </div>
                  </div>
                  {(hovered === c.id || deleting === c.id) && (
                    <button
                      className="aria-conv-delete"
                      onClick={e => handleDelete(e, c.id)}
                      disabled={deleting === c.id}
                      title="Delete"
                      type="button"
                    >
                      {deleting === c.id ? '…' : '×'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="aria-sidebar-footer">
        <div className="aria-sidebar-nav-links">
          <a href="/dashboard/history" className="aria-sidebar-nav-link">
            <span>📊</span> Usage &amp; History
          </a>
          <a href="/dashboard/agent" className="aria-sidebar-nav-link">
            <span>🔌</span> Monitoring Agent
          </a>
          <a href="/dashboard/servers" className="aria-sidebar-nav-link">
            <span>🖥️</span> Manage Servers
          </a>
        </div>
        <div className="aria-memory-badge">
          <span className="aria-memory-dot" />
          4-week memory active
        </div>
        <div className="aria-user-row">
          <div className="aria-user-avatar">{(userName || 'U').charAt(0).toUpperCase()}</div>
          <span className="aria-user-name">{userName}</span>
          <button className="aria-logout-btn" onClick={onLogout} title="Sign out" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
