// =============================================================================
// POST /api/campaigns/[id]/test — Envoie le template d'une campagne à une adresse de test.
// =============================================================================
// Body: { "email": "test@example.com" }
//
// Charge la campagne + son template, interpole avec des données de démo,
// et envoie l'email au destinataire de test via le gateway actif.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '@/app/api/_lib/auth-server';
import { getCampaignScope } from '@/app/api/_lib/scope';
import { sendTestEmail } from '@/app/api/_lib/test-send';

const testSchema = z.object({
  email: z.string().email(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;

  const { id } = await params;
  const [data, err] = await parseBody(req, testSchema);
  if (err) return err;

  try {
    // findFirst avec scope : anti-IDOR (DEC-K5). Un conseiller ne peut tester que ses campagnes.
    const campaign = await prisma.campaign.findFirst({
      where: { id, ...getCampaignScope(admin) },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            subject: true,
            bodyText: true,
            htmlContent: true,
            bannerEnabled: true,
            isConfidential: true,
          },
        },
      },
    });

    if (!campaign) {
      return errorResponse('Campagne introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    if (!campaign.template) {
      return errorResponse('Aucun template associé à cette campagne', ERR.VALIDATION.code, undefined, 422);
    }

    const result = await sendTestEmail(campaign.template, data.email, admin.id);

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
