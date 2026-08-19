// =============================================================================
// POST /api/templates/[id]/test — Envoie un template à une adresse de test.
// =============================================================================
// Body: { "email": "test@example.com" }
//
// Charge le template, interpole avec des données de démo (Jean Dupont, 250k€),
// et envoie l'email au destinataire de test via le gateway actif.
// L'email est préfixé [TEST] dans l'objet pour le distinguer.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '@/app/api/_lib/auth-server';
import { sendTestEmail } from '@/app/api/_lib/test-send';

const testSchema = z.object({
  email: z.string().email(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAdmin();
  if (deny) return deny;

  const { id } = await params;
  const [data, err] = await parseBody(req, testSchema);
  if (err) return err;

  try {
    const template = await prisma.emailTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        subject: true,
        bodyText: true,
        htmlContent: true,
        bannerEnabled: true,
        isConfidential: true,
        language: true,
      },
    });

    if (!template) {
      return errorResponse('Modèle introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    const result = await sendTestEmail(template, data.email, admin.id);

    if (!result.success) {
      return errorResponse(
        result.error ?? 'Échec de l\'envoi de test',
        ERR.INTERNAL.code,
        undefined,
        500,
      );
    }

    return successResponse({
      sent: true,
      message: `Email de test envoyé à ${data.email}`,
    });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
