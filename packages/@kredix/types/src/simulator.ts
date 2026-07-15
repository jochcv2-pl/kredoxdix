import type { LoanType } from './loan';

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
