// =============================================================================
// /api/clients — Liste des prospects validés comme clients.
// =============================================================================
// Renvoie tous les leads au statut "client", triés par dernière mise à jour,
// avec leurs niveaux déjà envoyés (ClientStep) et le niveau courant.
//
// La relation Lead → ClientStep n'est pas déclarée côté Prisma (leadId est une
// simple String). On fait donc deux requêtes : leads, puis steps regroupées.
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma, LeadStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';
import { getLeadScope } from '../_lib/scope';

interface ClientStepInfo {
  id: string;
  level: number;
  sentAt: Date;
}

interface ClientListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  city: string;
  loanType: string;
  amount: number;
  monthlyPayment: number | null;
  status: string;
  steps: ClientStepInfo[];
  currentLevel: number;
  updatedAt: Date;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedToRole: string | null;
}

// GET /api/clients — liste paginée des clients + progression du parcours 7 niveaux.
// Paramètres : ?page=1&pageSize=20 (max 200). Réponse : { clients, pagination }.
export async function GET(req: NextRequest) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize')) || 20));

    const where = { ...getLeadScope(admin!), status: LeadStatus.client };
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          city: true,
          loanType: true,
          amount: true,
          monthlyPayment: true,
          status: true,
          updatedAt: true,
          assignedToId: true,
          assignedTo: { select: { displayName: true, role: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    // Récupère en une seule requête tous les ClientStep des leads concernés.
    const leadIds = leads.map((l) => l.id);
    const steps = await prisma.clientStep.findMany({
      where: { leadId: { in: leadIds } },
      orderBy: { level: 'asc' },
      select: { id: true, leadId: true, level: true, sentAt: true },
    });

    // Regroupe les steps par leadId.
    const stepsByLead = new Map<string, ClientStepInfo[]>();
    for (const s of steps) {
      const arr = stepsByLead.get(s.leadId);
      if (arr) {
        arr.push({ id: s.id, level: s.level, sentAt: s.sentAt });
      } else {
        stepsByLead.set(s.leadId, [{ id: s.id, level: s.level, sentAt: s.sentAt }]);
      }
    }

    const result: ClientListItem[] = leads.map((lead) => {
      const leadSteps = stepsByLead.get(lead.id) ?? [];
      const currentLevel = leadSteps.reduce((max, s) => Math.max(max, s.level), 0);
      return {
        ...lead,
        assignedToName: lead.assignedTo?.displayName ?? null,
        assignedToRole: lead.assignedTo?.role ?? null,
        steps: leadSteps,
        currentLevel,
      };
    });

    return successResponse({
      clients: result,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error('[GET /api/clients] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
