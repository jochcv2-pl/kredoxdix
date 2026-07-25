// Barrel export du package @kredix/db
export { prisma } from '../prisma/client';

// Helpers métier (queries réutilisables côté server)
export {
  getActiveRates,
  getPublicSettings,
  getVisibleTestimonials,
  getContentBlock,
  getActiveLegalPages,
  getActiveBankPartners,
} from './queries';

// Helper notifications (création d'événements notifiables)
export { createNotification } from './notifications';
export type { CreateNotificationInput } from './notifications';

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
