import { GatewayProvider, decryptSecret, type EmailGateway } from '@kredix/db';
import { getSetting } from './settings';

// =============================================================================
// @kredix/email/sender — Adapter d'envoi d'emails (Resend / Brevo / SMTP).
// =============================================================================
// Extrait depuis apps/admin/app/api/_lib/email-sender.ts.
// Dispatch vers le bon SDK selon gateway.provider.
// La clé API est lue depuis EmailGateway.apiKey (DB).
// L'adresse d'expédition est lue depuis Setting.from_email (CMS admin).

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

type EffectiveSendParams = Required<Pick<SendEmailParams, 'to' | 'subject' | 'html' | 'from'>> & {
  text?: string;
  attachments?: EmailAttachment[];
};

/**
 * Résout l'adresse d'expédition dans l'ordre de priorité :
 * 1. config.from (spécifique au gateway — JSON EmailGateway.config)
 *    → Le from est LIÉ au gateway, pas global. Changer de gateway = changer de from.
 * 2. config.username (SMTP — l'utilisateur SMTP est généralement l'adresse d'envoi)
 * 3. params.from (override caller — ex: campagne avec expéditeur dédié)
 * 4. Setting from_email (legacy global — backward compat, dernier recours)
 * 5. Erreur (pas de fallback hardcoded — l'admin doit configurer son adresse)
 */
async function resolveFrom(
  config: Record<string, unknown>,
  paramsFrom?: string,
): Promise<string> {
  // 1. Gateway-specific config.from — priorité absolue (lié au gateway actif)
  const configFrom = config.from as string | undefined;
  if (configFrom) return configFrom;
  // 2. SMTP username (pour les gateways SMTP, le username = adresse d'envoi)
  const smtpUser = config.username as string | undefined;
  if (smtpUser) return smtpUser;
  // 3. Caller override
  if (paramsFrom) return paramsFrom;
  // 4. Legacy global Setting from_email (backward compat — dernier recours)
  const settingFrom = await getSetting('from_email', '');
  if (settingFrom) return settingFrom;
  // 5. Aucune adresse configurée — on retourne une chaîne vide.
  //    Le caller doit vérifier et retourner une erreur explicite.
  return '';
}

export async function sendEmail(
  gateway: EmailGateway,
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const config = (gateway.config ?? {}) as Record<string, unknown>;
  const from = await resolveFrom(config, params.from);

  console.log(`[EMAIL] Gateway="${gateway.label}" provider=${gateway.provider} from="${from}" to="${params.to}" subject="${params.subject}"`);

  if (!from) {
    return {
      success: false,
      error: "Aucune adresse d'expédition configurée. Le champ From du gateway est vide.",
    };
  }

  // Déchiffre la clé API si elle est stockée chiffrée (préfixe "enc:").
  const apiKey = gateway.apiKey ? decryptSecret(gateway.apiKey) : null;

  if (!apiKey && gateway.provider !== GatewayProvider.smtp) {
    return { success: false, error: `Aucune clé API configurée pour ${gateway.label}` };
  }

  switch (gateway.provider) {
    case GatewayProvider.resend:
      return sendViaResend(apiKey!, { ...params, from });
    case GatewayProvider.brevo:
      return sendViaBrevo(apiKey!, { ...params, from });
    case GatewayProvider.smtp:
      return sendViaSmtp(config, apiKey, { ...params, from });
    default:
      return { success: false, error: `Provider non supporté: ${gateway.provider}` };
  }
}

async function sendViaResend(
  apiKey: string,
  params: EffectiveSendParams,
): Promise<SendEmailResult> {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        content_type: a.contentType,
      })),
    });

    if (error) {
      return { success: false, error: `Resend: ${error.message}` };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    return { success: false, error: `Resend: ${(err as Error).message}` };
  }
}

async function sendViaBrevo(
  apiKey: string,
  params: EffectiveSendParams,
): Promise<SendEmailResult> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: params.from },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
        textContent: params.text,
        attachment: params.attachments?.map((a) => ({
          name: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Brevo: ${res.status} ${body}` };
    }

    const data = (await res.json()) as { messageId?: string };
    return { success: true, messageId: data.messageId };
  } catch (err) {
    return { success: false, error: `Brevo: ${(err as Error).message}` };
  }
}

async function sendViaSmtp(
  config: Record<string, unknown>,
  apiKey: string | null,
  params: EffectiveSendParams,
): Promise<SendEmailResult> {
  try {
    const nodemailer = await import('nodemailer');

    const host = (config.host as string) || 'localhost';
    const port = (config.port as number) || 587;
    const username = (config.username as string) || undefined;
    const password = apiKey || (config.password as string) || undefined;
    const encryption = (config.encryption as string) || 'starttls';

    const secure = encryption === 'ssl' || (port === 465 && encryption !== 'none');

    console.log(`[SMTP] Connecting to ${host}:${port} (encryption=${encryption}, secure=${secure}, auth=${username ? 'yes' : 'no'}, from=${params.from})`);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: encryption === 'starttls',
      auth: username ? { user: username, pass: password } : undefined,
      // Logging détaillé pour diagnostic — apparaît dans docker logs
      debug: true,
      logger: true,
    });

    // Vérifie la connexion SMTP avant l'envoi (révèle les erreurs d'auth/réseau).
    try {
      await transporter.verify();
      console.log('[SMTP] Connection verified ✓');
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      console.error('[SMTP] Connection verification FAILED:', msg);
      return { success: false, error: `SMTP verify failed: ${msg}` };
    }

    const info = await transporter.sendMail({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    console.log(`[SMTP] Sent ✓ messageId=${info.messageId} response=${info.response}`);

    return { success: true, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SMTP] Send FAILED:', msg);
    return { success: false, error: `SMTP: ${msg}` };
  }
}
