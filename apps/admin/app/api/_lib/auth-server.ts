// =============================================================================
// auth-server.ts — Helpers d'autorisation pour routes API admin.
// =============================================================================
// Centralise les checks d'authentification et d'autorisation (RBAC).
// Avant : les routes ne vérifiaient que `!!auth?.user` via le middleware.
// Maintenant : chaque route appelle requireAuth() ou requireAdmin() en tête.
//
// Usage :
//   export async function GET() {
//     const [admin, deny] = await requireAdmin()
//     if (deny) return deny
//     // admin est garantit non-null et de rôle 'admin'
//   }
//
// Levels :
//   - requireAuth()   → n'importe quel compte authentifié actif
//   - requireAdmin()  → compte authentifié actif + rôle 'admin'
//
// Pattern Edge-safe : ce fichier importe @kredix/db (Prisma) et auth.ts —
// donc il ne peut PAS être consommé par middleware.ts (Edge Runtime).

import { getCurrentAdmin } from '@/auth'
import { errorResponse, ERR } from './responses'
import type { AdminUser } from '@prisma/client'

export type AuthResult =
  | [AdminUser, null]
  | [null, Response]

/**
 * Vérifie que la requête provient d'un compte admin authentifié et actif.
 * Retourne [admin, null] si OK, [null, 401 response] sinon.
 *
 * Inclut le check `isActive` : un admin désactivé mais avec un JWT valide
 * (24h max) se voit refuser l'accès aux routes API.
 */
export async function requireAuth(): Promise<AuthResult> {
  const admin = await getCurrentAdmin()
  if (!admin || !admin.isActive) {
    return [null, errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)]
  }
  return [admin, null]
}

/**
 * Vérifie que la requête provient d'un compte admin authentifié, actif,
 * ET de rôle 'admin'. Retourne [admin, null] si OK, [null, 401/403] sinon.
 *
 * Rôle 'admin' = accès complet (gestion users, gateways, settings, etc.).
 * Tout autre rôle futur (advisor, viewer...) sera bridé ici.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const [admin, deny] = await requireAuth()
  if (deny) return [null, deny]
  if (admin!.role !== 'admin') {
    return [null, errorResponse('Permissions insuffisantes', 'FORBIDDEN', undefined, 403)]
  }
  return [admin, null]
}
