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
import { prisma, LeadStatus, SequenceExitReason } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';

const patchLeadSchema = z.object({
  status: z.nativeEnum(LeadStatus),
  notes: z.string().optional(),
});

// GET /api/leads/[id] — détail complet.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
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
  try {
    const { id } = await ctx.params;
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
    const isTerminal = newStatus === LeadStatus.client || newStatus === LeadStatus.lost;

    // Ferme proprement la séquence de relance si on bascule vers un statut terminal.
    // Uniquement si la séquence était active ou pas encore terminée.
    const updateData: Record<string, unknown> = { status: newStatus };
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    if (isTerminal) {
      updateData.sequenceActive = false;
      updateData.sequenceEndedAt = now;
      // On ne surcharge pas un exitReason déjà posé par webhook/cron (ex: unsubscribe),
      // sauf si la séquence était encore considérée comme ouverte côté admin.
      if (existing.exitReason === null) {
        updateData.exitReason =
          newStatus === LeadStatus.client
            ? SequenceExitReason.validated
            : SequenceExitReason.excluded;
      }
    } else if (existing.status === LeadStatus.client || existing.status === LeadStatus.lost) {
      // Rouverture depuis un statut terminal → on clears exitReason/sequenceEndedAt
      // pour laisser le cron ou l'admin reprendre la main.
      updateData.exitReason = null;
      updateData.sequenceEndedAt = null;
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: updateData,
    });

    return successResponse(updated);
  } catch (err) {
    console.error('[PATCH /api/leads/[id]] Erreur:', err);
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
