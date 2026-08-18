// =============================================================================
// POST /api/emails/adhoc — Envoi ponctuel d'un modèle à un destinataire hors CRM.
// =============================================================================
// L'admin choisit un modèle existant, saisit l'adresse du destinataire (qui
// n'est PAS obligatoirement un lead du CRM) et des informations optionnelles
// (prénom, nom, message personnalisé) pour l'interpolation des variables.
//
// Différences avec POST /api/templates/[id]/test :
//   - envoi RÉEL (pas de préfixe [TEST], pas de données démo Jean Dupont)
//   - variables interpolées avec les informations saisies (champs vides = vides)
//
// Body : { templateId, to, firstName?, lastName?, customMessage? }
// Auth  : requireAuth() — envoi via le SMTP de l'admin connecté (DEC-K5).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '@/app/api/_lib/auth-server';
import { logAudit, getClientIpFromHeaders } from '@/app/api/_lib/audit';
import {
  interpolateTemplate,
  textToHtml,
  composeEmailHtml,
  loadBrandData,
  brandToContext,
  getSetting,
  getPrimaryGateway,
  extractGatewayInfo,
  sendEmail,
  type InterpolationContext,
} from '@kredix/email';

const adhocSchema = z.object({
  templateId: z.string().min(1),
  to: z.string().email().max(254),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  customMessage: z.string().max(5000).optional(),
  // Overrides éditables avant envoi (valeurs pré-remplies du modèle côté UI).
  // NON persistés : le modèle EmailTemplate n'est jamais modifié par cette route.
  subject: z.string().max(300).optional(),
  bodyText: z.string().max(50_000).optional(),
  bodyHtml: z.string().max(200_000).optional(),
});

export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAuth();
  if (deny) return deny;

  const [data, error] = await parseBody(req, adhocSchema);
  if (error) return error;

  try {
    // 1. Modèle — champs nécessaires à l'interpolation + traçabilité.
    const template = await prisma.emailTemplate.findUnique({
      where: { id: data.templateId },
      select: {
        id: true,
        name: true,
        subject: true,
        bodyText: true,
        htmlContent: true,
        bannerEnabled: true,
      },
    });
    if (!template) {
      return errorResponse('Modèle introuvable.', ERR.NOT_FOUND.msg, undefined, 404);
    }

    // 2. Gateway — SMTP de l'admin connecté (cohérent DEC-K5 / test-send).
    const gateway = await getPrimaryGateway(admin!.id);
    if (!gateway) {
      return errorResponse(
        'Aucun gateway email actif. Configurez un fournisseur dans Paramètres → Emails.',
        ERR.INTERNAL.code,
        undefined,
        503,
      );
    }

    // 3. Contexte d'interpolation — lead "virtuel" adhoc.
    //    Les champs non renseignés restent vides dans l'email ; les variables
    //    de prêt affichent des valeurs neutres (0 € / 0 ans) — l'admin choisit
    //    un modèle adapté à un envoi ponctuel (visible en Aperçu avant envoi).
    const siteUrl = await getSetting('site_url', 'http://localhost:3100');
    const brand = await loadBrandData();
    const ctx: InterpolationContext = {
      lead: {
        id: `adhoc-${randomUUID().slice(0, 8)}`,
        reference: null,
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        email: data.to,
        phone: '',
        amount: 0,
        durationYears: 0,
        monthlyPayment: null,
        annualRate: null,
        loanType: 'autre',
        companyName: null,
        createdAt: new Date(),
        offerSentAt: null,
        unsubscribeToken: randomUUID(),
        preferredLanguage: 'fr',
        advisorName: admin!.displayName ?? null,
      },
      siteUrl,
      brand: brandToContext(brand),
      customMessage: data.customMessage,
    };

    // 4. Contenu effectif : overrides édités par l'admin (ponctuels, non
    //    sauvegardés) avec fallback sur le contenu du modèle.
    //    Pour un modèle HTML, l'UI édite bodyHtml (bodyText reste la version
    //    texte du modèle). Pour un modèle texte, l'UI édite bodyText.
    const isHtmlTemplate = template.htmlContent !== null;
    const effectiveSubject = (data.subject ?? '').trim() || template.subject;
    const effectiveBodyText = !isHtmlTemplate && (data.bodyText ?? '').trim()
      ? data.bodyText!
      : template.bodyText;
    const effectiveHtml = isHtmlTemplate && (data.bodyHtml ?? '').trim()
      ? data.bodyHtml!
      : template.htmlContent;

    // 5. Interpolation + composition (même chaîne que le cron/campagnes).
    const subject = interpolateTemplate(effectiveSubject, ctx);
    const bodyText = interpolateTemplate(effectiveBodyText, ctx);
    const rawHtml = effectiveHtml
      ? interpolateTemplate(effectiveHtml, ctx)
      : textToHtml(bodyText, 'fr');
    const html = composeEmailHtml({
      bodyHtml: rawHtml,
      bodyText,
      brand,
      unsubscribeUrl: `${siteUrl}/api/unsubscribe?t=${ctx.lead.unsubscribeToken}`,
      bannerEnabled: template.bannerEnabled,
      subject,
    });

    // 6. Envoi réel.
    const result = await sendEmail(gateway, { to: data.to, subject, html, text: bodyText });
    if (!result.success) {
      return errorResponse(
        result.error ?? 'Échec de l\'envoi.',
        ERR.INTERNAL.code,
        undefined,
        502,
      );
    }

    // 7. Traçabilité — EmailLog (compte dans le plafond journalier SMTP) + audit.
    //    "édité" = le contenu envoyé diffère du modèle (override ponctuel).
    const wasEdited =
      effectiveSubject !== template.subject ||
      effectiveBodyText !== template.bodyText ||
      effectiveHtml !== template.htmlContent;
    try {
      await prisma.emailLog.create({
        data: {
          email: data.to,
          trigger: 'manual',
          templateName: `${template.name} (ponctuel${wasEdited ? ', édité' : ''})`,
          subject,
          bodyText,
          status: 'sent',
          ...extractGatewayInfo(gateway),
        },
      });
    } catch {
      // Non bloquant.
    }
    await logAudit({
      admin: admin!,
      action: 'send',
      entity: 'adhoc_email',
      entityId: template.id,
      metadata: { to: data.to, templateName: template.name, edited: wasEdited },
      ipAddress: getClientIpFromHeaders(req.headers),
    });

    return successResponse({ messageId: result.messageId, to: data.to });
  } catch (err) {
    console.error('[POST /api/emails/adhoc] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
