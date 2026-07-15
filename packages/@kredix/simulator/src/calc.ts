import type { SimulatorInput, SimulatorResult } from '@kredix/types';
import { getIndicativeRate } from './rates';

/**
 * Calcule la mensualité, le coût total et les taux à partir des entrées.
 *
 * Formule d'amortissement classique (annuité constante) :
 *   M = C × (r / (1 - (1 + r)^-n))
 * où :
 *   C = capital emprunté
 *   r = taux mensuel (= taux annuel / 12 / 100)
 *   n = nombre de mensualités
 *
 * Cas particulier : si r = 0 (taux zéro), mensualité = C / n.
 *
 * @throws Error si les entrées sont hors bornes (à valider en amont par Zod).
 */
export function calculateLoan(input: SimulatorInput): SimulatorResult {
  const { amount, durationYears, loanType } = input;

  // Garde-fou : la validation stricte se fait côté API (Zod),
  // mais on protège ici aussi contre les valeurs aberrantes.
  if (amount <= 0 || durationYears <= 0) {
    throw new Error(
      `Invalid simulator input: amount=${amount}, durationYears=${durationYears}`
    );
  }

  const annualRate = getIndicativeRate(amount, loanType);
  const monthlyRate = annualRate / 100 / 12;
  const totalMonths = durationYears * 12;

  const monthlyPayment =
    monthlyRate === 0
      ? amount / totalMonths
      : (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths));

  const totalCost = monthlyPayment * totalMonths;

  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalCost: Math.round(totalCost),
    annualRate,
    monthlyRate,
    totalMonths,
  };
}

/**
 * Arrondit une durée en années au palier le plus proche parmi ceux du select.
 * Utilisé par l'autofill du simulateur vers le formulaire.
 */
export function roundToDurationStep(
  years: number,
  steps: readonly number[]
): number {
  return steps.reduce((closest, step) =>
    Math.abs(step - years) < Math.abs(closest - years) ? step : closest
  );
}

/**
 * Formate un nombre au format français (espaces comme séparateurs de milliers).
 * Ex: 150000 -> "150 000"
 */
export function formatFrenchNumber(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ');
}
