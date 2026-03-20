// app/api/aria/analyze-error/route.ts
import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, incrementRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { ARIA_SYSTEM, GROQ_MODEL, detectErrorType, formatMemoryContext } from '@/lib/aria-constants'

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
    const { error, serverId, conversationId } = body

    if (!error || typeof error !== 'string' || error.trim().length === 0) {
      return Response.json({ error: 'Error text is required' }, { status: 400 })
    }

    const errorText = error.trim().slice(0, 12000)
    const errorType = detectErrorType(errorText)

    let convo = conversationId
      ? await prisma.ariaConversation.findFirst({ where: { id: conversationId, userId: user.id } })
      : null

    if (!convo) {
      convo = await prisma.ariaConversation.create({
        data: { userId: user.id, title: `${errorType} Error — ${new Date().toLocaleDateString()}`, mode: 'error' },
      })
    }

    // Past similar errors (memory)
    const pastErrors = await prisma.ariaMessage.findMany({
      where: {
        conversation: { userId: user.id, mode: 'error' },
        role: 'assistant',
        NOT: { conversationId: convo.id },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true, createdAt: true },
    })

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

    if (serverId) {
      const server = await prisma.server.findFirst({ where: { id: serverId, userId: user.id } })
      if (server) {
        systemPrompt += `\n\nSERVER CONTEXT:\nName: ${server.name} | Host: ${server.host} | OS: ${server.os || 'unknown'} | Status: ${server.status}`
      }
    }

    if (pastErrors.length > 0) {
      systemPrompt += `\n\nPAST ERROR FIXES FOR THIS USER:\n${pastErrors.map(e => `[${new Date(e.createdAt).toLocaleDateString()}] ${e.content.slice(0, 400)}`).join('\n---\n')}`
    }

    const userMessage = `Analyze this ${errorType} error and give me the exact fix:\n\n\`\`\`\n${errorText}\n\`\`\``

    await prisma.ariaMessage.create({
      data: { conversationId: convo.id, role: 'user', content: userMessage, metadata: { errorType } },
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
          enqueue({ type: 'id', conversationId: savedConvoId, errorType })
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
            data: { conversationId: savedConvoId, role: 'assistant', content: fullResponse, metadata: { errorType } },
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
