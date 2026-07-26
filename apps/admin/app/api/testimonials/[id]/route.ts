// =============================================================================
// /api/testimonials/[id] — Détail / Mise à jour / Suppression (admin).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';
import { isValidId } from '../../_lib/id-validation';

const patchSchema = z.object({
  authorName: z.string().min(1).max(120).optional(),
  authorRole: z.string().max(120).nullish(),
  authorLocation: z.string().max(120).nullish(),
  authorAvatar: z.string().max(500).nullish(),
  rating: z.number().int().min(1).max(5).optional(),
  content: z.string().min(1).optional(),
  locale: z.string().min(2).max(8).optional(),
  isVisible: z.boolean().optional(),
  order: z.number().int().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  if (!isValidId(id)) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  const t = await prisma.testimonial.findUnique({ where: { id } });
  if (!t) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  return successResponse(t);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  if (!isValidId(id)) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  const [data, err] = await parseBody(req, patchSchema);
  if (err) return err;
  try {
    const updated = await prisma.testimonial.update({
      where: { id },
      data: {
        ...(data.authorName !== undefined ? { authorName: data.authorName.trim() } : {}),
        ...(data.authorRole !== undefined ? { authorRole: data.authorRole?.trim() || null } : {}),
        ...(data.authorLocation !== undefined ? { authorLocation: data.authorLocation?.trim() || null } : {}),
        ...(data.authorAvatar !== undefined ? { authorAvatar: data.authorAvatar?.trim() || null } : {}),
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        ...(data.content !== undefined ? { content: data.content.trim() } : {}),
        ...(data.locale !== undefined ? { locale: data.locale } : {}),
        ...(data.isVisible !== undefined ? { isVisible: data.isVisible } : {}),
        ...(data.order !== undefined ? { order: data.order } : {}),
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
    await prisma.testimonial.delete({ where: { id } });
    return successResponse({ id });
  } catch {
    return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  }
}
