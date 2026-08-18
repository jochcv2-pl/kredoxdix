// =============================================================================
// POST /api/leads/[id]/send-offer — Envoi manuel immédiat de l'offre de prêt.
// =============================================================================
// Le chaînon manquant entre le 100% automatique (cron T+15min) et le détour
// campagnes : le conseiller qui vient de raccrocher avec un prospect chaud
// envoie l'offre instantanément, avec le tableau d'amortissement PDF en PJ.
//
// - Template trigger 'offer' actif : langue du lead → FR → n'importe quelle
//   langue (même cascade que le cron relance / pipeline-test).
// - Gateway du lead (DEC-K5 : SMTP de l'owner assigné, sinon système).
// - PDF via getOfferAttachment (null si données de prêt incomplètes —
//   l'email part alors sans pièce jointe, avec un log de diagnostic).
// - offerSentAt = maintenant → re-ancre {{date_expiration_offre}} et
//   satisfait le cron (il ne renverra pas l'offre automatiquement).
// - Traçabilité : EmailLog (trigger 'offer', templateName suffixé 'manuel')
//   + Journal d'audit (action 'send', IP).
//
// Body : {} (aucun paramètre). Réponse : succès 200 ou 400/404/503.
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma, EmailTrigger } from '@kredix/db';
import {
  interpolateTemplate,
  textToHtml,
  buildUnsubscribeUrl,
  composeEmailHtml,
  loadBrandData,
  brandToContext,
  getSetting,
  getGatewayForLead,
  extractGatewayInfo,
  sendEmail,
  type InterpolationContext,
} from '@kredix/email';
import { getOfferAttachment } from '@/app/api/_lib/campaign-sender';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '@/app/api/_lib/auth-server';
import { getLeadScope } from '@/app/api/_lib/scope';
import { isValidId } from '@/app/api/_lib/id-validation';
import { logAudit, getClientIpFromHeaders } from '@/app/api/_lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // 1. Lead — findFirst avec scope : anti-IDOR (DEC-K5).
    //    Un conseiller n'envoie l'offre qu'à ses propres leads.
    const lead = await prisma.lead.findFirst({
      where: { id, ...getLeadScope(admin) },
      include: {
        assignedTo: { select: { firstName: true, lastName: true, phone: true, email: true, displayName: true } },
      },
    });
    if (!lead) {
      return errorResponse('Prospect introuvable', ERR.NOT_FOUND.code, undefined, 404);
    }
    if (!lead.email) {
      return errorResponse('Ce prospect n\'a pas d\'adresse email.', ERR.VALIDATION.code, undefined, 400);
    }

    // 2. Template offer actif — cascade langue du lead → FR → n'importe laquelle.
    const leadLang = lead.preferredLanguage || 'fr';
    let template = await prisma.emailTemplate.findFirst({
      where: { trigger: EmailTrigger.offer, status: 'active', language: leadLang },
    });
    if (!template && leadLang !== 'fr') {
      template = await prisma.emailTemplate.findFirst({
        where: { trigger: EmailTrigger.offer, status: 'active', language: 'fr' },
      });
    }
    if (!template) {
      template = await prisma.emailTemplate.findFirst({
        where: { trigger: EmailTrigger.offer, status: 'active' },
      });
    }
    if (!template) {
      return errorResponse(
        'Aucun template actif pour le déclencheur « Offre ». Créez et activez un modèle dans Emails.',
        ERR.NOT_FOUND.code,
        undefined,
        404,
      );
    }

    // 3. Gateway du lead (SMTP de l'owner si assigné, sinon système).
    const gateway = await getGatewayForLead(lead.id);
    if (!gateway) {
      return errorResponse(
        'Aucun gateway email actif. Configurez un fournisseur dans Paramètres → Emails.',
        ERR.INTERNAL.code,
        undefined,
        503,
      );
    }

    // 4. Interpolation + composition (même chaîne que le cron).
    const now = new Date();
    const siteUrl = await getSetting('site_url', 'http://localhost:3100');
    const brand = await loadBrandData();
    // offerSentAt = maintenant → la date d'expiration de l'offre se re-ancrée
    // sur cet envoi manuel (et non sur un ancien envoi expiré).
    const ctx: InterpolationContext = {
      lead: { ...lead, offerSentAt: now, advisorName: lead.assignedTo?.displayName ?? null },
      siteUrl,
      brand: brandToContext(brand),
      advisor: lead.assignedTo ?? undefined,
    };

    const subject = interpolateTemplate(template.subject, ctx);
    const bodyText = interpolateTemplate(template.bodyText, ctx);
    const rawHtml = template.htmlContent
      ? interpolateTemplate(template.htmlContent, ctx)
      : textToHtml(bodyText, leadLang);
    const html = composeEmailHtml({
      bodyHtml: rawHtml,
      bodyText,
      brand,
      unsubscribeUrl: buildUnsubscribeUrl(lead, siteUrl),
      bannerEnabled: template.bannerEnabled,
      subject,
    });

    // 5. Tableau d'amortissement PDF en pièce jointe (null si données
    //    incomplètes — l'email part sans PJ, log de diagnostic côté helper).
    const pdfAttachment = await getOfferAttachment(lead.id, lead.firstName, lead.lastName);
    const attachments = pdfAttachment ? [pdfAttachment] : undefined;

    // 6. Envoi réel.
    const result = await sendEmail(gateway, { to: lead.email, subject, html, text: bodyText, attachments });
    if (!result.success) {
      return errorResponse(result.error ?? 'Échec de l\'envoi.', ERR.INTERNAL.code, undefined, 502);
    }

    // 7. offerSentAt = maintenant (dans une transaction avec le log) :
    //    - re-ancre {{date_expiration_offre}} sur cet envoi
    //    - le cron ne renverra pas l'offre (condition !offerSentAt satisfaite)
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { offerSentAt: now },
      }),
      prisma.emailLog.create({
        data: {
          leadId: lead.id,
          email: lead.email,
          trigger: 'offer',
          templateName: `${template.name} (manuel)`,
          subject,
          bodyText,
          status: 'sent',
          ...extractGatewayInfo(gateway),
        },
      }),
    ]);

    // 8. Journal d'audit.
    await logAudit({
      admin: admin!,
      action: 'send',
      entity: 'lead',
      entityId: lead.id,
      metadata: {
        kind: 'offer_manual',
        to: lead.email,
        templateName: template.name,
        hasPdf: !!pdfAttachment,
      },
      ipAddress: getClientIpFromHeaders(req.headers),
    });

    return successResponse({
      to: lead.email,
      template: template.name,
      hasPdf: !!pdfAttachment,
      offerSentAt: now.toISOString(),
    });
  } catch (err) {
    console.error('[POST /api/leads/[id]/send-offer] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
