// =============================================================================
// /api/document-templates/[id] — Lecture, mise à jour et suppression d'un template.
// DELETE retire aussi le fichier PDF du disque (nettoyage).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth, requireAdmin } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';
import fs from 'fs/promises';
import path from 'path';

// Schéma de mise à jour — tous champs optionnels.
const updateTemplateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  level: z.number().int().min(1).max(7).nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/document-templates/[id] — template seul.
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
    const template = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    return successResponse(template);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/document-templates/[id] — met à jour les champs éditables.
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
    const [data, error] = await parseBody(req, updateTemplateSchema);
    if (error) return error;

    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const template = await prisma.documentTemplate.update({
      where: { id },
      data,
    });

    return successResponse(template);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/document-templates/[id] — supprime le template + le fichier disque.
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
    const existing = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Nettoyage du fichier PDF sur le disque (s'il existe).
    if (existing.filePath) {
      const absPath = path.join(process.cwd(), 'public', existing.filePath);
      try {
        await fs.unlink(absPath);
      } catch {
        // Fichier absent ou déjà supprimé — on ignore.
      }
    }

    await prisma.documentTemplate.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
