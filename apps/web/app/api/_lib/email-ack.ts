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
  getSetting,
  getActiveGateway,
  getActiveTemplate,
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
          subject: template ? interpolateTemplate(template.subject, { lead, siteUrl }) : 'Accusé de réception',
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

  const subject = interpolateTemplate(template.subject, { lead, siteUrl });
  const bodyText = interpolateTemplate(template.bodyText, { lead, siteUrl });
  const html = template.htmlContent
    ? interpolateTemplate(template.htmlContent, { lead, siteUrl })
    : textToHtml(bodyText);

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
 * Calcule les dates de séquence de relance pour un nouveau lead.
 *
 * RÈGLE IMPORTANTE : ackSentAt n'est PAS setté ici — il ne l'est QUE si
 * l'email d'accusé de réception a effectivement été envoyé avec succès
 * (cf. leads/route.ts qui update le lead après sendReceptionAck).
 *
 * Règle métier (cf. Kredix_MEMORY) :
 *   - recallDueAt     = maintenant + 48h (rappel humain annoncé)
 *   - sequenceActive  = true
 *   - sequenceStartedAt = maintenant
 *   - nextRelanceAt   = maintenant + 3 jours (J+3 — première relance)
 *   - relanceCount    = 0
 */
export function computeSequenceInitDates(now: Date = new Date()) {
  return {
    recallDueAt: new Date(now.getTime() + 2 * DAY), // 48h
    sequenceActive: true,
    sequenceStartedAt: now,
    nextRelanceAt: new Date(now.getTime() + 3 * DAY), // J+3
    relanceCount: 0,
  };
}
