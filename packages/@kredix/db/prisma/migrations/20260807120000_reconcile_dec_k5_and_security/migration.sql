-- =============================================================================
-- KRX-008 + KRX-004 — Réconciliation DEC-K5 + sécurité (onDelete: SetNull)
-- =============================================================================
-- Cette migration comble l'écart entre la dernière migration versionnée
-- (20260729120000_add_pipeline_step_model) et le schema.prisma actuel.
--
-- Toutes les évolutions DEC-K5 + post-déploiement (Notification, LoanType,
-- champs multi-admin, EmailTemplate.blocksJson/isConfidential/language,
-- Lead.offerSentAt/companyName, CampaignRecipientStatus.sending) qui avaient
-- été appliquées via `prisma db push` (sans tracker dans le dossier migrations)
-- sont réconciliées ici.
--
-- ⚠️ IDEMPOTENTE — peut être (re)jouée sur une DB déjà à jour (via db push)
--    ou sur une DB vierge déployée via `prisma migrate deploy`.
--    Utilise ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--    DROP CONSTRAINT IF EXISTS pour ne pas lever d'erreur.
--
-- Source : audit Kredix 2026-08-07 (KRX-004 + KRX-008).
-- =============================================================================

-- =============================================================================
-- SECTION A — KRX-004 : onDelete: SetNull sur FK multi-admin
-- =============================================================================
-- Évite l'erreur Prisma P2003 à la suppression d'un AdminUser qui possède
-- des leads / gateways / campaigns. Avec SetNull, ces ressources repassent
-- à ownerId=null (système / non assigné) automatiquement.

-- Lead.assignedTo → SetNull
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_assignedToId_fkey";
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL;

-- EmailGateway.owner → SetNull
ALTER TABLE "EmailGateway" DROP CONSTRAINT IF EXISTS "EmailGateway_ownerId_fkey";
ALTER TABLE "EmailGateway" ADD CONSTRAINT "EmailGateway_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL;

-- Campaign.owner → SetNull
ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_ownerId_fkey";
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL;

-- =============================================================================
-- SECTION B — AdminUser champs DEC-K5 (identité conseiller + routing)
-- =============================================================================
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "loanTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "maxActiveLeads" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "currentActiveLeads" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "lastAssignedAt" TIMESTAMP(3);
-- KRX-007 : révocation session immédiate (JWT stateless).
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "sessionTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- =============================================================================
-- SECTION C — EmailGateway champs DEC-K5 (SMTP exclusif par admin)
-- =============================================================================
ALTER TABLE "EmailGateway" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "EmailGateway" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
-- Index de perf pour le filtrage scope admin (getGatewayScope)
CREATE INDEX IF NOT EXISTS "EmailGateway_ownerId_isActive_idx" ON "EmailGateway"("ownerId", "isActive");

-- =============================================================================
-- SECTION D — Campaign champ DEC-K5 (propriétaire de la campagne)
-- =============================================================================
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
CREATE INDEX IF NOT EXISTS "Campaign_ownerId_idx" ON "Campaign"("ownerId");

-- =============================================================================
-- SECTION E — Lead champs post-déploiement + DEC-K5
-- =============================================================================
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);          -- DEC-K5
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "companyName" TEXT;                 -- prêts pro (session 37)
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "offerSentAt" TIMESTAMP(3);         -- offre T+15min (session 36)
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "street" TEXT;                      -- adresse complète (session 38)
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "zipCode" TEXT;                     -- code postal (session 38)

-- =============================================================================
-- SECTION F — EmailTemplate champs DEC-K5 (éditeur par blocs + confidentiel)
-- =============================================================================
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "blocksJson" TEXT;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "isConfidential" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';

-- =============================================================================
-- SECTION G — Table Notification (nouvelle — manquait des migrations)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "icon" TEXT NOT NULL DEFAULT 'info',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "linkUrl" TEXT,
  "relatedEntityId" TEXT,
  "recipientId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- =============================================================================
-- SECTION H — Table LoanType (nouvelle — types de prêt dynamiques DEC-K5)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "LoanType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoanType_code_key" ON "LoanType"("code");
CREATE INDEX IF NOT EXISTS "LoanType_isActive_sortOrder_idx" ON "LoanType"("isActive", "sortOrder");

-- =============================================================================
-- SECTION I — CampaignRecipientStatus : ajout valeur 'sending' (lock worker)
-- =============================================================================
-- ⚠️ `ALTER TYPE ... ADD VALUE` NE PEUT PAS tourner dans un bloc transactionnel
-- (Prisma migrate deploy wrap chaque migration dans une transaction → erreur
-- "ALTER TYPE ... ADD cannot run inside a transaction block").
-- Contournement : INSERT direct dans pg_enum (transactionnable + idempotent via NOT EXISTS).
INSERT INTO pg_enum (enumtypid, enumlabel, enumsortorder)
SELECT t.oid, 'sending',
       COALESCE((SELECT MAX(enumsortorder) FROM pg_enum WHERE enumtypid = t.oid), 0) + 1
FROM pg_type t
WHERE t.typname = 'CampaignRecipientStatus'
  AND NOT EXISTS (
    SELECT 1 FROM pg_enum e WHERE e.enumtypid = t.oid AND e.enumlabel = 'sending'
  );

-- =============================================================================
-- SECTION J — Seed LoanType par défaut (immo / conso / rachat / pro)
-- =============================================================================
-- KRX-019 : LoanType n'était pas seedé → fallback UI en base neuve.
-- Insertion idempotente (ON CONFLICT DO NOTHING).
-- =============================================================================
INSERT INTO "LoanType" ("id", "code", "label", "isActive", "sortOrder") VALUES
  ('lt_immo',    'immo',    'Immobilier',     true, 1),
  ('lt_conso',   'conso',   'Crédit conso',   true, 2),
  ('lt_rachat',  'rachat',  'Rachat de crédit', true, 3),
  ('lt_pro',     'pro',     'Prêt pro',       true, 4)
ON CONFLICT ("code") DO NOTHING;

-- =============================================================================
-- SECTION K — Phase 7 Bloc F : Table AuditLog (journal d'audit admin)
-- =============================================================================
-- Trace toute mutation d'une entité métier par un admin + actions de sécurité.
-- Vue dédiée "Journal d'audit" (super-admin only).
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "diff" JSONB,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_adminId_idx" ON "AuditLog"("adminId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
-- FK AdminUser avec onDelete: SetNull (préserve les logs si l'admin est supprimé).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AuditLog_adminId_fkey' AND table_name = 'AuditLog'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL;
  END IF;
END $$;
