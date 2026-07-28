// =============================================================================
// PRISMA CLEANUP — Supprime les données mockées de l'ancien seed.
// =============================================================================
// À exécuter sur le VPS après le nouveau déploiement pour retirer :
//   - BankPartner (4 banques fake)
//   - Rate (9 taux fake — FK vers BankPartner, supprimé en premier)
//   - Domain (3 domaines fake)
//
// Désactive aussi tous les gateways email (isActive = false) pour forcer
// le client à configurer le sien depuis l'admin.
//
// Usage VPS (via conteneur temporaire) :
//   docker run --rm \
//     --network kredix-network \
//     -v /home/vpsname/projets/kredix:/app \
//     -w /app/packages/@kredix/db \
//     -e DATABASE_URL="<URL_BDD>" \
//     node:20-alpine \
//     npx tsx prisma/cleanup.ts
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleanup des données mockées...\n');

  // 1. Rate (FK vers BankPartner — supprimé en premier)
  const rates = await prisma.rate.deleteMany({});
  console.log(`   Rate : ${rates.count} supprimés`);

  // 2. BankPartner
  const banks = await prisma.bankPartner.deleteMany({});
  console.log(`   BankPartner : ${banks.count} supprimés`);

  // 3. Domain
  const domains = await prisma.domain.deleteMany({});
  console.log(`   Domain : ${domains.count} supprimés`);

  // 4. Gateways — tous désactivés
  const gateways = await prisma.emailGateway.updateMany({
    where: {},
    data: { isActive: false },
  });
  console.log(`   EmailGateway : ${gateways.count} désactivés (isActive = false)`);

  console.log('\n✅ Cleanup terminé.');
}

main()
  .catch((err) => {
    console.error('❌ Erreur cleanup :', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
