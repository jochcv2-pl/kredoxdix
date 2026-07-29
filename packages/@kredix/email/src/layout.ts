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
  primaryColor: string;
}

/**
 * Charge les données de marque depuis la table Setting.
 * Utilisé par tous les senders pour peupler le wrapper HTML + l'interpolation.
 */
export async function loadBrandData(): Promise<EmailBrandData> {
  const [siteName, logoUrl, siteUrl, contactEmail, agencyPhone, agencyAddress, primaryColor] =
    await Promise.all([
      getSetting('site_name', 'Kredix'),
      getSetting('cms_logo_url', ''),
      getSetting('site_url', ''),
      getSetting('contact_email', ''),
      getSetting('agency_phone', ''),
      getSetting('agency_address', ''),
      getSetting('cms_primary_color', '#2B8BDE'),
    ]);

  return { siteName, logoUrl, siteUrl, contactEmail, agencyPhone, agencyAddress, primaryColor };
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

export interface EmailBrandData {
  siteName: string;
  logoUrl: string;
  siteUrl: string;
  contactEmail: string;
  agencyPhone: string;
  agencyAddress: string;
  primaryColor: string;
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
 * Entoure le corps HTML d'un email avec un header et footer branded.
 *
 * Le template HTML produit est :
 *   <!DOCTYPE html>
 *   <html>
 *     <body>
 *       [HEADER — logo + site name + couleur]
 *       [BODY  — contenu interpolé du template]
 *       [FOOTER — unsubscribe + contact + mentions]
 *     </body>
 *   </html>
 */
export function wrapEmailHtml(opts: WrapEmailOptions): string {
  const { bodyHtml, brand, unsubscribeUrl, bannerEnabled = true, subject } = opts;

  const header = bannerEnabled
    ? buildHeader(brand)
    : '';

  const footer = buildFooter(brand, unsubscribeUrl);

  // Pre-header caché (aperçu dans la boîte de réception).
  const preheader = subject
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#fff;opacity:0;">${escapeHtml(subject)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject ?? brand.siteName)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

${header}
${buildBody(bodyHtml)}
${footer}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Header ---

function buildHeader(brand: EmailBrandData): string {
  const logoHtml = brand.logoUrl
    ? `<img src="${escapeAttr(brand.logoUrl)}" alt="${escapeAttr(brand.siteName)}" style="height:36px;max-width:180px;object-fit:contain;display:inline-block;vertical-align:middle;" />`
    : '';

  const nameHtml = brand.logoUrl
    ? ''  // Si logo, on n'affiche pas le nom à côté
    : `<span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(brand.siteName)}</span>`;

  return `          <!-- HEADER -->
          <tr>
            <td style="background:${escapeAttr(brand.primaryColor)};padding:20px 32px;text-align:left;">
              ${logoHtml}${nameHtml}
            </td>
          </tr>`;
}

// --- Body ---

function buildBody(bodyHtml: string): string {
  return `          <!-- BODY -->
          <tr>
            <td style="padding:32px 32px 24px;">
              ${bodyHtml}
            </td>
          </tr>`;
}

// --- Footer ---

function buildFooter(brand: EmailBrandData, unsubscribeUrl: string): string {
  const contactParts: string[] = [];
  if (brand.contactEmail) {
    contactParts.push(`<a href="mailto:${escapeAttr(brand.contactEmail)}" style="color:#94a3b8;text-decoration:underline;">${escapeHtml(brand.contactEmail)}</a>`);
  }
  if (brand.agencyPhone) {
    contactParts.push(escapeHtml(brand.agencyPhone));
  }
  if (brand.agencyAddress) {
    contactParts.push(escapeHtml(brand.agencyAddress));
  }

  const contactLine = contactParts.length > 0
    ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">${contactParts.join(' · ')}</div>`
    : '';

  return `          <!-- FOOTER -->
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #e5e7eb;background:#fafbfc;">
              ${contactLine}
              <div style="font-size:11px;color:#cbd5e1;line-height:1.6;">
                © ${new Date().getFullYear()} ${escapeHtml(brand.siteName)}. Tous droits réservés.<br>
                Vous recevez cet email car vous avez demandé une simulation de crédit.<br>
                <a href="${escapeAttr(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline;">Se désinscrire</a>
                ${brand.siteUrl ? ` · <a href="${escapeAttr(brand.siteUrl)}" style="color:#94a3b8;text-decoration:underline;">${escapeHtml(brand.siteName)}</a>` : ''}
              </div>
            </td>
          </tr>`;
}

// =============================================================================
// composeEmailHtml — Point d'entrée UNIQUE pour composer un email prêt à envoyer.
// =============================================================================
// Décide intelligemment entre :
//   - Document HTML complet (template importé OU éditeur de blocs) → on PRÉSERVE
//     le design original. On injecte uniquement un pied de page de désinscription
//     RGPD discret avant </body>. AUCUN ré-emballage (sinon double <html>/header).
//   - Fragment HTML (texte brut / IA → textToHtml = simples <p>) → on applique
//     wrapEmailHtml complet (header logo + footer branded).
//
// La détection se base sur la présence de balises structurelles (<html>, <body>,
// <!doctype>) qui n'existent QUE dans un document HTML complet.
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
 * Compose un email prêt à l'envoi en préservant le design des templates HTML
 * complets, ou en enveloppant les fragments de texte avec un wrapper branded.
 *
 * À utiliser par TOUS les senders (cron, campaign, client-level, email-ack).
 */
export function composeEmailHtml(opts: ComposeOptions): string {
  const isFullDocument = FULL_DOC_RE.test(opts.bodyHtml);
  return isFullDocument
    ? injectUnsubscribeFooter(opts.bodyHtml, opts.brand, opts.unsubscribeUrl)
    : wrapEmailHtml(opts);
}

/**
 * Injecte un pied de page de désinscription RGPD discret dans un document HTML
 * complet, SANS modifier le design original du modèle.
 *
 * Le footer est inséré juste avant </body> (ou </html>, ou en fin de document).
 * Il contient le lien de désinscription (obligation RGPD) et les coordonnées.
 */
function injectUnsubscribeFooter(
  html: string,
  brand: EmailBrandData,
  unsubscribeUrl: string,
): string {
  const footer = buildInlineFooter(brand, unsubscribeUrl);

  // Injection avant </body> (cas le plus fréquent).
  const bodyClose = html.match(/<\/body>\s*/i);
  if (bodyClose && bodyClose.index !== undefined) {
    return (
      html.slice(0, bodyClose.index) +
      footer +
      html.slice(bodyClose.index)
    );
  }
  // Fallback : avant </html>.
  const htmlClose = html.match(/<\/html>\s*$/i);
  if (htmlClose && htmlClose.index !== undefined) {
    return (
      html.slice(0, htmlClose.index) +
      footer +
      html.slice(htmlClose.index)
    );
  }
  // Aucune balise de fermeture → on append.
  return html + footer;
}

/**
 * Pied de page autonome (table-based, compatible tous clients mail) injecté
 * dans les documents HTML complets. Style sobre pour s'intégrer discrètement.
 */
function buildInlineFooter(brand: EmailBrandData, unsubscribeUrl: string): string {
  const contactParts: string[] = [];
  if (brand.contactEmail) {
    contactParts.push(`<a href="mailto:${escapeAttr(brand.contactEmail)}" style="color:#94a3b8;text-decoration:underline;">${escapeHtml(brand.contactEmail)}</a>`);
  }
  if (brand.agencyPhone) contactParts.push(escapeHtml(brand.agencyPhone));
  const contactLine = contactParts.length
    ? `<div style="margin-bottom:6px;">${contactParts.join(' · ')}</div>`
    : '';

  return `
<!-- FOOTER DÉSINSCRIPTION RGPD (injecté automatiquement) -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;padding:18px 24px;border-top:1px solid #e5e7eb;background:#fafbfc;">
  <tr>
    <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;line-height:1.6;">
      ${contactLine}
      <div>© ${new Date().getFullYear()} ${escapeHtml(brand.siteName)}.
        <a href="${escapeAttr(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline;">Se désinscrire</a>
      </div>
    </td>
  </tr>
</table>
`;
}

// --- Utils ---

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
