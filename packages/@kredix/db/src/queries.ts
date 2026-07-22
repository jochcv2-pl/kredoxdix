// =============================================================================
// Queries réutilisables côté server (apps/web et apps/admin).
// Independantes de toute logique HTTP — juste du Prisma.
// =============================================================================

import type { ApplicableRate, LoanType } from '@kredix/types';
import { prisma } from '../prisma/client';

/**
 * Récupère tous les taux ACTIFS des banques partenaires ACTIVES,
 * mis au format `ApplicableRate` pour alimenter le simulateur.
 *
 * Filtre optionnel par `loanType` (sinon tous types confondus).
 *
 * Utilisé par :
 *   - apps/web : rendu SSR du simulateur + /api/simulate
 *   - apps/admin : export / comparaison
 *
 * @returns tableau de paliers triés par loanType puis amountMin croissant.
 */
export async function getActiveRates(loanType?: LoanType): Promise<ApplicableRate[]> {
  const rates = await prisma.rate.findMany({
    where: {
      isActive: true,
      ...(loanType ? { loanType } : {}),
      bank: { isActive: true },
    },
    include: {
      bank: { select: { id: true, name: true } },
    },
    orderBy: [{ loanType: 'asc' }, { amountMin: 'asc' }],
  });

  return rates.map((r) => ({
    bankId: r.bankId,
    bankName: r.bank.name,
    loanType: r.loanType as LoanType,
    amountMin: r.amountMin,
    amountMax: r.amountMax,
    annualRate: r.annualRate,
  }));
}

/**
 * Récupère un dictionnaire { clé -> valeur } des settings globaux.
 *
 * Filtre optionnel par `category` (ex: 'cms.hero', 'contact').
 * Utilisé pour le rendu dynamique de la landing publique et les vues admin.
 *
 * @returns une Map clé→valeur (valeurs en string, parsing à la charge de l'app).
 */
export async function getPublicSettings(category?: string): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany({
    where: category ? { category } : {},
    select: { key: true, value: true },
  });
  const out: Record<string, string> = {};
  for (const s of settings) out[s.key] = s.value;
  return out;
}
