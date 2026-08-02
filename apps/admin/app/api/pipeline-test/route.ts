// =============================================================================
// /api/pipeline-test — Test séquence email pipeline (Bienvenue, Offre, R1-R3).
// =============================================================================
// Envoie un email de test complet pour chaque étape du pipeline automatique.
// Offre et relances 1/2 incluent le PDF d'amortissement en pièce jointe.
//
// POST /api/pipeline-test
// Body: { step: 'welcome' | 'offer' | 'relance_1' | 'relance_2' | 'relance_3', email: string }
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, EmailTrigger } from '@kredix/db';
import {
  interpolateTemplate,
  textToHtml,
  buildUnsubscribeUrl,
  composeEmailHtml,
  loadBrandData,
  brandToContext,
  getSetting,
  getPrimaryGateway,
  sendEmail,
  type InterpolationContext,
} from '@kredix/email';
import { generateAmortizationPDF } from '@/app/api/_lib/amortization';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';

const STEP_CONFIG: Record<string, EmailTrigger> = {
  welcome: 'reception_ack',
  offer: 'offer',
  relance_1: 'relance_1',
  relance_2: 'relance_2',
  relance_3: 'relance_3',
};

const STEP_LABELS: Record<string, string> = {
  welcome: 'Bienvenue',
  offer: 'Offre',
  relance_1: 'Relance J+3',
  relance_2: 'Relance J+6',
  relance_3: 'Relance J+9',
};

const STEPS_WITH_PDF = new Set(['offer', 'relance_1', 'relance_2']);

const TEST_LEAD: InterpolationContext['lead'] = {
  id: 'test-pipeline-0001',
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
  createdAt: new Date(),
  offerSentAt: new Date(),
  unsubscribeToken: 'test-token-pipeline',
  preferredLanguage: 'fr',
  advisorName: 'Marie Lefèvre',
};

const bodySchema = z.object({
  step: z.string().refine((s) => s in STEP_CONFIG, { message: 'Étape invalide' }),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Paramètres invalides : step (welcome|offer|relance_1|relance_2|relance_3) + email requis', ERR.VALIDATION.code, undefined, 400);
  }

  const { step, email: testEmail } = parsed.data;
  const trigger = STEP_CONFIG[step];

  // 1. Gateway actif
  const gateway = await getPrimaryGateway();
  if (!gateway) {
    return errorResponse('Aucun gateway email actif.', ERR.INTERNAL.code, undefined, 503);
  }

  // 2. Template actif pour ce trigger
  const template = await prisma.emailTemplate.findFirst({
    where: { trigger, status: 'active', language: 'fr' },
  });
  if (!template) {
    return errorResponse(`Aucun template actif pour l'étape "${STEP_LABELS[step]}" (${trigger}). Créez et activez un template dans Emails.`, ERR.NOT_FOUND.code, undefined, 404);
  }

  try {
    // 3. Contexte interpolation
    const siteUrl = await getSetting('site_url', 'http://localhost:3100');
    const brand = await loadBrandData();
    const ctx: InterpolationContext = {
      lead: TEST_LEAD,
      siteUrl,
      brand: brandToContext(brand),
    };

    const subject = interpolateTemplate(template.subject, ctx);
    const bodyText = interpolateTemplate(template.bodyText, ctx);
    const rawHtml = template.htmlContent
      ? interpolateTemplate(template.htmlContent, ctx)
      : textToHtml(bodyText, 'fr');

    const html = composeEmailHtml({
      bodyHtml: rawHtml,
      bodyText,
      brand,
      unsubscribeUrl: buildUnsubscribeUrl(TEST_LEAD, siteUrl),
      bannerEnabled: false,
      subject,
    });

    // 4. PDF pour Offre / R1 / R2
    let attachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined;
    if (STEPS_WITH_PDF.has(step)) {
      const siteName = await getSetting('site_name', 'Kredix');
      const pdfBuffer = await generateAmortizationPDF({
        amount: TEST_LEAD.amount,
        annualRate: TEST_LEAD.annualRate ?? 3.85,
        durationYears: TEST_LEAD.durationYears,
        firstName: TEST_LEAD.firstName,
        lastName: TEST_LEAD.lastName,
        siteName,
      });
      attachments = [{
        filename: 'tableau-amortissement.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      }];
    }

    // 5. Envoi
    const result = await sendEmail(gateway, {
      to: testEmail,
      subject: `[TEST PIPELINE] [${STEP_LABELS[step]}] ${subject}`,
      html,
      text: bodyText,
      attachments,
    });

    if (!result.success) {
      return errorResponse(result.error ?? 'Échec de l\'envoi', ERR.INTERNAL.code, undefined, 500);
    }

    // 6. Log
    try {
      await prisma.emailLog.create({
        data: {
          email: testEmail,
          trigger: 'manual',
          templateName: `${template.name} (TEST PIPELINE: ${STEP_LABELS[step]})`,
          subject: `[TEST PIPELINE] [${STEP_LABELS[step]}] ${subject}`,
          bodyText,
          status: 'sent',
        },
      });
    } catch { /* non bloquant */ }

    return successResponse({
      step,
      label: STEP_LABELS[step],
      template: template.name,
      email: testEmail,
      hasPdf: !!attachments,
      messageId: result.messageId,
    });
  } catch (err) {
    console.error(`[PIPELINE TEST] Erreur étape ${step}:`, err);
    return errorResponse(err instanceof Error ? err.message : 'Erreur interne', ERR.INTERNAL.code, undefined, 500);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
