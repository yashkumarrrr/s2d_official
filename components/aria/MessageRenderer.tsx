'use client'
// components/aria/MessageRenderer.tsx
import { useState, useCallback } from 'react'

// Phrases that indicate ARIA is referencing past memory
const MEMORY_TRIGGERS = [
  'last week', 'last month', 'yesterday', 'previously', 'you mentioned',
  'you had a similar', 'same issue', 'recall that', 'as we discussed',
  'from before', 'past issue', 'earlier you', 'you fixed', 'you ran into',
  'same root cause', 'like before', 'you encountered', 'that time you',
  'a few days ago', 'last time', 'we fixed', 'you dealt with',
]

function hasMemoryRef(text: string): boolean {
  const lower = text.toLowerCase()
  return MEMORY_TRIGGERS.some(t => lower.includes(t))
}

function MemoryBadge() {
  return (
    <span className="aria-memory-ref-badge" title="ARIA is referencing your conversation history">
      <span className="aria-memory-ref-dot" />
      Memory
    </span>
  )
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code])
  return (
    <div className="aria-code-block">
      <div className="aria-code-header">
        <span className="aria-code-lang">{language || 'code'}</span>
        <button className="aria-copy-btn" onClick={copy}>{copied ? '✓ Copied!' : 'Copy'}</button>
      </div>
      <pre className="aria-code-pre"><code>{code}</code></pre>
    </div>
  )
}

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`\n]+)`)/g
  let last = 0, match: RegExpExecArray | null, i = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    if (match[2]) nodes.push(<strong key={`${keyPrefix}-b${i++}`}>{match[2]}</strong>)
    else if (match[3]) nodes.push(<em key={`${keyPrefix}-i${i++}`}>{match[3]}</em>)
    else if (match[4]) nodes.push(<code key={`${keyPrefix}-c${i++}`} className="aria-inline-code">{match[4]}</code>)
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function MessageRenderer({ content }: { content: string }) {
  const nodes: React.ReactNode[] = []
  const lines = content.split('\n')
  let i = 0, key = 0
  const showMemoryBadge = hasMemoryRef(content)

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      nodes.push(<CodeBlock key={key++} code={codeLines.join('\n')} language={lang} />)
      i++; continue
    }

    // Heading
    const hm = line.match(/^(#{1,4})\s+(.+)/)
    if (hm) {
      const lvl = hm[1].length
      const Tag = `h${lvl}` as 'h1'|'h2'|'h3'|'h4'
      nodes.push(<Tag key={key++} className={`aria-h${lvl}`}>{parseInline(hm[2], `h${key}`)}</Tag>)
      i++; continue
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="aria-hr" />)
      i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const qlines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) { qlines.push(lines[i].slice(2)); i++ }
      // Check if the blockquote contains a memory reference
      const qText = qlines.join(' ')
      nodes.push(
        <blockquote key={key++} className={`aria-blockquote${hasMemoryRef(qText) ? ' aria-memory-highlight' : ''}`}>
          {qlines.map((q, qi) => <p key={qi}>{parseInline(q, `bq${key}-${qi}`)}</p>)}
        </blockquote>
      )
      continue
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*+]\s/, '')); i++ }
      nodes.push(
        <ul key={key++} className="aria-ul">
          {items.map((it, ii) => <li key={ii}>{parseInline(it, `ul${key}-${ii}`)}</li>)}
        </ul>
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++ }
      nodes.push(
        <ol key={key++} className="aria-ol">
          {items.map((it, ii) => <li key={ii}>{parseInline(it, `ol${key}-${ii}`)}</li>)}
        </ol>
      )
      continue
    }

    // Table
    if (line.includes('|') && lines[i+1]?.match(/^[\s|:-]+$/)) {
      const rows: string[] = []
      while (i < lines.length && lines[i].includes('|')) { rows.push(lines[i]); i++ }
      const parse = (r: string) => r.split('|').map(c => c.trim()).filter(Boolean)
      const [hdr, , ...body] = rows
      nodes.push(
        <div key={key++} className="aria-table-wrapper">
          <table className="aria-table">
            <thead><tr>{parse(hdr).map((h, hi) => <th key={hi}>{parseInline(h, `th${key}-${hi}`)}</th>)}</tr></thead>
            <tbody>{body.map((row, ri) => <tr key={ri} className={ri%2===0?'aria-tr-even':'aria-tr-odd'}>{parse(row).map((c, ci) => <td key={ci}>{parseInline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }

    // Empty line
    if (line.trim() === '') { i++; continue }

    // Paragraph — highlight if contains memory reference
    const isMemory = hasMemoryRef(line)
    nodes.push(
      <p key={key++} className={`aria-p${isMemory ? ' aria-memory-line' : ''}`}>
        {parseInline(line, `p${key}`)}
      </p>
    )
    i++
  }

  return (
    <div className="aria-message-body">
      {showMemoryBadge && <MemoryBadge />}
      {nodes}
    </div>
  )
}
