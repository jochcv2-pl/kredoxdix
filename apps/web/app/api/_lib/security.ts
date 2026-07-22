// =============================================================================
// security.ts — Helpers de sécurité pour les routes API web (apps/web).
// =============================================================================

import { createHash, timingSafeEqual } from 'crypto'

/**
 * Vérifie qu'un header Authorization: Bearer <token> correspond au secret attendu,
 * en comparaison à temps constant (timing-safe) pour empêcher les timing attacks.
 *
 * Hash SHA-256 des deux côtés → buffers de 32 bytes comparables avec timingSafeEqual.
 */
export function verifyBearerSecret(
  authHeader: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (!token) return false;

  const tokenHash = createHash('sha256').update(token).digest();
  const expectedHash = createHash('sha256').update(expectedSecret).digest();

  return timingSafeEqual(tokenHash, expectedHash);
}
