// =============================================================================
// PRISMA MIGRATION — PipelineStep model + seed 7 niveaux par défaut.
// =============================================================================
// Crée la table PipelineStep, ajoute stepId sur ClientStep, et insère
// les 7 étapes par défaut (noms alignés avec l'ancien système hardcoded).
//
// Usage VPS (via conteneur temporaire) :
//   docker run --rm \
//     --network kredix-network \
//     -v /home/vpsname/projets/kredix:/app \
//     -w /app/packages/@kredix/db \
//     -e DATABASE_URL="<URL_BDD>" \
//     node:20-alpine \
//     npx tsx prisma/migrate-pipeline-step.ts
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔧 Migration PipelineStep...\n');

  // 1. Crée la table si elle n'existe pas (idempotent).
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "PipelineStep" (
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
  `;
  console.log('   ✓ Table PipelineStep');

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "PipelineStep_order_idx" ON "PipelineStep"("order");
  `;
  console.log('   ✓ Index PipelineStep_order_idx');

  // 2. Ajoute stepId sur ClientStep si la colonne n'existe pas.
  try {
    await prisma.$executeRaw`ALTER TABLE "ClientStep" ADD COLUMN "stepId" TEXT;`;
    console.log('   ✓ Colonne ClientStep.stepId ajoutée');
  } catch {
    console.log('   ⊙ Colonne ClientStep.stepId existe déjà');
  }

  try {
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "ClientStep_stepId_idx" ON "ClientStep"("stepId");`;
  } catch { /* ignore */ }

  // 3. Foreign keys.
  try {
    await prisma.$executeRaw`
      ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    `;
  } catch { /* déjà existant */ }

  try {
    await prisma.$executeRaw`
      ALTER TABLE "PipelineStep" ADD CONSTRAINT "PipelineStep_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    `;
  } catch { /* déjà existant */ }

  try {
    await prisma.$executeRaw`
      ALTER TABLE "ClientStep" ADD CONSTRAINT "ClientStep_stepId_fkey"
      FOREIGN KEY ("stepId") REFERENCES "PipelineStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    `;
  } catch { /* déjà existant */ }
  console.log('   ✓ Foreign keys');

  // 4. Seed : insère les 7 niveaux par défaut si la table est vide.
  //    Utilise $queryRaw au lieu de prisma.pipelineStep car le client Prisma
  //    du VPS peut ne pas connaître le modèle PipelineStep (généré au build Docker).
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "PipelineStep"
  `;
  const existing = Number(rows[0]?.count ?? 0);

  if (existing === 0) {
    const defaults = [
      { order: 1, name: 'Accueil client',         description: 'Email de bienvenue envoyé au client' },
      { order: 2, name: 'Demande documents',      description: 'Liste des documents requis pour le dossier' },
      { order: 3, name: 'Offre de prêt formelle', description: "Offre détaillée avec tableau d'amortissement" },
      { order: 4, name: 'Vérification dossier',   description: 'Dossier en cours de vérification interne' },
      { order: 5, name: 'Accord de principe',     description: 'Accord préliminaire de la banque' },
      { order: 6, name: 'Signature',              description: 'Convocation pour signature du contrat' },
      { order: 7, name: 'Déblocage fonds',        description: 'Confirmation du déblocage des fonds' },
    ];

    for (const d of defaults) {
      await prisma.$executeRaw`
        INSERT INTO "PipelineStep" ("id", "order", "name", "description", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${d.order}, ${d.name}, ${d.description}, true, NOW(), NOW())
      `;
    }
    console.log(`   ✓ Seed: ${defaults.length} étapes par défaut insérées`);
  } else {
    console.log(`   ⊙ Seed ignoré: ${existing} étapes déjà présentes`);
  }

  console.log('\n✅ Migration PipelineStep terminée.');
}

main()
  .catch((err) => {
    console.error('❌ Erreur migration PipelineStep :', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
