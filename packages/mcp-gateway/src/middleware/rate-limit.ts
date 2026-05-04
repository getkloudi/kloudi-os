import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { Request, Response } from 'express';

// Tier limits: calls per calendar month
const TIER_MONTHLY_LIMITS: Record<string, number> = {
  free: 1_000,
  pro: 50_000,
  enterprise: Infinity,
};

let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  const url = process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];
  if (!url || !token) return null;
  if (!_ratelimit) {
    _ratelimit = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(100, '60 s'),
      prefix: 'mcp-gateway:ratelimit',
    });
  }
  return _ratelimit;
}

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: () => void
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const organizationId = (req as any).organizationId as string;
  if (!organizationId) {
    next();
    return;
  }

  // Layer 1: Redis burst control
  const rl = getRatelimit();
  if (rl) {
    const { success, limit, remaining, reset } = await rl.limit(organizationId);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', reset);
    if (!success) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((reset - Date.now()) / 1000),
      });
      return;
    }
  }

  // Layer 2: Monthly quota from billing state
  try {
    const { Database } = await import('@kloudi/infrastructure/database');
    const db = await Database.getInstance().getClient();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [usageCount, subscription] = await Promise.all([
      (db as any).usageEvent.count({
        where: {
          organizationId,
          product: 'mcp-gateway',
          createdAt: { gte: monthStart },
        },
      }),
      (db as any).billingSubscription.findFirst({
        where: { organizationId, status: 'active' },
        select: { tier: true },
      }),
    ]);

    const tier: string = subscription?.tier ?? 'free';
    const monthlyLimit =
      TIER_MONTHLY_LIMITS[tier] ?? TIER_MONTHLY_LIMITS['free'];

    if (usageCount >= monthlyLimit) {
      res.status(429).json({
        error: 'Monthly quota exceeded',
        tier,
        limit: monthlyLimit,
        used: usageCount,
        resetsAt: new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() + 1,
          1
        ).toISOString(),
      });
      return;
    }
  } catch {
    // Quota check failure is non-blocking — log and proceed
    console.warn(
      '[gateway] quota check failed, proceeding without enforcement'
    );
  }

  next();
}
