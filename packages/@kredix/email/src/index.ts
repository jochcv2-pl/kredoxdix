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
  type BrandContext,
  type AdvisorContext,
} from './template';

export {
  wrapEmailHtml,
  composeEmailHtml,
  loadBrandData,
  brandToContext,
  buildInterpolationContext,
  type EmailBrandData,
  type WrapEmailOptions,
  type ComposeOptions,
} from './layout';

export {
  getSetting,
  getSettingNumber,
  getActiveGateway,
  getSystemGateway,
  getPrimaryGateway,
  getGatewayForLead,
  resolveGatewaysForLeadsBatch,
  getLastSentByGateway,
  extractGatewayInfo,
  getGatewayForCampaign,
  getConseillerContext,
  getActiveTemplate,
} from './settings';
