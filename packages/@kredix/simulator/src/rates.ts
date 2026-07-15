import { LOAN_TYPE_BASE_RATES, type LoanType } from '@kredix/types';

/**
 * Détermine le taux indicatif en fonction du montant et du type de prêt.
 *
 * Règle extraite du HTML de référence (kredix-site.html, fonction getRate) :
 *   - montant >= 200 000 € → taux 2,0 % (effet volume)
 *   - montant >= 100 000 € → taux 2,5 %
 *   - sinon               → taux de base du type de prêt
 *
 * Ces paliers sont indicatifs et seront remplacés par les taux réels
 * des banques partenaires en Phase 2 (backend API).
 */
export function getIndicativeRate(
  amount: number,
  loanType: Exclude<LoanType, 'autre'>
): number {
  if (amount >= 200_000) return 2.0;
  if (amount >= 100_000) return 2.5;
  return LOAN_TYPE_BASE_RATES[loanType];
}
