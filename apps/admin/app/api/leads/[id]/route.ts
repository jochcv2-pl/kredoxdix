// =============================================================================
// /api/leads/[id] — Détail et mise à jour d'un lead.
// =============================================================================
// GET    /api/leads/[id]        → détail complet d'un lead
// PATCH  /api/leads/[id]        → met à jour le statut (+ ferme la séquence si terminal)
//
// Règles de fermeture de séquence (jamais gérées par l'IA — décision admin) :
//   - status → client  : exitReason = validated, séquence arrêtée
//   - status → lost    : exitReason = excluded (décision manuelle admin)
//   - retour à un statut non-terminal : exitReason remis à null, séquence réactivable
//
// Schéma de body PATCH : { status: LeadStatus }
// Le body peut aussi contenir des notes optionnelles (notes: string).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, LeadStatus, SequenceExitReason, createNotification } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';

const patchLeadSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  notes: z.string().optional(),
  // Champs d'édition prospect (admin CRM)
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(1).max(40).optional(),
  street: z.string().max(200).optional().or(z.literal('')),
  zipCode: z.string().max(20).optional().or(z.literal('')),
  city: z.string().min(1).max(120).optional(),
  country: z.string().max(10).optional(),
  loanType: z.string().min(1).max(60).optional(),
  amount: z.number().int().min(0).optional(),
  durationYears: z.number().int().min(1).max(30).optional(),
  monthlyPayment: z.number().int().min(0).optional(),
  annualRate: z.number().min(0).max(100).optional(),
  totalCost: z.number().int().min(0).optional(),
});

// GET /api/leads/[id] — détail complet.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const lead = await prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    return successResponse(lead);
  } catch (err) {
    console.error('[GET /api/leads/[id]] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/leads/[id] — met à jour le statut (et ferme la séquence si terminal).
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const [data, error] = await parseBody(req, patchLeadSchema);
    if (error) return error;

    const existing = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, status: true, sequenceActive: true, exitReason: true },
    });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const now = new Date();
    const newStatus = data.status;
    const hasStatusChange = newStatus !== undefined && newStatus !== existing.status;
    const isTerminal = newStatus === LeadStatus.client || newStatus === LeadStatus.lost;

    // Ferme proprement la séquence de relance si on bascule vers un statut terminal.
    // Uniquement si la séquence était active ou pas encore terminée.
    const allowedEditFields = ['firstName', 'lastName', 'email', 'phone', 'street', 'zipCode', 'city', 'country', 'loanType', 'amount', 'durationYears', 'monthlyPayment', 'annualRate', 'totalCost'] as const;

    // Construire updateData : champs d'édition + statut (si fourni) + notes
    const updateData: Record<string, unknown> = {};
    if (newStatus !== undefined) {
      updateData.status = newStatus;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    // Ajouter les champs d'édition (seulement ceux qui sont explicitement fournis)
    for (const field of allowedEditFields) {
      if (data[field] !== undefined) {
        (updateData as Record<string, unknown>)[field] = data[field];
      }
    }

    // Logique de séquence : uniquement si le statut change
    if (hasStatusChange && isTerminal) {
      updateData.sequenceActive = false;
      updateData.sequenceEndedAt = now;
      if (existing.exitReason === null) {
        updateData.exitReason =
          newStatus === LeadStatus.client
            ? SequenceExitReason.validated
            : SequenceExitReason.excluded;
      }
    } else if (hasStatusChange && (existing.status === LeadStatus.client || existing.status === LeadStatus.lost)) {
      // Rouverture depuis un statut terminal → on clears exitReason/sequenceEndedAt
      updateData.exitReason = null;
      updateData.sequenceEndedAt = null;
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
    });

    // ----- Notification : conversion client -----
    if (newStatus === LeadStatus.client && existing.status !== LeadStatus.client) {
      await createNotification({
        type: 'client_converted',
        title: 'Dossier validé',
        message: `Le dossier de ${updated.firstName} ${updated.lastName} a été validé comme client.`,
        icon: 'check-circle',
        severity: 'success',
        linkUrl: `/leads?id=${updated.id}`,
        relatedEntityId: updated.id,
      });
    }

    return successResponse(updated);
  } catch (err) {
    console.error('[PATCH /api/leads/[id]] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/leads/[id] — supprime un lead et ses données liées (emails, destinataires de campagne).
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await ctx.params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const existing = await prisma.lead.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Suppression en cascade manuelle : EmailLogs et CampaignRecipients liés au lead.
    await prisma.emailLog.deleteMany({ where: { leadId: id } });
    await prisma.campaignRecipient.deleteMany({ where: { leadId: id } });
    await prisma.lead.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/leads/[id]] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// Next.js 15 : fonction utilitaire pour signaler que PATCH est dynamique
// (params est asynchrone — évite le static optimization).
export const dynamic = 'force-dynamic';

// Évite le warning "params should be awaited" en explicitant le runtime Node.
export const runtime = 'nodejs';

// Pour rassurer le linter — NextResponse est utilisé dans d'autres routes admin.
void NextResponse;
