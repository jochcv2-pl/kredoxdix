// =============================================================================
// /api/pipeline-steps/reorder — Réordonne les étapes du parcours client.
// =============================================================================
// Body: { orderedIds: string[] }  — tableau d'IDs dans le nouvel ordre.
// Met à jour le champ `order` de chaque étape en une seule transaction.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1, 'Au moins une étape est requise'),
});

// PATCH /api/pipeline-steps/reorder
export async function PATCH(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, reorderSchema);
    if (error) return error;

    // Vérifie que tous les IDs existent.
    const existing = await prisma.pipelineStep.findMany({
      where: { id: { in: data.orderedIds } },
      select: { id: true },
    });
    if (existing.length !== data.orderedIds.length) {
      return errorResponse(
        "Un ou plusieurs IDs d'étape sont invalides",
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Transaction : update order pour chaque étape.
    await prisma.$transaction(
      data.orderedIds.map((id, index) =>
        prisma.pipelineStep.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    );

    return successResponse({ reordered: true });
  } catch (err) {
    console.error('[PATCH /api/pipeline-steps/reorder] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
