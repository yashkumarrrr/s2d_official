// lib/rate-limit.ts
import { prisma } from '@/lib/prisma'

// Plan limits — messages per day
export const PLAN_LIMITS: Record<string, number> = {
  free:  20,
  pro:   9999,  // effectively unlimited
  team:  9999,
}

export interface RateLimitResult {
  allowed: boolean
  used: number
  limit: number
  remaining: number
  plan: string
  resetAt: string  // ISO string — midnight tonight
}

export async function checkRateLimit(userId: string, plan: string): Promise<RateLimitResult> {
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
  const today = new Date().toISOString().split('T')[0]  // "2025-01-15"

  // Upsert today's count
  const record = await prisma.rateLimit.upsert({
    where:  { userId_date: { userId, date: today } },
    create: { userId, date: today, count: 0 },
    update: {},
  })

  const used = record.count
  const remaining = Math.max(0, limit - used)
  const allowed = used < limit

  // Midnight tonight UTC
  const resetAt = new Date()
  resetAt.setUTCHours(24, 0, 0, 0)

  return { allowed, used, limit, remaining, plan, resetAt: resetAt.toISOString() }
}

export async function incrementRateLimit(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  await prisma.rateLimit.upsert({
    where:  { userId_date: { userId, date: today } },
    create: { userId, date: today, count: 1 },
    update: { count: { increment: 1 } },
  })
}

export function rateLimitResponse(result: RateLimitResult): Response {
  const resetIn = Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 3600000)
  return Response.json({
    error: `Daily limit reached. Free plan allows ${result.limit} messages/day. Resets in ~${resetIn}h.`,
    rateLimited: true,
    used: result.used,
    limit: result.limit,
    resetAt: result.resetAt,
    upgradeTo: 'pro',
  }, {
    status: 429,
    headers: {
      'X-RateLimit-Limit':     String(result.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset':     result.resetAt,
      'Retry-After':           String(Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000)),
    },
  })
}
