import { NextRequest } from 'next/server';
import { prisma, EmailTrigger, SequenceExitReason, createNotification } from '@kredix/db';
import { generateEmail } from '@kredix/ai';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { getSetting, getSettingNumber, getActiveGateway } from '../../_lib/settings';
import { sendEmail } from '../../_lib/email-sender';
import { interpolateTemplate, textToHtml, buildUnsubscribeUrl } from '../../_lib/template-interpolation';
import { composeEmailHtml, loadBrandData, brandToContext } from '@kredix/email';
import { getOfferAttachment } from '../../_lib/campaign-sender';
import { verifyBearerSecret } from '../../_lib/security';

// =============================================================================
// POST /api/cron/relance
// =============================================================================
// Job cron de la séquence d'emails (welcome + relances J+3 / J+6 / J+9).
// Protégé par header Authorization: Bearer <CRON_SECRET> (env var).
//
// Chronologie garantie (le cron est le SEUL point d'envoi) :
//   T+5min : welcome email (reception_ack) → ackSentAt setté
//   J+3    : relance_1
//   J+6    : relance_2
//   J+9    : relance_3 → sortie max_relances
//
// Garanties :
//   - Le welcome email est TOUJOURS envoyé avant les relances (ackSentAt check).
//   - Si le welcome échoue, il est réessayé au prochain passage du cron.
//   - Les relances ne partent QUE si ackSentAt est non-null.
//
// Le cron :
//   1. Traite les TIMEOUTS (leads en séquence > N jours sans validation).
//   2. Sélectionne les emails dus (sequenceActive + nextRelanceAt dépassé).
//   3. Pour chaque lead : si ackSentAt null → welcome, sinon → relance_N.
//   4. Respecte le cap journalier (cadence_daily_cap).
// =============================================================================

