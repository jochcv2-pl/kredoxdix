// =============================================================================
// /api/leads/[id]/tracking — Liste l'avancement tracking d'un lead (s44)
// =============================================================================
// Retourne :
//   - Toutes les TrackingStep actives (ordre croissant)
//   - Les LeadTracking déjà validées pour ce lead (avec validateur)
//
// Permissions (Q7) : requireAuth + scope DEC-K5 (conseiller ne voit que ses leads).
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../../../_lib/auth-server';
import { getLeadScope } from '../../../_lib/scope';
import { isValidId } from '@/app/api/_lib/id-validation';

// GET /api/leads/[id]/tracking — avancement tracking d'un lead.
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

    // Vérifie que le lead est dans le scope du conseiller (Q7 — DEC-K5).
    const lead = await prisma.lead.findFirst({
      where: { id, ...getLeadScope(admin) },
      select: { id: true, reference: true, status: true, firstName: true, lastName: true },
    });
    if (!lead) {
      return errorResponse('Lead introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Charge toutes les étapes tracking actives + les validations existantes du lead.
    const [steps, trackings] = await Promise.all([
      prisma.trackingStep.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
      }),
      prisma.leadTracking.findMany({
        where: { leadId: id },
        include: {
          validatedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return successResponse({
      lead,
      steps,
      trackings,
    });
  } catch (err) {
    console.error('[GET /api/leads/[id]/tracking] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
