// =============================================================================
// /api/banks — Liste des banques partenaires (pour le sélecteur de la vue Taux).
// Lecture seule pour l'instant — création/édition des banques sera ajoutée
// plus tard (écran dédié).
// =============================================================================

import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';

// GET /api/banks — liste triée par displayOrder, avec compte de taux actifs.
export async function GET() {
  try {
    const banks = await prisma.bankPartner.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { rates: { where: { isActive: true } } },
        },
      },
    });
    return successResponse(banks);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
