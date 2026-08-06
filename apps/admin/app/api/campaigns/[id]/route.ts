// =============================================================================
// /api/campaigns/[id] — Détail d'une campagne (stats + destinataires récents).
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { getCampaignScope } from '../../_lib/scope';
import { isValidId } from '@/app/api/_lib/id-validation';

// DELETE /api/campaigns/[id] — supprime une campagne et ses destinataires.
export async function DELETE(
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
    const existing = await prisma.campaign.findFirst({
      where: { id, ...getCampaignScope(admin) },
      select: { id: true, status: true },
    });

    if (!existing) {
      return errorResponse('Campagne introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // On ne permet pas de supprimer une campagne en cours d'envoi.
    if (existing.status === 'sending') {
      return errorResponse(
        'Impossible de supprimer une campagne en cours d\'envoi. Annulez-la d\'abord.',
        ERR.CONFLICT.code,
        undefined,
        409,
      );
    }

    // Suppression en cascade manuelle : destinataires, puis campagne.
    await prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
    await prisma.campaign.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/campaigns/[id]] Erreur:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// Évite le static optimization (params est asynchrone).

export async function GET(
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
      include: {
        template: true,
        domain: { select: { domain: true, fromEmail: true } },
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
    const campaignData = { ...campaign, recipients: undefined };

    return successResponse({
      ...campaignData,
      statusCounts,
      recentRecipients,
    });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

export const dynamic = 'force-dynamic';
