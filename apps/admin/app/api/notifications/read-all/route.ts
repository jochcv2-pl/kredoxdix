// =============================================================================
// POST /api/notifications/read-all — Marquer toutes les notifications comme lues.
// =============================================================================

import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'

export async function POST() {
  const [, deny] = await requireAuth()
  if (deny) return deny

  try {
    const result = await prisma.notification.updateMany({
      where: {
        readAt: null,
        OR: [{ recipientId: null }],
      },
      data: { readAt: new Date() },
    })

    return successResponse({ updated: result.count })
  } catch (err) {
    console.error('[POST /api/notifications/read-all] Error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
