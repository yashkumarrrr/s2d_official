'use client'
// app/dashboard/agent/page.tsx
import { useState, useEffect, useRef } from 'react'

interface Server { id: string; name: string; host: string; status: string; cpuUsage: number | null; ramUsage: number | null; diskUsage: number | null; uptime: string | null; lastCheckAt: string | null; os: string | null }
interface Token  { token: string; serverId: string; lastUsedAt: string | null; server: { id: string; name: string; host: string } }

function Bar({ value, warn, crit, label }: { value: number | null; warn: number; crit: number; label: string }) {
  if (value == null) return (
    <div className="rt-metric">
      <div className="rt-metric-label">{label}</div>
      <div className="rt-metric-val" style={{ color: 'var(--text-3)' }}>—</div>
    </div>
  )
  const color = value >= crit ? 'var(--red)' : value >= warn ? 'var(--amber)' : 'var(--emerald)'
  return (
    <div className="rt-metric">
      <div className="rt-metric-label">{label}</div>
      <div className="rt-metric-val" style={{ color }}>{value.toFixed(0)}%</div>
      <div className="rt-metric-bar"><div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .5s ease' }} /></div>
    </div>
  )
}

function fmtUptime(s: string | null) {
  if (!s) return '—'
  const n = parseInt(s)
  const d = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtAgo(iso: string | null) {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 5)  return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  return `${Math.floor(s/3600)}h ago`
}

