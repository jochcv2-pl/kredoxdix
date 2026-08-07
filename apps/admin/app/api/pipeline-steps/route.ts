// =============================================================================
// /api/pipeline-steps — Liste et création des étapes du parcours client.
// =============================================================================
// Chaque étape associe un template email + un document PDF (optionnel).
// L'ordre est défini par `order` (entier). L'admin peut réordonner via
// /api/pipeline-steps/reorder.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../_lib/auth-server';

// GET /api/pipeline-steps — liste toutes les étapes, triées par order.
export async function GET() {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const steps = await prisma.pipelineStep.findMany({
      orderBy: { order: 'asc' },
      include: {
        template: {
          select: { id: true, name: true, subject: true, language: true },
        },
        document: {
          select: { id: true, name: true, fileName: true },
        },
      },
    });
    return successResponse(steps);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// Schéma de création.
const createStepSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  description: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

// POST /api/pipeline-steps — crée une nouvelle étape (à la fin du parcours).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createStepSchema);
    if (error) return error;

    // Calcule l'ordre suivant (max + 1).
    const maxOrder = await prisma.pipelineStep.aggregate({
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? 0) + 1;

    const step = await prisma.pipelineStep.create({
      data: {
        order: nextOrder,
        name: data.name,
        description: data.description ?? null,
        templateId: data.templateId || null,
        documentId: data.documentId || null,
        isActive: data.isActive,
      },
      include: {
        template: { select: { id: true, name: true, subject: true, language: true } },
        document: { select: { id: true, name: true, fileName: true } },
      },
    });

    return successResponse(step, 201);
  } catch (err) {
    console.error('[POST /api/pipeline-steps] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
