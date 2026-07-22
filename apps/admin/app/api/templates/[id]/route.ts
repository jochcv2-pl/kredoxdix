// =============================================================================
// /api/templates/[id] — Lecture, mise à jour et suppression d'un template.
// Le trigger est IMMUTABLE après création (volontairement absent du schéma PATCH).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, TemplateStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { isValidId } from '@/app/api/_lib/id-validation';
import { requireAuth } from '../../_lib/auth-server';

// Schéma de mise à jour — trigger volontairement absent (immutable après création).
const updateTemplateSchema = z.object({
  name: z.string().optional(),
  agentId: z.string().nullable().optional(),
  status: z.nativeEnum(TemplateStatus).optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  htmlContent: z.string().nullable().optional(),
  languages: z.array(z.string()).optional(),
  bannerEnabled: z.boolean().optional(),
});

// GET /api/templates/[id] — template seul.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const template = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    return successResponse(template);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/templates/[id] — met à jour les champs éditables (pas le trigger).
// Si activation, désactive les autres actifs du même trigger (transaction).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const [data, error] = await parseBody(req, updateTemplateSchema);
    if (error) return error;

    const existing = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Règle métier : un seul template actif par déclencheur.
    const activating = data.status === 'active';
    if (activating) {
      const conflict = await prisma.emailTemplate.findFirst({
        where: {
          trigger: existing.trigger,
          status: 'active',
          NOT: { id },
        },
      });
      if (conflict) {
        return errorResponse(
          'Un seul template actif par déclencheur',
          ERR.CONFLICT.code,
          undefined,
          409,
        );
      }
    }

    // Mise à jour + désactivation des autres actifs pour ce trigger (transaction).
    const template = await prisma.$transaction(async (tx) => {
      if (activating) {
        await tx.emailTemplate.updateMany({
          where: {
            trigger: existing.trigger,
            status: 'active',
            NOT: { id },
          },
          data: { status: 'draft' },
        });
      }
      return tx.emailTemplate.update({ where: { id }, data });
    });

    return successResponse(template);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/templates/[id] — supprime le template.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const existing = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    await prisma.emailTemplate.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
