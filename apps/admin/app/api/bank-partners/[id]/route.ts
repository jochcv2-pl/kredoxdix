// =============================================================================
// /api/bank-partners/[id] — Mise à jour / Suppression (admin).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';
import { isValidId } from '../../_lib/id-validation';

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  logoUrl: z.string().max(500).nullish(),
  contactEmail: z.string().max(200).nullish(),
  contactPhone: z.string().max(50).nullish(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  if (!isValidId(id)) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  const [data, err] = await parseBody(req, patchSchema);
  if (err) return err;
  try {
    // Vérifie l'unicité du slug si modifié.
    if (data.slug) {
      const taken = await prisma.bankPartner.findUnique({ where: { slug: data.slug } });
      if (taken && taken.id !== id) {
        return errorResponse('Ce slug est déjà utilisé', ERR.CONFLICT.code, { slug: data.slug }, 409);
      }
    }

    const updated = await prisma.bankPartner.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.slug !== undefined ? { slug: data.slug.trim() } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl?.trim() || null } : {}),
        ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail?.trim() || null } : {}),
        ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.displayOrder !== undefined ? { displayOrder: data.displayOrder } : {}),
      },
    });
    return successResponse(updated);
  } catch {
    return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  if (!isValidId(id)) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  try {
    await prisma.bankPartner.delete({ where: { id } });
    return successResponse({ id });
  } catch {
    return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  }
}
