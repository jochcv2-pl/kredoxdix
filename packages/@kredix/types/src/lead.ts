import type { LoanType, EmploymentStatus } from './loan';

// Demande déposée par un prospect via le formulaire
export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  city: string;
  loanType: LoanType;
  amount: number;
  durationYears: number;
  employmentStatus: EmploymentStatus;
  status: LeadStatus;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export type LeadStatus =
  | 'pending' // nouveau, non traité
  | 'contacted' // conseiller a contacté le prospect
  | 'qualified' // dossier qualifié, en négociation
  | 'financed' // crédit obtenu
  | 'rejected'; // refusé

// Payload de création d'un lead (validation côté API)
export interface CreateLeadInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  city: string;
  loanType: LoanType;
  amount: number;
  durationYears: number;
  employmentStatus: EmploymentStatus;
}

// Toutes les valeurs autorisées pour le select situation pro (HTML de référence)
export const EMPLOYMENT_STATUS_LABELS_FR: Record<EmploymentStatus, string> = {
  cdi: 'Salarié CDI',
  cdd: 'Salarié CDD',
  independent: 'Indépendant / Auto-entrepreneur',
  'civil-servant': 'Fonctionnaire',
  retired: 'Retraité',
  unemployed: 'Sans emploi',
};
