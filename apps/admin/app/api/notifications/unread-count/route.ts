// =============================================================================
// GET /api/notifications/unread-count — Compteur de notifications non lues.
// =============================================================================
// Utilisé par le badge de la cloche Topbar. Léger (COUNT seulement).
// =============================================================================

import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'

export async function GET() {
  const [, deny] = await requireAuth()
  if (deny) return deny

  try {
    const count = await prisma.notification.count({
      where: {
        readAt: null,
        OR: [{ recipientId: null }],
      },
    })

    return successResponse({ count })
  } catch (err) {
    console.error('[GET /api/notifications/unread-count] Error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
