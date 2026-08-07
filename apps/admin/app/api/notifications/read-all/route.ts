// =============================================================================
// POST /api/notifications/read-all — Marquer toutes les notifications comme lues.
// =============================================================================

import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'

export async function POST() {
  const [admin, deny] = await requireAuth()
  if (deny) return deny

  try {
    // KRX-014 : inclure les notifications ciblées au conseiller (recipientId=admin.id)
    // ET les broadcast (recipientId=null). Avant : seules les broadcast étaient marquées lues.
    const result = await prisma.notification.updateMany({
      where: {
        readAt: null,
        OR: [{ recipientId: null }, { recipientId: admin!.id }],
      },
      data: { readAt: new Date() },
    })

    return successResponse({ updated: result.count })
  } catch (err) {
    console.error('[POST /api/notifications/read-all] Error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
