// =============================================================================
// GET /api/admin/pipeline/state — Snapshot du pipeline de relance email.
// =============================================================================
// Retourne :
//   - paused (pipeline.paused en DB)
//   - provider actif (nom du gateway)
//   - dailyCap + sentToday (compteur du jour)
//   - queue : nombre de leads éligibles par étape (accueil déjà envoyé,
//     relance_1/2/3 dues)
//   - recentLogs : 30 derniers EmailLog (tous statuts)
// =============================================================================

import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../../_lib/responses';
import { requireAdmin } from '../../../_lib/auth-server';
import { getSetting, getSettingNumber, getActiveGateway } from '../../../_lib/settings';

const DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const [, deny] = await requireAdmin();
  if (deny) return deny;

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // --- État du pipeline ---
    const pausedVal = await getSetting('pipeline.paused', 'false');
    const paused = pausedVal === 'true';
    const dailyCap = await getSettingNumber('cadence_daily_cap', 200);
    const timeoutDays = await getSettingNumber('cadence_timeout_days', 10);

    // --- Gateway actif ---
    const gateway = await getActiveGateway();
    const providerName = gateway?.label || null;

    // --- Compteur envois du jour ---
    const sentToday = await prisma.emailLog.count({
      where: {
        status: 'sent',
        sentAt: { gte: startOfDay },
      },
    });

    // --- File d'attente par étape ---
    // relance_1 : sequenceActive + relanceCount=0 + nextRelanceAt <= now
    // relance_2 : sequenceActive + relanceCount=1 + nextRelanceAt <= now
    // relance_3 : sequenceActive + relanceCount=2 + nextRelanceAt <= now
    const [queueRelance1, queueRelance2, queueRelance3, totalActive] = await Promise.all([
      prisma.lead.count({
        where: { sequenceActive: true, relanceCount: 0, nextRelanceAt: { lte: now }, exitReason: null },
      }),
      prisma.lead.count({
        where: { sequenceActive: true, relanceCount: 1, nextRelanceAt: { lte: now }, exitReason: null },
      }),
      prisma.lead.count({
        where: { sequenceActive: true, relanceCount: 2, nextRelanceAt: { lte: now }, exitReason: null },
      }),
      prisma.lead.count({
        where: { sequenceActive: true, exitReason: null },
      }),
    ]);

    // --- Prochains leads à relancer (5 plus anciens dus) ---
    const upcomingLeads = await prisma.lead.findMany({
      where: { sequenceActive: true, nextRelanceAt: { lte: now }, exitReason: null },
      orderBy: { nextRelanceAt: 'asc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        relanceCount: true,
        nextRelanceAt: true,
        createdAt: true,
      },
    });

    // --- Leads en file (pas encore dus mais programmés) ---
    const scheduledCount = await prisma.lead.count({
      where: {
        sequenceActive: true,
        nextRelanceAt: { gt: now },
        exitReason: null,
      },
    });

    // --- Leads en timeout imminent (proche de la limite) ---
    const timeoutThreshold = new Date(now.getTime() - timeoutDays * DAY);
    const nearTimeoutCount = await prisma.lead.count({
      where: {
        sequenceActive: true,
        sequenceStartedAt: { lt: new Date(timeoutThreshold.getTime() + 2 * DAY) },
        exitReason: null,
      },
    });

    // --- 30 derniers EmailLog ---
    const recentLogs = await prisma.emailLog.findMany({
      take: 30,
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        email: true,
        trigger: true,
        templateName: true,
        subject: true,
        status: true,
        error: true,
        sentAt: true,
        leadId: true,
      },
    });

    // --- Stats agrégées ---
    const totalSent = await prisma.emailLog.count({ where: { status: 'sent' } });
    const totalFailed = await prisma.emailLog.count({ where: { status: 'failed' } });
    const totalSkipped = await prisma.emailLog.count({ where: { status: 'skipped' } });

    // --- Campagnes actives (draft + sending) avec leurs compteurs ---
    const activeCampaignsRaw = await prisma.campaign.findMany({
      where: { status: { in: ['draft', 'sending'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        startedAt: true,
        template: { select: { name: true } },
      },
    });

    // Pour les campagnes sending, on récupère aussi les destinataires pending/sending en temps réel
    const sendingCampaignIds = activeCampaignsRaw
      .filter((c) => c.status === 'sending')
      .map((c) => c.id);

    let campaignPendingCounts: Record<string, number> = {};
    if (sendingCampaignIds.length > 0) {
      const pendingGroups = await prisma.campaignRecipient.groupBy({
        by: ['campaignId'],
        where: {
          campaignId: { in: sendingCampaignIds },
          status: { in: ['pending', 'sending'] },
        },
        _count: true,
      });
      campaignPendingCounts = Object.fromEntries(
        pendingGroups.map((g) => [g.campaignId, g._count]),
      );
    }

    const activeCampaigns = activeCampaignsRaw.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      templateName: c.template?.name ?? '—',
      totalRecipients: c.totalRecipients,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      pendingCount: campaignPendingCounts[c.id] ?? 0,
      startedAt: c.startedAt?.toISOString() ?? null,
    }));

    return successResponse({
      paused,
      providerName,
      dailyCap,
      sentToday,
      queue: {
        relance1: queueRelance1,
        relance2: queueRelance2,
        relance3: queueRelance3,
        totalDue: queueRelance1 + queueRelance2 + queueRelance3,
        scheduled: scheduledCount,
        totalActive,
        nearTimeout: nearTimeoutCount,
      },
      upcomingLeads: upcomingLeads.map((l) => ({
        id: l.id,
        initials: `${l.firstName?.[0] || '?'}${l.lastName?.[0] || ''}`,
        name: `${l.firstName} ${l.lastName}`,
        email: l.email,
        relanceCount: l.relanceCount,
        nextRelanceAt: l.nextRelanceAt?.toISOString() || null,
        createdAt: l.createdAt.toISOString(),
      })),
      recentLogs: recentLogs.map((log) => ({
        ...log,
        sentAt: log.sentAt.toISOString(),
      })),
      stats: {
        totalSent,
        totalFailed,
        totalSkipped,
      },
      activeCampaigns,
    }, 200);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
