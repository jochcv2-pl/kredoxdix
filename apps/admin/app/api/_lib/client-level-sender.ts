// =============================================================================
// client-level-sender — Envoi d'un email d'une étape du parcours client.
// =============================================================================
// Le parcours est entièrement configurable via PipelineStep (modèle DB).
// Chaque étape associe UN template email + UN document PDF (optionnel).
// L'envoi est 100% manuel (clic admin) — AUCUN délai automatique.
//
// Un niveau ne peut être envoyé qu'une seule fois par client (@@unique lead+level).
// L'envoi réel passe par le gateway actif configuré dans l'admin.
// =============================================================================

import {
  prisma,
  LeadStatus,
  EmailTrigger,
  type EmailGateway,
  type EmailTemplate,
  type DocumentTemplate,
} from '@kredix/db';
import { getSetting, getGatewayForLead, extractGatewayInfo } from './settings';
import { sendEmail, type EmailAttachment } from './email-sender';
import { interpolateTemplate, textToHtml, buildUnsubscribeUrl } from './template-interpolation';
import { composeEmailHtml, loadBrandData, brandToContext } from '@kredix/email';
import { fillPdfTemplate, type PdfFillData } from './pdf-filler';

export interface SendLevelResult {
  success: boolean;
  error?: string;
  emailLogId?: string;
  currentLevel?: number;
  stepName?: string;
}

/**
 * Envoie l'email d'une étape du parcours client.
 *
 * Étapes :
 *   1. Charge le PipelineStep (source de vérité : template + document + nom).
 *   2. Charge le lead — doit exister et être au statut "client".
 *   3. Vérifie que ce niveau n'a pas déjà été envoyé (ClientStep unique).
 *   4. Récupère le template email (PipelineStep.templateId, fallback trigger level_N).
 *   5. Récupère le gateway actif + site_name + site_url.
 *   6. Interpole sujet + corps avec les données du lead.
 *   7. Construit les pièces jointes PDF (PipelineStep.documentId + level match).
 *   8. Envoie via le gateway.
 *   9. Journalise dans EmailLog + crée le ClientStep (succès uniquement).
 */
