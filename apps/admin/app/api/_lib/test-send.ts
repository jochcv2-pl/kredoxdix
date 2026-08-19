// =============================================================================
// test-send — Helper partagé pour l'envoi de test (templates + campagnes).
// =============================================================================
// Crée un faux lead avec des données réalistes pour l'interpolation,
// compose l'email final et l'envoie à l'adresse de test demandée.
//
// Utilisé par :
//   POST /api/templates/[id]/test
//   POST /api/campaigns/[id]/test

import { prisma } from '@kredix/db';
import {
  interpolateTemplate,
  textToHtml,
  buildUnsubscribeUrl,
  composeEmailHtml,
  loadBrandData,
  brandToContext,
  getSetting,
  getPrimaryGateway,
  extractGatewayInfo,
  sendEmail,
  type InterpolationContext,
} from '@kredix/email';

/** Données de test réalistes pour l'interpolation des variables {{...}}. */
const TEST_LEAD: InterpolationContext['lead'] = {
  id: 'test-lead-0001',
  reference: 'KREDIX-TEST0001',
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'test@kredix.fr',
  phone: '+33 6 12 34 56 78',
  amount: 250000,
  durationYears: 20,
  monthlyPayment: 1285,
  annualRate: 3.85,
  loanType: 'immo',
  companyName: null,
  createdAt: new Date('2026-07-30'),
  offerSentAt: new Date('2026-07-30T10:30:00'),
  unsubscribeToken: 'test-token-preview',
  preferredLanguage: 'fr',
  advisorName: 'Marie Lefèvre',
};

export interface TestSendResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Envoie un email de test à l'adresse fournie.
 *
 * @param template   Le modèle EmailTemplate (déjà chargé depuis la DB).
 * @param testEmail  L'adresse email du destinataire de test.
 */
export async function sendTestEmail(
  template: {
    id: string;
    name: string;
    subject: string;
    bodyText: string;
    htmlContent: string | null;
    bannerEnabled: boolean;
    isConfidential: boolean;
    /** Langue du modèle — les variables du test suivent la langue de l'email. */
    language?: string;
  },
  testEmail: string,
  adminId?: string,
): Promise<TestSendResult> {
  // 1. Gateway actif obligatoire (DEC-K5 : SMTP de l'admin connecté si fourni).
  const gateway = await getPrimaryGateway(adminId);
  if (!gateway) {
    return { success: false, error: 'Aucun gateway email actif. Configurez un fournisseur dans Paramètres → Emails.' };
  }

  // 2. Données de marque + site URL.
  const siteUrl = await getSetting('site_url', 'http://localhost:3100');
  const brand = await loadBrandData();
  const ctx: InterpolationContext = {
    lead: TEST_LEAD,
    siteUrl,
    brand: brandToContext(brand),
    language: template.language || 'fr',
  };

  // 3. Interpolation.
  const subject = interpolateTemplate(template.subject, ctx);
  const bodyText = interpolateTemplate(template.bodyText, ctx);
  const rawHtml = template.htmlContent
    ? interpolateTemplate(template.htmlContent, ctx)
    : textToHtml(bodyText, template.language || 'fr');

  // 4. Composition finale (sans header/footer — les emails sont envoyés tels quels).
  const html = composeEmailHtml({
    bodyHtml: rawHtml,
    bodyText,
    brand,
    unsubscribeUrl: buildUnsubscribeUrl(TEST_LEAD, siteUrl),
    bannerEnabled: false,
    subject,
  });

  // 5. Envoi.
  const result = await sendEmail(gateway, {
    to: testEmail,
    subject: `[TEST] ${subject}`,
    html,
    text: bodyText,
  });

  if (!result.success) {
    return { success: false, error: result.error ?? 'Échec de l\'envoi' };
  }

  // 6. Log pour traçabilité.
  try {
    await prisma.emailLog.create({
      data: {
        email: testEmail,
        trigger: 'manual',
        templateName: `${template.name} (TEST)`,
        subject: `[TEST] ${subject}`,
        bodyText,
        status: 'sent',
        ...extractGatewayInfo(gateway),
      },
    });
  } catch {
    // Non bloquant.
  }

  return { success: true, messageId: result.messageId };
}
