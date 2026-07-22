// =============================================================================
// /api/campaigns — Liste et création des campagnes d'envoi en masse.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, LeadStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';

// Source des destinataires possibles.
const recipientSourceSchema = z.enum([
  'validated_today',
  'validated_week',
  'manual',
  'all_active',
]);

// Schéma de création d'une campagne.
const createCampaignSchema = z.object({
  name: z.string(),
  templateId: z.string(),
  recipientSource: recipientSourceSchema,
  leadIds: z.array(z.string()).optional(), // requis uniquement pour "manual"
});

/**
 * Sélectionne les leads destinataires selon la source.
 * Renvoie id + champs nécessaires à la création des CampaignRecipient.
 */
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
      // Lundi 00:00 de la semaine courante.
      const now = new Date();
      const day = now.getDay(); // 0 = dimanche
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
      // Leads non terminaux (ni perdus ni clients) avec email.
      return {
        status: { notIn: [LeadStatus.lost, LeadStatus.client] },
        email: { not: null },
      };
    case 'manual':
      return { id: { in: leadIds ?? [] }, email: { not: null } };
    default:
      return { id: '__none__' };
  }
}

// GET /api/campaigns — liste toutes les campagnes (template inclus).
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { template: { select: { name: true } } },
    });
    return successResponse(campaigns);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/campaigns — crée une campagne + ses destinataires (transaction).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createCampaignSchema);
    if (error) return error;

    // Le template doit exister.
    const template = await prisma.emailTemplate.findUnique({
      where: { id: data.templateId },
      select: { id: true },
    });
    if (!template) {
      return errorResponse('Template introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Sélection des destinataires selon la source.
    const leads = await prisma.lead.findMany({
      where: buildRecipientWhere(data.recipientSource, data.leadIds),
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    // Création atomique campagne + destinataires.
    const campaign = await prisma.$transaction(async (tx) => {
      return tx.campaign.create({
        data: {
          name: data.name,
          templateId: data.templateId,
          recipientSource: data.recipientSource,
          totalRecipients: leads.length,
          recipients: {
            create: leads.map((lead) => ({
              leadId: lead.id,
              email: lead.email as string,
              firstName: lead.firstName,
              lastName: lead.lastName,
            })),
          },
        },
        include: { template: { select: { name: true } } },
      });
    });

    return successResponse(campaign, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
