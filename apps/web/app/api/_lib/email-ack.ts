// =============================================================================
// Helper d'envoi d'accusé de réception au POST lead.
// =============================================================================
// Utilise @kredix/email (package partagé) pour le sender, le template
// interpolation et les helpers settings. Plus de duplication avec apps/admin.
//
// Ce module ne contient QUE la logique métier spécifique au web :
//   - sendReceptionAck (orchestration)
//   - computeSequenceInitDates (règles de séquence)

import { prisma, type Lead } from '@kredix/db';
import {
  sendEmail,
  interpolateTemplate,
  textToHtml,
  buildUnsubscribeUrl,
  getSetting,
  getActiveGateway,
  getActiveTemplate,
  composeEmailHtml,
  loadBrandData,
  brandToContext,
} from '@kredix/email';

const DAY = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// API publique du module
// -----------------------------------------------------------------------------

export interface AckResult {
  sent: boolean;
  error?: string;
  templateUsed: boolean;
  gatewayActive: boolean;
}

/**
 * Envoie l'accusé de réception (template `reception_ack`) au lead fourni.
 *
 * Comportement défensif :
 *   - Si aucun gateway actif → no-op (renvoie { sent:false, gatewayActive:false }).
 *   - Si aucun template actif pour `reception_ack` → no-op.
 *   - Si le lead n'a pas d'email → no-op.
 *   - Sinon → rendu du template + envoi + EmailLog.
 *
 * Ne lève JAMAIS : un échec d'accusé ne doit pas faire échouer la création du lead.
 */
export async function sendReceptionAck(lead: Lead): Promise<AckResult> {
  if (!lead.email) {
    return { sent: false, templateUsed: false, gatewayActive: false, error: 'Lead sans email' };
  }

  const siteUrl = await getSetting('site_url', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3100');
  const brand = await loadBrandData();

  const [gateway, template] = await Promise.all([
    getActiveGateway(),
    getActiveTemplate('reception_ack', lead.preferredLanguage || 'fr'),
  ]);

  if (!gateway) {
    // Aucun gateway actif — on loggue pour traçabilité côté admin.
    try {
      await prisma.emailLog.create({
        data: {
          leadId: lead.id,
          email: lead.email,
          trigger: 'reception_ack',
          templateName: template?.name ?? '—',
          subject: template ? interpolateTemplate(template.subject, { lead, siteUrl, brand: brandToContext(brand) }) : 'Accusé de réception',
          status: 'skipped',
          error: "Aucun gateway email actif. Configurez et activez un fournisseur dans Paramètres → Emails.",
        },
      });
    } catch { /* non bloquant */ }
    return { sent: false, templateUsed: !!template, gatewayActive: false };
  }
  if (!template) {
    return { sent: false, templateUsed: false, gatewayActive: true };
  }

  const ctx = { lead, siteUrl, brand: brandToContext(brand) };
  const subject = interpolateTemplate(template.subject, ctx);
  const bodyText = interpolateTemplate(template.bodyText, ctx);
  const rawHtml = template.htmlContent
    ? interpolateTemplate(template.htmlContent, ctx)
    : textToHtml(bodyText, lead.preferredLanguage || 'fr');

  const html = composeEmailHtml({
    bodyHtml: rawHtml,
    bodyText,
    brand,
    unsubscribeUrl: buildUnsubscribeUrl(lead, siteUrl),
    bannerEnabled: template.bannerEnabled,
    subject,
  });

  const result = await sendEmail(gateway, {
    to: lead.email,
    subject,
    html,
    text: bodyText,
  });

  // EmailLog quelle que soit l'issue (pour audit + dashboard activité agents).
  try {
    await prisma.emailLog.create({
      data: {
        leadId: lead.id,
        email: lead.email,
        trigger: 'reception_ack',
        templateName: template.name,
        subject,
        status: result.success ? 'sent' : 'failed',
        error: result.error,
      },
    });
  } catch {
    // Non bloquant — on ne veut pas casser le flux lead sur un log failed.
  }

  return {
    sent: result.success,
    error: result.error,
    templateUsed: true,
    gatewayActive: true,
  };
}

/**
 * Calcule les dates de séquence pour un nouveau lead.
 *
 * RÈGLE IMPORTANTE : ackSentAt n'est PAS setté ici — il ne l'est QUE par
 * le cron relance après envoi réussi du welcome email.
 *
 * Le welcome email n'est PLUS envoyé synchronément à la création du lead.
 * Il est pris en charge par le cron, qui sélectionne les leads dont
 * nextRelanceAt est dépassé ET ackSentAt est null → envoie le reception_ack.
 *
 * Chronologie garantie par le cron :
 *   T+5min : welcome email (reception_ack) → ackSentAt setté
 *   T+20min: offer email (offer + PDF amortissement) → offerSentAt setté
 *   J+3    : relance_1 (+ offre renvoyée en PJ)
 *   J+6    : relance_2 (+ offre renvoyée en PJ)
 *   J+9    : relance_3 → sortie max_relances
 *
 * @param welcomeDelayMs Délai avant le welcome email (défaut 5 min).
 */
export function computeSequenceInitDates(
  now: Date = new Date(),
  welcomeDelayMs: number = 5 * 60 * 1000,
) {
  return {
    recallDueAt: new Date(now.getTime() + 2 * DAY), // 48h
    sequenceActive: true,
    sequenceStartedAt: now,
    nextRelanceAt: new Date(now.getTime() + welcomeDelayMs), // 5 min → welcome
    relanceCount: 0,
  };
}
