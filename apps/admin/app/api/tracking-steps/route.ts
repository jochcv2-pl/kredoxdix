// =============================================================================
// /api/tracking-steps — Liste et création des étapes de suivi dossier (s44)
// =============================================================================
// Système de suivi PUBLIC (page /suivi côté client).
// INDÉPENDANT du pipeline email (PipelineStep) — aucune envoi d'email.
// Chaque étape est validée manuellement par le conseiller (cf. LeadTracking).
//
// Permissions :
//   - GET (liste) : requireAuth (tous les conseillers voient les étapes
//     pour les appliquer à leurs leads)
//   - POST (création) : requireAdmin (super-admin only — config globale)
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth, requireAdmin } from '../_lib/auth-server';
import { logAudit } from '../_lib/audit';

// GET /api/tracking-steps — liste toutes les étapes, triées par order.
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const steps = await prisma.trackingStep.findMany({
      orderBy: { order: 'asc' },
    });
    return successResponse(steps);
  } catch (err) {
    console.error('[GET /api/tracking-steps] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// Schéma de création.
const createStepSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(100),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),        // nom d'icône lucide-react (ex: "check-circle")
  isActive: z.boolean().default(true),
});

// POST /api/tracking-steps — crée une nouvelle étape (à la fin du parcours).
// Super-admin only (config globale).
export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createStepSchema);
    if (error) return error;

    // Calcule l'ordre suivant (max + 1).
    const maxOrder = await prisma.trackingStep.aggregate({
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? 0) + 1;

    const step = await prisma.trackingStep.create({
      data: {
        order: nextOrder,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon || null,
        isActive: data.isActive,
      },
    });

    await logAudit({
      admin,
      action: 'tracking_step_create',
      entity: 'TrackingStep',
      entityId: step.id,
      diff: { name: step.name, order: step.order },
    });

    return successResponse(step, 201);
  } catch (err) {
    console.error('[POST /api/tracking-steps] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
