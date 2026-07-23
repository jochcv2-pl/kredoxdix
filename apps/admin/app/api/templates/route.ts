// =============================================================================
// /api/templates — Liste et création des modèles d'email.
// Règle métier : un seul template actif par déclencheur (EmailTrigger) + langue.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, EmailTrigger, TemplateStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';

// Schéma de création d'un template.
const createTemplateSchema = z.object({
  name: z.string(),
  trigger: z.nativeEnum(EmailTrigger),
  language: z.string().default('fr'),
  agentId: z.string().nullable().optional(),
  status: z.nativeEnum(TemplateStatus).default('draft'),
  subject: z.string(),
  bodyText: z.string(),
  htmlContent: z.string().nullable().optional(),
  bannerEnabled: z.boolean().default(true),
});

// GET /api/templates — liste tous les templates, triés par trigger puis date.
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: [{ trigger: 'asc' }, { createdAt: 'asc' }],
    });
    return successResponse(templates);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/templates — crée un template (409 si un autre actif existe déjà pour le même trigger).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createTemplateSchema);
    if (error) return error;

    // Règle métier : un seul template actif par déclencheur + langue.
    if (data.status === 'active') {
      const conflict = await prisma.emailTemplate.findFirst({
        where: { trigger: data.trigger, status: 'active', language: data.language },
      });
      if (conflict) {
        return errorResponse(
          `Un seul template actif par déclencheur + langue (${data.language})`,
          ERR.CONFLICT.code,
          undefined,
          409,
        );
      }
    }

    // Création + désactivation des autres actifs pour ce trigger + langue (transaction).
    const template = await prisma.$transaction(async (tx) => {
      if (data.status === 'active') {
        await tx.emailTemplate.updateMany({
          where: { trigger: data.trigger, status: 'active', language: data.language },
          data: { status: 'draft' },
        });
      }
      return tx.emailTemplate.create({ data });
    });

    return successResponse(template, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
