import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../_lib/responses';
import { requireAuth } from '../_lib/auth-server';
import { getEmailLogScope } from '../_lib/scope';

// =============================================================================
// GET /api/email-logs
// =============================================================================
// Historique des emails envoyés (EmailLog), paginé.
// Paramètres de requête (tous optionnels, combinables) :
//   ?email=xxx   — filtre insensible à la casse (contains)
//   ?leadId=xxx  — filtrage exact sur le lead
//   ?trigger=xxx — filtrage exact sur le type de déclencheur
//   ?page=1      — page (1-based)
//   ?pageSize=20 — taille de page (max 200)
//
// Réponse : { logs, pagination: { page, pageSize, total, totalPages } }
// triés par sentAt DESC.
// EmailLog.leadId est une simple String (pas une relation Prisma),
// donc pas de `include` — les logs contiennent déjà email + trigger.
// =============================================================================

export async function GET(req: NextRequest) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const leadId = searchParams.get('leadId');
    const trigger = searchParams.get('trigger');
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize')) || 20));

    // Scope multi-admin (DEC-K5) : un conseiller ne voit que les logs de ses leads.
    const where: Record<string, unknown> = { ...getEmailLogScope(admin!) };
    if (email) where.email = { contains: email, mode: 'insensitive' };
    if (leadId) where.leadId = leadId;
    if (trigger) where.trigger = trigger;

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.emailLog.count({ where }),
    ]);

    return successResponse({
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (e) {
    console.error('[EMAIL LOGS] Erreur:', e instanceof Error ? e.message : String(e));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