const DAY = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  // ----- Authentification : CRON_SECRET obligatoire (comparaison timing-safe) -----
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401);
  }

  try {
    const now = new Date();

    // ----- Pause d'urgence (pipeline.paused en DB) -----
    const pausedVal = await getSetting('pipeline.paused', 'false');
    if (pausedVal === 'true') {
      return successResponse({ paused: true, stoppedReason: 'paused' }, 200);
    }

    // ----- Paramètres cadence -----
    const timeoutDays = await getSettingNumber('cadence_timeout_days', 10);
    const dailyCap = await getSettingNumber('cadence_daily_cap', 200);

    const stats = {
      timeouts: 0,
      suppressed: 0,
      welcomeSent: 0,
      offerSent: 0,
      sent: 0,
      maxRelances: 0,
      errors: 0,
      skippedNoGateway: 0,
      skippedNoTemplate: 0,
    };

    // -----------------------------------------------------------------
    // 1. TIMEOUTS — leads en séquence depuis trop longtemps sans validation
    // -----------------------------------------------------------------
    const timeoutThreshold = new Date(now.getTime() - timeoutDays * DAY);
    const timeoutLeads = await prisma.lead.findMany({
      where: {
        sequenceActive: true,
        sequenceStartedAt: { lt: timeoutThreshold },
      },
      select: { id: true, firstName: true, lastName: true },
    });

    for (const lead of timeoutLeads) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          sequenceActive: false,
          sequenceEndedAt: now,
          exitReason: SequenceExitReason.timeout,
          status: 'lost',
        },
      });
      stats.timeouts++;

      // Notification admin : séquence expirée (timeout)
      await createNotification({
        type: 'sequence_timeout',
        title: 'Dossier expiré',
        message: `Le dossier de ${lead.firstName} ${lead.lastName} a expiré (${timeoutDays} jours sans validation).`,
        icon: 'alert-triangle',
        severity: 'warning',
        linkUrl: `/leads?id=${lead.id}`,
        relatedEntityId: lead.id,
      });
    }

    // -----------------------------------------------------------------
    // 2. Sélection des relances dues
    // -----------------------------------------------------------------
    const dueLeads = await prisma.lead.findMany({
      where: {
        sequenceActive: true,
        nextRelanceAt: { lte: now },
        exitReason: null,
      },
      orderBy: { nextRelanceAt: 'asc' },
      take: dailyCap, // respecte le cap journalier
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        loanType: true,
        amount: true,
        durationYears: true,
        monthlyPayment: true,
        annualRate: true,
        companyName: true,
        createdAt: true,
        relanceCount: true,
        ackSentAt: true,
        offerSentAt: true,
        unsubscribeToken: true,
        preferredLanguage: true,
        assignedTo: { select: { displayName: true } },
      },
    });

    // Vérifie qu'un gateway actif existe (sinon on skippe avec un log).
    const gateway = await getActiveGateway();
    if (!gateway) {
      stats.skippedNoGateway = dueLeads.length;
      return successResponse({ ...stats, note: 'Aucun gateway actif — envois skipés' }, 200);
    }

    // Charge les données de marque une fois (header/footer emails).
    const brand = await loadBrandData();

    // -----------------------------------------------------------------
    // 3. Traitement de chaque lead dû
    // -----------------------------------------------------------------
    for (const lead of dueLeads) {
      try {
        // a) Vérifie la SuppressionList (STOP / bounce / plainte antérieur)
        if (lead.email) {
          const suppressed = await prisma.suppressionList.findUnique({
            where: { email: lead.email },
          });
          if (suppressed) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: {
                sequenceActive: false,
                sequenceEndedAt: now,
                exitReason: suppressed.reason === 'unsubscribe'
                  ? SequenceExitReason.unsubscribe
                  : suppressed.reason === 'complaint'
                    ? SequenceExitReason.complaint
                    : SequenceExitReason.bounced,
              },
            });
            stats.suppressed++;
            continue;
          }
        }

        // b) Lead sans email — skippe
        if (!lead.email) {
          stats.errors++;
          continue;
        }

        // ================================================================
        // c) BRANCHE WELCOME — ackSentAt null → envoyer reception_ack
        // ================================================================
        if (!lead.ackSentAt) {
          // CLAIM ATOMIQUE — set ackSentAt IMMÉDIATEMENT pour empêcher un second
          // cron run concurrent d'envoyer un doublon pendant la génération IA (~30-45s).
          // Pattern optimistic locking (même principe qu'A-036 campaign-sender).
          const claimed = await prisma.lead.updateMany({
            where: { id: lead.id, ackSentAt: null },
            data: { ackSentAt: now },
          });
          if (claimed.count === 0) {
            // Déjà claimé par un autre cron run — on skippe.
            continue;
          }

          const leadLang = lead.preferredLanguage || 'fr';
          let welcomeTemplate = await prisma.emailTemplate.findFirst({
            where: { trigger: EmailTrigger.reception_ack, status: 'active', language: leadLang },
          });
          if (!welcomeTemplate && leadLang !== 'fr') {
            welcomeTemplate = await prisma.emailTemplate.findFirst({
              where: { trigger: EmailTrigger.reception_ack, status: 'active', language: 'fr' },
            });
          }

          if (!welcomeTemplate) {
            stats.skippedNoTemplate++;
            continue;
          }

          const siteUrl = await getSetting('site_url', 'http://localhost:3100');
          const ctx = { lead: { ...lead, advisorName: lead.assignedTo?.displayName ?? null }, siteUrl, brand: brandToContext(brand) };
          const welcomeSubject = interpolateTemplate(welcomeTemplate.subject, ctx);
          const welcomeBody = interpolateTemplate(welcomeTemplate.bodyText, ctx);

          // IA (Agent Accueil) — sauf si template confidentiel
          let finalSubject = welcomeSubject;
          let finalBody = welcomeBody;
          let generated = false;

          if (!welcomeTemplate.isConfidential) {
            try {
              const aiResult = await generateEmail({
                agentRole: 'accueil',
                trigger: 'reception_ack',
                leadContext: {
                  firstName: lead.firstName,
                  lastName: lead.lastName,
                  email: lead.email,
                  phone: lead.phone,
                  loanType: lead.loanType,
                  amount: lead.amount ?? undefined,
                  durationYears: lead.durationYears ?? undefined,
                  monthlyPayment: lead.monthlyPayment ?? undefined,
                  annualRate: lead.annualRate ?? undefined,
                  preferredLanguage: lead.preferredLanguage,
                },
                fallbackSubject: welcomeSubject,
                fallbackBody: welcomeBody,
              });
              finalSubject = aiResult.subject;
              finalBody = aiResult.bodyText;
              generated = aiResult.generated;
            } catch {
              // Fallback template si l'IA échoue
            }
          }

          const welcomeRawHtml = welcomeTemplate.htmlContent && !generated
            ? interpolateTemplate(welcomeTemplate.htmlContent, ctx)
            : textToHtml(finalBody);

          const welcomeHtml = composeEmailHtml({
            bodyHtml: welcomeRawHtml,
            bodyText: finalBody,
            brand,
            unsubscribeUrl: buildUnsubscribeUrl(lead, siteUrl),
            bannerEnabled: welcomeTemplate.bannerEnabled,
            subject: finalSubject,
          });

          const welcomeResult = await sendEmail(gateway, {
            to: lead.email,
            subject: finalSubject,
            html: welcomeHtml,
            text: finalBody,
          });

          // EmailLog
          await prisma.emailLog.create({
            data: {
              leadId: lead.id,
              email: lead.email,
              trigger: 'reception_ack',
              templateName: generated ? `${welcomeTemplate.name} (IA)` : welcomeTemplate.name,
              subject: finalSubject,
              bodyText: finalBody,
              status: welcomeResult.success ? 'sent' : 'failed',
              error: welcomeResult.success ? null : (welcomeResult.error || 'Unknown error'),
            },
          });

          if (!welcomeResult.success) {
            console.error(`[CRON] Échec welcome → ${lead.email} (lead ${lead.id}):`, welcomeResult.error);
            stats.errors++;
            // Reset ackSentAt → le cron réessaiera au prochain passage.
            await prisma.lead.update({
              where: { id: lead.id },
              data: { ackSentAt: null },
            });
            continue;
          }

          console.log(`[CRON] Welcome envoyé → ${lead.email} (lead ${lead.id})`);

          // Programme l'offre à T+15min (ackSentAt déjà setté par le claim atomique).
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              nextRelanceAt: new Date(now.getTime() + 15 * 60 * 1000), // 15 min → offer
            },
          });

          stats.welcomeSent++;
          continue; // ← passe au lead suivant, ne pas traiter de relance
        }

        // ================================================================
        // c-bis) BRANCHE OFFRE — ackSentAt non-null + offerSentAt null → offer
        // ================================================================
        // T+15min après le welcome, on envoie l'offre de prêt (template `offer`)
        // avec le tableau d'amortissement PDF en pièce jointe.
        if (lead.ackSentAt && !lead.offerSentAt) {
          // CLAIM ATOMIQUE — set offerSentAt immédiatement (anti-doublon concurrent).
          const claimed = await prisma.lead.updateMany({
            where: { id: lead.id, offerSentAt: null },
            data: { offerSentAt: now },
          });
          if (claimed.count === 0) continue;

          const leadLang = lead.preferredLanguage || 'fr';
          let offerTemplate = await prisma.emailTemplate.findFirst({
            where: { trigger: EmailTrigger.offer, status: 'active', language: leadLang },
          });
          if (!offerTemplate && leadLang !== 'fr') {
            offerTemplate = await prisma.emailTemplate.findFirst({
              where: { trigger: EmailTrigger.offer, status: 'active', language: 'fr' },
            });
          }

          if (!offerTemplate) {
            stats.skippedNoTemplate++;
            // Reset offerSentAt pour réessayer plus tard si le template est créé
            await prisma.lead.update({
              where: { id: lead.id },
              data: { offerSentAt: null },
            });
            continue;
          }

          const siteUrl = await getSetting('site_url', 'http://localhost:3100');
          const ctx = { lead: { ...lead, advisorName: lead.assignedTo?.displayName ?? null }, siteUrl, brand: brandToContext(brand) };
          const offerSubject = interpolateTemplate(offerTemplate.subject, ctx);
          const offerBody = interpolateTemplate(offerTemplate.bodyText, ctx);
          const offerRawHtml = offerTemplate.htmlContent
            ? interpolateTemplate(offerTemplate.htmlContent, ctx)
            : textToHtml(offerBody);

          const offerHtml = composeEmailHtml({
            bodyHtml: offerRawHtml,
            bodyText: offerBody,
            brand,
            unsubscribeUrl: buildUnsubscribeUrl(lead, siteUrl),
            bannerEnabled: offerTemplate.bannerEnabled,
            subject: offerSubject,
          });

          // Tableau d'amortissement PDF en pièce jointe.
          const pdfAttachment = await getOfferAttachment(lead.id, lead.firstName, lead.lastName);
          const offerAttachments = pdfAttachment ? [pdfAttachment] : undefined;

          const offerResult = await sendEmail(gateway, {
            to: lead.email,
            subject: offerSubject,
            html: offerHtml,
            text: offerBody,
            attachments: offerAttachments,
          });

          await prisma.emailLog.create({
            data: {
              leadId: lead.id,
              email: lead.email,
              trigger: 'offer',
              templateName: offerTemplate.name,
              subject: offerSubject,
              bodyText: offerBody,
              status: offerResult.success ? 'sent' : 'failed',
              error: offerResult.success ? null : (offerResult.error || 'Unknown error'),
            },
          });

          if (!offerResult.success) {
            console.error(`[CRON] Échec offer → ${lead.email} (lead ${lead.id}):`, offerResult.error);
            stats.errors++;
            // Reset offerSentAt → le cron réessaiera au prochain passage.
            await prisma.lead.update({
              where: { id: lead.id },
              data: { offerSentAt: null },
            });
            continue;
          }

          console.log(`[CRON] Offer envoyée → ${lead.email} (lead ${lead.id})`);

          // Programme la première relance à J+3 (offerSentAt déjà setté par le claim).
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              nextRelanceAt: new Date(now.getTime() + 3 * DAY), // J+3 → relance_1
            },
          });

          stats.offerSent++;
          continue;
        }

        // ================================================================
        // d) BRANCHE RELANCE — ackSentAt non-null → relance_N
        // ================================================================

        // d-a) Détermine le template imposé (relance_1, relance_2, relance_3)
        const nextRelanceNum = lead.relanceCount + 1; // 1, 2, ou 3
        const triggerKey = `relance_${nextRelanceNum}` as EmailTrigger;
        // Template dans la langue du prospect (fallback français si absent).
        const leadLang = lead.preferredLanguage || 'fr';
        let template = await prisma.emailTemplate.findFirst({
          where: { trigger: triggerKey, status: 'active', language: leadLang },
        });
        if (!template && leadLang !== 'fr') {
          template = await prisma.emailTemplate.findFirst({
            where: { trigger: triggerKey, status: 'active', language: 'fr' },
          });
        }

        if (!template) {
          // Pas de template actif pour cette étape — on log et on skippe
          stats.skippedNoTemplate++;
          continue;
        }

        // d) Interpole les variables du template (fallback de base)
        const siteUrl = await getSetting('site_url', 'http://localhost:3100');
        const ctx = { lead: { ...lead, advisorName: lead.assignedTo?.displayName ?? null }, siteUrl, brand: brandToContext(brand) };
        const fallbackSubject = interpolateTemplate(template.subject, ctx);
        const fallbackBody = interpolateTemplate(template.bodyText, ctx);

        // d-bis) Génération IA — l'Agent Relance personnalise l'email.
        // Si le template est CONFIDENTIEL, l'IA est contournée : le template
        // est envoyé tel quel, sans que l'IA ne puisse en lire le contenu.
        let subject: string;
        let bodyText: string;
        let generated = false;

        if (template.isConfidential) {
          // Template verrouillé — envoi direct sans passer par l'IA.
          subject = fallbackSubject;
          bodyText = fallbackBody;
        } else {
          const aiResult = await generateEmail({
            agentRole: 'relance',
            trigger: `relance_${nextRelanceNum}`,
            leadContext: {
              firstName: lead.firstName,
              lastName: lead.lastName,
              email: lead.email ?? undefined,
              phone: lead.phone,
              loanType: lead.loanType,
              amount: lead.amount ?? undefined,
              durationYears: lead.durationYears ?? undefined,
              monthlyPayment: lead.monthlyPayment ?? undefined,
              annualRate: lead.annualRate ?? undefined,
              relanceCount: lead.relanceCount,
              preferredLanguage: lead.preferredLanguage,
            },
            fallbackSubject,
            fallbackBody,
          });
          subject = aiResult.subject;
          bodyText = aiResult.bodyText;
          generated = aiResult.generated;
        }
        const relanceRawHtml = template.htmlContent && !generated
          ? interpolateTemplate(template.htmlContent, ctx)
          : textToHtml(bodyText);

        const htmlContent = composeEmailHtml({
          bodyHtml: relanceRawHtml,
          bodyText,
          brand,
          unsubscribeUrl: buildUnsubscribeUrl(lead, siteUrl),
          bannerEnabled: template.bannerEnabled,
          subject,
        });

        if (generated) {
          console.log(`[CRON RELANCE] Email généré par IA (lead ${lead.id}, relance ${nextRelanceNum})`);
        } else {
          console.log(`[CRON RELANCE] Template envoyé${template.isConfidential ? ' (confidentiel — IA contournée)' : ' (fallback)'} (lead ${lead.id}, relance ${nextRelanceNum})`);
        }

        // e) Envoi réel via le gateway actif.
        //    R1 et R2 : on renvoie l'offre (tableau d'amortissement PDF) en pièce
        //    jointe au cas où le prospect ne l'aurait pas vue. R3 : pas de renvoi.
        let attachments;
        if (nextRelanceNum <= 2) {
          const pdf = await getOfferAttachment(lead.id, lead.firstName, lead.lastName);
          if (pdf) attachments = [pdf];
        }

        const sendResult = await sendEmail(gateway, {
          to: lead.email,
          subject,
          html: htmlContent,
          text: bodyText,
          attachments,
        });

        // e-bis) Journalisation de la tentative d'envoi dans EmailLog.
        await prisma.emailLog.create({
          data: {
            leadId: lead.id,
            email: lead.email,
            trigger: triggerKey,
            templateName: generated ? `${template.name} (IA)` : template.name,
            subject,
            bodyText,
            status: sendResult.success ? 'sent' : 'failed',
            error: sendResult.success ? null : (sendResult.error || 'Unknown error'),
          },
        });

        if (!sendResult.success) {
          console.error(
            `[CRON RELANCE] Échec envoi ${triggerKey} → ${lead.email} (lead ${lead.id}):`,
            sendResult.error,
          );
          stats.errors++;

          // Notification admin : échec d'envoi email
          await createNotification({
            type: 'email_failed',
            title: 'Échec d\'envoi email',
            message: `Relance ${nextRelanceNum}/3 échouée pour ${lead.firstName} ${lead.lastName} (${lead.email}). Erreur: ${sendResult.error ?? 'inconnue'}`,
            icon: 'alert-triangle',
            severity: 'danger',
            linkUrl: `/leads?id=${lead.id}`,
            relatedEntityId: lead.id,
          });

          continue; // N'incrémente pas — le cron réessayera au prochain passage
        }

        console.log(
          `[CRON RELANCE] ${triggerKey} envoyé → ${lead.email} ` +
          `(lead ${lead.id}, relance ${nextRelanceNum}/3, msgId: ${sendResult.messageId ?? 'n/a'})`,
        );

        // f) Incrémente le compteur + programme la prochaine relance (J+3)
        const newCount = nextRelanceNum;
        const isLast = newCount >= 3;

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            relanceCount: newCount,
            nextRelanceAt: isLast ? null : new Date(now.getTime() + 3 * DAY),
            sequenceActive: !isLast,
            sequenceEndedAt: isLast ? now : undefined,
            exitReason: isLast ? SequenceExitReason.max_relances : undefined,
            status: isLast ? 'lost' : undefined, // 3 relances sans réponse → lost
          },
        });

        if (isLast) {
          stats.maxRelances++;

          // Notification admin : séquence terminée (3 relances épuisées)
          await createNotification({
            type: 'sequence_max_relances',
            title: 'Séquence de relance terminée',
            message: `3 relances envoyées sans réponse pour ${lead.firstName} ${lead.lastName}. Dossier clos.`,
            icon: 'alert-triangle',
            severity: 'warning',
            linkUrl: `/leads?id=${lead.id}`,
            relatedEntityId: lead.id,
          });
        } else {
          stats.sent++;
        }
      } catch (err) {
        console.error(`[CRON RELANCE] Erreur lead ${lead.id}:`, err);
        stats.errors++;
      }
    }

    return successResponse(stats, 200);
  } catch (err) {
    console.error('[CRON RELANCE] Erreur fatale:', err);
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
