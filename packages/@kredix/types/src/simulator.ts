import type { LoanType, ApplicableRate } from './loan';

// Paramètres d'entrée du simulateur (côté client ET backend)
export interface SimulatorInput {
  loanType: Exclude<LoanType, 'autre'>;
  amount: number; // en euros, 5000 <= amount <= 500000
  durationYears: number; // 1 <= durationYears <= 30
}

// Résultat du calcul du simulateur
export interface SimulatorResult {
  monthlyPayment: number; // mensualité en euros
  totalCost: number; // coût total du crédit (mensualité × mois)
  annualRate: number; // taux annuel en pourcentage (ex: 3.5 pour 3.5%)
  monthlyRate: number; // taux mensuel en décimal (ex: 0.002917 pour 3.5%)
  totalMonths: number; // durée en mois
}

// Durée en années : paliers du select du formulaire
export const DURATION_OPTIONS: readonly number[] = [5, 10, 15, 20, 25, 30] as const;

// Bornes du simulateur (extraites du HTML)
export const SIMULATOR_LIMITS = {
  AMOUNT_MIN: 5000,
  AMOUNT_MAX: 500000,
  AMOUNT_STEP: 5000,
  DURATION_MIN: 1,
  DURATION_MAX: 30,
} as const;

/**
 * Sélectionne le meilleur taux (le plus bas) parmi une liste de paliers
 * applicables pour le montant et le type de prêt demandés.
 *
 * Règle : un palier matche si `amountMin <= amount <= amountMax`.
 * En cas de chevauchement de paliers entre plusieurs banques, le taux le
 * plus bas gagne (c'est l'offre la plus compétitive que le courtier met en
 * avant). En cas d'égalité, le premier trouvé gagne (ordre stable côté DB).
 *
 * @returns le taux applicable, ou `null` si aucun palier ne matche.
 */
export function findBestRate(
  amount: number,
  loanType: LoanType,
  rates: readonly ApplicableRate[],
): ApplicableRate | null {
  const candidates = rates.filter(
    (r) =>
      r.loanType === loanType &&
      amount >= r.amountMin &&
      amount <= r.amountMax,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) =>
    cur.annualRate < best.annualRate ? cur : best,
  );
}
