import type { Lead } from '@kredix/db';
import { generateTrackingToken } from '@kredix/db';

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

// Locale BCP47 par code langue (pour formatage dates et montants).
const LOCALE_BY_LANG: Record<string, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-IE', // en-IE : format européen (€ après le nombre, point comme séparateur)
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
};

// Unités de durée par langue.
const DURATION_UNIT_I18N: Record<string, string> = {
  fr: 'ans', de: 'Jahre', en: 'years', es: 'años', pt: 'anos', it: 'anni',
};

// Suffixe mensualité par langue.
const MONTHLY_SUFFIX_I18N: Record<string, string> = {
  fr: '/mois', de: '/Monat', en: '/month', es: '/mes', pt: '/mês', it: '/mese',
};

// Fallback du nom du conseiller par langue.
const ADVISOR_FALLBACK_I18N: Record<string, string> = {
  fr: 'votre conseiller', de: 'Ihr Berater', en: 'your advisor',
  es: 'su asesor', pt: 'seu conselheiro', it: 'il tuo consulente',
};

function translateLoanType(loanType: string, lang: string): string {
  const labels = LOAN_TYPE_I18N[lang] ?? LOAN_TYPE_I18N.fr;
  return labels[loanType] ?? LOAN_TYPE_I18N.fr[loanType] ?? loanType;
}

function getLocale(lang: string): string {
  return LOCALE_BY_LANG[lang] ?? 'fr-FR';
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
    | 'reference'
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
  /** Contexte conseiller (DEC-K5). Si présent, surcharge les variables conseiller. */
  advisor?: AdvisorContext | null;
}

/** Variables marque disponibles dans les templates via {{NomSite}}, {{SiteUrl}}, etc. */
export interface BrandContext {
  siteName: string;
  logoUrl: string;
  contactEmail: string;
  agencyPhone: string;
  agencyAddress: string;
  advisorName: string;
  /** URL du formulaire de contact — {{url_formulaire}}. */
  formUrl?: string;
  /** URL Messenger — {{url_messenger}}. */
  messengerUrl?: string;
}

/** Contexte conseiller (DEC-K5 multi-admin).
 *  Issu de lead.assignedTo (AdminUser). Surcharge les variables conseiller
 *  {{prenom_conseiller}}, {{nom_conseiller}}, {{telephone_conseiller}}, {{email_conseiller}}.
 *  Si absent (lead non assigné) → fallback sur BrandContext (settings CMS). */
export interface AdvisorContext {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string;
  displayName: string;
}

export function buildUnsubscribeUrl(lead: InterpolationContext['lead'], siteUrl: string): string {
  return `${siteUrl}/api/unsubscribe?t=${lead.unsubscribeToken}`;
}

/**
 * Construit l'URL magique de la page /suivi pour un lead.
 * Le client clique → atterrit directement sur son suivi (pas de saisie du code).
 * Token stateless anti-énumération (cf. @kredix/db isValidTrackingToken).
 *
 * Format : {siteUrl}/{locale}/suivi?ref=KREDIX-XXXXXXXX&token=YYYY
 */
export function buildSuiviUrl(
  lead: InterpolationContext['lead'],
  siteUrl: string,
  reference: string,
): string {
  const locale = lead.preferredLanguage ?? 'fr';
  const token = generateTrackingToken(lead.id);
  return `${siteUrl}/${locale}/suivi?ref=${encodeURIComponent(reference)}&token=${token}`;
}

/**
 * Initiales du conseiller pour {{initiales_conseiller}}.
 * Ex: "Marie Lefèvre" → "ML", "Jean de la Fontaine" → "JD" (particules ignorées).
 * Retourne une chaîne vide si aucun nom exploitable.
 */
