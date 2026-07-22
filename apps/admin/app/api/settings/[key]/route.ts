// =============================================================================
// /api/settings/[key] — Mise à jour (upsert) et suppression d'un paramètre.
// La clé est un segment d'URL dynamique (ex : "cms.hero_title").
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';

// Schéma de mise à jour — tous les champs optionnels (upsert si inexistant).
const updateSettingSchema = z.object({
  value: z.string().optional(),
  category: z.string().optional(),
  description: z.string().nullable().optional(),
});

// PATCH /api/settings/[key] — met à jour un paramètre (crée s'il n'existe pas).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const [data, error] = await parseBody(req, updateSettingSchema);
    if (error) return error;

    // Récupère le paramètre existant pour conserver la valeur de category si absente.
    const existing = await prisma.setting.findUnique({ where: { key } });

    // Upert : crée le paramètre s'il n'existe pas encore.
    const setting = await prisma.setting.upsert({
      where: { key },
      update: {
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
      create: {
        key,
        value: data.value ?? '',
        category: data.category ?? existing?.category ?? 'general',
        description: data.description ?? null,
      },
    });

    return successResponse(setting);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/settings/[key] — supprime un paramètre. 404 si introuvable.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;

    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    await prisma.setting.delete({ where: { key } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
