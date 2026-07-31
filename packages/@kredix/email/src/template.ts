import type { Lead } from '@kredix/db';

// =============================================================================
// @kredix/email/template — Interpolation des variables {{...}} dans les emails.
// =============================================================================
// Extrait depuis apps/admin/app/api/_lib/template-interpolation.ts.

// Traductions des types de prêt par langue.
// Fallback sur le français si la langue n'est pas trouvée.
const LOAN_TYPE_I18N: Record<string, Record<string, string>> = {
  fr: { immo: 'immobilier', conso: 'consommation', rachat: 'rachat de crédit', pro: 'professionnel', autre: 'personnel' },
  de: { immo: 'Immobilien', conso: 'Konsum', rachat: 'Umschuldung', pro: 'Geschäft', autre: 'Sonstiges' },
  en: { immo: 'mortgage', conso: 'consumer', rachat: 'debt consolidation', pro: 'business', autre: 'personal' },
  es: { immo: 'hipoteca', conso: 'consumo', rachat: 'reunificación de deudas', pro: 'empresarial', autre: 'personal' },
  pt: { immo: 'habitação', conso: 'consumo', rachat: 'consolidação de dívidas', pro: 'empresarial', autre: 'pessoal' },
  it: { immo: 'mutuo immobiliare', conso: 'consumo', rachat: 'consolidamento debiti', pro: 'aziendale', autre: 'personale' },
};

function translateLoanType(loanType: string, lang: string): string {
  const labels = LOAN_TYPE_I18N[lang] ?? LOAN_TYPE_I18N.fr;
  return labels[loanType] ?? LOAN_TYPE_I18N.fr[loanType] ?? loanType;
}

export interface InterpolationContext {
  lead: Pick<
    Lead,
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'amount'
    | 'durationYears'
    | 'monthlyPayment'
    | 'annualRate'
    | 'loanType'
    | 'companyName'
    | 'id'
    | 'createdAt'
    | 'offerSentAt'
    | 'unsubscribeToken'
    | 'preferredLanguage'
  > & {
    /** Prénom du conseiller assigné (si Lead.assignedTo chargé). */
    advisorName?: string | null;
  };
  siteUrl: string;
  customMessage?: string;
  /** Données de marque injectées dans l'interpolation. */
  brand?: BrandContext;
}

/** Variables marque disponibles dans les templates via {{NomSite}}, {{SiteUrl}}, etc. */
export interface BrandContext {
  siteName: string;
  logoUrl: string;
  contactEmail: string;
  agencyPhone: string;
  agencyAddress: string;
  advisorName: string;
}

export function buildUnsubscribeUrl(lead: InterpolationContext['lead'], siteUrl: string): string {
  return `${siteUrl}/api/unsubscribe?t=${lead.unsubscribeToken}`;
}

export function interpolateTemplate(text: string, ctx: InterpolationContext): string {
  const { lead, siteUrl, customMessage, brand } = ctx;
  const unsubscribeUrl = buildUnsubscribeUrl(lead, siteUrl);

  // Référence demande : prefix + 8 premiers chars du CUID.
  const reference = `KREDIX-${lead.id.slice(-8).toUpperCase()}`;

  // Date de soumission formatée (ex: 30/07/2026).
  const dateSoumission = lead.createdAt
    ? new Date(lead.createdAt).toLocaleDateString('fr-FR')
    : '';

  // Prénom du conseiller : priorité au paramètre global, fallback au conseiller assigné.
  const prenomConseiller = brand?.advisorName || lead.advisorName || 'votre conseiller';

  // Type de prêt traduit dans la langue du lead.
  const lang = lead.preferredLanguage || 'fr';
  const loanTypeLabel = translateLoanType(lead.loanType, lang);

  const replacements: Record<string, string> = {
    // Variables lead — PascalCase FR (originales)
    '{{Prénom}}': lead.firstName,
    '{{Nom}}': lead.lastName,
    '{{Email}}': lead.email ?? '',
    '{{Téléphone}}': lead.phone,
    '{{Montant}}': formatEuro(lead.amount),
    '{{TypePrêt}}': loanTypeLabel,
    '{{Durée}}': `${lead.durationYears} ans`,
    '{{Mensualité}}': lead.monthlyPayment ? `${formatEuro(lead.monthlyPayment)}/mois` : '—',
    '{{TAEG}}': lead.annualRate ? `${lead.annualRate.toFixed(2)}%` : '—',
    '{{LienDesinscription}}': unsubscribeUrl,
    '{{Message}}': customMessage ?? '',
    // Variables marque — PascalCase FR
    '{{NomSite}}': brand?.siteName ?? '',
    '{{SiteUrl}}': siteUrl,
    '{{LogoUrl}}': brand?.logoUrl ?? '',
    '{{ContactEmail}}': brand?.contactEmail ?? '',
    '{{TéléphoneAgence}}': brand?.agencyPhone ?? '',
    '{{AdresseAgence}}': brand?.agencyAddress ?? '',

    // ===== NOUVELLES VARIABLES (snake_case) =====
    '{{prenom}}': lead.firstName,
    '{{nom}}': lead.lastName,
    '{{nom_entreprise}}': lead.companyName ?? '',
    '{{reference_demande}}': reference,
    '{{date_soumission}}': dateSoumission,
    '{{date_envoi_offre}}': lead.offerSentAt
      ? new Date(lead.offerSentAt).toLocaleDateString('fr-FR')
      : '',
    '{{type_pret}}': loanTypeLabel,
    '{{montant_pret}}': formatEuro(lead.amount),
    '{{prenom_conseiller}}': prenomConseiller,
    '{{telephone_conseiller}}': brand?.agencyPhone ?? '',
    '{{email_conseiller}}': brand?.contactEmail ?? '',
    '{{adresse_siege}}': brand?.agencyAddress ?? '',
    '{{lien_desabonnement}}': unsubscribeUrl,
  };

  let result = text;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6;">
${escaped.split('\n').map((line) => `<p style="margin: 0 0 12px;">${line || '&nbsp;'}</p>`).join('\n')}
</body>
</html>`;
}
