// =============================================================================
// security.ts — Helpers de sécurité pour les routes API admin.
// =============================================================================

import { createHash, timingSafeEqual } from 'crypto'

/**
 * Masque une clé API/secrete pour l'affichage côté client.
 * Retourne seulement les 4 derniers caractères précédés de points.
 * Ex: "sk_live_1234567890wxyz" → "••••••••wxyz"
 *
 * null/undefined/chaîne vide → null (pas de clé configurée).
 * Moins de 8 caractères → entièrement masqué (ne pas révéler de clé courte).
 */
export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length < 8) return '••••';
  const last4 = key.slice(-4);
  const masked = '•'.repeat(Math.min(key.length - 4, 20));
  return `${masked}${last4}`;
}

/**
 * Vérifie qu'un header Authorization: Bearer <token> correspond au secret attendu,
 * en comparaison à temps constant (timing-safe) pour empêcher les timing attacks.
 *
 * Retourne true uniquement si :
 *   - le secret attendu est défini et non vide
 *   - le header est au format "Bearer <token>"
 *   - le token correspond exactement au secret (longueur ET contenu)
 *
 * On hash les deux valeurs en SHA-256 avant de comparer les buffers, ce qui
 * normalise la longueur (32 bytes) et rend timingSafeEqual toujours valide.
 */
export function verifyBearerSecret(
  authHeader: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) return false;

  // Extraction du token depuis "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7); // longueur de "Bearer "
  if (!token) return false;

  // Hash SHA-256 des deux côtés → buffers de 32 bytes, comparables avec timingSafeEqual
  const tokenHash = createHash('sha256').update(token).digest();
  const expectedHash = createHash('sha256').update(expectedSecret).digest();

  return timingSafeEqual(tokenHash, expectedHash);
}
