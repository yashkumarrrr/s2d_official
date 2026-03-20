// app/api/aria/chat/route.ts
import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ARIA_SYSTEM, GROQ_MODEL, formatMemoryContext } from '@/lib/aria-constants'
import { checkRateLimit, incrementRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { sanitizeForAI, sanitizeString, checkIPRateLimit, getIP, safeError, LIMITS } from '@/lib/security'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { conversationId, mode = 'chat', serverId, context } = body
    // Sanitize and check for prompt injection
    const message = sanitizeForAI(body.message || '')

    if (!message || typeof message !== 'string' || message.trim().length === 0)
      return Response.json({ error: 'Message is required' }, { status: 400 })
    if (message.trim().length > 16000)
      return Response.json({ error: 'Message too long (max 16000 chars)' }, { status: 400 })

    // ── IP rate limit — max 60 requests per IP per minute ────
    const ip = getIP(req)
    if (!checkIPRateLimit(ip, 'aria-chat', 60, 60000)) {
      return Response.json({ error: 'Too many requests. Slow down.' }, { status: 429 })
    }

    // ── Rate limit check ──────────────────────────────────────
    const rl = await checkRateLimit(user.id, user.plan)
    if (!rl.allowed) return rateLimitResponse(rl)

    // Load or create conversation
    let convo = conversationId
      ? await prisma.ariaConversation.findFirst({ where: { id: conversationId, userId: user.id } })
      : null
    if (!convo) {
      const title = message.trim().slice(0, 80).replace(/\n/g, ' ') || 'New Conversation'
      convo = await prisma.ariaConversation.create({
        data: { userId: user.id, title, mode },
      })
    }

    // Short-term memory
    const recentMessages = await prisma.ariaMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    recentMessages.reverse()

    // Long-term memory
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
    const pastConvos = await prisma.ariaConversation.findMany({
      where: { userId: user.id, updatedAt: { gte: fourWeeksAgo }, id: { not: convo.id }, summary: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { updatedAt: true, summary: true, mode: true },
    })

    let systemPrompt = ARIA_SYSTEM
    const memoryCtx = formatMemoryContext(pastConvos)
    if (memoryCtx) systemPrompt += `\n\n${memoryCtx}`

    if (serverId) {
      const server = await prisma.server.findFirst({ where: { id: serverId, userId: user.id } })
      if (server) {
        systemPrompt += `\n\nCURRENT SERVER:\n${server.name} | ${server.host} | ${server.status}${server.os ? ` | ${server.os}` : ''}${server.cpuUsage != null ? ` | CPU ${server.cpuUsage}%` : ''}${server.ramUsage != null ? ` | RAM ${server.ramUsage}%` : ''}${server.diskUsage != null ? ` | Disk ${server.diskUsage}%` : ''}`
      }
    }
    if (context) systemPrompt += `\n\nADDITIONAL CONTEXT:\n${String(context).slice(0, 2000)}`

    const history = recentMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    await prisma.ariaMessage.create({
      data: { conversationId: convo.id, role: 'user', content: message.trim() },
    })
    await prisma.ariaConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } })

    // ── Increment usage BEFORE streaming ─────────────────────
    await incrementRateLimit(user.id)

    const encoder = new TextEncoder()
    let fullResponse = ''
    const savedConvoId = convo.id
    const remaining = rl.remaining - 1

    const stream = new ReadableStream({
      async start(controller) {
        const enq = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        try {
          enq({ type: 'id', conversationId: savedConvoId })
          // Send usage info so client can show warning
          enq({ type: 'usage', used: rl.used + 1, limit: rl.limit, remaining, plan: rl.plan })

          const completion = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message.trim() }],
            stream: true,
            max_tokens: 2048,
            temperature: 0.4,
          })

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content || ''
            if (delta) { fullResponse += delta; enq({ type: 'delta', text: delta }) }
          }

          await prisma.ariaMessage.create({
            data: { conversationId: savedConvoId, role: 'assistant', content: fullResponse },
          })

          // Auto-summarize every 10 messages
          const msgCount = await prisma.ariaMessage.count({ where: { conversationId: savedConvoId } })
          if (msgCount > 0 && msgCount % 10 === 0) {
            try {
              const ctx = [...recentMessages.slice(-8), { role: 'user', content: message }, { role: 'assistant', content: fullResponse }]
              const sum = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: 'user', content: `Summarize in 2 sentences the key technical issues discussed and fixes applied. Be specific.\n\n${ctx.map(m => `${m.role}: ${m.content.slice(0, 250)}`).join('\n')}` }],
                max_tokens: 120, temperature: 0.2,
              })
              const summary = sum.choices[0]?.message?.content?.trim()
              if (summary) await prisma.ariaConversation.update({ where: { id: savedConvoId }, data: { summary } })
            } catch {}
          }

          enq({ type: 'done' })
          controller.close()
        } catch (err: any) {
          enq({ type: 'error', message: err.message || 'Stream failed' })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Limit': String(rl.limit),
      },
    })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: safeError(err) }, { status: 500 })
  }
}
