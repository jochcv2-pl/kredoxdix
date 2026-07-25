// =============================================================================
// /api/agents/[id] — Lecture, mise à jour et suppression d'un agent.
// systemPrompt est éditable (uniquement via l'interface admin).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';

// Schéma de mise à jour — systemPrompt éditable depuis l'admin.
const updateAgentSchema = z.object({
  name: z.string().optional(),
  initials: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  tools: z.record(z.any()).optional(),
  guardrails: z.record(z.any()).optional(),
});

// GET /api/agents/[id] — agent seul + ses mémoires triées par clé.
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
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        memories: { orderBy: { key: 'asc' } },
      },
    });
    if (!agent) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    return successResponse(agent);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/agents/[id] — met à jour les champs éditibles (incluant systemPrompt).
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
    const [data, error] = await parseBody(req, updateAgentSchema);
    if (error) return error;

    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const agent = await prisma.agent.update({
      where: { id },
      data,
    });
    return successResponse(agent);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/agents/[id] — supprime l'agent (cascade sur ses mémoires).
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
    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    await prisma.agent.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
