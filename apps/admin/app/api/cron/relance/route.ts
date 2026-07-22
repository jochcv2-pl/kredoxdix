import { NextRequest } from 'next/server';
import { prisma, EmailTrigger, SequenceExitReason } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { getSetting, getSettingNumber, getActiveGateway } from '../../_lib/settings';
import { sendEmail } from '../../_lib/email-sender';
import { interpolateTemplate, textToHtml } from '../../_lib/template-interpolation';
import { getOfferAttachment } from '../../_lib/campaign-sender';

// =============================================================================
// POST /api/cron/relance
// =============================================================================
// Job cron de la séquence de relance (J+3 / J+6 / J+9).
// Protégé par header Authorization: Bearer <CRON_SECRET> (env var).
//
// Le cron :
//   1. Traite les TIMEOUTS (leads en séquence > N jours sans validation).
//   2. Sélectionne les relances dues (sequenceActive + nextRelanceAt dépassé).
//   3. Pour chaque lead : vérifie SuppressionList, récupère le template imposé,
//      envoie via le gateway actif, incrémente le compteur, programme la prochaine.
//   4. Si relanceCount atteint 3 → sortie max_relances.
//   5. Respecte le cap journalier (cadence_daily_cap).
//
// L'IA ne lit jamais rien — ce job est purement système.
// L'envoi réel via Resend/SMTP sera branché quand les clés API seront en place.
// =============================================================================

const DAY = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  // ----- Authentification : CRON_SECRET obligatoire -----
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401);
  }

  try {
    const now = new Date();

    // ----- Paramètres cadence -----
    const timeoutDays = await getSettingNumber('cadence_timeout_days', 10);
    const dailyCap = await getSettingNumber('cadence_daily_cap', 200);

    const stats = {
      timeouts: 0,
      suppressed: 0,
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
      select: { id: true },
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
        relanceCount: true,
        unsubscribeToken: true,
        preferredLanguage: true,
      },
    });

    // Vérifie qu'un gateway actif existe (sinon on skippe avec un log).
    const gateway = await getActiveGateway();
    if (!gateway) {
      stats.skippedNoGateway = dueLeads.length;
      return successResponse({ ...stats, note: 'Aucun gateway actif — envois skipés' }, 200);
    }

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

        // b) Détermine le template imposé (relance_1, relance_2, relance_3)
        const nextRelanceNum = lead.relanceCount + 1; // 1, 2, ou 3
        const triggerKey = `relance_${nextRelanceNum}` as EmailTrigger;
        const template = await prisma.emailTemplate.findFirst({
          where: { trigger: triggerKey, status: 'active' },
        });

        if (!template) {
          // Pas de template actif pour cette étape — on log et on skippe
          stats.skippedNoTemplate++;
          continue;
        }

        // c) Lead sans email — skippe (le canal principal est le téléphone,
        //    mais la relance email nécessite un email)
        if (!lead.email) {
          stats.errors++;
          continue;
        }

        // d) Interpole les variables du template avec les données du lead
        const siteUrl = await getSetting('site_url', 'http://localhost:3100');
        const ctx = { lead, siteUrl };
        const subject = interpolateTemplate(template.subject, ctx);
        const bodyText = interpolateTemplate(template.bodyText, ctx);
        const htmlContent = template.htmlContent
          ? interpolateTemplate(template.htmlContent, ctx)
          : textToHtml(bodyText);

        // e) Envoi réel via le gateway actif
        //    Cas défensif : si le template imposé est une offre (rare pour la
        //    séquence de relance, mais possible si l'admin redéfinit les slots),
        //    on joint le tableau d'amortissement PDF.
        let attachments;
        if (template.trigger === EmailTrigger.offer) {
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
            templateName: template.name,
            subject,
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
