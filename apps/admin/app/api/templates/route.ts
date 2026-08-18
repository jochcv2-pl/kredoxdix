// =============================================================================
// /api/templates — Liste et création des modèles d'email.
// Règle métier : un seul template actif par déclencheur (EmailTrigger) + langue.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, EmailTrigger, TemplateStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth, requireAdmin } from '../_lib/auth-server';

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
  blocksJson: z.string().nullable().optional(),
  bannerEnabled: z.boolean().default(true),
  isConfidential: z.boolean().default(false),
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

// POST /api/templates — crée un template.
// Si le statut est 'active', les autres templates actifs du même trigger+langue
// sont automatiquement passés en 'draft' (transaction ci-dessous).
// EXCEPTION trigger 'manual' : l'envoi manuel choisit toujours explicitement
// le modèle (envoi ponctuel, campagne) — aucun findFirst automatique ne le
// consomme. Une bibliothèque de modèles manuels actifs est donc légitime.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createTemplateSchema);
    if (error) return error;

    const template = await prisma.$transaction(async (tx) => {
      if (data.status === 'active' && data.trigger !== EmailTrigger.manual) {
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
