// =============================================================================
// /api/content-blocks/[id] — Détail / Suppression (admin).
// =============================================================================
// L'édition se fait via POST (upsert) sur /api/content-blocks.
// Cette route permet la lecture individuelle + suppression.

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';
import { isValidId } from '../../_lib/id-validation';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  if (!isValidId(id)) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  const block = await prisma.contentBlock.findUnique({ where: { id } });
  if (!block) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  return successResponse(block);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const { id } = await params;
  if (!isValidId(id)) return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  try {
    await prisma.contentBlock.delete({ where: { id } });
    return successResponse({ id });
  } catch {
    return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
  }
}
