import { NextRequest } from 'next/server';
import { z } from 'zod';
import { generateEmail } from '@kredix/ai';
import { successResponse, errorResponse, ERR, parseBody } from '../../_lib/responses';
import { requireAuth } from '../../_lib/auth-server';

// =============================================================================
// POST /api/ai/generate-email — Génère le contenu d'un email via l'agent IA.
// =============================================================================
// Appelé par le bouton "Générer avec l'IA" dans l'éditeur de modèles.
// Permet à l'admin de laisser l'IA rédiger un brouillon de template,
// puis de l'éditer manuellement avant sauvegarde.

const generateSchema = z.object({
  agentRole: z.string().default('relance'),
  trigger: z.string().default('manual'),
  userPrompt: z.string().optional(),
  leadContext: z.object({
    firstName: z.string().default('Prospect'),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    loanType: z.string().optional(),
    amount: z.number().optional(),
    durationYears: z.number().optional(),
    monthlyPayment: z.number().optional(),
    annualRate: z.number().optional(),
    relanceCount: z.number().optional(),
    preferredLanguage: z.string().default('fr'),
  }),
  fallbackSubject: z.string().optional(),
  fallbackBody: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;

  const [data, error] = await parseBody(req, generateSchema);
  if (error) return error;

  try {
    const result = await generateEmail(data);
    return successResponse(result);
  } catch (err) {
    console.error('[API /ai/generate-email]', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
