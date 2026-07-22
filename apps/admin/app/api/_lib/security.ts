// =============================================================================
// security.ts — Helpers de sécurité pour les routes API admin.
// =============================================================================

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
