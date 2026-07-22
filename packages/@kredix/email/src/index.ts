// =============================================================================
// @kredix/email — Package partagé pour l'envoi d'emails (admin + web).
// =============================================================================
// Extrait depuis apps/admin/app/api/_lib/ pour éliminer la duplication
// avec apps/web/app/api/_lib/email-ack.ts.
//
// Trois modules :
//   - sender    : dispatch Resend/Brevo/SMTP
//   - template  : interpolation {{Prénom}}, {{Nom}}, etc.
//   - settings  : lecture gateway/template/settings depuis DB

export {
  sendEmail,
  type EmailAttachment,
  type SendEmailParams,
  type SendEmailResult,
} from './sender';

export {
  interpolateTemplate,
  buildUnsubscribeUrl,
  textToHtml,
  formatEuro,
  type InterpolationContext,
} from './template';

export {
  getSetting,
  getSettingNumber,
  getActiveGateway,
  getActiveTemplate,
} from './settings';