export default function AgentPage() {
  const [servers, setServers]     = useState<Server[]>([])
  const [tokens, setTokens]       = useState<Token[]>([])
  const [allServers, setAllSrv]   = useState<{id:string;name:string;host:string}[]>([])
  const [selected, setSelected]   = useState('')
  const [generating, setGen]      = useState(false)
  const [newToken, setNewToken]   = useState('')
  const [newSrvName, setNewSrvName] = useState('')
  const [copied, setCopied]       = useState('')
  const [appUrl, setAppUrl]       = useState('')
  const [tick, setTick]           = useState(0)
  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => {
    setAppUrl(window.location.origin)
    fetch('/api/servers').then(r => r.ok ? r.json() : {servers:[]}).then(d => setAllSrv(d.servers || []))
    fetch('/api/agent/token').then(r => r.ok ? r.json() : {tokens:[]}).then(d => setTokens(d.tokens || []))

    // Real-time SSE connection
    const es = new EventSource('/api/servers/stream')
    sseRef.current = es
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'metrics') setServers(data.servers)
      } catch {}
    }
    es.onerror = () => { /* SSE auto-reconnects */ }

    // Tick every second for "updated Xs ago"
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => { es.close(); clearInterval(t) }
  }, [])

  async function generateToken() {
    if (!selected) return
    setGen(true)
    try {
      const res  = await fetch('/api/agent/token', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ serverId: selected }) })
      const data = await res.json()
      if (res.ok) {
        setNewToken(data.token); setNewSrvName(data.serverName)
        fetch('/api/agent/token').then(r => r.json()).then(d => setTokens(d.tokens || []))
      }
    } finally { setGen(false) }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const installScript = (token: string) => `#!/bin/bash
# ARIA Monitoring Agent — ${newSrvName || 'your server'}
set -euo pipefail

AGENT_TOKEN="${token}"
APP_URL="${appUrl}"
SCRIPT="/opt/aria-agent.sh"

cat > "\$SCRIPT" << 'AGENT'
#!/bin/bash
set -uo pipefail
TOKEN="${token}"
URL="${appUrl}"
while true; do
  CPU=\$(top -bn1 2>/dev/null | grep -E "^%?Cpu" | awk '{for(i=1;i<=NF;i++) if(\$i~/^[0-9]/ && \$(i+1)~/id/) {printf "%.1f", 100-\$i; exit}}' || echo 0)
  RAM=\$(free 2>/dev/null | awk '/^Mem:/{printf "%.1f", \$3/\$2*100}' || echo 0)
  DISK=\$(df / 2>/dev/null | awk 'NR==2{gsub("%",""); print \$5}' || echo 0)
  UPTIME=\$(awk '{print int(\$1)}' /proc/uptime 2>/dev/null || echo 0)
  OS=\$(. /etc/os-release 2>/dev/null && echo "\$PRETTY_NAME" || uname -sr)
  curl -sf -X POST "\$URL/api/agent/push" -H "Content-Type: application/json" --connect-timeout 8 --max-time 12 -d "{\\"token\\":\\"\$TOKEN\\",\\"cpuUsage\\":\$CPU,\\"ramUsage\\":\$RAM,\\"diskUsage\\":\$DISK,\\"uptime\\":\$UPTIME,\\"os\\":\\"\$OS\\",\\"status\\":\\"online\\"}" >/dev/null 2>&1
  echo "[\$(date '+%H:%M:%S')] CPU:\${CPU}% RAM:\${RAM}% Disk:\${DISK}%"
  sleep 30
done
AGENT

chmod +x "\$SCRIPT"
cat > /etc/systemd/system/aria-agent.service << EOF
[Unit]
Description=ARIA Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/bin/bash \$SCRIPT
Restart=always
RestartSec=15
StandardOutput=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now aria-agent
echo "✅ ARIA agent installed! Check: systemctl status aria-agent"`

  return (
    <div className="servers-root">
      <div className="servers-topbar">
        <div className="servers-topbar-left">
          <a href="/dashboard/servers" className="servers-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Servers
          </a>
          <div>
            <h1 className="servers-title">Monitoring Agent</h1>
            <p className="servers-sub">Real-time metrics — updates every 30 seconds automatically</p>
          </div>
        </div>
        <a href="/dashboard/aria" className="btn-3d" style={{textDecoration:'none',fontSize:13}}>🤖 Open ARIA</a>
      </div>

      <div className="servers-body">

        {/* Live metrics panel */}
        {servers.length > 0 && (
          <div className="card-3d rt-panel">
            <div className="rt-panel-header">
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span className="aria-realtime-dot" />
                <span style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>Live Server Metrics</span>
              </div>
              <span style={{fontSize:11,color:'var(--text-3)'}}>auto-updates every 5s via SSE</span>
            </div>
            <div className="rt-servers-grid">
              {servers.map(s => {
                const isLive = s.lastCheckAt && (Date.now() - new Date(s.lastCheckAt).getTime()) < 120000
                return (
                  <div key={s.id} className={`rt-server-card ${isLive ? 'live' : 'stale'}`}>
                    <div className="rt-server-top">
                      <div>
                        <div className="rt-server-name">{s.name}</div>
                        <div className="rt-server-host">{s.host}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div className={`rt-status-badge ${s.status}`}>{s.status}</div>
                        <div style={{fontSize:10,color: isLive ? 'var(--emerald)' : 'var(--text-3)',marginTop:3}}>
                          {isLive ? `● ${fmtAgo(s.lastCheckAt)}` : '○ no agent'}
                        </div>
                      </div>
                    </div>
                    <div className="rt-metrics-grid">
                      <Bar value={s.cpuUsage}  warn={70} crit={90} label="CPU"  />
                      <Bar value={s.ramUsage}  warn={75} crit={90} label="RAM"  />
                      <Bar value={s.diskUsage} warn={80} crit={95} label="Disk" />
                      <div className="rt-metric">
                        <div className="rt-metric-label">Uptime</div>
                        <div className="rt-metric-val" style={{color:'var(--text)'}}>{fmtUptime(s.uptime)}</div>
                      </div>
                    </div>
                    {s.os && <div style={{fontSize:11,color:'var(--text-3)',marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>{s.os}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Active tokens with last push time */}
        {tokens.length > 0 && (
          <div className="card-3d" style={{padding:24}}>
            <h2 className="agent-section-title">Active Agents</h2>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:16}}>
              {tokens.map(t => {
                const live = t.lastUsedAt && (Date.now() - new Date(t.lastUsedAt).getTime()) < 120000
                return (
                  <div key={t.token} className="agent-active-row">
                    <div className="agent-active-dot" style={{background: live ? 'var(--emerald)' : 'var(--text-3)'}} />
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700}}>{t.server.name}</div>
                      <div style={{fontSize:12,color:'var(--text-3)',fontFamily:'var(--font-mono,monospace)'}}>{t.server.host}</div>
                    </div>
                    <div style={{fontSize:12,color: live ? 'var(--emerald)' : 'var(--text-3)',fontWeight: live ? 600 : 400}}>
                      {live ? `● Live · ${fmtAgo(t.lastUsedAt)}` : t.lastUsedAt ? `Last: ${fmtAgo(t.lastUsedAt)}` : 'Never connected'}
                    </div>
                    <div style={{fontSize:11,fontFamily:'var(--font-mono,monospace)',color:'var(--text-3)',background:'var(--bg-2)',padding:'2px 8px',borderRadius:5}}>
                      {t.token.slice(0,8)}…
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Generate token */}
        <div className="card-3d" style={{padding:28}}>
          <h2 className="agent-section-title">Generate Agent Token</h2>
          <p style={{fontSize:13,color:'var(--text-2)',marginBottom:20}}>
            Each server gets its own secure token. The agent can only push metrics — it cannot read any data from your account.
          </p>
          {allServers.length === 0 ? (
            <div style={{textAlign:'center',padding:'24px 0'}}>
              <p style={{color:'var(--text-2)',marginBottom:12,fontSize:14}}>No servers found.</p>
              <a href="/dashboard/servers" className="btn-3d" style={{textDecoration:'none'}}>+ Add Server First</a>
            </div>
          ) : (
            <div className="agent-gen-row">
              <select className="input-3d" style={{flex:1,height:44}} value={selected} onChange={e => setSelected(e.target.value)}>
                <option value="">Select a server…</option>
                {allServers.map(s => <option key={s.id} value={s.id}>{s.name} — {s.host}</option>)}
              </select>
              <button className="btn-3d" onClick={generateToken} disabled={!selected || generating}>
                {generating ? 'Generating…' : '🔑 Generate Token'}
              </button>
            </div>
          )}

          {newToken && (
            <div className="agent-token-box">
              <div className="agent-token-header">
                <div>
                  <div className="agent-token-label">🔑 Token for <strong>{newSrvName}</strong></div>
                  <div style={{fontSize:12,color:'var(--text-3)',marginTop:3}}>Copy it now — shown once only</div>
                </div>
                <button className="agent-copy-btn" onClick={() => copy(newToken,'token')}>
                  {copied==='token' ? '✓ Copied!' : 'Copy token'}
                </button>
              </div>
              <div className="agent-token-value">{newToken}</div>

              <div style={{marginTop:24}}>
                <div className="agent-script-tab-label">📦 Install as systemd service (recommended)</div>
                <div className="agent-script-block" style={{marginTop:8}}>
                  <div className="agent-script-header">
                    <span className="agent-script-lang">bash — run as root on your server</span>
                    <button className="agent-copy-btn" onClick={() => copy(installScript(newToken),'install')}>
                      {copied==='install' ? '✓ Copied!' : 'Copy script'}
                    </button>
                  </div>
                  <pre className="agent-script-code">{installScript(newToken)}</pre>
                </div>
              </div>

              <div className="agent-install-steps" style={{marginTop:20}}>
                <div className="agent-install-title">How to run:</div>
                {[
                  'SSH into your server: ssh root@your-ip',
                  'Create a file: nano /tmp/install-aria.sh',
                  'Paste the script above, save (Ctrl+X → Y → Enter)',
                  'Run it: bash /tmp/install-aria.sh',
                  'Come back here — you\'ll see live metrics within 30 seconds',
                ].map((step, i) => (
                  <div key={i} className="agent-install-step">
                    <span className="agent-install-num">{i+1}</span>{step}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manual test */}
        {tokens.length > 0 && (
          <div className="card-3d" style={{padding:28}}>
            <h2 className="agent-section-title">⚡ Test without a real server</h2>
            <p style={{fontSize:13,color:'var(--text-2)',marginBottom:16}}>Open F12 → Console tab in your browser and paste this:</p>
            <div className="agent-script-block">
              <div className="agent-script-header">
                <span className="agent-script-lang">javascript — browser console</span>
                <button className="agent-copy-btn" onClick={() => copy(
                  `fetch('/api/agent/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${tokens[0].token}',cpuUsage:87,ramUsage:92,diskUsage:78,status:'online',os:'Ubuntu 22.04'})}).then(r=>r.json()).then(console.log)`,
                  'console'
                )}>{copied==='console' ? '✓ Copied!' : 'Copy'}</button>
              </div>
              <pre className="agent-script-code" style={{fontSize:11}}>{`fetch('/api/agent/push', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    token: '${tokens[0].token}',
    cpuUsage: 87,   // ← change these
    ramUsage: 92,
    diskUsage: 78,
    status: 'online',
    os: 'Ubuntu 22.04'
  })
}).then(r => r.json()).then(console.log)`}</pre>
            </div>
            <p style={{fontSize:12,color:'var(--text-3)',marginTop:10}}>
              After running, watch the Live Server Metrics above — it updates within 5 seconds.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
