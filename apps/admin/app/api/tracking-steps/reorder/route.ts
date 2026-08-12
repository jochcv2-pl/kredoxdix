// =============================================================================
// /api/tracking-steps/reorder — Réordonne les étapes de suivi (s44)
// =============================================================================
// Body : { steps: [{ id, order }, ...] }
// Super-admin only (config globale).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';
import { logAudit } from '../../_lib/audit';

const reorderSchema = z.object({
  steps: z.array(
    z.object({
      id: z.string().min(1),
      order: z.number().int().min(1),
    }),
  ).min(1),
});

// PATCH /api/tracking-steps/reorder — réordonne les étapes en bulk.
export async function PATCH(req: NextRequest) {
  const [admin, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, reorderSchema);
    if (error) return error;

    // Vérifie que toutes les étapes existent.
    const ids = data.steps.map((s) => s.id);
    const existing = await prisma.trackingStep.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      return errorResponse(
        'Une ou plusieurs étapes sont introuvables',
        ERR.NOT_FOUND.code,
        undefined,
        404,
      );
    }

    // Transaction : update each order.
    await prisma.$transaction(
      data.steps.map((s) =>
        prisma.trackingStep.update({
          where: { id: s.id },
          data: { order: s.order },
        }),
      ),
    );

    await logAudit({
      admin,
      action: 'tracking_step_reorder',
      entity: 'TrackingStep',
      diff: { count: data.steps.length },
    });

    return successResponse({ reordered: data.steps.length });
  } catch (err) {
    console.error('[PATCH /api/tracking-steps/reorder] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
