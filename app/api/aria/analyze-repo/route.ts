// app/api/aria/analyze-repo/route.ts
import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { requireAuth } from '@/lib/auth'
import { checkRateLimit, incrementRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { ARIA_SYSTEM, GROQ_MODEL, formatMemoryContext } from '@/lib/aria-constants'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY || '' })
}

const GH_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'Step2Dev-ARIA/1.0',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\.git$/, '').replace(/\/$/, '')
  const match = cleaned.match(/github\.com\/([^/\s]+)\/([^/\s]+)/)
  return match ? { owner: match[1], repo: match[2] } : null
}

async function fetchTree(owner: string, repo: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers: GH_HEADERS })
  if (!res.ok) return []
  const data = await res.json()
  return (data.tree || []).map((i: any) => i.path as string).filter((p: string) => !p.includes('node_modules') && !p.includes('.next'))
}

async function fetchFile(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { headers: GH_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.content || data.encoding !== 'base64') return null
    return Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 4000)
  } catch { return null }
}

const KEY_FILES = ['package.json', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'nginx.conf', 'requirements.txt', 'go.mod', 'Makefile', '.env.example', 'pom.xml', 'build.gradle', 'pyproject.toml', 'Cargo.toml']

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()

    // ── Rate limit ────────────────────────────────────────────
    const rl = await checkRateLimit(user.id, user.plan)
    if (!rl.allowed) return rateLimitResponse(rl)
    await incrementRateLimit(user.id)
    const { repoUrl, conversationId } = body

    if (!repoUrl || typeof repoUrl !== 'string') return Response.json({ error: 'repoUrl is required' }, { status: 400 })

    const parsed = parseGitHubUrl(repoUrl)
    if (!parsed) return Response.json({ error: 'Invalid GitHub URL. Expected: https://github.com/owner/repo' }, { status: 400 })

    const { owner, repo } = parsed

    let convo = conversationId
      ? await prisma.ariaConversation.findFirst({ where: { id: conversationId, userId: user.id } })
      : null

    if (!convo) {
      convo = await prisma.ariaConversation.create({
        data: { userId: user.id, title: `Repo: ${owner}/${repo}`, mode: 'repo' },
      })
    }

    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
    const pastConvos = await prisma.ariaConversation.findMany({
      where: { userId: user.id, updatedAt: { gte: fourWeeksAgo }, summary: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { updatedAt: true, summary: true, mode: true },
    })

    let systemPrompt = ARIA_SYSTEM
    const memoryCtx = formatMemoryContext(pastConvos)
    if (memoryCtx) systemPrompt += `\n\n${memoryCtx}`

    systemPrompt += `\n\nREPO ANALYSIS FORMAT — After full analysis, assign letter grades A-F for:
🔒 Security | ⚡ Performance | 🚀 CI/CD Quality | 📦 Dependencies | 🐳 Containerization | 📋 Best Practices
For each grade explain WHY and provide specific actionable commands to improve.`

    const encoder = new TextEncoder()
    let fullResponse = ''
    const savedConvoId = convo.id

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (obj: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

        try {
          enqueue({ type: 'id', conversationId: savedConvoId })
          enqueue({ type: 'status', message: 'Fetching repository tree...' })

          const tree = await fetchTree(owner, repo)
          if (tree.length === 0) {
            enqueue({ type: 'error', message: 'Could not access repository. Make sure it is public.' })
            controller.close()
            return
          }

          enqueue({ type: 'status', message: `Found ${tree.length} files. Reading key configs...` })

          const fileContents: Record<string, string> = {}
          for (const kf of KEY_FILES) {
            if (tree.includes(kf)) {
              const content = await fetchFile(owner, repo, kf)
              if (content) fileContents[kf] = content
            }
          }

          // Fetch up to 3 workflow files
          const workflows = tree.filter(p => p.startsWith('.github/workflows/') && (p.endsWith('.yml') || p.endsWith('.yaml'))).slice(0, 3)
          for (const wf of workflows) {
            const content = await fetchFile(owner, repo, wf)
            if (content) fileContents[wf] = content
          }

          enqueue({ type: 'status', message: 'Running AI analysis...' })

          const fileSection = Object.entries(fileContents).map(([f, c]) => `\n=== ${f} ===\n${c}`).join('\n')

          const userMessage = `Analyze this GitHub repository: ${repoUrl}

REPO: ${owner}/${repo}
TOTAL FILES: ${tree.length}

FILE STRUCTURE (first 80):
${tree.slice(0, 80).join('\n')}

KEY CONFIG FILES:
${fileSection || '(no standard config files found)'}

Provide:
1. One-paragraph executive summary
2. Letter grades A-F with explanation for: Security, Performance, CI/CD, Dependencies, Containerization, Best Practices
3. Top 5 critical issues with exact fix commands
4. 3 quick wins (fixable in < 30 min)
5. Strategic improvements for long-term`

          await prisma.ariaMessage.create({
            data: { conversationId: savedConvoId, role: 'user', content: userMessage, metadata: { repoUrl, owner, repo, fileCount: tree.length } },
          })
          await prisma.ariaConversation.update({ where: { id: savedConvoId }, data: { updatedAt: new Date() } })

          const completion = await getGroq().chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
            stream: true,
            max_tokens: 3000,
            temperature: 0.3,
          })

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content || ''
            if (delta) { fullResponse += delta; enqueue({ type: 'delta', text: delta }) }
          }

          await prisma.ariaMessage.create({
            data: { conversationId: savedConvoId, role: 'assistant', content: fullResponse, metadata: { repoUrl, owner, repo } },
          })

          enqueue({ type: 'done' })
          controller.close()
        } catch (err: any) {
          enqueue({ type: 'error', message: err.message || 'Analysis failed' })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
    })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
