// =============================================================================
// client-level-sender — Envoi d'un email d'un niveau du parcours client (1-7).
// =============================================================================
// Quand un prospect est validé comme client (LeadStatus.client), il entre dans
// le parcours d'accompagnement en 7 niveaux. Chaque niveau déclenche l'envoi
// d'un email (template EmailTrigger.level_N) + les PDFs DocumentTemplate liés.
//
// Un niveau ne peut être envoyé qu'une seule fois par client (@@unique lead+level).
// L'envoi réel passe par le gateway actif configuré dans l'admin.
// Aucune IA ne lit les emails entrants : ce module est purement sortant.
// =============================================================================

import {
  prisma,
  LeadStatus,
  EmailTrigger,
  type EmailGateway,
  type EmailTemplate,
} from '@kredix/db';
import { getSetting, getActiveGateway } from './settings';
import { sendEmail, type EmailAttachment } from './email-sender';
import { interpolateTemplate, textToHtml } from './template-interpolation';
import { fillPdfTemplate, type PdfFillData } from './pdf-filler';
import { generateAmortizationPDF } from './amortization';

export interface SendLevelResult {
  success: boolean;
  error?: string;
  emailLogId?: string;
  currentLevel?: number;
}

/**
 * Envoie l'email d'un niveau (1-7) à un client.
 *
 * Étapes :
 *   1. Valide le niveau (1-7).
 *   2. Charge le lead — doit exister et être au statut "client".
 *   3. Vérifie que ce niveau n'a pas déjà été envoyé (ClientStep unique).
 *   4. Récupère le template email actif pour `level_N`.
 *   5. Récupère le gateway actif + site_name + site_url.
 *   6. Interpole sujet + corps avec les données du lead.
 *   7. Construit les pièces jointes PDF (DocumentTemplate du niveau + amortissement si level_3).
 *   8. Envoie via le gateway.
 *   9. Journalise dans EmailLog + crée le ClientStep (succès uniquement).
 */
export async function sendClientLevelEmail(
  leadId: string,
  level: number,
): Promise<SendLevelResult> {
  // 1 — Validation du niveau.
  if (!Number.isInteger(level) || level < 1 || level > 7) {
    return { success: false, error: 'Niveau invalide (1 à 7 attendu)' };
  }

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
      status: true,
      unsubscribeToken: true,
      preferredLanguage: true,
      createdAt: true,
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

  // 4 — Template email actif pour ce trigger (level_1 ... level_7).
  const triggerKey = `level_${level}` as EmailTrigger;
  const template = (await prisma.emailTemplate.findFirst({
    where: { trigger: triggerKey, status: 'active' },
  })) as EmailTemplate | null;

  if (!template) {
    return { success: false, error: 'Aucun modèle actif pour ce niveau' };
  }

  // 5 — Gateway actif (échec fatal si aucun) + paramètres marque.
  const gateway = (await getActiveGateway()) as EmailGateway | null;
  if (!gateway) {
    return { success: false, error: 'Aucune passerelle d\'envoi configurée' };
  }

  const siteName = await getSetting('site_name', 'Kredix');
  const siteUrl = await getSetting('site_url', 'http://localhost:3100');

  // 6 — Interpolation sujet + corps (mêmes variables que les autres senders).
  const ctx = {
    lead: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      amount: lead.amount,
      durationYears: lead.durationYears,
      monthlyPayment: lead.monthlyPayment,
      annualRate: lead.annualRate,
      loanType: lead.loanType,
      unsubscribeToken: lead.unsubscribeToken,
      preferredLanguage: lead.preferredLanguage,
    },
    siteUrl,
  };
  const subject = interpolateTemplate(template.subject, ctx);
  const textBody = interpolateTemplate(template.bodyText, ctx);
  const html = template.htmlContent
    ? interpolateTemplate(template.htmlContent, ctx)
    : textToHtml(textBody);

  // 7 — Pièces jointes PDF.
  //   a) Tous les DocumentTemplate actifs rattachés à ce niveau.
  //   b) Si level_3 (offre formelle) et données de prêt présentes → amortissement.
  const attachments: EmailAttachment[] = [];

  const docTemplates = await prisma.documentTemplate.findMany({
    where: { level, isActive: true },
  });

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

  for (const doc of docTemplates) {
    if (!doc.filePath) continue;
    try {
      const buffer = await fillPdfTemplate(doc.filePath, pdfData);
      attachments.push({
        filename: doc.fileName || `${doc.name}.pdf`,
        content: buffer,
        contentType: 'application/pdf',
      });
    } catch (err) {
      // Un PDF illisible ne doit pas bloquer tout l'envoi : on log et on continue.
      console.error(
        `[client-level] Échec remplissage PDF "${doc.fileName}" (niveau ${level}, lead ${leadId}):`,
        err,
      );
    }
  }

  // Offre formelle (level_3) : on joint en plus le tableau d'amortissement.
  if (level === 3 && lead.amount && lead.durationYears) {
    try {
      const amortBuffer = await generateAmortizationPDF({
        amount: lead.amount,
        annualRate: lead.annualRate ?? 4.5,
        durationYears: lead.durationYears,
        firstName: lead.firstName,
        lastName: lead.lastName,
        siteName,
      });
      attachments.push({
        filename: 'tableau-amortissement.pdf',
        content: amortBuffer,
        contentType: 'application/pdf',
      });
    } catch (err) {
      console.error(
        `[client-level] Échec génération tableau d'amortissement (lead ${leadId}):`,
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

  // 9 — Journalisation (succès ou échec) dans EmailLog.
  const log = await prisma.emailLog.create({
    data: {
      leadId: lead.id,
      email: lead.email,
      trigger: `level_${level}`,
      templateName: template.name,
      subject,
      status: sendResult.success ? 'sent' : 'failed',
      error: sendResult.success ? null : sendResult.error || 'Unknown error',
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

  // Succès : on crée le ClientStep (verrou anti-renvoi) et on calcule le niveau courant.
  await prisma.clientStep.create({
    data: {
      leadId: lead.id,
      level,
      templateId: template.id,
      emailLogId: log.id,
    },
  });

  // Niveau courant après cet envoi (= max niveau envoyé pour ce client).
  const steps = await prisma.clientStep.findMany({
    where: { leadId: lead.id },
    select: { level: true },
  });
  const currentLevel = steps.reduce((max, s) => Math.max(max, s.level), 0);

  console.log(
    `[client-level] level_${level} envoyé → ${lead.email} (lead ${lead.id}, msgId: ${sendResult.messageId ?? 'n/a'})`,
  );

  return { success: true, emailLogId: log.id, currentLevel };
}
