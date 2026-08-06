import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../_lib/responses';
import { requireAuth } from '../_lib/auth-server';
import { getEmailLogScope } from '../_lib/scope';

// =============================================================================
// GET /api/email-logs
// =============================================================================
// Historique des emails envoyés (EmailLog).
// Paramètres de requête (tous optionnels, combinables) :
//   ?email=xxx   — filtre insensible à la casse (contains)
//   ?leadId=xxx  — filtrage exact sur le lead
//   ?trigger=xxx — filtrage exact sur le type de déclencheur
//
// Retourne les 100 derniers logs triés par sentAt DESC.
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

    // Scope multi-admin (DEC-K5) : un conseiller ne voit que les logs de ses leads.
    const where: Record<string, unknown> = { ...getEmailLogScope(admin!) };
    if (email) where.email = { contains: email, mode: 'insensitive' };
    if (leadId) where.leadId = leadId;
    if (trigger) where.trigger = trigger;

    const logs = await prisma.emailLog.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      take: 100,
    });

    return successResponse(logs);
  } catch (e) {
    console.error('[EMAIL LOGS] Erreur:', e);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
