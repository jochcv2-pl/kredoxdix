// =============================================================================
// /api/gateways — Liste et création des passerelles d'envoi email.
// Plusieurs passerelles peuvent être actives simultanément.
// Une seule peut être isPrimary (SMTP principal pour prospects/relances).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, GatewayProvider, encryptSecret } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';
import { getGatewayScope } from '../_lib/scope';
import { maskApiKey } from '@/app/api/_lib/security';

// Schéma de création d'une passerelle.
const createGatewaySchema = z.object({
  provider: z.nativeEnum(GatewayProvider),
  label: z.string(),
  apiKey: z.string().nullable().optional(), // secret — défini via l'admin
  config: z.record(z.any()).default({}),
  isActive: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
  isSystem: z.boolean().default(false), // DEC-K5 — SMTP système (super-admin only)
});

// GET /api/gateways — liste toutes les passerelles, triées par label.
// L'apiKey est MASQUÉE dans la réponse (jamais exposée en clair côté client).
export async function GET() {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const gateways = await prisma.emailGateway.findMany({
      where: getGatewayScope(admin!),
      orderBy: { label: 'asc' },
    });
    const masked = gateways.map((g) => ({
      ...g,
      apiKey: maskApiKey(g.apiKey),
    }));
    return successResponse(masked);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/gateways — crée une passerelle.
// Si isPrimary = true, retire le flag primary de toutes les autres (transaction).
export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createGatewaySchema);
    if (error) return error;

    // Chiffrer la clé API avant stockage (AES-256-GCM).
    const encryptedApiKey = data.apiKey ? encryptSecret(data.apiKey) : null;

    // DEC-K5 — SMTP système réservé au super-admin.
    if (data.isSystem && admin!.role !== 'admin') {
      return errorResponse('Seul le super-admin peut créer un SMTP système', 'FORBIDDEN', undefined, 403);
    }

    // Règle métier : un seul isPrimary à la fois (transaction).
    const gateway = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.emailGateway.updateMany({
          where: { isPrimary: true, ...getGatewayScope(admin!) },
          data: { isPrimary: false },
        });
      }
      return tx.emailGateway.create({
        data: {
          ...data,
          apiKey: encryptedApiKey,
          ownerId: data.isSystem ? null : admin!.id,
        },
      });
    });

    return successResponse({ ...gateway, apiKey: maskApiKey(gateway.apiKey) }, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
