// =============================================================================
// /api/campaigns/recipients-preview — Compte les destinataires par source.
// =============================================================================
// Utilisé par le front avant création : prévisualiser le périmètre d'une campagne.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, LeadStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { getLeadScope } from '../../_lib/scope';

const previewSchema = z.object({
  recipientSource: z.enum([
    'validated_today',
    'validated_week',
    'manual',
    'all_active',
    'import_file',
  ]),
  leadIds: z.array(z.string()).optional(),
});

/** Reconstruit la clause where selon la source (identique à /api/campaigns). */
function buildRecipientWhere(source: string, leadIds: string[] | undefined) {
  switch (source) {
    case 'validated_today': {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return {
        status: LeadStatus.client,
        updatedAt: { gte: startOfToday },
        email: { not: null },
      };
    }
    case 'validated_week': {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const startOfWeek = new Date(now);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(now.getDate() - diffToMonday);
      return {
        status: LeadStatus.client,
        updatedAt: { gte: startOfWeek },
        email: { not: null },
      };
    }
    case 'all_active':
      return {
        status: { notIn: [LeadStatus.lost, LeadStatus.client] },
        email: { not: null },
      };
    case 'manual':
      return { id: { in: leadIds ?? [] }, email: { not: null } };
    case 'import_file':
      // Pas de preview côté DB — les destinataires viennent du fichier CSV.
      return { id: '__none__' };
    default:
      return { id: '__none__' };
  }
}

// POST /api/campaigns/recipients-preview — compte + échantillon (10 premiers).
export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, previewSchema);
    if (error) return error;

    // Scope multi-admin (DEC-K5) : un conseiller ne cible que ses propres leads.
    const where = { ...getLeadScope(admin!), ...buildRecipientWhere(data.recipientSource, data.leadIds) };

    const [count, sample] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        take: 10,
        orderBy: { id: 'asc' },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);

    return successResponse({ count, sample });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
