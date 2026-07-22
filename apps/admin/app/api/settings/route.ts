// =============================================================================
// /api/settings — Liste et création/mise à jour (upsert) des paramètres.
// Les paramètres sont identifiés par une clé unique (ex : "cms.hero.title").
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';

// Schéma de création / mise à jour d'un paramètre (upsert par clé unique).
const upsertSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  category: z.string().default('general'),
  description: z.string().nullable().optional(),
});

// GET /api/settings — liste tous les paramètres.
// Filtre optionnel par catégorie via ?category=xxx.
// Tri par catégorie puis par clé.
export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get('category');

    const settings = await prisma.setting.findMany({
      ...(category ? { where: { category } } : {}),
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    return successResponse(settings);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/settings — crée ou met à jour un paramètre (upsert par clé).
// Retourne 200 (et non 201) car un update est possible.
export async function POST(req: NextRequest) {
  try {
    const [data, error] = await parseBody(req, upsertSettingSchema);
    if (error) return error;

    const setting = await prisma.setting.upsert({
      where: { key: data.key },
      update: {
        value: data.value,
        category: data.category,
        description: data.description,
      },
      create: {
        key: data.key,
        value: data.value,
        category: data.category,
        description: data.description,
      },
    });

    return successResponse(setting);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
