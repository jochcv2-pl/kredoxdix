// =============================================================================
// /api/campaigns/[id] — Détail d'une campagne (stats + destinataires récents).
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';

// GET /api/campaigns/[id] — détail + stats groupées par statut.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;

    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        recipients: { select: { status: true } },
      },
    });

    if (!campaign) {
      return errorResponse('Campagne introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Compteurs par statut (calculés côté JS depuis la liste des statuts).
    const statusCounts: Record<string, number> = {
      pending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };
    for (const r of campaign.recipients) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }

    // 20 derniers destinataires traités pour la vue progression.
    const recentRecipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: id },
      orderBy: { id: 'desc' },
      take: 20,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        sentAt: true,
        error: true,
      },
    });

    // On retire le tableau brut des recipients (déjà agrégé dans statusCounts).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { recipients, ...campaignData } = campaign;

    return successResponse({
      ...campaignData,
      statusCounts,
      recentRecipients,
    });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
