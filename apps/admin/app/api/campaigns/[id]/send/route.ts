// =============================================================================
// /api/campaigns/[id]/send — Déclenche l'envoi asynchrone d'une campagne.
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma, CampaignStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../../../_lib/auth-server';
import { getCampaignScope } from '../../../_lib/scope';
import { isValidId } from '@/app/api/_lib/id-validation';
import { processCampaign } from '@/app/api/_lib/campaign-sender';

// POST /api/campaigns/[id]/send — passe en "sending" + lance le traitement async.
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
      select: { id: true, status: true, name: true, totalRecipients: true },
    });

    if (!campaign) {
      return errorResponse('Campagne introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Seule une campagne en brouillon peut être envoyée.
    if (campaign.status !== CampaignStatus.draft) {
      return errorResponse(
        `Campagne non envoyable (statut: ${campaign.status})`,
        ERR.CONFLICT.code,
        undefined,
        409,
      );
    }

    // Il faut au moins un destinataire en attente.
    const pendingCount = await prisma.campaignRecipient.count({
      where: { campaignId: id, status: 'pending' },
    });
    if (pendingCount === 0) {
      return errorResponse(
        'Aucun destinataire en attente',
        ERR.CONFLICT.code,
        undefined,
        409,
      );
    }

    // Passage en "sending" + horodatage du démarrage.
    await prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.sending, startedAt: new Date() },
    });

    // Fire-and-forget : le traitement tourne en arrière-plan.
    processCampaign(id).catch((err) =>
      console.error(`[campaign ${id}] Erreur traitement:`, err instanceof Error ? err.message : String(err)),
    );

    return successResponse(
      { id, name: campaign.name, status: CampaignStatus.sending, pendingCount },
      202,
    );
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
