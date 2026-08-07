// =============================================================================
// /api/rates/[id] — Lecture, mise à jour et suppression d'un taux.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { isValidId } from '@/app/api/_lib/id-validation';
import { requireAuth, requireAdmin } from '../../_lib/auth-server';

// Schéma PATCH — tous les champs éditables sauf bankId/loanType (immutables
// après création : un changement de palier = une nouvelle entrée).
const updateRateSchema = z.object({
  amountMin: z.number().int().nonnegative().optional(),
  amountMax: z.number().int().nonnegative().optional(),
  annualRate: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (d) => d.amountMin === undefined || d.amountMax === undefined || d.amountMin <= d.amountMax,
  { message: 'amountMin doit être ≤ amountMax', path: ['amountMax'] },
);

// GET /api/rates/[id] — taux seul avec sa banque.
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
    const rate = await prisma.rate.findUnique({
      where: { id },
      include: { bank: { select: { id: true, name: true, slug: true } } },
    });
    if (!rate) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    return successResponse(rate);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/rates/[id] — met à jour les champs éditables.
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
    const [data, error] = await parseBody(req, updateRateSchema);
    if (error) return error;

    const existing = await prisma.rate.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Si on change les bornes du palier, vérifier l'unicité résultante.
    const nextMin = data.amountMin ?? existing.amountMin;
    const nextMax = data.amountMax ?? existing.amountMax;
    if (data.amountMin !== undefined || data.amountMax !== undefined) {
      const conflict = await prisma.rate.findFirst({
        where: {
          bankId: existing.bankId,
          loanType: existing.loanType,
          amountMin: nextMin,
          amountMax: nextMax,
          NOT: { id },
        },
      });
      if (conflict) {
        return errorResponse(
          'Un autre taux utilise déjà ce palier',
          ERR.CONFLICT.code,
          undefined,
          409,
        );
      }
    }

    const rate = await prisma.rate.update({
      where: { id },
      data,
      include: { bank: { select: { id: true, name: true, slug: true } } },
    });
    return successResponse(rate);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/rates/[id] — supprime le taux.
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
    const existing = await prisma.rate.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    await prisma.rate.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
