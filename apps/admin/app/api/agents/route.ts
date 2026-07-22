// =============================================================================
// /api/agents — Liste et création des agents IA (rôles verrouillés).
// Un rôle = un agent (unique). Le systemPrompt n'est set qu'à la création.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, AgentRole } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';

// Schéma de création d'un agent (systemPrompt verrouillé, set à la création).
const createAgentSchema = z.object({
  role: z.nativeEnum(AgentRole),
  name: z.string(),
  initials: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  isActive: z.boolean().default(true),
  tools: z.record(z.any()).default({}),
  guardrails: z.record(z.any()).default({}),
});

// GET /api/agents — liste tous les agents, triés par rôle, avec compte mémoire.
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { role: 'asc' },
      include: {
        _count: { select: { memories: true } },
      },
    });
    return successResponse(agents);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/agents — crée un nouvel agent (409 si le rôle existe déjà).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createAgentSchema);
    if (error) return error;

    const existing = await prisma.agent.findUnique({ where: { role: data.role } });
    if (existing) {
      return errorResponse(ERR.CONFLICT.msg, ERR.CONFLICT.code, undefined, 409);
    }

    const agent = await prisma.agent.create({ data });
    return successResponse(agent, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
