// Barrel export du package @kredix/db
export { prisma } from '../prisma/client';

// Crypto — chiffrement AES-256-GCM pour secrets au repos (partagé)
export { encryptSecret, decryptSecret } from './crypto';

// Helpers métier (queries réutilisables côté server)
export {
  getActiveRates,
  getPublicSettings,
  getVisibleTestimonials,
  getContentBlock,
  getActiveLegalPages,
  getActiveBankPartners,
  getActiveLoanTypes,
} from './queries';

// Helper notifications (création d'événements notifiables)
export { createNotification } from './notifications';
export type { CreateNotificationInput } from './notifications';

// Routing automatique des leads (DEC-K5 multi-admin)
export { assignLeadToAdmin, recalcAdminLoad, recalcAllAdminLoads } from './routing';
export type { RoutingResult } from './routing';

// Types
export type {
  Lead,
  BankPartner,
  Rate,
  AdminUser,
  Setting,
  Agent,
  AgentMemory,
  EmailTemplate,
  EmailGateway,
  SuppressionList,
  LegalPage,
  Campaign,
  CampaignRecipient,
  EmailLog,
  Domain,
  ClientStep,
  DocumentTemplate,
  Notification,
  Testimonial,
  ContentBlock,
  LoanType,
} from '@prisma/client';

// Enums (valeurs runtime) — pour usage direct dans les apps
export {
  LeadStatus,
  SequenceExitReason,
  AdminRole,
  AgentRole,
  EmailTrigger,
  TemplateStatus,
  GatewayProvider,
  SuppressionReason,
  CampaignStatus,
  CampaignRecipientStatus,
  DomainType,
} from '@prisma/client';
