-- =============================================================================
-- Feature suivi dossier public (s44 — page /suivi côté client)
-- =============================================================================
-- Ajoute :
--   1. Lead.reference : numéro public KREDIX-XXXXXXXX (page /suivi client)
--   2. TrackingStep : étapes de suivi configurables (CRUD admin, INDÉPENDANT pipeline email)
--   3. LeadTracking : validation d'étape par lead (1 par étape par lead)
--
-- ⚠️ IDEMPOTENTE — peut être (re)jouée sur DB déjà à jour (via db push)
--    ou sur DB vierge déployée via `prisma migrate deploy`.
--    Utilise ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / DO $$ blocks.
--
-- Rappel A-074 : les ADD COLUMN précèdent les ADD CONSTRAINT FK (PostgreSQL strict).
-- Rappel A-075 : ALTER TYPE ADD VALUE IF NOT EXISTS (jamais INSERT direct dans pg_enum).
-- =============================================================================

-- ===== SECTION 1 — Lead.reference (nullable, populate pour leads existants) =====
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "reference" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_reference_key" ON "Lead"("reference");

-- Populate les leads existants : KREDIX-XXXXXXXX (8 derniers chars du id, majuscules).
-- Identique au calcul template.ts:118 pour rétro-compat emails déjà envoyés.
UPDATE "Lead"
SET "reference" = 'KREDIX-' || UPPER(RIGHT("id", 8))
WHERE "reference" IS NULL;

-- ===== SECTION 2 — Table TrackingStep (configurable, indépendante de PipelineStep) =====
CREATE TABLE IF NOT EXISTS "TrackingStep" (
  "id"          TEXT NOT NULL,
  "order"       INTEGER NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "icon"        TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackingStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TrackingStep_isActive_order_idx" ON "TrackingStep"("isActive", "order");

-- ===== SECTION 3 — Table LeadTracking (validation d'étape par lead) =====
CREATE TABLE IF NOT EXISTS "LeadTracking" (
  "id"              TEXT NOT NULL,
  "leadId"          TEXT NOT NULL,
  "trackingStepId"  TEXT NOT NULL,
  "validatedById"   TEXT,
  "validatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"            TEXT,
  CONSTRAINT "LeadTracking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeadTracking_leadId_trackingStepId_key" ON "LeadTracking"("leadId", "trackingStepId");
CREATE INDEX IF NOT EXISTS "LeadTracking_leadId_idx" ON "LeadTracking"("leadId");

-- ===== SECTION 4 — FK LeadTracking (APRÈS création des tables, A-074) =====

-- FK LeadTracking → Lead (Cascade : si lead supprimé, ses trackings aussi)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LeadTracking_leadId_fkey' AND table_name = 'LeadTracking'
  ) THEN
    ALTER TABLE "LeadTracking"
      ADD CONSTRAINT "LeadTracking_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- FK LeadTracking → TrackingStep (Cascade : si étape supprimée, ses validations aussi)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LeadTracking_trackingStepId_fkey' AND table_name = 'LeadTracking'
  ) THEN
    ALTER TABLE "LeadTracking"
      ADD CONSTRAINT "LeadTracking_trackingStepId_fkey"
      FOREIGN KEY ("trackingStepId") REFERENCES "TrackingStep"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- FK LeadTracking → AdminUser (SetNull : si admin supprimé, on garde la trace de validation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LeadTracking_validatedById_fkey' AND table_name = 'LeadTracking'
  ) THEN
    ALTER TABLE "LeadTracking"
      ADD CONSTRAINT "LeadTracking_validatedById_fkey"
      FOREIGN KEY ("validatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL;
  END IF;
END $$;
