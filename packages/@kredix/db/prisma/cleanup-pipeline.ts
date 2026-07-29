// =============================================================================
// PRISMA CLEANUP — Nettoie l'historique des emails et campagnes.
// =============================================================================
// Supprime :
//   - EmailLog (tous les enregistrements)
//   - CampaignRecipient (tous les destinataires de campagnes)
//   - Campaign (toutes les campagnes)
// Reset lead sequence state :
//   - ackSentAt → null
//   - relanceCount → 0
//   - nextRelanceAt → null
//   - sequenceActive → false
//   - sequenceStartedAt → null
//   - sequenceEndedAt → null
//   - exitReason → null
//
// Usage VPS (via conteneur temporaire) :
//   docker run --rm \
//     --network kredix-network \
//     -v /home/vpsname/projets/kredix:/app \
//     -w /app/packages/@kredix/db \
//     -e DATABASE_URL="<URL_BDD>" \
//     node:20-alpine \
//     npx tsx prisma/cleanup-pipeline.ts
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🧹 Nettoyage pipeline email + campagnes...\n');

  // 1. EmailLog — historique de tous les emails
  const logs = await prisma.emailLog.deleteMany({});
  console.log(`   EmailLog : ${logs.count} supprimés`);

  // 2. CampaignRecipient — destinataires des campagnes (FK vers Campaign)
  const recipients = await prisma.campaignRecipient.deleteMany({});
  console.log(`   CampaignRecipient : ${recipients.count} supprimés`);

  // 3. Campaign — campagnes
  const campaigns = await prisma.campaign.deleteMany({});
  console.log(`   Campaign : ${campaigns.count} supprimés`);

  // 4. Reset lead sequence state — remet les leads à zéro
  const leads = await prisma.lead.updateMany({
    where: { OR: [
      { ackSentAt: { not: null } },
      { relanceCount: { not: 0 } },
      { nextRelanceAt: { not: null } },
      { sequenceActive: true },
    ] },
    data: {
      ackSentAt: null,
      relanceCount: 0,
      nextRelanceAt: null,
      sequenceActive: false,
      sequenceStartedAt: null,
      sequenceEndedAt: null,
      exitReason: null,
    },
  });
  console.log(`   Lead sequence state : ${leads.count} resets`);

  console.log('\n✅ Nettoyage terminé.');
}

main()
  .catch((err) => {
    console.error('❌ Erreur cleanup pipeline :', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
