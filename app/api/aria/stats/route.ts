// app/api/aria/stats/route.ts
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PLAN_LIMITS } from '@/lib/rate-limit'

export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const today = new Date().toISOString().split('T')[0]

    // Total messages sent
    const totalMessages = await prisma.ariaMessage.count({
      where: { conversation: { userId: user.id }, role: 'user' },
    })

    // Messages per mode
    const modeBreakdown = await prisma.ariaConversation.groupBy({
      by: ['mode'],
      where: { userId: user.id },
      _count: { id: true },
    })

    // Conversations in last 30 days
    const recentConvos = await prisma.ariaConversation.count({
      where: { userId: user.id, createdAt: { gte: thirtyDaysAgo } },
    })

    // Total conversations
    const totalConvos = await prisma.ariaConversation.count({
      where: { userId: user.id },
    })

    // Today's usage
    const todayUsage = await prisma.rateLimit.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    })

    // Last 7 days usage per day
    const last7 = await prisma.rateLimit.findMany({
      where: {
        userId: user.id,
        date: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
      },
      orderBy: { date: 'asc' },
    })

    // Error types from metadata
    const errorMessages = await prisma.ariaMessage.findMany({
      where: {
        conversation: { userId: user.id, mode: 'error' },
        role: 'user',
        metadata: { not: undefined },
      },
      select: { metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const errorTypeCounts: Record<string, number> = {}
    for (const msg of errorMessages) {
      const meta = msg.metadata as any
      if (meta?.errorType) {
        errorTypeCounts[meta.errorType] = (errorTypeCounts[meta.errorType] || 0) + 1
      }
    }

    // Recent conversations with summaries
    const recentWithSummaries = await prisma.ariaConversation.findMany({
      where: { userId: user.id, summary: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, mode: true, summary: true, updatedAt: true },
    })

    // Repos analyzed
    const reposAnalyzed = await prisma.ariaConversation.count({
      where: { userId: user.id, mode: 'repo' },
    })

    // Servers analyzed
    const serversAnalyzed = await prisma.ariaConversation.count({
      where: { userId: user.id, mode: 'server' },
    })

    const dailyLimit = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free

    return Response.json({
      user: { name: user.name, plan: user.plan },
      overview: {
        totalMessages,
        totalConvos,
        recentConvos,
        reposAnalyzed,
        serversAnalyzed,
        errorsAnalyzed: modeBreakdown.find(m => m.mode === 'error')?._count?.id ?? 0,
      },
      today: {
        used: todayUsage?.count ?? 0,
        limit: dailyLimit,
        remaining: Math.max(0, dailyLimit - (todayUsage?.count ?? 0)),
      },
      modeBreakdown: modeBreakdown.map(m => ({
        mode: m.mode,
        count: m._count.id,
      })),
      last7Days: last7.map(r => ({ date: r.date, count: r.count })),
      errorTypes: Object.entries(errorTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count })),
      recentSummaries: recentWithSummaries,
    })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
