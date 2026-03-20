// app/api/aria/conversations/route.ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const conversations = await prisma.ariaConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    })
    return Response.json(
      conversations.map(c => ({
        id: c.id,
        title: c.title,
        mode: c.mode,
        summary: c.summary,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        messageCount: c._count.messages,
      }))
    )
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
