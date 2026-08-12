// =============================================================================
// /api/tracking-steps/[id] — Modification et suppression d'une étape de suivi.
// =============================================================================
// Super-admin only (config globale).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';
import { logAudit } from '../../_lib/audit';

// Schéma de mise à jour (tous les champs optionnels).
const updateStepSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/tracking-steps/[id] — met à jour une étape.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const [data, error] = await parseBody(req, updateStepSchema);
    if (error) return error;

    const existing = await prisma.trackingStep.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Étape introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    const updated = await prisma.trackingStep.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    await logAudit({
      admin,
      action: 'tracking_step_update',
      entity: 'TrackingStep',
      entityId: id,
      diff: { before: existing, after: updated },
    });

    return successResponse(updated);
  } catch (err) {
    console.error('[PATCH /api/tracking-steps/[id]] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/tracking-steps/[id] — supprime une étape et réordonne les suivantes.
// CASCADE : toutes les LeadTracking liées sont supprimées (cf. schema.prisma).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const existing = await prisma.trackingStep.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Étape introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Transaction : supprime l'étape + décrémente l'ordre des suivantes.
    // CASCADE emporte les LeadTracking liées (pertes de validations acceptées :
    // supprimer une étape de tracking = l'étape n'existe plus, donc ses validations non plus).
    await prisma.$transaction(async (tx) => {
      await tx.trackingStep.delete({ where: { id } });
      await tx.trackingStep.updateMany({
        where: { order: { gt: existing.order } },
        data: { order: { decrement: 1 } },
      });
    });

    await logAudit({
      admin,
      action: 'tracking_step_delete',
      entity: 'TrackingStep',
      entityId: id,
      diff: { deleted: existing.name },
    });

    return successResponse({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/tracking-steps/[id]] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
