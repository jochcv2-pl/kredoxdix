// =============================================================================
// GET /api/notifications — Liste des notifications (20 dernières).
// =============================================================================
// Query params :
//   ?unread=true  → filtre uniquement les non lues
//
// Tri : createdAt DESC (plus récent en premier).
// Limite : 50 (suffisant pour le dropdown + page notifications).
// =============================================================================

import { NextRequest } from 'next/server'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../_lib/responses'
import { requireAuth } from '../_lib/auth-server'

export async function GET(req: NextRequest) {
  const [, deny] = await requireAuth()
  if (deny) return deny

  try {
    const url = new URL(req.url)
    const unreadOnly = url.searchParams.get('unread') === 'true'
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 100)

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { recipientId: null },
          // recipientId spécifique si on implémente plus tard le ciblage
        ],
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return successResponse(notifications)
  } catch (err) {
    console.error('[GET /api/notifications] Error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
