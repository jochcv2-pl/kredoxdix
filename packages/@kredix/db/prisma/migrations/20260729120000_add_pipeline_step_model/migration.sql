-- CreateTable
CREATE TABLE "PipelineStep" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateId" TEXT,
    "documentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineStep_order_idx" ON "PipelineStep"("order");

-- AddColumn: stepId on ClientStep
ALTER TABLE "ClientStep" ADD COLUMN "stepId" TEXT;

-- CreateIndex
CREATE INDEX "ClientStep_stepId_idx" ON "ClientStep"("stepId");

-- AddForeignKey
ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStep" ADD CONSTRAINT "ClientStep_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "PipelineStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: insert 7 default PipelineSteps matching the old hardcoded levels.
-- templateId is left NULL — the admin will assign templates via the UI.
INSERT INTO "PipelineStep" ("id", "order", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 1, 'Accueil client',         'Email de bienvenue envoyé au client',                    true, NOW(), NOW()),
  (gen_random_uuid(), 2, 'Demande documents',      'Liste des documents requis pour le dossier',             true, NOW(), NOW()),
  (gen_random_uuid(), 3, 'Offre de prêt formelle', 'Offre détaillée avec tableau d''amortissement',           true, NOW(), NOW()),
  (gen_random_uuid(), 4, 'Vérification dossier',   'Dossier en cours de vérification interne',               true, NOW(), NOW()),
  (gen_random_uuid(), 5, 'Accord de principe',     'Accord préliminaire de la banque',                       true, NOW(), NOW()),
  (gen_random_uuid(), 6, 'Signature',              'Convocation pour signature du contrat',                  true, NOW(), NOW()),
  (gen_random_uuid(), 7, 'Déblocage fonds',        'Confirmation du déblocage des fonds',                    true, NOW(), NOW());
