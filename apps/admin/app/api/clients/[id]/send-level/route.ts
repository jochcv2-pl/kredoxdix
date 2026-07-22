// =============================================================================
// /api/clients/[id]/send-level — Déclenche l'envoi d'un niveau du parcours client.
// =============================================================================
// Body : { level: 1..7 }
// Appelle client-level-sender qui :
//   - vérifie le lead (client), l'absence d'envoi antérieur, le template actif,
//   - envoie l'email + PDFs via le gateway actif,
//   - crée le ClientStep et journalise dans EmailLog.
//
// Réponse : succès 200 ou erreur 400/404/500 avec message.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { sendClientLevelEmail } from '@/app/api/_lib/client-level-sender';

const sendLevelSchema = z.object({
  level: z.number().int().min(1).max(7),
});

// POST /api/clients/[id]/send-level — envoie le niveau demandé au client.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    // Envoi effectif du niveau.
    const result = await sendClientLevelEmail(id, data.level);

    if (!result.success) {
      // Erreurs métier (déjà envoyé, pas de template, pas de gateway...) → 400.
      return errorResponse(
        result.error ?? "Échec de l'envoi",
        'SEND_LEVEL_ERROR',
        { level: data.level },
        400,
      );
    }

    return successResponse(
      {
        message: `Niveau ${data.level} envoyé`,
        level: data.level,
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
