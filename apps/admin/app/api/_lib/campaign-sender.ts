// =============================================================================
// campaign-sender — Traitement asynchrone d'une campagne d'envoi en masse.
// =============================================================================
// Parcourt les destinataires "pending" un par un, avec un espacement aléatoire
// (30-90s par défaut) entre chaque email pour respecter les garde-fous cadence.
// Vérifie à chaque itération : statut campagne (annulation), plafond journalier,
// et SuppressionList (désinscriptions / bounces / plaintes).
// Fire-and-forget : lancé depuis la route /send, tourne en arrière-plan.

import {
  prisma,
  CampaignStatus,
  CampaignRecipientStatus,
  EmailTrigger,
  type EmailGateway,
  type EmailTemplate,
} from '@kredix/db';
import { getSetting, getSettingNumber, getGatewayForCampaign } from './settings';
import { sendEmail, type EmailAttachment } from './email-sender';
import { interpolateTemplate, textToHtml, buildUnsubscribeUrl } from './template-interpolation';
import { composeEmailHtml, loadBrandData, brandToContext } from '@kredix/email';
import { generateAmortizationPDF } from './amortization';

/** Pause synchrone (Promise) — utilise setTimeout. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Entier aléatoire inclus entre min et max (secondes converties en ms via l'appelant). */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Construit la pièce jointe PDF du tableau d'amortissement pour un email d'offre.
 * Retourne `null` si le lead est introuvable ou manque des données de prêt
 * (amount / durationYears) — auquel cas l'email part sans pièce jointe.
 *
 * Appelé à la fois par campaign-sender (envoi en masse) et par le cron relance
 * pour les séquences de type offre.
 */
