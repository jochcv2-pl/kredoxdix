// Barrel export du package @kredix/db
export { prisma } from '../prisma/client';

// Helpers métier (queries réutilisables côté server)
export { getActiveRates, getPublicSettings } from './queries';

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
