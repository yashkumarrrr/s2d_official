// app/api/aria/analyze-server/route.ts
import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { requireAuth } from '@/lib/auth'
import { checkRateLimit, incrementRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { ARIA_SYSTEM, GROQ_MODEL, formatMemoryContext } from '@/lib/aria-constants'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY || '' })
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()

    // ── Rate limit ────────────────────────────────────────────
    const rl = await checkRateLimit(user.id, user.plan)
    if (!rl.allowed) return rateLimitResponse(rl)
    await incrementRateLimit(user.id)
    const { serverId, question, conversationId } = body

    if (!serverId) return Response.json({ error: 'serverId is required' }, { status: 400 })

    const server = await prisma.server.findFirst({ where: { id: serverId, userId: user.id } })
    if (!server) return Response.json({ error: 'Server not found' }, { status: 404 })

    let convo = conversationId
      ? await prisma.ariaConversation.findFirst({ where: { id: conversationId, userId: user.id } })
      : null

    if (!convo) {
      convo = await prisma.ariaConversation.create({
        data: { userId: user.id, title: `Server: ${server.name}`, mode: 'server' },
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

    const uptimeStr = server.uptime
      ? (() => {
          const secs = Number(server.uptime)
          const d = Math.floor(secs / 86400)
          const h = Math.floor((secs % 86400) / 3600)
          return `${d}d ${h}h`
        })()
      : 'unknown'

    systemPrompt += `\n\nSERVER METRICS (LIVE):\nName: ${server.name}\nHost: ${server.host}:${server.port}\nOS: ${server.os || 'unknown'}\nStatus: ${server.status}\nCPU Usage: ${server.cpuUsage != null ? server.cpuUsage + '%' : 'unknown'}\nRAM Usage: ${server.ramUsage != null ? server.ramUsage + '%' : 'unknown'}\nDisk Usage: ${server.diskUsage != null ? server.diskUsage + '%' : 'unknown'}\nUptime: ${uptimeStr}\nLast Checked: ${server.lastCheckAt ? new Date(server.lastCheckAt).toLocaleString() : 'never'}`

    const userMessage = question?.trim()
      ? `Server "${server.name}" (${server.host}): ${question.trim()}`
      : `Perform a complete health diagnosis of server "${server.name}" (${server.host}). Analyze all metrics, identify issues in priority order, and give specific commands to fix each one. Then list optimization opportunities.`

    await prisma.ariaMessage.create({
      data: { conversationId: convo.id, role: 'user', content: userMessage, metadata: { serverId, serverName: server.name } },
    })
    await prisma.ariaConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } })

    const encoder = new TextEncoder()
    let fullResponse = ''
    const savedConvoId = convo.id

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (obj: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        try {
          enqueue({ type: 'id', conversationId: savedConvoId })
          const completion = await getGroq().chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
            stream: true,
            max_tokens: 2048,
            temperature: 0.3,
          })
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content || ''
            if (delta) { fullResponse += delta; enqueue({ type: 'delta', text: delta }) }
          }
          await prisma.ariaMessage.create({
            data: { conversationId: savedConvoId, role: 'assistant', content: fullResponse, metadata: { serverId } },
          })
          enqueue({ type: 'done' })
          controller.close()
        } catch (err: any) {
          enqueue({ type: 'error', message: err.message })
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
