// =============================================================================
// /api/campaigns/[id]/cancel — Annule une campagne en cours d'envoi.
// =============================================================================
// Le traitement async détecte le changement de statut et s'arrête de lui-même.

import { NextRequest } from 'next/server';
import { prisma, CampaignStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../../../_lib/auth-server';
import { getCampaignScope } from '../../../_lib/scope';
import { isValidId } from '@/app/api/_lib/id-validation';

// POST /api/campaigns/[id]/cancel — passe le statut à "cancelled".
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;

    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // findFirst avec scope : anti-IDOR (DEC-K5).
    const campaign = await prisma.campaign.findFirst({
      where: { id, ...getCampaignScope(admin) },
      select: { id: true, status: true, name: true },
    });

    if (!campaign) {
      return errorResponse('Campagne introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Seule une campagne en cours d'envoi peut être annulée.
    if (campaign.status !== CampaignStatus.sending) {
      return errorResponse(
        `Campagne non annulable (statut: ${campaign.status})`,
        ERR.CONFLICT.code,
        undefined,
        409,
      );
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.cancelled },
    });

    return successResponse(updated);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
