// =============================================================================
// /api/agents/[id]/memories/[memoryId] — Mise à jour et suppression d'une mémoire.
// Édition inline de la valeur (la clé reste fixe une fois créée).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';

// Schéma de mise à jour — seule la valeur est éditable.
const updateMemorySchema = z.object({
  value: z.string(),
});

// PATCH /api/agents/[id]/memories/[memoryId] — met à jour la valeur de la mémoire.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memoryId: string }> },
) {
  try {
    const { id, memoryId } = await params;

    const memory = await prisma.agentMemory.findFirst({
      where: { id: memoryId, agentId: id },
    });
    if (!memory) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const [data, error] = await parseBody(req, updateMemorySchema);
    if (error) return error;

    const updated = await prisma.agentMemory.update({
      where: { id: memoryId },
      data: { value: data.value },
    });
    return successResponse(updated);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/agents/[id]/memories/[memoryId] — supprime l'entrée mémoire.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memoryId: string }> },
) {
  try {
    const { id, memoryId } = await params;

    const memory = await prisma.agentMemory.findFirst({
      where: { id: memoryId, agentId: id },
    });
    if (!memory) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    await prisma.agentMemory.delete({ where: { id: memoryId } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
