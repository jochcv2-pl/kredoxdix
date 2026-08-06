import { NextRequest } from 'next/server';
import { prisma, createNotification } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { verifyBearerSecret } from '../../_lib/security';

// =============================================================================
// POST /api/cron/unassigned-grace — Alerte les super-admins des leads non assignés.
// =============================================================================
// DEC-K5 multi-admin : quand assignLeadToAdmin ne trouve aucun conseiller
// éligible (loanType/pays sans match OU tous saturés), le lead reste
// assignedToId = null. Le welcome email part quand même via le cron relance
// (SMTP système + variables conseiller génériques), mais le super-admin doit
// être alerté pour assigner manuellement.
//
// Ce cron (toutes les 5 min) :
//   1. Trouve les leads assignedToId = null AND createdAt < now() - 30min
//   2. Crée une notification au super-admin (dédupliquée par relatedEntityId)
//
// Protégé par Authorization: Bearer <CRON_SECRET>.
// Crontab VPS : */5 * * * * curl -sX POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3100/api/cron/unassigned-grace
// =============================================================================

const GRACE_MINUTES = 30;
const MAX_PER_RUN = 50;

export async function POST(req: NextRequest) {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return errorResponse('Non autorisé', ERR.UNAUTHORIZED.code, undefined, 401);
  }

  try {
    const now = new Date();
    const graceThreshold = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000);

    // Leads non assignés en grâce (> 30 min sans conseiller).
    const unassignedLeads = await prisma.lead.findMany({
      where: {
        assignedToId: null,
        createdAt: { lt: graceThreshold },
        sequenceActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        loanType: true,
        country: true,
        amount: true,
        createdAt: true,
      },
      take: MAX_PER_RUN,
      orderBy: { createdAt: 'asc' },
    });

    if (unassignedLeads.length === 0) {
      return successResponse({ checked: true, unassigned: 0, notified: 0 });
    }

    // Déduplication : charger les notifications déjà existantes pour ces leads.
    const leadIds = unassignedLeads.map((l) => l.id);
    const existingNotifs = await prisma.notification.findMany({
      where: {
        type: 'unassigned_grace',
        relatedEntityId: { in: leadIds },
      },
      select: { relatedEntityId: true },
    });
    const alreadyNotified = new Set(existingNotifs.map((n) => n.relatedEntityId));

    // Créer les notifications manquantes.
    let notified = 0;
    for (const lead of unassignedLeads) {
      if (alreadyNotified.has(lead.id)) continue;

      const elapsedMin = Math.floor((now.getTime() - lead.createdAt.getTime()) / 60_000);
      await createNotification({
        type: 'unassigned_grace',
        title: 'Lead non assigné — intervention requise',
        message: `${lead.firstName} ${lead.lastName} (${lead.loanType}/${lead.country}, ${lead.amount.toLocaleString('fr-FR')}€) attend depuis ${elapsedMin} min. Aucun conseiller ne correspond aux critères (loanType + pays) ou tous sont saturés.`,
        icon: 'alert-triangle',
        severity: 'warning',
        linkUrl: `/leads?id=${lead.id}`,
        relatedEntityId: lead.id,
      });
      notified++;
    }

    return successResponse({
      checked: true,
      unassigned: unassignedLeads.length,
      notified,
      deduplicated: unassignedLeads.length - notified,
    });
  } catch (err) {
    console.error('[CRON unassigned-grace] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
