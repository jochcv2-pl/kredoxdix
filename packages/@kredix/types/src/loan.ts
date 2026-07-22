// Types liés aux prêts et crédits

export type LoanType = 'immo' | 'conso' | 'rachat' | 'pro' | 'autre';

export type EmploymentStatus =
  | 'cdi'
  | 'cdd'
  | 'independent'
  | 'civil-servant'
  | 'retired'
  | 'unemployed';

// Taux indicatif par type de prêt (extrait du HTML de référence kredix-site.html)
export const LOAN_TYPE_BASE_RATES: Record<Exclude<LoanType, 'autre'>, number> = {
  immo: 3.5,
  conso: 5.9,
  rachat: 4.5,
  pro: 4.2,
};

export const LOAN_TYPE_LABELS_FR: Record<LoanType, string> = {
  immo: 'Prêt immobilier',
  conso: 'Prêt à la consommation',
  rachat: 'Rachat de crédits',
  pro: 'Prêt professionnel',
  autre: 'Autre',
};

export interface LoanTypeOption {
  value: LoanType;
  label: string;
  baseRate: number | null; // null pour 'autre'
}

/**
 * Taux applicable provenant d'une banque partenaire (modèle Rate en DB).
 * Format minimal nécessaire au simulateur pour choisir le meilleur taux.
 */
export interface ApplicableRate {
  bankId: string;
  bankName?: string;
  loanType: LoanType;
  amountMin: number; // palier bas (inclusif)
  amountMax: number; // palier haut (inclusif)
  annualRate: number; // taux annuel en % (ex: 3.45)
}
