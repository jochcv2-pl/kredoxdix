// =============================================================================
// /api/clients/[id]/send-level — Déclenche l'envoi d'une étape du parcours client.
// =============================================================================
// Body : { stepId: string }  — ID du PipelineStep à envoyer.
// Appelle client-level-sender qui :
//   - charge le PipelineStep (template + document),
//   - vérifie le lead (client), l'absence d'envoi antérieur,
//   - envoie l'email + PDFs via le gateway actif,
//   - crée le ClientStep et journalise dans EmailLog.
//
// Réponse : succès 200 ou erreur 400/404/500 avec message.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';
import { sendClientLevelEmail } from '@/app/api/_lib/client-level-sender';

const sendLevelSchema = z.object({
  stepId: z.string().min(1, 'stepId est requis'),
});

// POST /api/clients/[id]/send-level — envoie l'étape demandée au client.
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

    // Validation du corps de la requête.
    const [data, error] = await parseBody(req, sendLevelSchema);
    if (error) return error;

    // Vérifie l'existence du client (404 clair avant toute tentative d'envoi).
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!lead) {
      return errorResponse('Client introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Envoi effectif de l'étape.
    const result = await sendClientLevelEmail(id, data.stepId);

    if (!result.success) {
      // Erreurs métier (déjà envoyé, pas de template, pas de gateway...) → 400.
      return errorResponse(
        result.error ?? "Échec de l'envoi",
        'SEND_LEVEL_ERROR',
        { stepId: data.stepId },
        400,
      );
    }

    return successResponse(
      {
        message: `${result.stepName ?? 'Étape'} envoyé`,
        emailLogId: result.emailLogId,
        currentLevel: result.currentLevel,
      },
      200,
    );
  } catch (err) {
    console.error(`[POST /api/clients/[id]/send-level] Erreur:`, err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
