// =============================================================================
// POST /api/profile/revoke-sessions — Révoque toutes les sessions JWT actives.
// =============================================================================
// KRX-007 : incrémente `sessionTokenVersion` en DB. Tous les JWT émis avant
// cet incrément (y compris celui qui fait l'appel) deviennent invalides
// au prochain appel à `getCurrentAdmin()`.
//
// Cas d'usage :
//   - Logout sécurisé (l'UI appelle revoke-sessions AVANT signOut côté client)
//   - En cas de soupçon de session compromise
//   - Rotation défensive des sessions
//
// Note : le JWT de l'appelant est aussi révoqué → il devra se reconnecter.

import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'

export async function POST() {
  const [admin, deny] = await requireAuth()
  if (deny) return deny

  try {
    await prisma.adminUser.update({
      where: { id: admin!.id },
      data: { sessionTokenVersion: { increment: 1 } },
    })

    return successResponse({ revoked: true })
  } catch (err) {
    console.error('[POST /api/profile/revoke-sessions] Error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
