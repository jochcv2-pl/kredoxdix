// =============================================================================
// /api/pipeline-steps/[id] — Modification et suppression d'une étape.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';

// Schéma de mise à jour (tous les champs optionnels).
const updateStepSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/pipeline-steps/[id] — met à jour une étape.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const [data, error] = await parseBody(req, updateStepSchema);
    if (error) return error;

    const existing = await prisma.pipelineStep.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Étape introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    const updated = await prisma.pipelineStep.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.templateId !== undefined && { templateId: data.templateId || null }),
        ...(data.documentId !== undefined && { documentId: data.documentId || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        template: { select: { id: true, name: true, subject: true, language: true } },
        document: { select: { id: true, name: true, fileName: true } },
      },
    });

    return successResponse(updated);
  } catch (err) {
    console.error('[PATCH /api/pipeline-steps/[id]] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/pipeline-steps/[id] — supprime une étape et réordonne les suivantes.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const existing = await prisma.pipelineStep.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('Étape introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Transaction : supprime l'étape + décrémente l'ordre des suivantes.
    await prisma.$transaction(async (tx) => {
      await tx.pipelineStep.delete({ where: { id } });
      await tx.pipelineStep.updateMany({
        where: { order: { gt: existing.order } },
        data: { order: { decrement: 1 } },
      });
    });

    return successResponse({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/pipeline-steps/[id]] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