function buildAdvisorInitials(firstName: string | null | undefined, lastName: string | null | undefined): string {
  // Particules courantes ignorées (de, la, van, von...).
  const PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'van', 'von', 'der', 'den', 'del', 'di']);
  const words = `${firstName ?? ''} ${lastName ?? ''}`
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !PARTICLES.has(w.toLowerCase()));
  if (words.length === 0) return '';
  return words
    .slice(0, 2) // initiales = prénom + nom (max 2 lettres)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function interpolateTemplate(text: string, ctx: InterpolationContext): string {
  const { lead, siteUrl, customMessage, brand, advisor } = ctx;
  const unsubscribeUrl = buildUnsubscribeUrl(lead, siteUrl);

  const lang = lead.preferredLanguage || 'fr';
  const locale = getLocale(lang);

  // Référence demande : prefix + 8 premiers chars du CUID.
  // Référence publique : priorité à lead.reference (DB s44), fallback calcul à la volée
  // (rétro-compat leads pré-migration qui n'ont pas encore reference setté).
  const reference = lead.reference ?? `KREDIX-${lead.id.slice(-8).toUpperCase()}`;

  // Lien magique page /suivi (anti-énumération via token stateless).
  const suiviUrl = buildSuiviUrl(lead, siteUrl, reference);

  // Dates formatées selon la locale du lead.
  const dateSoumission = lead.createdAt
    ? new Date(lead.createdAt).toLocaleDateString(locale)
    : '';
  const dateEnvoiOffre = lead.offerSentAt
    ? new Date(lead.offerSentAt).toLocaleDateString(locale)
    : '';
  // L'offre expire 14 jours après l'envoi (couvre les 3 relances J+3, J+6, J+9).
  const dateExpirationOffre = lead.offerSentAt
    ? new Date(new Date(lead.offerSentAt).getTime() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString(locale)
    : '';

  // Variables conseiller (DEC-K5) : priorité admin assigné → settings CMS → fallback traduit.
  const prenomConseiller = advisor?.firstName
    || brand?.advisorName
    || lead.advisorName
    || (ADVISOR_FALLBACK_I18N[lang] ?? ADVISOR_FALLBACK_I18N.fr);
  const nomConseiller = advisor?.lastName ?? '';
  const telephoneConseiller = advisor?.phone || brand?.agencyPhone || '';
  const emailConseiller = advisor?.email || brand?.contactEmail || '';

  // Type de prêt + unités traduites.
  const loanTypeLabel = translateLoanType(lead.loanType, lang);
  const durationUnit = DURATION_UNIT_I18N[lang] ?? DURATION_UNIT_I18N.fr;
  const monthlySuffix = MONTHLY_SUFFIX_I18N[lang] ?? MONTHLY_SUFFIX_I18N.fr;

  // Initiales du conseiller ({{initiales_conseiller}}) — même cascade de
  // résolution que prenomConseiller : admin assigné → brand.advisorName →
  // lead.advisorName. Sur le nom complet du setting ("Marie Lefèvre"),
  // le split se fait sur les espaces.
  const advisorInitials = buildAdvisorInitials(advisor?.firstName, advisor?.lastName)
    || buildAdvisorInitials(null, brand?.advisorName || lead.advisorName || null);

  const replacements: Record<string, string> = {
    // Variables lead — PascalCase FR (originales)
    '{{Prénom}}': lead.firstName,
    '{{Nom}}': lead.lastName,
    '{{Email}}': lead.email ?? '',
    '{{Téléphone}}': lead.phone,
    '{{Montant}}': formatEuro(lead.amount, locale),
    '{{TypePrêt}}': loanTypeLabel,
    '{{Durée}}': `${lead.durationYears} ${durationUnit}`,
    '{{Mensualité}}': lead.monthlyPayment ? `${formatEuro(lead.monthlyPayment, locale)}${monthlySuffix}` : '—',
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
    '{{date_envoi_offre}}': dateEnvoiOffre,
    '{{date_expiration_offre}}': dateExpirationOffre,
    '{{type_pret}}': loanTypeLabel,
    '{{montant_pret}}': formatEuro(lead.amount, locale),
    '{{prenom_conseiller}}': prenomConseiller,
    '{{nom_conseiller}}': nomConseiller,
    '{{telephone_conseiller}}': telephoneConseiller,
    '{{email_conseiller}}': emailConseiller,
    '{{adresse_siege}}': brand?.agencyAddress ?? '',
    '{{lien_desabonnement}}': unsubscribeUrl,
    '{{lien_suivi}}': suiviUrl,
    // URLs configurables (settings CMS url_formulaire / url_messenger)
    '{{url_formulaire}}': brand?.formUrl ?? '',
    '{{url_messenger}}': brand?.messengerUrl ?? '',
    // Initiales du conseiller (ex: "ML" pour Marie Lefèvre)
    '{{initiales_conseiller}}': advisorInitials,
  };

  let result = text;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export function formatEuro(amount: number, locale: string = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function textToHtml(text: string, lang: string = 'fr'): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6;">
${escaped.split('\n').map((line) => `<p style="margin: 0 0 12px;">${line || '&nbsp;'}</p>`).join('\n')}
</body>
</html>`;
}
