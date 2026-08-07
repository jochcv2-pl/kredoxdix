// =============================================================================
// /api/settings — Liste et création/mise à jour (upsert) des paramètres.
// Les paramètres sont identifiés par une clé unique (ex : "cms.hero.title").
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, encryptSecret, decryptSecret } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../_lib/auth-server';

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
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const category = req.nextUrl.searchParams.get('category');

    const settings = await prisma.setting.findMany({
      ...(category ? { where: { category } } : {}),
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    // Masquer la clé API IA dans la réponse (sécurité — ne jamais exposer en clair côté client).
    const masked = settings.map((s) => {
      if (s.key === 'ai_api_key' && s.value) {
        try {
          const decrypted = decryptSecret(s.value) || '';
          const last4 = decrypted.slice(-4);
          return { ...s, value: `••••${last4}` };
        } catch {
          return { ...s, value: '••••' };
        }
      }
      return s;
    });

    return successResponse(masked);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/settings — crée ou met à jour un paramètre (upsert par clé).
// Retourne 200 (et non 201) car un update est possible.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, upsertSettingSchema);
    if (error) return error;

    // Chiffrer la clé API IA avant stockage (AES-256-GCM).
    // Si la valeur est vide (déconnexion) ou déjà masquée (••••), on ne chiffre pas.
    let storeValue = data.value;
    if (data.key === 'ai_api_key' && data.value && !data.value.startsWith('••••')) {
      storeValue = encryptSecret(data.value);
    }

    const setting = await prisma.setting.upsert({
      where: { key: data.key },
      update: {
        value: storeValue,
        category: data.category,
        description: data.description,
      },
      create: {
        key: data.key,
        value: storeValue,
        category: data.category,
        description: data.description,
      },
    });

    return successResponse(setting);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
