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

/**
 * Récupère les témoignages VISIBLES pour une locale donnée, triés par `order`.
 * Utilisé côté web (rendu SSR de la section Avis).
 *
 * @param locale  code langue ('de', 'fr', 'en'...) — 'de' par défaut (DEFAULT_LOCALE)
 */
export async function getVisibleTestimonials(locale = 'de') {
  return prisma.testimonial.findMany({
    where: { locale, isVisible: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  });
}

/**
 * Récupère un bloc de contenu éditorial pour une section + locale.
 * Retourne `null` si aucun bloc n'existe (l'app utilise alors le fallback i18n).
 *
 * @param section  'engagements' | 'services' | ... (clé technique)
 * @param locale   code langue — 'de' par défaut
 */
export async function getContentBlock(section: string, locale = 'de') {
  return prisma.contentBlock.findUnique({
    where: { section_locale: { section, locale } },
  });
}

/**
 * Récupère toutes les pages légales ACTIVES, triées par `order`.
 * Utilisé côté web pour construire dynamiquement les liens du footer.
 */
export async function getActiveLegalPages(locale?: string) {
  return prisma.legalPage.findMany({
    where: { isActive: true, ...(locale ? { locale } : {}) },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, slug: true, title: true, category: true, order: true, locale: true },
  });
}

/**
 * Récupère tous les partenaires bancaires ACTIFS pour la section "Nos partenaires".
 */
export async function getActiveBankPartners() {
  return prisma.bankPartner.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });
}
