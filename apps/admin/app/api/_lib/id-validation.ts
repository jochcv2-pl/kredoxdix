// id-validation.ts — Validation de format des IDs dynamiques d'URL.
// Les IDs Kredix sont des cuid() (24 caractères alphanumériques base36,
// préfixe 'c' optionnel). On accepte aussi les UUID v4 pour compat future.

const CUID_RE = /^c?[a-z0-9]{20,32}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Retourne true si `id` ressemble à un identifiant valide (cuid ou uuid).
 * Utilisé pour short-circuiter les findUnique Prisma sur des IDs évidemment
 * invalides (payloads d'attaque, chemins HTML fallback, etc.).
 */
export function isValidId(id: string | undefined | null): id is string {
  if (!id || typeof id !== 'string') return false
  if (id.length < 8 || id.length > 64) return false
  return CUID_RE.test(id) || UUID_RE.test(id)
}