export async function getOfferAttachment(
  leadId: string,
  fallbackFirstName?: string | null,
  fallbackLastName?: string | null,
): Promise<EmailAttachment | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      firstName: true,
      lastName: true,
      amount: true,
      annualRate: true,
      durationYears: true,
    },
  });
  if (!lead || !lead.amount || !lead.durationYears) return null;

  const siteName = await getSetting('site_name', 'Kredix');

  // Le PDF est optionnel : si sa génération échoue (fonts manquantes en standalone,
  // OOM, etc.), on renvoie null et l'email part SANS pièce jointe plutôt que de
  // bloquer toute la séquence (welcome/offre/relances).
  try {
    const pdfBuffer = await generateAmortizationPDF({
      amount: lead.amount,
      annualRate: lead.annualRate ?? 4.5,
      durationYears: lead.durationYears,
      firstName: fallbackFirstName ?? lead.firstName,
      lastName: fallbackLastName ?? lead.lastName,
      siteName,
    });

    return {
      filename: 'tableau-amortissement.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf',
    };
  } catch (err) {
    console.error('[getOfferAttachment] PDF non généré, email envoyé sans pièce jointe:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Traite une campagne : envoie tous les emails "pending" un par un.
 * À appeler en fire-and-forget : `processCampaign(id).catch(console.error)`.
 *
 * Étapes :
 *   1. Vérifie le statut (doit être "sending")
 *   2. Récupère le gateway actif (échec fatal si aucun)
 *   3. Lit la cadence (intervalles, plafond journalier) + site_url
 *   4. Pour chaque destinataire pending :
 *        - re-vérifie le statut (arrêt si annulée)
 *        - vérifie le plafond journalier (pause — reprise à la prochaine invocation)
 *        - vérifie la SuppressionList (skip)
 *        - interpole le template puis envoie
 *        - met à jour le destinataire + compteurs campagne
 *        - dort intervalle aléatoire
 *   5. Marque la campagne "completed"
 */
export async function processCampaign(campaignId: string): Promise<void> {
  try {
    // 1 — Charger la campagne et vérifier qu'elle est en cours d'envoi.
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
        domain: true,
        owner: { select: { firstName: true, lastName: true, phone: true, email: true, displayName: true } },
      },
    });
    if (!campaign) return;
    if (campaign.status !== CampaignStatus.sending) return;

    // 1b — Résoudre l'adresse d'expédition depuis le domaine de la campagne.
    //      Si la campagne a un domaine avec fromEmail, on l'utilise.
    //      Sinon, sendEmail() utilisera le from_email global (fallback).
    const fromAddress = campaign.domain?.fromEmail || undefined;

    // 2 — Gateway pour cette campagne (spécifique si défini, sinon primaire).
    const gateway = (await getGatewayForCampaign(campaignId)) as EmailGateway | null;
    if (!gateway) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.failed },
      });
      console.error(`[campaign ${campaignId}] Aucun gateway actif — campagne marquée failed`);
      return;
    }

    // 3 — Paramètres de cadence + URL du site (pour le lien de désinscription).
    // Unified settings : les mêmes que le cron relance (configurables dans CRM > Paramètres > Cadence).
    const intervalMin = await getSettingNumber('cadence_interval_min', 30);
    const intervalMax = await getSettingNumber('cadence_interval_max', 90);
    const dailyCap = await getSettingNumber('cadence_daily_cap', 200);
    const siteUrl = await getSetting('site_url', '');
    const brand = await loadBrandData();

    const template = campaign.template as EmailTemplate;

    // 4 — Destinataires en attente ou bloqués en "sending" (process crashé).
    //     Ordre d'insertion (FIFO).
    //     On récupère seulement les IDs ; on re-vérifiera le statut de chaque
    //     destinataire avant l'envoi pour éviter les race conditions
    //     (cron de reprise + /send tournant en parallèle).
    const pendingIds = await prisma.campaignRecipient.findMany({
      where: {
        campaignId,
        status: {
          in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.sending],
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    // 3b — Préchargement de la SuppressionList en batch (anti-N+1).
    //     Au lieu d'un findUnique par destinataire, on charge tous les emails
    //     supprimés en une seule requête (Map pour lookup O(1)).
    const pendingRecipients = await prisma.campaignRecipient.findMany({
      where: { id: { in: pendingIds.map((p) => p.id) } },
      select: { email: true },
    });
    const suppressedRows = await prisma.suppressionList.findMany({
      where: { email: { in: pendingRecipients.map((p) => p.email) } },
      select: { email: true, reason: true },
    });
    const suppressedMap = new Map(suppressedRows.map((s) => [s.email, s.reason]));

    // 3c — Plafond journalier : initialiser le compteur UNE SEULE FOIS au début,
    //     puis incrémenter en mémoire après chaque envoi réussi (anti-N+1).
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let sentToday = await prisma.campaignRecipient.count({
      where: { status: CampaignRecipientStatus.sent, sentAt: { gte: startOfToday } },
    });

    for (const { id: recipientId } of pendingIds) {
      // 4a — Re-vérification du statut campagne (annulation par l'admin).
      const current = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });
      if (!current || current.status !== CampaignStatus.sending) {
        console.log(`[campaign ${campaignId}] Statut changé → arrêt du traitement`);
        break;
      }

      // 4a-bis — Anti double-envoi atomique : on tente de "locking" le destinataire
      //         en passant son statut de pending/sending → sending. Si updateMany
      //         retourne 0, c'est qu'un autre process l'a déjà traité (sent/failed/skipped).
      const locked = await prisma.campaignRecipient.updateMany({
        where: {
          id: recipientId,
          status: { in: [CampaignRecipientStatus.pending, CampaignRecipientStatus.sending] },
        },
        data: { status: CampaignRecipientStatus.sending },
      });
      if (locked.count === 0) continue;

      const recipient = await prisma.campaignRecipient.findUnique({
        where: { id: recipientId },
      });
      if (!recipient) continue;

      // 4b — Plafond journalier global (toutes campagnes confondues).
      //      sentToday est maintenu en mémoire (initialisé avant la boucle, incrémenté après envoi).
      if (sentToday >= dailyCap) {
        console.log(
          `[campaign ${campaignId}] Plafond journalier atteint (${sentToday}/${dailyCap}) — pause`,
        );
        return; // reprise à la prochaine invocation (cron / appel manuel)
      }

      // 4c — SuppressionList : lookup O(1) dans le Map préchargé (anti-N+1).
      const suppressed = suppressedMap.has(recipient.email)
        ? { reason: suppressedMap.get(recipient.email)! }
        : null;
      if (suppressed) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: CampaignRecipientStatus.skipped },
        });
        await prisma.emailLog.create({
          data: {
            leadId: recipient.leadId,
            email: recipient.email,
            trigger: 'campaign',
            templateName: template.name,
            subject: '(skipped - suppressed)',
            campaignId: campaignId,
            status: 'skipped',
            error: 'Recipient in suppression list',
          },
        });
        continue;
      }

      // 4d — Interpolation du sujet + corps avec les données du destinataire.
      const ctx = {
        lead: {
          id: recipient.leadId ?? recipient.id,
          firstName: recipient.firstName ?? '',
          lastName: recipient.lastName ?? '',
          email: recipient.email,
          phone: '',
          amount: 0,
          durationYears: 0,
          monthlyPayment: null,
          annualRate: null,
          loanType: 'autre',
          companyName: null,
          createdAt: new Date(),
          offerSentAt: null,
          unsubscribeToken: '',
          preferredLanguage: 'fr',
        },
        siteUrl,
        brand: brandToContext(brand),
        advisor: campaign.owner,
      };
      const subject = interpolateTemplate(template.subject, ctx);
      const textBody = interpolateTemplate(template.bodyText, ctx);
      const rawHtml = template.htmlContent
        ? interpolateTemplate(template.htmlContent, ctx)
        : textToHtml(textBody);

      const html = composeEmailHtml({
        bodyHtml: rawHtml,
        bodyText: textBody,
        brand,
        unsubscribeUrl: buildUnsubscribeUrl(ctx.lead, siteUrl),
        bannerEnabled: template.bannerEnabled,
        subject,
      });

      // 4e — Envoi effectif via le gateway configuré.
      //      Si le template est une offre, on génère le PDF d'amortissement
      //      et on le joint à l'email (si le lead a des données de prêt valides).
      let attachments: EmailAttachment[] | undefined;
      if (template.trigger === EmailTrigger.offer && recipient.leadId) {
        const pdf = await getOfferAttachment(
          recipient.leadId,
          recipient.firstName,
          recipient.lastName,
        );
        if (pdf) attachments = [pdf];
      }

      const result = await sendEmail(gateway, {
        to: recipient.email,
        from: fromAddress,
        subject,
        html,
        text: textBody,
        attachments,
      });

      // 4e-bis — Journalisation de l'envoi (succès, échec) dans EmailLog.
      await prisma.emailLog.create({
        data: {
          leadId: recipient.leadId,
          email: recipient.email,
          trigger: 'campaign',
          templateName: template.name,
          subject,
          campaignId: campaignId,
          status: result.success ? 'sent' : 'failed',
          error: result.success ? null : (result.error || 'Unknown error'),
        },
      });

      // 4f/4g — Mise à jour du destinataire + compteurs campagne.
      if (result.success) {
        await prisma.$transaction([
          prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: CampaignRecipientStatus.sent, sentAt: new Date() },
          }),
          prisma.campaign.update({
            where: { id: campaignId },
            data: { sentCount: { increment: 1 } },
          }),
        ]);
        sentToday++; // maintien en mémoire du plafond journalier (anti-N+1)
      } else {
        await prisma.$transaction([
          prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: CampaignRecipientStatus.failed,
              error: result.error ?? 'Erreur inconnue',
            },
          }),
          prisma.campaign.update({
            where: { id: campaignId },
            data: { failedCount: { increment: 1 } },
          }),
        ]);
      }

      // 4h — Espacement aléatoire (anti-spam) entre chaque envoi.
      const delaySec = randomBetween(intervalMin, intervalMax);
      await sleep(delaySec * 1000);
    }

    // 5 — Tous les destinataires traités : campagne terminée.
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.completed, completedAt: new Date() },
    });
    console.log(`[campaign ${campaignId}] Traitement terminé`);
  } catch (err) {
    // Erreur fatale : on marque la campagne en échec pour trace.
    console.error(`[campaign ${campaignId}] Erreur fatale:`, err);
    try {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.failed },
      });
    } catch {
      // Si même la mise à jour échoue, on ne peut rien faire de plus.
    }
  }
}
