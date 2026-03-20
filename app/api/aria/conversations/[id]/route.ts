// app/api/aria/conversations/[id]/route.ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth()
    const convo = await prisma.ariaConversation.findFirst({
      where: { id: params.id, userId: user.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 } },
    })
    if (!convo) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(convo)
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth()
    const convo = await prisma.ariaConversation.findFirst({
      where: { id: params.id, userId: user.id },
    })
    if (!convo) return Response.json({ error: 'Not found' }, { status: 404 })
    await prisma.ariaConversation.delete({ where: { id: params.id } })
    return Response.json({ success: true })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
