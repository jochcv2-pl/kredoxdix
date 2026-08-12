// =============================================================================
// /api/leads/[id]/tracking/[stepId] — Valide / dévalide une étape (s44)
// =============================================================================
// POST   : valide une étape (crée un LeadTracking).
// DELETE : dévalide une étape (supprime le LeadTracking).
//
// Permissions (Q7) :
//   - Validation : conseiller assigné au lead OU super-admin
//   - Dévalidation (Q9-A) : le validateur peut dévalider SA validation,
//     le super-admin peut dévalider n'importe laquelle.
//
// AUCUNE envoi d'email — système purement manuel pour la page /suivi publique.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../../../_lib/auth-server';
import { getLeadScope, isSuperAdmin } from '../../../../_lib/scope';
import { isValidId } from '@/app/api/_lib/id-validation';
import { logAudit } from '../../../../_lib/audit';

// Schéma optionnel pour POST (note interne possible).
const validateSchema = z.object({
  note: z.string().max(500).optional(),
});

// POST /api/leads/[id]/tracking/[stepId] — valide une étape.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id: leadId, stepId } = await params;
    if (!isValidId(leadId) || !isValidId(stepId)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Vérifie que le lead est dans le scope du conseiller (Q7 — DEC-K5).
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, ...getLeadScope(admin) },
      select: { id: true },
    });
    if (!lead) {
      return errorResponse('Lead introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Vérifie que l'étape existe et est active.
    const step = await prisma.trackingStep.findUnique({
      where: { id: stepId },
    });
    if (!step || !step.isActive) {
      return errorResponse('Étape introuvable ou inactive', ERR.NOT_FOUND.code, undefined, 404);
    }

    const [data, error] = await parseBody(req, validateSchema);
    if (error) return error;

    // Vérifie l'absence de validation existante (unique [leadId, trackingStepId]).
    const existing = await prisma.leadTracking.findUnique({
      where: { leadId_trackingStepId: { leadId, trackingStepId: stepId } },
    });
    if (existing) {
      return errorResponse(
        'Cette étape est déjà validée pour ce lead',
        ERR.CONFLICT.code,
        undefined,
        409,
      );
    }

    // Crée le LeadTracking (validatedById = admin connecté).
    const tracking = await prisma.leadTracking.create({
      data: {
        leadId,
        trackingStepId: stepId,
        validatedById: admin.id,
        note: data.note || null,
      },
      include: {
        trackingStep: true,
        validatedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await logAudit({
      admin,
      action: 'tracking_validate',
      entity: 'LeadTracking',
      entityId: tracking.id,
      metadata: { leadId, stepId, stepName: step.name },
    });

    return successResponse(tracking, 201);
  } catch (err) {
    console.error('[POST /api/leads/[id]/tracking/[stepId]] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/leads/[id]/tracking/[stepId] — dévalide une étape (Q9-A).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id: leadId, stepId } = await params;
    if (!isValidId(leadId) || !isValidId(stepId)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Charge la validation existante.
    const tracking = await prisma.leadTracking.findUnique({
      where: { leadId_trackingStepId: { leadId, trackingStepId: stepId } },
      include: { trackingStep: { select: { name: true } } },
    });
    if (!tracking) {
      return errorResponse('Validation introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }

    // Q9-A : dévalidation
    //   - Conseiller : peut dévalider SES PROPRES validations uniquement
    //   - Super-admin : peut dévalider n'importe laquelle
    if (!isSuperAdmin(admin) && tracking.validatedById !== admin.id) {
      return errorResponse(
        'Vous ne pouvez dévalider que vos propres validations',
        ERR.FORBIDDEN.code,
        undefined,
        403,
      );
    }

    await prisma.leadTracking.delete({
      where: { id: tracking.id },
    });

    await logAudit({
      admin,
      action: 'tracking_unvalidate',
      entity: 'LeadTracking',
      entityId: tracking.id,
      metadata: {
        leadId,
        stepId,
        stepName: tracking.trackingStep?.name,
        originalValidatorId: tracking.validatedById,
      },
    });

    return successResponse({ deleted: true });
  } catch (err) {
    console.error('[DELETE /api/leads/[id]/tracking/[stepId]] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
