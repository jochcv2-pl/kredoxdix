// =============================================================================
// POST /api/gateways/[id]/test — Teste une passerelle email.
// =============================================================================
// Envoie un email de test à from_email (ou à défaut à l'email de l'admin).
// Retourne { success: boolean, messageId?: string, error?: string }.
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { isValidId } from '@/app/api/_lib/id-validation';
import { requireAuth } from '../../../_lib/auth-server';
import { getSetting } from '@/app/api/_lib/settings';
import { sendEmail } from '@/app/api/_lib/email-sender';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const gateway = await prisma.emailGateway.findUnique({ where: { id } });
    if (!gateway) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Adresse de destination : from_email setting ou fallback
    const fromEmail = await getSetting('from_email', 'noreply@kredix.fr');
    const testEmail = fromEmail.includes('<')
      ? fromEmail.match(/<(.+)>/)?.[1] || 'admin@kredix.fr'
      : fromEmail || 'admin@kredix.fr';

    const result = await sendEmail(gateway, {
      to: testEmail,
      subject: `[TEST] Kredix — Passerelle ${gateway.label} fonctionnelle`,
      html: `<h2>✅ Test réussi</h2><p>Cet email confirme que la passerelle <b>${gateway.label}</b> (${gateway.provider}) fonctionne correctement.</p><p>Si vous recevez cet email, l'envoi SMTP/API est opérationnel.</p><hr><p style="color:#999;font-size:12px;">Email de test envoyé depuis le CRM Kredix.</p>`,
      text: `Test réussi — Passerelle ${gateway.label} (${gateway.provider}) fonctionne correctement.`,
    });

    if (result.success) {
      return successResponse({ success: true, messageId: result.messageId, sentTo: testEmail }, 200);
    } else {
      return successResponse({ success: false, error: result.error || 'Échec de l\'envoi' }, 200);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return errorResponse(msg, ERR.INTERNAL.code, undefined, 500);
  }
}
