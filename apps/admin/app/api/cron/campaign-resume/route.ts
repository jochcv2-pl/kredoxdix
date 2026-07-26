// =============================================================================
// POST /api/cron/campaign-resume
// =============================================================================
// Job cron de reprise des campagnes en cours d'envoi.
// Protégé par header Authorization: Bearer <CRON_SECRET> (env var).
//
// Le cron :
//   1. Trouve les campagnes en statut "sending" avec des destinataires "pending".
//   2. Relance processCampaign(id) en fire-and-forget pour chacune.
//
// À exécuter toutes les 5 minutes :
//   */5 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3101/api/cron/campaign-resume
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma, CampaignStatus, CampaignRecipientStatus } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { verifyBearerSecret } from '../../_lib/security';
import { processCampaign } from '../../_lib/campaign-sender';

export async function POST(req: NextRequest) {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401);
  }

  try {
    // Campagnes "sending" qui ont encore des destinataires en attente.
    const sendingCampaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.sending,
        recipients: {
          some: { status: CampaignRecipientStatus.pending },
        },
      },
      select: { id: true, name: true },
    });

    let resumed = 0;
    for (const c of sendingCampaigns) {
      // Fire-and-forget : processCampaign tourne en arrière-plan.
      processCampaign(c.id).catch((err) =>
        console.error(`[cron campaign-resume] Erreur campagne ${c.id}:`, err),
      );
      resumed++;
      console.log(`[cron campaign-resume] Reprise campagne "${c.name}" (${c.id})`);
    }

    return successResponse({
      checked: sendingCampaigns.length,
      resumed,
      campaignIds: sendingCampaigns.map((c) => c.id),
    });
  } catch (err) {
    console.error('[cron campaign-resume] Erreur:', err);
    return successResponse({ checked: 0, resumed: 0, error: 'Internal error' });
  }
}
