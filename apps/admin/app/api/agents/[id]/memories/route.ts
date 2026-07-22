// =============================================================================
// /api/agents/[id]/memories — Liste et ajout d'entrées mémoire (clé/valeur).
// Fichier mémoire éditable par agent, manipulé clé par clé depuis l'admin.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';

// Schéma de création d'une entrée mémoire.
const createMemorySchema = z.object({
  key: z.string(),
  value: z.string(),
});

// GET /api/agents/[id]/memories — mémoires de l'agent, triées par clé.
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

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const memories = await prisma.agentMemory.findMany({
      where: { agentId: id },
      orderBy: { key: 'asc' },
    });
    return successResponse(memories);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/agents/[id]/memories — ajoute une entrée mémoire à l'agent.
export async function POST(
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

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const [data, error] = await parseBody(req, createMemorySchema);
    if (error) return error;

    const memory = await prisma.agentMemory.create({
      data: { agentId: id, key: data.key, value: data.value },
    });
    return successResponse(memory, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
