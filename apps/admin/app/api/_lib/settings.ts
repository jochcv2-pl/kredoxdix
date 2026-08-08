// =============================================================================
// Re-export depuis @kredix/email — le code canonique vit dans le package partagé.
// =============================================================================
// Avant : ce fichier dupliquait 121 lignes de @kredix/email/src/settings.ts
// (KRX-011 audit) — risque de divergence entre les deux copies (getActiveTemplate
// était déjà absent côté admin). Maintenant : simple re-export, source unique.
//
// Les callers via `@/app/api/_lib/settings` ne sont pas impactés.

export {
  getSetting,
  getSettingNumber,
  getActiveGateway,
  getSystemGateway,
  getPrimaryGateway,
  getGatewayForLead,
  resolveGatewaysForLeadsBatch,
  getGatewayForCampaign,
  getConseillerContext,
  getActiveTemplate,
} from '@kredix/email';
