// =============================================================================
// PATCH /api/notifications/[id] — Marquer une notification comme lue.
// =============================================================================

import { NextRequest } from 'next/server'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../../_lib/responses'
import { requireAuth } from '../../_lib/auth-server'
import { isValidId } from '@/app/api/_lib/id-validation'

export async function PATCH(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAuth()
  if (deny) return deny

  try {
    const { id } = await ctx.params
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    // KRX-013 : scope par recipientId — un conseiller ne peut marquer comme lues
    // QUE ses notifications (ciblées via recipientId=admin.id) ou les broadcast (recipientId=null).
    // updateMany atomique + check du count pour distinguer 404 (inexistante ou hors-scope).
    const result = await prisma.notification.updateMany({
      where: {
        id,
        OR: [{ recipientId: null }, { recipientId: admin!.id }],
      },
      data: { readAt: new Date() },
    })

    if (result.count === 0) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    return successResponse({ updated: result.count })
  } catch (err) {
    console.error('[PATCH /api/notifications/[id]] Error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
