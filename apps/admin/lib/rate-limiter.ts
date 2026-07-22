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

// globalThis pour persistance dev (hot reload). En production (mono-process),
// le Map vit dans la mémoire du process Node.js.
const store: RateLimitStore = (globalThis as Record<string, unknown>).__rateLimitStore as RateLimitStore ?? {
  buckets: new Map<string, RateBucket>(),
};
(globalThis as Record<string, unknown>).__rateLimitStore = store;

// Nettoyage périodique des buckets expirés (évite la fuite mémoire).
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
  resetAt: number; // timestamp ms
}

/**
 * Vérifie si une requête est autorisée selon la limite de débit.
 *
 * @param identifier  Clé unique (ex: IP, email).
 * @param maxRequests Nombre max de requêtes dans la fenêtre.
 * @param windowMs    Durée de la fenêtre en millisecondes.
 * @returns { allowed, remaining, resetAt }
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  cleanupExpired();

  const now = Date.now();
  const key = identifier;
  const bucket = store.buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Nouvelle fenêtre.
    store.buckets.set(key, { count: 1, resetAt: now + windowMs });
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

/**
 * Extrait l'IP du client depuis les headers (middleware Edge + routes API).
 *
 * En production derrière un reverse proxy (Caddy/Nginx), TRUST_PROXY doit
 * être "true" (ou "1") pour lire x-forwarded-for / x-real-ip.
 * Si TRUST_PROXY est absent ou faux, on ignore ces headers (sécurité :
 * empêche le spoofing d'IP en accès direct sans proxy de confiance).
 */
export function getClientIp(headers: Headers): string {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  if (trustProxy) {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
      // x-forwarded-for peut contenir une liste : "client, proxy1, proxy2".
      return forwarded.split(',')[0].trim();
    }
    const realIp = headers.get('x-real-ip');
    if (realIp) return realIp.trim();
  }
  return 'unknown';
}
