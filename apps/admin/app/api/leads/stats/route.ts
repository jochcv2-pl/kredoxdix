// =============================================================================
// /api/leads/stats — Agrégations pour le dashboard admin.
// =============================================================================
// KPIs principaux :
//   - prospectsActifs     : leads non-terminaux (ni client ni lost)
//   - clientsValides      : status = client
//   - offresFormalisees   : status = offer
//   - volumeFinances      : somme des amounts des leads "client"
//
// Pipeline (count par statut, ordre canonique) :
//   new, contacted, progress, offer, waiting, client, lost
//
// Activité agents (aujourd'hui) : nombre d'envois par trigger depuis EmailLog,
// plus nombre de relances programmées (leads avec nextRelanceAt futur).
//
// Derniers dossiers : 5 derniers leads créés.
// =============================================================================

import { prisma, LeadStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';

// Ordre canonique du pipeline (cohérent avec la vue Contacts).
const PIPELINE_ORDER: LeadStatus[] = [
  LeadStatus.new,
  LeadStatus.contacted,
  LeadStatus.progress,
  LeadStatus.offer,
  LeadStatus.waiting,
  LeadStatus.client,
  LeadStatus.lost,
];

// GET /api/leads/stats — agrégations dashboard.
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // ----- KPIs principaux -----
    const [
      prospectsActifs,
      clientsValides,
      offresFormalisees,
      volumeAgg,
      totalLeads,
      pipelineRaw,
      derniersLeadsRaw,
      emailsTodayAgg,
      relancesProgrees,
    ] = await Promise.all([
      // Prospects actifs = ni client ni lost.
      prisma.lead.count({
        where: { status: { notIn: [LeadStatus.client, LeadStatus.lost] } },
      }),
      prisma.lead.count({ where: { status: LeadStatus.client } }),
      prisma.lead.count({ where: { status: LeadStatus.offer } }),
      // Volume financé = somme des amounts des clients validés.
      prisma.lead.aggregate({
        where: { status: LeadStatus.client },
        _sum: { amount: true },
      }),
      prisma.lead.count(),
      // Count groupé par statut.
      prisma.lead.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      // 5 derniers leads.
      prisma.lead.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          city: true,
          country: true,
          loanType: true,
          amount: true,
          monthlyPayment: true,
          annualRate: true,
          durationYears: true,
          status: true,
          createdAt: true,
        },
      }),
      // Activité agents : emails envoyés aujourd'hui, groupés par trigger.
      prisma.emailLog.groupBy({
        by: ['trigger'],
        where: { sentAt: { gte: startOfToday } },
        _count: { _all: true },
      }),
      // Relances programmées (leads avec prochaine échéance future).
      prisma.lead.count({
        where: {
          sequenceActive: true,
          nextRelanceAt: { gt: now },
        },
      }),
    ]);

    // Map status → count (en respectant l'ordre canonique).
    const countByStatus = new Map<string, number>();
    for (const row of pipelineRaw) {
      countByStatus.set(row.status, row._count._all);
    }
    const pipeline = PIPELINE_ORDER.map((s) => ({
      status: s,
      count: countByStatus.get(s) ?? 0,
    }));

    // Activité agents par déclencheur (accusé/offre/relance_1-3/campaign/...).
    const emailsByTrigger: Record<string, number> = {};
    for (const row of emailsTodayAgg) {
      emailsByTrigger[row.trigger] = row._count._all;
    }

    return successResponse({
      kpis: {
        prospectsActifs,
        clientsValides,
        offresFormalisees,
        volumeFinances: volumeAgg._sum.amount ?? 0,
        totalLeads,
      },
      pipeline,
      derniersLeads: derniersLeadsRaw,
      activiteAgents: {
        emailsEnvoyesAujourdhui: emailsByTrigger,
        relancesProgrammees: relancesProgrees,
      },
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/leads/stats] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
