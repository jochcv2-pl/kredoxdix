// =============================================================================
// /api/rates — Liste et création des taux par banque / type de prêt / palier.
// Modèle : Rate { bankId, loanType, amountMin, amountMax, annualRate, isActive }.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth, requireAdmin } from '../_lib/auth-server';

// Schéma de création — bankId optionnel (taux générique sans banque).
// La contrainte d'unicité est (bankId, loanType, amountMin, amountMax) ; pour
// les taux génériques (bankId null), l'unicité est vérifiée côté applicatif.
const createRateSchema = z.object({
  bankId: z.string().min(1).optional().nullable(),
  loanType: z.string().min(1),
  amountMin: z.number().int().nonnegative(),
  amountMax: z.number().int().nonnegative(),
  annualRate: z.number().nonnegative(),
  isActive: z.boolean().default(true),
}).refine((d) => d.amountMin <= d.amountMax, {
  message: 'amountMin doit être ≤ amountMax',
  path: ['amountMax'],
});

// GET /api/rates — liste filtrable par banque et/ou type de prêt.
// Ex: /api/rates?bankId=xxx  /api/rates?loanType=immo
export async function GET(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const bankId = req.nextUrl.searchParams.get('bankId');
    const loanType = req.nextUrl.searchParams.get('loanType');
    const activeOnly = req.nextUrl.searchParams.get('active') === 'true';

    const rates = await prisma.rate.findMany({
      where: {
        ...(bankId ? { bankId } : {}),
        ...(loanType ? { loanType } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: { bank: { select: { id: true, name: true, slug: true } } },
      orderBy: [
        { bank: { name: 'asc' } },
        { loanType: 'asc' },
        { amountMin: 'asc' },
      ],
    });

    return successResponse(rates);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/rates — crée un taux (409 si le palier existe déjà pour cette banque/type).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createRateSchema);
    if (error) return error;

    // Vérifie l'existence de la banque (uniquement si bankId fourni).
    const hasBank = !!data.bankId;
    if (hasBank) {
      const bank = await prisma.bankPartner.findUnique({ where: { id: data.bankId! } });
      if (!bank) {
        return errorResponse('Banque introuvable', ERR.NOT_FOUND.code, undefined, 404);
      }
    }

    // Contrainte d'unicité (bankId, loanType, amountMin, amountMax).
    // Pour les taux génériques (bankId null), on vérifie aussi côté applicatif
    // car PostgreSQL traite les NULL comme distincts dans les contraintes unique.
    const existing = await prisma.rate.findFirst({
      where: {
        bankId: data.bankId ?? null,
        loanType: data.loanType,
        amountMin: data.amountMin,
        amountMax: data.amountMax,
      },
    });
    if (existing) {
      return errorResponse(
        hasBank
          ? 'Un taux existe déjà pour ce palier (banque/type/montants)'
          : 'Un taux générique existe déjà pour ce palier (type/montants)',
        ERR.CONFLICT.code,
        undefined,
        409,
      );
    }

    const rate = await prisma.rate.create({
      data,
      include: { bank: { select: { id: true, name: true, slug: true } } },
    });
    return successResponse(rate, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
