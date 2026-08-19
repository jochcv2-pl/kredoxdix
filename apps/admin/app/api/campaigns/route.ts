// =============================================================================
// /api/campaigns — Liste et création des campagnes d'envoi en masse.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, LeadStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';
import { getCampaignScope, getLeadScope } from '../_lib/scope';

// Source des destinataires possibles.
const recipientSourceSchema = z.enum([
  'validated_today',
  'validated_week',
  'manual',
  'all_active',
  'lost_leads', // win-back : prospects perdus (relance commerciale)
  'import_file',
]);

// Destinataire importé depuis un fichier CSV (sans leadId — standalone).
const importedRecipientSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

// Schéma de création d'une campagne.
const createCampaignSchema = z.object({
  name: z.string(),
  templateId: z.string(),
  domainId: z.string().nullable().optional(),             // domaine d'envoi (null = global)
  gatewayId: z.string().nullable().optional(),            // SMTP spécifique (null = primaire)
  recipientSource: recipientSourceSchema,
  leadIds: z.array(z.string()).optional(),           // requis pour "manual"
  recipients: z.array(importedRecipientSchema).optional(), // requis pour "import_file" ou "manual"
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
    case 'lost_leads':
      // Win-back : leads marqués perdus (fin de séquence ou décision admin)
      // avec email. La SuppressionList (désabonnés) est exclue à l'envoi par
      // le campaign-sender, comme pour toute campagne.
      return {
        status: LeadStatus.lost,
        email: { not: null },
      };
    case 'manual':
      return { id: { in: leadIds ?? [] }, email: { not: null } };
    default:
      return { id: '__none__' };
  }
}

// GET /api/campaigns — liste les campagnes paginées (template inclus).
// Paramètres : ?page=1&pageSize=20 (max 200). Réponse : { campaigns, pagination }.
export async function GET(req: NextRequest) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize')) || 20));

    const where = getCampaignScope(admin!);
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          template: { select: { name: true } },
          domain: { select: { domain: true, fromEmail: true } },
          gateway: { select: { id: true, label: true } },
        },
      }),
      prisma.campaign.count({ where }),
    ]);
    return successResponse({
      campaigns,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/campaigns — crée une campagne + ses destinataires (transaction).
export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAuth();
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

    // --- Construction des destinataires ---
    let recipientsData: Array<{
      leadId?: string | null;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      source: string;
    }> = [];

    if (data.recipientSource === 'import_file') {
      // Destinataires importés depuis un fichier — ne touche pas à la table Lead.
      if (!data.recipients || data.recipients.length === 0) {
        return errorResponse('Aucun destinataire à importer', ERR.VALIDATION.code, undefined, 422);
      }
      // Déduplication par email (le dernier gagne).
      const seen = new Map<string, typeof data.recipients[number]>();
      for (const r of data.recipients) seen.set(r.email.toLowerCase(), r);
      recipientsData = Array.from(seen.values()).map((r) => ({
        email: r.email,
        firstName: r.firstName || null,
        lastName: r.lastName || null,
        phone: r.phone || null,
        leadId: null,
        source: 'import',
      }));
    } else if (data.recipientSource === 'manual' && data.recipients && data.recipients.length > 0) {
      // Sélection manuelle avec données enrichies (depuis la recherche leads).
      const seen = new Map<string, typeof data.recipients[number]>();
      for (const r of data.recipients) seen.set(r.email.toLowerCase(), r);
      recipientsData = Array.from(seen.values()).map((r) => ({
        email: r.email,
        firstName: r.firstName || null,
        lastName: r.lastName || null,
        phone: r.phone || null,
        leadId: null,
        source: 'lead',
      }));
    } else {
      // Sources automatiques (validated_today, validated_week, all_active, manual avec leadIds).
      const leads = await prisma.lead.findMany({
        where: { ...getLeadScope(admin!), ...buildRecipientWhere(data.recipientSource, data.leadIds) },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      });
      recipientsData = leads.map((lead) => ({
        leadId: lead.id,
        email: lead.email as string,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        source: 'lead',
      }));
    }

    // Création atomique campagne + destinataires.
    const campaign = await prisma.$transaction(async (tx) => {
      return tx.campaign.create({
        data: {
          name: data.name,
          templateId: data.templateId,
          domainId: data.domainId || null,
          gatewayId: data.gatewayId || null,
          ownerId: admin!.id,
          recipientSource: data.recipientSource,
          totalRecipients: recipientsData.length,
          recipients: {
            create: recipientsData,
          },
        },
        include: { template: { select: { name: true } }, domain: { select: { domain: true, fromEmail: true } } },
      });
    });

    return successResponse(campaign, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
