// =============================================================================
// /api/gateways/[id] — Lecture, mise à jour et suppression d'une passerelle.
// Le provider est IMMUTABLE après création (volontairement absent du PATCH).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, encryptSecret } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { isValidId } from '@/app/api/_lib/id-validation';
import { requireAuth } from '../../_lib/auth-server';
import { maskApiKey } from '@/app/api/_lib/security';

// Schéma de mise à jour — provider volontairement absent (immutable après création).
const updateGatewaySchema = z.object({
  label: z.string().optional(),
  apiKey: z.string().nullable().optional(),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/gateways/[id] — passerelle seule.
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
    const gateway = await prisma.emailGateway.findUnique({ where: { id } });
    if (!gateway) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    return successResponse({ ...gateway, apiKey: maskApiKey(gateway.apiKey) });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/gateways/[id] — met à jour les champs éditables (pas le provider).
// Si activation, désactive toutes les autres passerelles (transaction).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const [data, error] = await parseBody(req, updateGatewaySchema);
    if (error) return error;

    const existing = await prisma.emailGateway.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Chiffrer la clé API si elle est modifiée (et non masquée/••••).
    const updateData: Record<string, unknown> = { ...data };
    if (data.apiKey && !data.apiKey.startsWith('••••')) {
      updateData.apiKey = encryptSecret(data.apiKey);
    } else if (data.apiKey && data.apiKey.startsWith('••••')) {
      // Valeur masquée renvoyée par le GET — ne pas écraser la clé existante.
      delete updateData.apiKey;
    }

    // Règle métier : une seule passerelle active à la fois (transaction).
    const activating = data.isActive === true;
    const gateway = await prisma.$transaction(async (tx) => {
      if (activating) {
        await tx.emailGateway.updateMany({
          where: { isActive: true, NOT: { id } },
          data: { isActive: false },
        });
      }
      return tx.emailGateway.update({ where: { id }, data: updateData });
    });

    return successResponse({ ...gateway, apiKey: maskApiKey(gateway.apiKey) });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/gateways/[id] — supprime la passerelle.
// Si c'était la passerelle active, il n'y en a simplement plus aucune d'active.
export async function DELETE(
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
    const existing = await prisma.emailGateway.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    await prisma.emailGateway.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
