-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'progress', 'offer', 'waiting', 'client', 'lost');

-- CreateEnum
CREATE TYPE "SequenceExitReason" AS ENUM ('validated', 'unsubscribe', 'bounced', 'complaint', 'excluded', 'max_relances', 'timeout');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin', 'advisor', 'viewer');

-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('accueil', 'offre', 'relance', 'tri', 'seo');

-- CreateEnum
CREATE TYPE "EmailTrigger" AS ENUM ('reception_ack', 'offer', 'relance_1', 'relance_2', 'relance_3', 'manual', 'level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6', 'level_7');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('active', 'draft');

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('resend', 'brevo', 'smtp');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('unsubscribe', 'bounce', 'complaint', 'manual');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'sending', 'completed', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "DomainType" AS ENUM ('site', 'admin', 'mail', 'brand');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "loanType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "durationYears" INTEGER NOT NULL,
    "monthlyPayment" INTEGER,
    "annualRate" DOUBLE PRECISION,
    "totalCost" INTEGER,
    "employmentStatus" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'fr',
    "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "assignedToId" TEXT,
    "ackSentAt" TIMESTAMP(3),
    "recallDueAt" TIMESTAMP(3),
    "sequenceActive" BOOLEAN NOT NULL DEFAULT false,
    "relanceCount" INTEGER NOT NULL DEFAULT 0,
    "nextRelanceAt" TIMESTAMP(3),
    "sequenceStartedAt" TIMESTAMP(3),
    "sequenceEndedAt" TIMESTAMP(3),
    "exitReason" "SequenceExitReason",
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "apiEndpoint" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "loanType" TEXT NOT NULL,
    "amountMin" INTEGER NOT NULL,
    "amountMax" INTEGER NOT NULL,
    "annualRate" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'advisor',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "twoFactorSecret" TEXT,
    "zitadelSubjectId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "systemPrompt" TEXT NOT NULL,
    "tools" JSONB NOT NULL DEFAULT '{}',
    "guardrails" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "EmailTrigger" NOT NULL,
    "agentId" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'draft',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "htmlContent" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bannerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailGateway" (
    "id" TEXT NOT NULL,
    "provider" "GatewayProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "apiKey" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionList" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "recipientSource" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "email" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "campaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "type" "DomainType" NOT NULL DEFAULT 'site',
    "brandName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sslStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStep" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "emailLogId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "level" INTEGER,
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_unsubscribeToken_key" ON "Lead"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_status_idx" ON "Lead"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Lead_sequenceActive_nextRelanceAt_idx" ON "Lead"("sequenceActive", "nextRelanceAt");

-- CreateIndex
CREATE INDEX "Lead_exitReason_idx" ON "Lead"("exitReason");

-- CreateIndex
CREATE UNIQUE INDEX "BankPartner_name_key" ON "BankPartner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BankPartner_slug_key" ON "BankPartner"("slug");

-- CreateIndex
CREATE INDEX "Rate_loanType_isActive_idx" ON "Rate"("loanType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Rate_bankId_loanType_amountMin_amountMax_key" ON "Rate"("bankId", "loanType", "amountMin", "amountMax");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_zitadelSubjectId_key" ON "AdminUser"("zitadelSubjectId");

-- CreateIndex
CREATE INDEX "AdminUser_role_isActive_idx" ON "AdminUser"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_role_key" ON "Agent"("role");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_idx" ON "AgentMemory"("agentId");

-- CreateIndex
CREATE INDEX "EmailTemplate_trigger_status_idx" ON "EmailTemplate"("trigger", "status");

-- CreateIndex
CREATE INDEX "EmailGateway_provider_idx" ON "EmailGateway"("provider");

-- CreateIndex
CREATE INDEX "SuppressionList_reason_idx" ON "SuppressionList"("reason");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionList_email_key" ON "SuppressionList"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LegalPage_slug_key" ON "LegalPage"("slug");

-- CreateIndex
CREATE INDEX "LegalPage_category_isActive_idx" ON "LegalPage"("category", "isActive");

-- CreateIndex
CREATE INDEX "LegalPage_order_idx" ON "LegalPage"("order");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "EmailLog_leadId_sentAt_idx" ON "EmailLog"("leadId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailLog_email_sentAt_idx" ON "EmailLog"("email", "sentAt");

-- CreateIndex
CREATE INDEX "EmailLog_trigger_idx" ON "EmailLog"("trigger");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");

-- CreateIndex
CREATE INDEX "Domain_type_isActive_idx" ON "Domain"("type", "isActive");

-- CreateIndex
CREATE INDEX "ClientStep_leadId_idx" ON "ClientStep"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStep_leadId_level_key" ON "ClientStep"("leadId", "level");

-- CreateIndex
CREATE INDEX "DocumentTemplate_level_isActive_idx" ON "DocumentTemplate"("level", "isActive");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "BankPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

