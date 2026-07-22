type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** 租户级滑动窗口限流；超限返回 false */
export function checkAiRateLimit(
  tenantId: number,
  limit = 120,
  windowMs = 60_000,
): boolean {
  const key = String(tenantId || 0)
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(key, b)
  }
  if (b.count >= limit) return false
  b.count += 1
  return true
}
