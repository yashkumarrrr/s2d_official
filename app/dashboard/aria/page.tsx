'use client'
// app/dashboard/aria/page.tsx
import { useState, useEffect, useRef } from 'react'
import ConversationSidebar from '@/components/aria/ConversationSidebar'
import MessageRenderer from '@/components/aria/MessageRenderer'
import TypingDots from '@/components/aria/TypingDots'

type Mode = 'chat' | 'error' | 'server' | 'repo'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}
interface Convo {
  id: string; title: string; mode: Mode
  summary: string | null; updatedAt: string; messageCount: number
}
interface Server {
  id: string; name: string; host: string; status: string
  cpuUsage: number | null; ramUsage: number | null; diskUsage: number | null; os: string | null
}
interface UserInfo { id: string; name: string; email: string; plan: string }

const SUGGESTIONS = [
  'Why is my Docker container using 100% CPU?',
  'Set up zero-downtime Nginx deployment',
  'Debug PostgreSQL slow queries in production',
  'Harden my Ubuntu 22.04 server security',
  'Fix "ECONNREFUSED 127.0.0.1:5432" in Node.js',
  'Set up GitHub Actions CI/CD for a Node.js app',
]

function MetricCard({ label, value, warn, crit }: { label: string; value: number | null; warn: number; crit: number }) {
  const color = value == null ? 'var(--text-3)' : value >= crit ? 'var(--red)' : value >= warn ? 'var(--amber)' : 'var(--green)'
  return (
    <div className="aria-metric-card">
      <div className="aria-metric-value" style={{ color }}>{value != null ? `${value.toFixed(0)}%` : '—'}</div>
      <div className="aria-metric-label">{label}</div>
      {value != null && <div className="aria-metric-bar"><div className="aria-metric-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} /></div>}
    </div>
  )
}

export default function AriaPage() {
  const [userInfo, setUserInfo]             = useState<UserInfo | null>(null)
  const [mode, setMode]                     = useState<Mode>('chat')
  const [convos, setConvos]                 = useState<Convo[]>([])
  const [activeId, setActiveId]             = useState<string | null>(null)
  const [messages, setMessages]             = useState<Message[]>([])

  // Chat mode
  const [input, setInput]                   = useState('')

  // Error mode
  const [errorInput, setErrorInput]         = useState('')
  const [errorType, setErrorType]           = useState('')
  const [errorDone, setErrorDone]           = useState(false)

  // Server mode
  const [servers, setServers]               = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState('')
  const [serverDone, setServerDone]         = useState(false)

  // Repo mode
  const [repoUrl, setRepoUrl]               = useState('')
  const [repoProgress, setRepoProgress]     = useState(0)
  const [repoStatus, setRepoStatus]         = useState('')
  const [repoDone, setRepoDone]             = useState(false)

  // Follow-up chat (shared across error/server/repo after analysis)
  const [followUp, setFollowUp]             = useState('')

  const [isStreaming, setIsStreaming]       = useState(false)
  const [lastRefresh, setLastRefresh]       = useState<Date>(new Date())
  const [refreshTick, setRefreshTick]       = useState(0)
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number; plan: string } | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const followRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => { if (d?.user) setUserInfo(d.user) })
    fetch('/api/aria/conversations').then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setConvos(d) })
    fetch('/api/servers').then(r => r.ok ? r.json() : { servers: [] }).then(d => setServers(d.servers || []))
  }, [])

  // Real-time server metrics — refresh every 15 seconds when on server tab
  useEffect(() => {
    if (mode !== 'server') return
    const interval = setInterval(() => {
      fetch('/api/servers').then(r => r.ok ? r.json() : { servers: [] }).then(d => {
        setServers(d.servers || [])
        setLastRefresh(new Date())
      })
    }, 15000)
    // Tick every second to update "X seconds ago" display
    const ticker = setInterval(() => setRefreshTick(t => t + 1), 1000)
    return () => { clearInterval(interval); clearInterval(ticker) }
  }, [mode])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function resetChat() {
    setActiveId(null); setMessages([]); setInput(''); setErrorInput(''); setRepoUrl('')
    setErrorType(''); setRepoProgress(0); setRepoStatus(''); setSelectedServer('')
    setErrorDone(false); setServerDone(false); setRepoDone(false); setFollowUp('')
  }

  function switchMode(m: Mode) { setMode(m); resetChat() }

  async function loadConvo(id: string, m: string) {
    try {
      const res = await fetch(`/api/aria/conversations/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setActiveId(id); setMode(m as Mode)
      setMessages(data.messages.map((msg: any) => ({ id: msg.id, role: msg.role, content: msg.content })))
      // If loading a past analysis conversation, show follow-up input
      if (m === 'error') setErrorDone(true)
      if (m === 'server') setServerDone(true)
      if (m === 'repo') setRepoDone(true)
    } catch {}
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.replace('/auth/login')
  }

  function refreshConvos() {
    fetch('/api/aria/conversations').then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setConvos(d) })
  }

  async function sendToAPI(endpoint: string, body: object, userContent: string, onDone?: () => void) {
    if (isStreaming) return
    const uid = `u-${Date.now()}`
    const aid = `a-${Date.now()}`
    setMessages(prev => [...prev,
      { id: uid, role: 'user' as const, content: userContent },
      { id: aid, role: 'assistant' as const, content: '', streaming: true },
    ])
    setIsStreaming(true)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        if (res.status === 429) {
          setRateLimited(true)
          setTimeout(() => setRateLimited(false), 8000)
          setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `❌ **Daily limit reached** — ${err.error || 'Rate limited'}`, streaming: false } : m))
          return
        }
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `❌ ${err.error || 'Request failed'}`, streaming: false } : m))
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const e = JSON.parse(line.slice(6))
            if (e.type === 'id') {
              setActiveId(e.conversationId)
              if (e.errorType) setErrorType(e.errorType)
            } else if (e.type === 'status') {
              setRepoStatus(e.message)
              setRepoProgress(p => Math.min(p + 18, 88))
            } else if (e.type === 'delta') {
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: m.content + e.text } : m))
            } else if (e.type === 'usage') {
              setUsage({ used: e.used, limit: e.limit, remaining: e.remaining, plan: e.plan })
            } else if (e.type === 'done') {
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, streaming: false } : m))
              setRepoProgress(100); setRepoStatus('')
              refreshConvos()
              if (onDone) onDone()
            } else if (e.type === 'error') {
              setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `❌ ${e.message}`, streaming: false } : m))
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: '❌ Connection lost. Please try again.', streaming: false } : m))
    } finally {
      setIsStreaming(false); setRepoProgress(0)
    }
  }

  // === CHAT ===
  function sendChat() {
    const text = input.trim(); if (!text || isStreaming) return
    setInput('')
    sendToAPI('/api/aria/chat', { conversationId: activeId, message: text, mode }, text)
  }

  // === ERROR ANALYZE ===
  function analyzeError() {
    const text = errorInput.trim(); if (!text || isStreaming) return
    sendToAPI(
      '/api/aria/analyze-error',
      { error: text, serverId: selectedServer || undefined, conversationId: activeId },
      `Analyze this error:\n\`\`\`\n${text.slice(0, 120)}…\n\`\`\``,
      () => {
        setErrorDone(true)
        setTimeout(() => followRef.current?.focus(), 300)
      }
    )
  }

  // === SERVER ANALYZE ===
  function analyzeServer() {
    if (!selectedServer || isStreaming) return
    const srv = servers.find(s => s.id === selectedServer)
    const q = input.trim(); setInput('')
    sendToAPI(
      '/api/aria/analyze-server',
      { serverId: selectedServer, question: q || undefined, conversationId: activeId },
      `${q || 'Full health diagnosis'} — ${srv?.name}`,
      () => {
        setServerDone(true)
        setTimeout(() => followRef.current?.focus(), 300)
      }
    )
  }

  // === REPO ANALYZE ===
  function analyzeRepo() {
    const url = repoUrl.trim(); if (!url || isStreaming) return
    setRepoProgress(5); setRepoStatus('Connecting to GitHub…')
    sendToAPI(
      '/api/aria/analyze-repo',
      { repoUrl: url, conversationId: activeId },
      `Analyze repo: ${url}`,
      () => {
        setRepoDone(true)
        setTimeout(() => followRef.current?.focus(), 300)
      }
    )
  }

  // === FOLLOW-UP CHAT (after any analysis) ===
  function sendFollowUp() {
    const text = followUp.trim(); if (!text || isStreaming) return
    setFollowUp('')
    // Send as chat with existing conversationId — ARIA stays in full context
    sendToAPI(
      '/api/aria/chat',
      { conversationId: activeId, message: text, mode },
      text
    )
  }

  function autoDetect(text: string) {
    if (!text) { setErrorType(''); return }
    const t = text.toLowerCase()
    if (t.includes('traceback') || t.includes('syntaxerror')) setErrorType('Python')
    else if (t.includes('econnrefused') || t.includes('cannot find module')) setErrorType('Node.js')
    else if (t.includes('502 bad gateway') || t.includes('upstream')) setErrorType('Nginx')
    else if (t.includes('docker') || t.includes('oci runtime')) setErrorType('Docker')
    else if (t.includes('out of memory') || t.includes('oom')) setErrorType('OOM')
    else if (t.includes('ssl') || t.includes('certificate')) setErrorType('SSL/TLS')
    else if (t.includes('permission denied')) setErrorType('Permissions')
    else if (t.includes('postgres') || t.includes('psql')) setErrorType('PostgreSQL')
    else if (t.includes('kubernetes') || t.includes('pod')) setErrorType('Kubernetes')
    else setErrorType('')
  }

  const currentServer = servers.find(s => s.id === selectedServer)
  const analysisActive = errorDone || serverDone || repoDone

  const tabConfig: { key: Mode; icon: string; label: string }[] = [
    { key: 'chat',   icon: '💬', label: 'Chat' },
    { key: 'error',  icon: '🔴', label: 'Error Analyzer' },
    { key: 'server', icon: '🖥️', label: 'Server Analyzer' },
    { key: 'repo',   icon: '📦', label: 'Repo Analyzer' },
  ]

  return (
    <div className="aria-root">
      <ConversationSidebar
        conversations={convos} activeId={activeId}
        onSelect={loadConvo}
        onDelete={id => { setConvos(prev => prev.filter(c => c.id !== id)); if (activeId === id) resetChat() }}
        onNewChat={resetChat}
        userName={userInfo?.name || 'User'}
        onLogout={handleLogout}
      />

      <div className="aria-main">
        {/* Topbar */}
        <div className="aria-topbar">
          <div className="aria-topbar-left">
            <div className="aria-topbar-avatar">AI</div>
            <div>
              <div className="aria-topbar-title">ARIA — AI Senior DevOps Engineer</div>
              <div className="aria-topbar-sub">40 years experience · Netflix · Google · AWS · Cloudflare</div>
            </div>
          </div>
          <div className="aria-topbar-right">
            <div className="aria-memory-indicator"><span className="aria-pulse-dot" />4-week memory</div>
            {usage && (
              <div className="aria-usage-bar">
                <span style={{ whiteSpace:'nowrap' }}>{usage.used}/{usage.limit === 9999 ? '∞' : usage.limit}</span>
                <div className="aria-usage-fill-wrap">
                  <div className="aria-usage-fill" style={{
                    width: `${usage.limit === 9999 ? 10 : Math.min((usage.used/usage.limit)*100,100)}%`,
                    background: usage.remaining < 5 ? 'var(--red)' : usage.remaining < 10 ? 'var(--amber)' : 'var(--indigo)',
                  }} />
                </div>
              </div>
            )}
            <a href="/dashboard/servers" className="btn-3d btn-outline" style={{ fontSize: 12, padding: '7px 14px' }}>🖥️ Servers</a>
            <button type="button" className="btn-3d" onClick={resetChat} style={{ fontSize: 12, padding: '7px 14px' }}>+ New Chat</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="aria-tabs">
          {tabConfig.map(({ key, icon, label }) => (
            <button key={key} type="button"
              className={`aria-tab${mode === key ? ' active' : ''}`}
              onClick={() => switchMode(key)}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="aria-messages">
          {messages.length === 0 && (
            <div className="aria-welcome stagger-1">
              <div className="aria-welcome-avatar">AI</div>
              <h2 className="aria-welcome-title">I&apos;m ARIA</h2>
              <p className="aria-welcome-sub">
                {mode === 'chat' && "Ask me anything DevOps. I've fixed every error, scaled every system, survived every 3 AM incident."}
                {mode === 'error' && "Paste any error or stack trace — I'll give you the exact fix. Then keep chatting to go deeper."}
                {mode === 'server' && "Select a server for a full health diagnosis. Then ask me anything about the results."}
                {mode === 'repo' && "Give me a public GitHub URL — I'll grade it A–F and explain every issue. Then ask follow-up questions."}
              </p>
              {mode === 'chat' && (
                <div className="aria-suggestions">
                  {SUGGESTIONS.map(s => (
                    <button key={s} type="button" className="aria-suggestion-btn"
                      onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50) }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {mode === 'server' && servers.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <p style={{ color: 'var(--text-2)', marginBottom: 12, fontSize: 14 }}>No servers added yet.</p>
                  <a href="/dashboard/servers" className="btn-3d" style={{ textDecoration: 'none', fontSize: 13 }}>+ Add Your First Server</a>
                </div>
              )}
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`aria-msg-row ${msg.role}`}>
              {msg.role === 'assistant' && <div className={`aria-avatar${msg.streaming ? ' aria-avatar-glow' : ''}`}>AI</div>}
              <div className={`aria-msg-bubble ${msg.role}`}>
                {msg.role === 'assistant'
                  ? (msg.streaming && !msg.content ? <TypingDots /> : <MessageRenderer content={msg.content} />)
                  : <div className="aria-user-text">{msg.content}</div>}
              </div>
            </div>
          ))}

          {/* Follow-up prompt after analysis completes */}
          {analysisActive && messages.length > 0 && !isStreaming && (
            <div className="aria-followup-hint stagger-1">
              <div className="aria-followup-icon">💬</div>
              <div>
                <div className="aria-followup-title">Want to go deeper?</div>
                <div className="aria-followup-sub">
                  {mode === 'error' && 'Ask ARIA to explain any part, fix more errors, or prevent this from happening again.'}
                  {mode === 'server' && 'Ask about any specific issue found, request more commands, or ask about optimizations.'}
                  {mode === 'repo' && 'Ask about any grade, request specific fixes, or analyze a particular file or workflow.'}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="aria-input-area">

          {/* CHAT */}
          {mode === 'chat' && (
            <div className="aria-chat-input-row">
              <textarea ref={inputRef} className="aria-chat-input input-3d"
                placeholder="Ask ARIA anything — errors, Docker, Linux, Kubernetes, CI/CD, security…"
                value={input} onChange={e => setInput(e.target.value)} rows={3} disabled={isStreaming}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }} />
              <button type="button" className="btn-3d aria-send-btn" onClick={sendChat} disabled={!input.trim() || isStreaming}>
                {isStreaming
                  ? <svg className="aria-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
              </button>
            </div>
          )}

          {/* ERROR — input panel + follow-up after done */}
          {mode === 'error' && (
            <div className="aria-error-wrapper">
              {!errorDone ? (
                <>
                  <div className="aria-error-top">
                    <span className="aria-error-label">🔴 Paste your error / stack trace</span>
                    {errorType && <span className="aria-badge-error">{errorType} detected</span>}
                  </div>
                  <textarea className="aria-error-textarea input-3d"
                    placeholder={"Paste the full error here:\n• Node.js: Cannot find module 'express'\n• Python: Traceback (most recent call last)...\n• Docker: OCI runtime exec failed...\n• Nginx: 502 Bad Gateway"}
                    value={errorInput} onChange={e => { setErrorInput(e.target.value); autoDetect(e.target.value) }}
                    rows={6} disabled={isStreaming} />
                  <div className="aria-error-actions">
                    <select className="input-3d aria-select-sm" value={selectedServer} onChange={e => setSelectedServer(e.target.value)}>
                      <option value="">No server context (optional)</option>
                      {servers.map(s => <option key={s.id} value={s.id}>{s.name} — {s.host}</option>)}
                    </select>
                    <button type="button" className="btn-3d" onClick={analyzeError} disabled={!errorInput.trim() || isStreaming}>
                      {isStreaming ? 'Analyzing…' : '⚡ Analyze & Fix'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="aria-followup-input-wrap">
                  <div className="aria-followup-input-label">
                    <span className="aria-followup-input-icon">💬</span>
                    Continue the conversation — ask ARIA anything about this error
                  </div>
                  <div className="aria-chat-input-row">
                    <textarea ref={followRef} className="aria-chat-input input-3d"
                      placeholder="e.g. 'How do I prevent this permanently?' or 'Explain the root cause in more detail' or 'Also fix the related Dockerfile issue'…"
                      value={followUp} onChange={e => setFollowUp(e.target.value)} rows={2} disabled={isStreaming}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp() } }} />
                    <button type="button" className="btn-3d aria-send-btn" onClick={sendFollowUp} disabled={!followUp.trim() || isStreaming}>
                      {isStreaming
                        ? <svg className="aria-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                    </button>
                  </div>
                  <button type="button" className="aria-new-analysis-btn" onClick={() => { setErrorDone(false); setErrorInput(''); setErrorType('') }}>
                    + Analyze a different error
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SERVER — controls + follow-up */}
          {mode === 'server' && (
            <div className="aria-server-wrapper">
              {currentServer && (
                <>
                <div className="aria-realtime-bar">
                  <span className="aria-realtime-dot" />
                  <span>Live metrics</span>
                  {currentServer.lastCheckAt ? (
                    <span style={{ color: 'var(--text-3)' }}>
                      · updated {Math.round((Date.now() - new Date(currentServer.lastCheckAt as any).getTime()) / 1000)}s ago
                    </span>
                  ) : (
                    <span style={{ color: 'var(--amber)', fontSize: 11 }}>· No agent connected —
                      <a href="/dashboard/agent" style={{ color: 'var(--indigo)', marginLeft: 4 }}>Set up agent →</a>
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>auto-refreshes every 15s</span>
                </div>
                <div className="aria-metrics-row">
                  <MetricCard label="CPU"  value={currentServer.cpuUsage}  warn={70} crit={90} />
                  <MetricCard label="RAM"  value={currentServer.ramUsage}  warn={75} crit={90} />
                  <MetricCard label="Disk" value={currentServer.diskUsage} warn={80} crit={95} />
                  <div className="aria-metric-card">
                    <div className="aria-metric-value" style={{ color: currentServer.status === 'online' ? 'var(--green)' : currentServer.status === 'offline' ? 'var(--red)' : 'var(--amber)', fontSize: 13 }}>
                      {currentServer.status}
                    </div>
                    <div className="aria-metric-label">Status</div>
                    {currentServer.os && <div className="aria-metric-os">{currentServer.os}</div>}
                  </div>
                </div>
                </>
              )}

              {!serverDone ? (
                <>
                  <div className="aria-server-controls">
                    <select className="input-3d aria-select-lg" value={selectedServer}
                      onChange={e => setSelectedServer(e.target.value)} disabled={isStreaming}>
                      <option value="">— Select a server to analyze —</option>
                      {servers.map(s => <option key={s.id} value={s.id}>{s.name} · {s.host} · {s.status}</option>)}
                    </select>
                    <button type="button" className="btn-3d" onClick={analyzeServer} disabled={!selectedServer || isStreaming}>
                      {isStreaming ? 'Analyzing…' : '🖥️ Full Health Check'}
                    </button>
                  </div>
                  <textarea className="input-3d" placeholder="Optional: ask a specific question…"
                    value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={isStreaming} />
                  {servers.length === 0 && (
                    <div className="aria-server-empty">
                      <span>No servers yet.</span>
                      <a href="/dashboard/servers" className="aria-link"> Add a server →</a>
                    </div>
                  )}
                </>
              ) : (
                <div className="aria-followup-input-wrap">
                  <div className="aria-followup-input-label">
                    <span className="aria-followup-input-icon">💬</span>
                    Ask ARIA about any finding — get more commands, explanations, or optimizations
                  </div>
                  <div className="aria-chat-input-row">
                    <textarea ref={followRef} className="aria-chat-input input-3d"
                      placeholder="e.g. 'Give me the commands to fix issue #2' or 'How do I set up monitoring for this server?' or 'What should I do about the high disk usage?'…"
                      value={followUp} onChange={e => setFollowUp(e.target.value)} rows={2} disabled={isStreaming}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp() } }} />
                    <button type="button" className="btn-3d aria-send-btn" onClick={sendFollowUp} disabled={!followUp.trim() || isStreaming}>
                      {isStreaming
                        ? <svg className="aria-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                    </button>
                  </div>
                  <button type="button" className="aria-new-analysis-btn" onClick={() => { setServerDone(false); setInput('') }}>
                    + Run another health check
                  </button>
                </div>
              )}
            </div>
          )}

          {/* REPO — URL input + follow-up */}
          {mode === 'repo' && (
            <div className="aria-repo-wrapper">
              {repoProgress > 0 && repoProgress < 100 && (
                <div className="aria-progress-wrap">
                  <div className="aria-progress-bar"><div className="aria-progress-fill" style={{ width: `${repoProgress}%` }} /></div>
                  <span className="aria-progress-label">{repoStatus}</span>
                </div>
              )}

              {!repoDone ? (
                <div className="aria-repo-row">
                  <div className="aria-repo-input-wrap">
                    <svg className="aria-gh-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                    <input type="url" className="input-3d aria-repo-input"
                      placeholder="https://github.com/owner/repository"
                      value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') analyzeRepo() }} disabled={isStreaming} />
                  </div>
                  <button type="button" className="btn-3d" onClick={analyzeRepo} disabled={!repoUrl.trim() || isStreaming}>
                    {isStreaming ? 'Scanning…' : '📦 Analyze Repo'}
                  </button>
                </div>
              ) : (
                <div className="aria-followup-input-wrap">
                  <div className="aria-followup-input-label">
                    <span className="aria-followup-input-icon">💬</span>
                    Ask ARIA about any part of the analysis — fixes, explanations, code changes
                  </div>
                  <div className="aria-chat-input-row">
                    <textarea ref={followRef} className="aria-chat-input input-3d"
                      placeholder="e.g. 'How do I fix the Security grade?' or 'Show me a better Dockerfile' or 'What CI/CD improvements should I make first?'…"
                      value={followUp} onChange={e => setFollowUp(e.target.value)} rows={2} disabled={isStreaming}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp() } }} />
                    <button type="button" className="btn-3d aria-send-btn" onClick={sendFollowUp} disabled={!followUp.trim() || isStreaming}>
                      {isStreaming
                        ? <svg className="aria-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                    </button>
                  </div>
                  <button type="button" className="aria-new-analysis-btn" onClick={() => { setRepoDone(false); setRepoUrl(''); setRepoProgress(0) }}>
                    + Analyze a different repo
                  </button>
                </div>
              )}

              {!repoDone && <p className="aria-repo-hint">Works with any public GitHub repository · Takes 15–30 seconds</p>}
            </div>
          )}

          <div className="aria-input-tip">
            {mode === 'chat' && 'Enter to send · Shift+Enter for new line'}
            {mode === 'error' && !errorDone && 'Include the full stack trace for the most accurate fix'}
            {mode === 'error' && errorDone && 'Enter to send · ARIA stays in full context of your error'}
            {mode === 'server' && !serverDone && 'Select a server then click Full Health Check'}
            {mode === 'server' && serverDone && 'Enter to send · ARIA knows everything about your server'}
            {mode === 'repo' && !repoDone && 'Public GitHub repos · No token required · 15–30 seconds'}
            {mode === 'repo' && repoDone && 'Enter to send · ARIA has the full repo context'}
            {isStreaming && <span className="aria-streaming-badge">⚡ Streaming…</span>}
          </div>
        </div>
      </div>

      {/* Rate limit toast */}
      {rateLimited && (
        <div className="aria-ratelimit-toast">
          <div className="aria-ratelimit-icon">🚫</div>
          <div className="aria-ratelimit-msg">
            <strong>Daily limit reached.</strong> Free plan allows 20 messages/day. Resets at midnight UTC.
            <br />
            <button className="aria-ratelimit-upgrade" onClick={() => window.open('/pricing', '_blank')}>
              Upgrade to Pro for unlimited →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
