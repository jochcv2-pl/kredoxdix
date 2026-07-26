// =============================================================================
// rate-limiter.ts — Rate limiting in-memory (compatible Edge Runtime).
// =============================================================================
// Algorithme : fixed window. Simple, prévisible, adapté au setup mono-VPS.
// Pour un déploiement multi-instances, remplacer par un store Redis.
//
// Le Map est stocké sur globalThis pour survivre aux hot reloads en dev.

interface RateBucket {
  count: number;
  resetAt: number; // timestamp ms
}

interface RateLimitStore {
  buckets: Map<string, RateBucket>;
}

const store: RateLimitStore =
  (globalThis as Record<string, unknown>).__webRateLimitStore as RateLimitStore ?? {
    buckets: new Map<string, RateBucket>(),
  };
(globalThis as Record<string, unknown>).__webRateLimitStore = store;

function cleanupExpired() {
  const now = Date.now();
  for (const [key, bucket] of store.buckets) {
    if (bucket.resetAt <= now) {
      store.buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  cleanupExpired();

  const now = Date.now();
  const bucket = store.buckets.get(identifier);

  if (!bucket || bucket.resetAt <= now) {
    store.buckets.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  bucket.count++;
  const allowed = bucket.count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function getClientIp(headers: Headers): string {
  // Ne faire confiance aux headers proxy QUE si TRUST_PROXY=true.
  // Sans cette vérification, un attaquant peut spoofé X-Forwarded-For
  // pour contourner le rate limiting.
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = headers.get('x-real-ip');
    if (realIp) return realIp.trim();
  }
  return 'unknown';
}