export async function sendClientLevelEmail(
  leadId: string,
  stepId: string,
): Promise<SendLevelResult> {
  // 1 — Charge le PipelineStep (source de vérité configurable).
  const step = await prisma.pipelineStep.findUnique({
    where: { id: stepId },
    include: {
      template: true,
      document: true,
    },
  });

  if (!step) {
    return { success: false, error: 'Étape du parcours introuvable' };
  }
  if (!step.isActive) {
    return { success: false, error: 'Cette étape est désactivée' };
  }

  const level = step.order;

  // 2 — Chargement du lead (doit être un client validé).
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      city: true,
      amount: true,
      annualRate: true,
      durationYears: true,
      monthlyPayment: true,
      totalCost: true,
      loanType: true,
      companyName: true,
      status: true,
      unsubscribeToken: true,
      preferredLanguage: true,
      createdAt: true,
      offerSentAt: true,
      assignedTo: { select: { firstName: true, lastName: true, phone: true, email: true, displayName: true } },
    },
  });

  if (!lead) {
    return { success: false, error: 'Client introuvable' };
  }
  if (lead.status !== LeadStatus.client) {
    return { success: false, error: "Ce lead n'est pas un client validé" };
  }
  if (!lead.email) {
    return { success: false, error: "Ce client n'a pas d'adresse email" };
  }

  // 3 — Le niveau a-t-il déjà été envoyé ? (@@unique [leadId, level])
  const existing = await prisma.clientStep.findUnique({
    where: { leadId_level: { leadId, level } },
    select: { id: true },
  });
  if (existing) {
    return { success: false, error: 'Niveau déjà envoyé' };
  }

  // 4 — Template email.
  // Priorité : PipelineStep.templateId → fallback par trigger level_N (legacy).
  let template: EmailTemplate | null = null;

  if (step.templateId && step.template) {
    // Template directement attaché au PipelineStep.
    if (step.template.status === 'active') {
      template = step.template as EmailTemplate;
    }
  }

  // Fallback : recherche par trigger si aucun template attaché ou inactif.
  if (!template) {
    const triggerKey = `level_${level}` as EmailTrigger;
    const leadLang = lead.preferredLanguage || 'fr';
    template = (await prisma.emailTemplate.findFirst({
      where: { trigger: triggerKey, status: 'active', language: leadLang },
    })) as EmailTemplate | null;
    if (!template && leadLang !== 'fr') {
      template = (await prisma.emailTemplate.findFirst({
        where: { trigger: triggerKey, status: 'active', language: 'fr' },
      })) as EmailTemplate | null;
    }
  }

  if (!template) {
    return { success: false, error: 'Aucun modèle actif pour cette étape' };
  }

  // 5 — Gateway pour ce lead (DEC-K5 : SMTP de l'owner du lead, ou système si non assigné).
  const gateway = (await getGatewayForLead(lead.id)) as EmailGateway | null;
  if (!gateway) {
    return { success: false, error: 'Aucune passerelle d\'envoi configurée' };
  }

  const siteName = await getSetting('site_name', 'Kredix');
  const siteUrl = await getSetting('site_url', 'http://localhost:3100');
  const brand = await loadBrandData();

  // 6 — Interpolation sujet + corps (avec variables marque injectées).
  const leadData = {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    amount: lead.amount,
    durationYears: lead.durationYears,
    monthlyPayment: lead.monthlyPayment,
    annualRate: lead.annualRate,
    loanType: lead.loanType,
    companyName: lead.companyName,
    createdAt: lead.createdAt,
    offerSentAt: lead.offerSentAt,
    unsubscribeToken: lead.unsubscribeToken,
    preferredLanguage: lead.preferredLanguage,
    advisorName: lead.assignedTo?.displayName ?? null,
  };
  const ctx = { lead: leadData, siteUrl, brand: brandToContext(brand), advisor: lead.assignedTo };
  const subject = interpolateTemplate(template.subject, ctx);
  const textBody = interpolateTemplate(template.bodyText, ctx);
  const rawHtml = template.htmlContent
    ? interpolateTemplate(template.htmlContent, ctx)
    : textToHtml(textBody, lead.preferredLanguage || 'fr');

  // Composition HTML : préserve le design des templates importés (document
  // complet), enveloppe les fragments de texte (textToHtml) avec le wrapper.
  const html = composeEmailHtml({
    bodyHtml: rawHtml,
    bodyText: textBody,
    brand,
    unsubscribeUrl: buildUnsubscribeUrl(leadData, siteUrl),
    bannerEnabled: template.bannerEnabled,
    subject,
  });

  // 7 — Pièces jointes PDF.
  const attachments: EmailAttachment[] = [];

  const pdfData: PdfFillData = {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    city: lead.city,
    amount: lead.amount,
    annualRate: lead.annualRate,
    durationYears: lead.durationYears,
    monthlyPayment: lead.monthlyPayment,
    totalCost: lead.totalCost,
    loanType: lead.loanType,
    date: new Date().toLocaleDateString('fr-FR'),
    createdAt: lead.createdAt.toLocaleDateString('fr-FR'),
    siteName,
  };

  // a) Document directement attaché au PipelineStep (nouveau système).
  if (step.documentId && step.document) {
    const doc = step.document as DocumentTemplate;
    if (doc.filePath && doc.isActive) {
      try {
        const buffer = await fillPdfTemplate(doc.filePath, pdfData);
        attachments.push({
          filename: doc.fileName || `${doc.name}.pdf`,
          content: buffer,
          contentType: 'application/pdf',
        });
      } catch (err) {
        console.error(
          `[client-level] Échec remplissage PDF "${doc.fileName}" (étape ${step.name}, lead ${leadId}):`,
          err,
        );
      }
    }
  }

  // b) Legacy : DocumentTemplate avec level matching (ancien système).
  const legacyDocs = await prisma.documentTemplate.findMany({
    where: { level, isActive: true },
  });
  for (const doc of legacyDocs) {
    // Évite le doublon si le document est déjà attaché via PipelineStep.
    if (step.documentId && doc.id === step.documentId) continue;
    if (!doc.filePath) continue;
    try {
      const buffer = await fillPdfTemplate(doc.filePath, pdfData);
      attachments.push({
        filename: doc.fileName || `${doc.name}.pdf`,
        content: buffer,
        contentType: 'application/pdf',
      });
    } catch (err) {
      console.error(
        `[client-level] Échec remplissage PDF legacy "${doc.fileName}" (niveau ${level}, lead ${leadId}):`,
        err,
      );
    }
  }

  // 8 — Envoi effectif via le gateway configuré.
  const sendResult = await sendEmail(gateway, {
    to: lead.email,
    subject,
    html,
    text: textBody,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  // 9 — Journalisation.
  const log = await prisma.emailLog.create({
    data: {
      leadId: lead.id,
      email: lead.email,
      trigger: `level_${level}`,
      templateName: template.name,
      subject,
      status: sendResult.success ? 'sent' : 'failed',
      error: sendResult.success ? null : sendResult.error || 'Unknown error',
      ...extractGatewayInfo(gateway),
    },
    select: { id: true },
  });

  if (!sendResult.success) {
    return {
      success: false,
      error: sendResult.error || "Échec de l'envoi de l'email",
      emailLogId: log.id,
    };
  }

  // Succès : on crée le ClientStep (verrou anti-renvoi).
  await prisma.clientStep.create({
    data: {
      leadId: lead.id,
      level,
      stepId: step.id,
      templateId: template.id,
      emailLogId: log.id,
    },
  });

  // Niveau courant après cet envoi.
  const steps = await prisma.clientStep.findMany({
    where: { leadId: lead.id },
    select: { level: true },
  });
  const currentLevel = steps.reduce((max, s) => Math.max(max, s.level), 0);

  console.log(
    `[client-level] ${step.name} (order ${level}) envoyé → ${lead.email} (lead ${lead.id}, msgId: ${sendResult.messageId ?? 'n/a'})`,
  );

  return { success: true, emailLogId: log.id, currentLevel, stepName: step.name };
}
