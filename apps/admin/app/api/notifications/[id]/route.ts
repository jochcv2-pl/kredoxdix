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
  const [, deny] = await requireAuth()
  if (deny) return deny

  try {
    const { id } = await ctx.params
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    })

    return successResponse(updated)
  } catch (err) {
    console.error('[PATCH /api/notifications/[id]] Error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
