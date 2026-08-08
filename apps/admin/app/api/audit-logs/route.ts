// =============================================================================
// GET /api/audit-logs — Liste paginée et filtrable du journal d'audit.
// =============================================================================
// Réservé au super-admin (requireAdmin). Le journal trace toutes les mutations
// d'entités métier et actions de sécurité.
//
// Query params :
//   - entity   : filtre par entité ("Lead", "Campaign", "AdminUser", ...)
//   - action   : filtre par action ("create", "update", "delete", ...)
//   - adminId  : filtre par auteur
//   - search   : recherche dans entityId (utile pour retrouver l'historique d'une entité)
//   - from     : date ISO (incluse) — filtre createdAt >= from
//   - to       : date ISO (incluse) — filtre createdAt <= to
//   - page     : page (1-based, default 1)
//   - pageSize : taille de page (default 50, max 200)
//
// Réponse : { data: AuditLog[], pagination: { page, pageSize, total, totalPages } }

import { NextRequest } from 'next/server'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR } from '../_lib/responses'
import { requireAdmin } from '../_lib/auth-server'

export async function GET(req: NextRequest) {
  const [, deny] = await requireAdmin()
  if (deny) return deny

  try {
    const url = new URL(req.url)
    const entity = url.searchParams.get('entity')
    const action = url.searchParams.get('action')
    const adminId = url.searchParams.get('adminId')
    const search = url.searchParams.get('search')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50))

    const where: Record<string, unknown> = {}
    if (entity) where.entity = entity
    if (action) where.action = action
    if (adminId) where.adminId = adminId
    if (search) where.entityId = { contains: search }
    if (from || to) {
      const createdAtFilter: Record<string, Date> = {}
      if (from) createdAtFilter.gte = new Date(from)
      if (to) {
        // Inclure tout le jour "to" (sinon 23:59:59 exclus).
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        createdAtFilter.lte = endDate
      }
      where.createdAt = createdAtFilter
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          admin: {
            select: { id: true, email: true, displayName: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    return successResponse({
      data: logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (err) {
    console.error(
      '[GET /api/audit-logs] Error:',
      err instanceof Error ? err.message : String(err),
    )
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
