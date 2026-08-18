// =============================================================================
// @kredix/email/layout — Wrapper HTML pour emails branded + helper brand data.
// =============================================================================
// Entoure le corps de l'email avec :
//   - Header : logo + nom du site + couleur primaire
//   - Footer : lien de désinscription, contact, mentions légales
//
// Si bannerEnabled = false → pas de header (email sobre).
// Le footer est TOUJOURS présent (conformité RGPD : lien de désinscription).
// =============================================================================

import { getSetting } from './settings';
import type { BrandContext, InterpolationContext } from './template';

export interface EmailBrandData {
  siteName: string;
  logoUrl: string;
  siteUrl: string;
  contactEmail: string;
  agencyPhone: string;
  agencyAddress: string;
  advisorName: string;
  primaryColor: string;
  /** URL du formulaire de contact (setting url_formulaire) — {{url_formulaire}}. */
  formUrl: string;
  /** URL Messenger (setting url_messenger) — {{url_messenger}}. */
  messengerUrl: string;
}

/**
 * Charge les données de marque depuis la table Setting.
 * Utilisé par tous les senders pour peupler le wrapper HTML + l'interpolation.
 */
export async function loadBrandData(): Promise<EmailBrandData> {
  const [siteName, logoUrl, siteUrl, contactEmail, agencyPhone, agencyAddress, advisorName, primaryColor, formUrl, messengerUrl] =
    await Promise.all([
      getSetting('site_name', 'Kredix'),
      getSetting('cms_logo_url', ''),
      getSetting('site_url', ''),
      getSetting('contact_email', ''),
      getSetting('contact_phone', ''),
      getSetting('agency_address', ''),
      getSetting('advisor_name', ''),
      getSetting('cms_primary_color', '#2B8BDE'),
      getSetting('url_formulaire', ''),
      getSetting('url_messenger', ''),
    ]);

  return { siteName, logoUrl, siteUrl, contactEmail, agencyPhone, agencyAddress, advisorName, primaryColor, formUrl, messengerUrl };
}

/**
 * Convertit les EmailBrandData en BrandContext pour l'interpolation des templates.
 */
export function brandToContext(brand: EmailBrandData): BrandContext {
  return {
    siteName: brand.siteName,
    logoUrl: brand.logoUrl,
    contactEmail: brand.contactEmail,
    agencyPhone: brand.agencyPhone,
    agencyAddress: brand.agencyAddress,
    advisorName: brand.advisorName,
    formUrl: brand.formUrl,
    messengerUrl: brand.messengerUrl,
  };
}

/**
 * Helper : charge les données marque et prépare un InterpolationContext enrichi.
 * Usage : const ctx = await buildInterpolationContext(lead, siteUrl);
 */
export async function buildInterpolationContext(
  lead: InterpolationContext['lead'],
  siteUrl: string,
  customMessage?: string,
): Promise<InterpolationContext> {
  const brand = await loadBrandData();
  return {
    lead,
    siteUrl,
    customMessage,
    brand: brandToContext(brand),
  };
}

export interface WrapEmailOptions {
  /** Contenu HTML déjà interpolé du template (body uniquement). */
  bodyHtml: string;
  /** Version texte brut (pour clients mail ne supportant pas le HTML). */
  bodyText?: string;
  /** Données de marque (site, logo, contact). */
  brand: EmailBrandData;
  /** URL complète de désinscription (avec token). */
  unsubscribeUrl: string;
  /** Si false, masque le header avec logo (footer reste). Défaut: true. */
  bannerEnabled?: boolean;
  /** Objet de l'email (affiché en pré-header). */
  subject?: string;
}

/**
 * Enveloppe un fragment HTML dans un document HTML minimal.
 *
 * PAS de header branded, PAS de footer branded.
 * Le corps du template est inséré tel quel dans <body>.
 */
export function wrapEmailHtml(opts: WrapEmailOptions): string {
  const { bodyHtml, subject } = opts;

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject ?? '')}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;">
${bodyHtml}
</body>
</html>`;
}

// =============================================================================
// composeEmailHtml — Point d'entrée UNIQUE pour composer un email prêt à envoyer.
// =============================================================================
// Les header/footer branded sont RETIRÉS — les emails sont envoyés tels quels.
//
// - Document HTML complet (template importé) → renvoyé TEL QUEL.
// - Fragment HTML (texte / IA) → enveloppé dans un document HTML minimal
//   (sans header ni footer branded).
// =============================================================================

const FULL_DOC_RE = /<(!doctype\s+html|html[\s>]|body[\s>])/i;

export interface ComposeOptions {
  /** Contenu HTML déjà interpolé du template (body OU document complet). */
  bodyHtml: string;
  /** Version texte brut (pour clients mail ne supportant pas le HTML). */
  bodyText?: string;
  /** Données de marque (site, logo, contact). */
  brand: EmailBrandData;
  /** URL complète de désinscription (avec token). */
  unsubscribeUrl: string;
  /** Si false, masque le header avec logo (footer reste). Défaut: true. */
  bannerEnabled?: boolean;
  /** Objet de l'email (affiché en pré-header pour les fragments). */
  subject?: string;
}

/**
 * Compose un email prêt à l'envoi.
 *
 * - Document HTML complet (importé) → renvoyé TEL QUEL, sans aucune modification.
 * - Fragment HTML (texte) → enveloppé dans un document HTML minimal sans header/footer.
 *
 * À utiliser par TOUS les senders (cron, campaign, client-level, email-ack).
 */
export function composeEmailHtml(opts: ComposeOptions): string {
  const isFullDocument = FULL_DOC_RE.test(opts.bodyHtml);
  return isFullDocument
    ? opts.bodyHtml
    : wrapEmailHtml(opts);
}

// --- Utils ---

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
