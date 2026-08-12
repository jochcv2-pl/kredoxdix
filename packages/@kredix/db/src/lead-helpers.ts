// =============================================================================
// lead-helpers.ts — Helpers partagés pour les leads
// =============================================================================

import { createHash } from 'crypto'

/**
 * Génère la référence publique d'un lead à partir de son id Prisma.
 * Format : KREDIX-XXXXXXXX (8 derniers chars du id, majuscules).
 *
 * Utilisée pour :
 *   - Page publique /suivi (le client tape ou clique sur ce code)
 *   - Variable email {{reference_demande}}
 *   - Affichage dans le CRM (contacts, clients, dossiers)
 *
 * RÉTRO-COMPAT (s44) : avant cette session, le calcul était inline dans
 * template.ts:118. Désormais lead.reference (DB, @unique) est la source de
 * vérité. Ce helper reste utilisé pour :
 *   - Initialiser reference à la création d'un lead (POST /api/leads)
 *   - Fallback pour les leads pré-migration (reference NULL en DB)
 *
 * Identique au calcul SQL de la migration 20260812120000_add_tracking_system :
 *   'KREDIX-' || UPPER(RIGHT(id, 8))
 */
export function generateLeadReference(id: string): string {
  return `KREDIX-${id.slice(-8).toUpperCase()}`
}

/**
 * SQL brut pour populater les leads sans référence (reference IS NULL).
 * Idempotent et safe : ne touche que les lignes NULL, calcule depuis l'id.
 *
 * À utiliser après un import CSV (createMany ne permet pas de calculer
 * dynamiquement reference à la volée).
 */
export const POPULATE_LEAD_REFERENCES_SQL = `
  UPDATE "Lead"
  SET "reference" = 'KREDIX-' || UPPER(RIGHT("id", 8))
  WHERE "reference" IS NULL
`

// =============================================================================
// Token magique stateless pour la page /suivi (anti-énumération)
// =============================================================================
// Permet au client d'accéder directement à son suivi via un lien dans l'email
// sans avoir à taper son code. Le token est STATELESS : pas de stockage DB.
// Recalculé à chaque validation côté /api/track.
//
// Format : 16 premiers chars du sha256(lead.id + SECRET).
// Constant-time comparison côté validation (sécurisé contre timing attacks).

const TRACKING_SECRET = process.env.AUTH_SECRET || process.env.TRACKING_TOKEN_SECRET || 'dev-tracking-secret'

/**
 * Génère le token stateless d'un lead pour la page /suivi.
 * Stateful-côté-DB NON requis — juste à valider en recalculant côté endpoint.
 */
export function generateTrackingToken(leadId: string): string {
  return createHash('sha256').update(`${leadId}:${TRACKING_SECRET}`).digest('hex').slice(0, 16)
}

/**
 * Valide un token pour un lead donné. Comparaison constant-time (anti-timing-attack).
 * Retourne true si le token correspond à generateTrackingToken(leadId).
 */
export function isValidTrackingToken(leadId: string, token: string): boolean {
  const expected = generateTrackingToken(leadId)
  if (expected.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i)
  }
  return diff === 0
}
