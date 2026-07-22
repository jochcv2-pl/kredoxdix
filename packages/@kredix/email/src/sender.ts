import { GatewayProvider, type EmailGateway } from '@kredix/db';

// =============================================================================
// @kredix/email/sender — Adapter d'envoi d'emails (Resend / Brevo / SMTP).
// =============================================================================
// Extrait depuis apps/admin/app/api/_lib/email-sender.ts.
// Dispatch vers le bon SDK selon gateway.provider.
// La clé API est lue depuis EmailGateway.apiKey (DB).

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

const DEFAULT_FROM = 'Kredix <noreply@kredix.fr>';

export async function sendEmail(
  gateway: EmailGateway,
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const config = (gateway.config ?? {}) as Record<string, unknown>;
  const from = (config.from as string) || params.from || DEFAULT_FROM;
  const apiKey = gateway.apiKey;

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

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: username ? { user: username, pass: password } : undefined,
    });

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

    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: `SMTP: ${(err as Error).message}` };
  }
}
