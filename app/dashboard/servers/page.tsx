'use client'
// app/dashboard/servers/page.tsx
import { useState, useEffect } from 'react'

interface Server {
  id: string; name: string; host: string; port: number; username: string
  status: string; os: string | null; cpuUsage: number | null
  ramUsage: number | null; diskUsage: number | null; uptime: number | null
  lastCheckAt: string | null; createdAt: string
}

const STATUS_COLOR: Record<string, string> = {
  online: 'var(--emerald)', offline: 'var(--red)', unknown: 'var(--amber)'
}

function formatUptime(secs: number | null): string {
  if (!secs) return '—'
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h`
  return `${Math.floor((secs % 3600) / 60)}m`
}

function MetricBar({ value, warn, crit }: { value: number | null; warn: number; crit: number }) {
  if (value == null) return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
  const color = value >= crit ? 'var(--red)' : value >= warn ? 'var(--amber)' : 'var(--emerald)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .5s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36 }}>{value.toFixed(0)}%</span>
    </div>
  )
}

const EMPTY = { name: '', host: '', port: '22', username: 'root', os: '', cpuUsage: '', ramUsage: '', diskUsage: '', status: 'unknown' }

export default function ServersPage() {
  const [servers, setServers]       = useState<Server[]>([])
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [showGuide, setShowGuide]   = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [activeGuide, setActiveGuide] = useState<'find-ip' | 'ssh' | 'metrics' | 'agent'>('find-ip')

  useEffect(() => { loadServers() }, [])

  async function loadServers() {
    setLoading(true)
    try {
      const res = await fetch('/api/servers')
      if (res.ok) { const d = await res.json(); setServers(d.servers || []) }
    } finally { setLoading(false) }
  }

  function openAdd() { setForm(EMPTY); setEditId(null); setError(''); setShowAdd(true); setShowGuide(false) }
  function openEdit(s: Server) {
    setForm({ name: s.name, host: s.host, port: String(s.port), username: s.username, os: s.os || '', cpuUsage: s.cpuUsage != null ? String(s.cpuUsage) : '', ramUsage: s.ramUsage != null ? String(s.ramUsage) : '', diskUsage: s.diskUsage != null ? String(s.diskUsage) : '', status: s.status })
    setEditId(s.id); setError(''); setShowAdd(true); setShowGuide(false)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.host.trim()) { setError('Name and IP address are required'); return }
    setSaving(true); setError('')
    try {
      const payload = { name: form.name.trim(), host: form.host.trim(), port: parseInt(form.port) || 22, username: form.username.trim() || 'root', os: form.os.trim() || null, status: form.status, cpuUsage: form.cpuUsage ? parseFloat(form.cpuUsage) : null, ramUsage: form.ramUsage ? parseFloat(form.ramUsage) : null, diskUsage: form.diskUsage ? parseFloat(form.diskUsage) : null }
      const url    = editId ? `/api/servers/${editId}` : '/api/servers'
      const method = editId ? 'PUT' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data   = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      setShowAdd(false); setEditId(null)
      setSuccess(editId ? 'Server updated!' : 'Server added! Now set up the monitoring agent to get live metrics.')
      setTimeout(() => setSuccess(''), 6000)
      loadServers()
    } catch { setError('Connection failed') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this server?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/servers/${id}`, { method: 'DELETE' })
      if (res.ok) { setServers(prev => prev.filter(s => s.id !== id)); setSuccess('Deleted.'); setTimeout(() => setSuccess(''), 2000) }
    } finally { setDeletingId(null) }
  }

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const GUIDES = {
    'find-ip': {
      title: '🌐 Find your server IP',
      steps: [
        { label: 'Cloud provider dashboard', desc: 'Log into AWS, DigitalOcean, Hetzner, Vultr, or wherever you bought your server. Look for "Instances", "Droplets", or "Servers". The Public IP is shown right there.' },
        { label: 'Linux terminal (if on the server)', desc: 'Run this command on your server:\n\ncurl ifconfig.me\n\nThis shows your public IP instantly.' },
        { label: 'Your own VPS', desc: 'If you set it up yourself, run:\n\nhostname -I\n\nThe first address shown is usually your main IP.' },
      ],
      note: 'Use the PUBLIC IP address — not 127.0.0.1 or 192.168.x.x (those are local only)',
    },
    'ssh': {
      title: '🔑 Find your SSH username',
      steps: [
        { label: 'Default usernames by provider', desc: 'AWS EC2 Ubuntu → ubuntu\nAWS EC2 Amazon Linux → ec2-user\nDigitalOcean → root\nHetzner → root\nGoogle Cloud → your Google username\nAzure → azureuser' },
        { label: 'If you created the server yourself', desc: 'The username is whatever you set when creating it. If unsure, try "root" first — most VPS providers default to root.' },
        { label: 'Default SSH port', desc: 'Port 22 is the default for SSH on every server. Only change this if you specifically changed it for security.' },
      ],
      note: 'Not sure? Try root first. If that fails, try ubuntu or ec2-user.',
    },
    'metrics': {
      title: '📊 Get current metrics (optional)',
      steps: [
        { label: 'SSH into your server first', desc: 'Open terminal and run:\nssh root@YOUR_SERVER_IP\n\nEnter your password when asked.' },
        { label: 'Check CPU usage', desc: 'Run: top -bn1 | grep "Cpu"\n\nYou\'ll see something like: Cpu(s): 12.3%us\nThe number before %us is your CPU usage.' },
        { label: 'Check RAM usage', desc: 'Run: free -m\n\nLook at the "Mem:" row. Divide "used" by "total" and multiply by 100 for %.' },
        { label: 'Check disk usage', desc: 'Run: df -h /\n\nLook at the "Use%" column in the "/" row. That\'s your disk usage.' },
      ],
      note: 'You can skip this! The monitoring agent will fill in live metrics automatically.',
    },
    'agent': {
      title: '🤖 Set up live monitoring (recommended)',
      steps: [
        { label: 'Step 1: Add your server here first', desc: 'Fill in the form on this page with your server name and IP. Click "Add Server".' },
        { label: 'Step 2: Go to Monitoring Agent page', desc: 'Click "🔌 Monitoring Agent" in the ARIA sidebar, or go to:\n/dashboard/agent' },
        { label: 'Step 3: Generate a token', desc: 'Select your server → click "Generate Token". You\'ll get a unique token for your server.' },
        { label: 'Step 4: Run the install script', desc: 'SSH into your server and run the one-line install script shown on that page. Takes 30 seconds.' },
        { label: 'Step 5: Done!', desc: 'ARIA will now see your CPU, RAM, disk, and uptime updating every 30 seconds — automatically, forever.' },
      ],
      note: 'The agent runs as a background service. It survives reboots and uses almost no resources.',
    },
  }

  const guide = GUIDES[activeGuide]

  return (
    <div className="servers-root">
      {/* Topbar */}
      <div className="servers-topbar">
        <div className="servers-topbar-left">
          <a href="/dashboard/aria" className="servers-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            ARIA
          </a>
          <div>
            <h1 className="servers-title">My Servers</h1>
            <p className="servers-sub">Add and monitor your servers — ARIA reads live metrics</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-outline-btn" onClick={() => { setShowGuide(!showGuide); setShowAdd(false) }}>
            {showGuide ? '✕ Close guide' : '📖 How to connect'}
          </button>
          <button type="button" className="btn-3d" onClick={openAdd}>+ Add Server</button>
        </div>
      </div>

      <div className="servers-body">
        {success && (
          <div className="servers-success stagger-1">
            ✓ {success}
            {success.includes('monitoring') && (
              <a href="/dashboard/agent" style={{ marginLeft: 10, color: 'var(--indigo)', fontWeight: 700, textDecoration: 'underline' }}>
                Set up agent →
              </a>
            )}
          </div>
        )}

        {/* ── HOW TO CONNECT GUIDE ── */}
        {showGuide && (
          <div className="card-3d srv-guide stagger-1">
            <div className="srv-guide-header">
              <h2 className="servers-form-title">📖 How to connect your server to ARIA</h2>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                Follow these steps in order — takes about 5 minutes total
              </p>
            </div>

            {/* Guide tabs */}
            <div className="srv-guide-tabs">
              {(Object.keys(GUIDES) as Array<keyof typeof GUIDES>).map((key, i) => (
                <button key={key} type="button"
                  className={`srv-guide-tab ${activeGuide === key ? 'active' : ''}`}
                  onClick={() => setActiveGuide(key)}>
                  <span className="srv-guide-tab-num">{i + 1}</span>
                  <span>{GUIDES[key].title.split(' ').slice(1).join(' ')}</span>
                </button>
              ))}
            </div>

            {/* Guide content */}
            <div className="srv-guide-content">
              <h3 className="srv-guide-title">{guide.title}</h3>
              <div className="srv-guide-steps">
                {guide.steps.map((step, i) => (
                  <div key={i} className="srv-guide-step">
                    <div className="srv-guide-step-num">{i + 1}</div>
                    <div className="srv-guide-step-body">
                      <div className="srv-guide-step-label">{step.label}</div>
                      <div className="srv-guide-step-desc">
                        {step.desc.split('\n').map((line, j) =>
                          line.trim() === '' ? <br key={j} /> :
                          line.startsWith('ssh') || line.startsWith('curl') || line.startsWith('top') || line.startsWith('free') || line.startsWith('df') || line.startsWith('hostname') ? (
                            <code key={j} className="srv-guide-cmd">{line}</code>
                          ) : (
                            <span key={j}>{line}<br /></span>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="srv-guide-note">💡 {guide.note}</div>

              {activeGuide !== 'agent' ? (
                <button type="button" className="btn-3d" style={{ marginTop: 20 }}
                  onClick={() => {
                    const keys = Object.keys(GUIDES) as Array<keyof typeof GUIDES>
                    const next = keys[keys.indexOf(activeGuide) + 1]
                    if (next) setActiveGuide(next)
                    else { setShowGuide(false); setShowAdd(true) }
                  }}>
                  Next step →
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn-3d" onClick={() => { setShowGuide(false); setShowAdd(true) }}>
                    + Add Server Now
                  </button>
                  <a href="/dashboard/agent" className="btn-outline-btn" style={{ textDecoration: 'none' }}>
                    🔌 Monitoring Agent
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ADD / EDIT FORM ── */}
        {showAdd && (
          <div className="servers-form-card stagger-1">
            <div className="servers-form-header">
              <h2 className="servers-form-title">{editId ? '✏️ Edit Server' : '+ Add New Server'}</h2>
              <button type="button" className="servers-close" onClick={() => setShowAdd(false)}>×</button>
            </div>

            {/* Quick help inside form */}
            {!editId && (
              <div className="srv-form-help">
                <span>🤔 Not sure what to fill in?</span>
                <button type="button" className="srv-help-link" onClick={() => { setShowGuide(true); setShowAdd(false) }}>
                  Open step-by-step guide →
                </button>
              </div>
            )}

            <div className="servers-form-grid">
              <div className="servers-field">
                <label className="servers-label">Server Name *</label>
                <input className="input-3d" placeholder="e.g. Production Web Server" value={form.name} onChange={e => f('name', e.target.value)} />
                <span className="srv-field-hint">Any name you'll recognize</span>
              </div>
              <div className="servers-field">
                <label className="servers-label">IP Address *
                  <button type="button" className="srv-label-help" onClick={() => { setShowGuide(true); setActiveGuide('find-ip'); setShowAdd(false) }}>
                    How to find it?
                  </button>
                </label>
                <input className="input-3d" placeholder="e.g. 143.198.12.34" value={form.host} onChange={e => f('host', e.target.value)} />
                <span className="srv-field-hint">Your server's public IP address</span>
              </div>
              <div className="servers-field">
                <label className="servers-label">SSH Port</label>
                <input className="input-3d" type="number" placeholder="22" value={form.port} onChange={e => f('port', e.target.value)} />
                <span className="srv-field-hint">Default is 22 — don't change unless you know it's different</span>
              </div>
              <div className="servers-field">
                <label className="servers-label">Username
                  <button type="button" className="srv-label-help" onClick={() => { setShowGuide(true); setActiveGuide('ssh'); setShowAdd(false) }}>
                    What username?
                  </button>
                </label>
                <input className="input-3d" placeholder="root" value={form.username} onChange={e => f('username', e.target.value)} />
                <span className="srv-field-hint">Usually: root, ubuntu, or ec2-user</span>
              </div>
              <div className="servers-field">
                <label className="servers-label">Operating System</label>
                <select className="input-3d" value={form.os} onChange={e => f('os', e.target.value)}>
                  <option value="">Select OS…</option>
                  <option>Ubuntu 24.04</option>
                  <option>Ubuntu 22.04</option>
                  <option>Ubuntu 20.04</option>
                  <option>Debian 12</option>
                  <option>Debian 11</option>
                  <option>CentOS 7</option>
                  <option>CentOS Stream 9</option>
                  <option>Amazon Linux 2</option>
                  <option>Alpine Linux</option>
                  <option>Windows Server 2022</option>
                </select>
              </div>
              <div className="servers-field">
                <label className="servers-label">Status</label>
                <select className="input-3d" value={form.status} onChange={e => f('status', e.target.value)}>
                  <option value="unknown">Unknown</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>

            {/* Optional metrics */}
            <div className="srv-metrics-section">
              <div className="srv-metrics-header">
                <span>📊 Current Metrics</span>
                <span className="srv-metrics-hint">
                  Optional — leave blank and
                  <a href="/dashboard/agent" style={{ color: 'var(--indigo)', marginLeft: 4 }}>set up the agent</a>
                  {' '}for automatic live metrics
                </span>
              </div>
              <div className="servers-form-grid">
                <div className="servers-field">
                  <label className="servers-label">CPU Usage %
                    <button type="button" className="srv-label-help" onClick={() => { setShowGuide(true); setActiveGuide('metrics'); setShowAdd(false) }}>
                      How to check?
                    </button>
                  </label>
                  <input className="input-3d" type="number" min="0" max="100" placeholder="e.g. 45" value={form.cpuUsage} onChange={e => f('cpuUsage', e.target.value)} />
                </div>
                <div className="servers-field">
                  <label className="servers-label">RAM Usage %</label>
                  <input className="input-3d" type="number" min="0" max="100" placeholder="e.g. 68" value={form.ramUsage} onChange={e => f('ramUsage', e.target.value)} />
                </div>
                <div className="servers-field">
                  <label className="servers-label">Disk Usage %</label>
                  <input className="input-3d" type="number" min="0" max="100" placeholder="e.g. 72" value={form.diskUsage} onChange={e => f('diskUsage', e.target.value)} />
                </div>
              </div>
            </div>

            {error && <div className="servers-error">⚠️ {error}</div>}

            <div className="servers-form-actions">
              <button type="button" className="btn-outline-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="button" className="btn-3d" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editId ? '✓ Save Changes' : '+ Add Server'}
              </button>
            </div>
          </div>
        )}

        {/* ── NEXT STEPS BANNER (after first server added) ── */}
        {servers.length > 0 && !showAdd && !showGuide && (
          <div className="srv-next-steps card-3d">
            <div className="srv-next-steps-title">🚀 Make ARIA smarter — set up live monitoring</div>
            <div className="srv-next-steps-row">
              <div className="srv-next-step">
                <div className="srv-next-step-num">1</div>
                <div>Server added ✓</div>
              </div>
              <div className="srv-next-arrow">→</div>
              <div className="srv-next-step">
                <div className="srv-next-step-num">2</div>
                <div>Install agent on server</div>
              </div>
              <div className="srv-next-arrow">→</div>
              <div className="srv-next-step">
                <div className="srv-next-step-num">3</div>
                <div>ARIA sees live CPU/RAM/Disk</div>
              </div>
              <div className="srv-next-arrow">→</div>
              <div className="srv-next-step">
                <div className="srv-next-step-num">4</div>
                <div>Ask ARIA to diagnose it</div>
              </div>
            </div>
            <a href="/dashboard/agent" className="btn-3d" style={{ textDecoration: 'none', alignSelf: 'flex-start', marginTop: 16, fontSize: 13 }}>
              🔌 Set Up Monitoring Agent →
            </a>
          </div>
        )}

        {/* ── SERVER LIST ── */}
        {loading ? (
          <div className="servers-loading">
            {[1,2].map(i => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 14 }} />)}
          </div>
        ) : servers.length === 0 && !showAdd && !showGuide ? (
          <div className="servers-empty">
            <div style={{ fontSize: 52, marginBottom: 16 }}>🖥️</div>
            <h3>No servers yet</h3>
            <p style={{ marginBottom: 20 }}>Add your first server so ARIA can analyze it in real-time</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn-3d" onClick={openAdd}>+ Add Server</button>
              <button type="button" className="btn-outline-btn" onClick={() => setShowGuide(true)}>
                📖 Step-by-step guide
              </button>
            </div>
          </div>
        ) : (
          <div className="servers-list">
            {servers.map((s, i) => (
              <div key={s.id} className={`server-card card-3d stagger-${Math.min(i + 1, 5)}`}>
                <div className="server-card-top">
                  <div className="server-card-info">
                    <div className="server-card-name">{s.name}</div>
                    <div className="server-card-host">{s.username}@{s.host}:{s.port}</div>
                    {s.os && <div className="server-card-os">{s.os}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div className="server-card-status" style={{ color: STATUS_COLOR[s.status] || 'var(--text-3)' }}>
                      <span className="server-status-dot" style={{ background: STATUS_COLOR[s.status] || 'var(--text-3)' }} />
                      {s.status}
                    </div>
                    {s.lastCheckAt ? (
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                        Updated {Math.round((Date.now() - new Date(s.lastCheckAt).getTime()) / 1000)}s ago
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>
                        No live metrics yet
                      </div>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="server-metrics-grid">
                  <div className="server-metric">
                    <div className="server-metric-label">CPU</div>
                    <MetricBar value={s.cpuUsage} warn={70} crit={90} />
                  </div>
                  <div className="server-metric">
                    <div className="server-metric-label">RAM</div>
                    <MetricBar value={s.ramUsage} warn={75} crit={90} />
                  </div>
                  <div className="server-metric">
                    <div className="server-metric-label">Disk</div>
                    <MetricBar value={s.diskUsage} warn={80} crit={95} />
                  </div>
                  <div className="server-metric">
                    <div className="server-metric-label">Uptime</div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{formatUptime(s.uptime)}</span>
                  </div>
                </div>

                {/* No agent warning */}
                {!s.lastCheckAt && (
                  <div className="srv-no-agent-warn">
                    <span>⚡ Install the monitoring agent for live metrics</span>
                    <a href="/dashboard/agent" className="srv-no-agent-link">Set up now →</a>
                  </div>
                )}

                <div className="server-card-actions">
                  <a href="/dashboard/aria" className="btn-3d btn-sm" style={{ textDecoration: 'none' }}>🤖 Ask ARIA</a>
                  <a href="/dashboard/agent" className="btn-outline-btn btn-sm" style={{ textDecoration: 'none' }}>🔌 Agent</a>
                  <button type="button" className="btn-outline-btn btn-sm" onClick={() => openEdit(s)}>✏️ Edit</button>
                  <button type="button" className="btn-danger-btn btn-sm" onClick={() => handleDelete(s.id)} disabled={deletingId === s.id}>
                    {deletingId === s.id ? '…' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
