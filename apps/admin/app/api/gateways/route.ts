// =============================================================================
// /api/gateways — Liste et création des passerelles d'envoi email.
// Règle métier : une seule passerelle active à la fois (contrainte app).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, GatewayProvider, encryptSecret } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';
import { maskApiKey } from '@/app/api/_lib/security';

// Schéma de création d'une passerelle.
const createGatewaySchema = z.object({
  provider: z.nativeEnum(GatewayProvider),
  label: z.string(),
  apiKey: z.string().nullable().optional(), // secret — défini via l'admin
  config: z.record(z.any()).default({}),
  isActive: z.boolean().default(false),
});

// GET /api/gateways — liste toutes les passerelles, triées par label.
// L'apiKey est MASQUÉE dans la réponse (jamais exposée en clair côté client).
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const gateways = await prisma.emailGateway.findMany({
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
// Si isActive = true, désactive toutes les autres passerelles (transaction).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createGatewaySchema);
    if (error) return error;

    // Chiffrer la clé API avant stockage (AES-256-GCM).
    const encryptedApiKey = data.apiKey ? encryptSecret(data.apiKey) : null;

    // Règle métier : une seule passerelle active à la fois (transaction).
    const gateway = await prisma.$transaction(async (tx) => {
      if (data.isActive) {
        await tx.emailGateway.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        });
      }
      return tx.emailGateway.create({
        data: {
          ...data,
          apiKey: encryptedApiKey,
        },
      });
    });

    return successResponse({ ...gateway, apiKey: maskApiKey(gateway.apiKey) }, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
