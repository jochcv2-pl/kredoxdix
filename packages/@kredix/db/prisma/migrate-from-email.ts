// =============================================================================
// PRISMA MIGRATION — Populate config.from sur les gateways existants.
// =============================================================================
// Lie le from_email à chaque gateway au lieu d'un Setting global.
// Pour chaque gateway SMTP : config.from = config.username (si from absent).
// Pour les gateways Resend/Brevo : config.from = Setting from_email (si existant).
//
// Usage VPS (via conteneur temporaire) :
//   docker run --rm \
//     --network kredix-network \
//     -v /home/vpsname/projets/kredix:/app \
//     -w /app/packages/@kredix/db \
//     -e DATABASE_URL="<URL_BDD>" \
//     node:20-alpine \
//     npx tsx prisma/migrate-from-email.ts
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📧 Migration config.from sur les gateways existants...\n');

  const gateways = await prisma.emailGateway.findMany();

  // Récupère l'ancien from_email global (legacy) pour les gateways non-SMTP.
  const fromEmailSetting = await prisma.setting.findUnique({
    where: { key: 'from_email' },
  });
  const legacyFromEmail = fromEmailSetting?.value || '';

  let updated = 0;

  for (const gw of gateways) {
    const config = (gw.config ?? {}) as Record<string, unknown>;

    // Si config.from existe déjà, on ne touche pas.
    if (config.from) {
      console.log(`   ${gw.label} : from déjà présent (${config.from}) — ignoré`);
      continue;
    }

    let newFrom = '';

    if (gw.provider === 'smtp') {
      // SMTP : le username est l'adresse d'envoi.
      newFrom = (config.username as string) || '';
    } else {
      // Resend/Brevo : utilise le legacy from_email global.
      newFrom = legacyFromEmail;
    }

    if (!newFrom) {
      console.log(`   ${gw.label} : aucune source pour from — ignoré`);
      continue;
    }

    await prisma.emailGateway.update({
      where: { id: gw.id },
      data: { config: { ...config, from: newFrom } },
    });

    console.log(`   ${gw.label} : from = ${newFrom} ✅`);
    updated++;
  }

  console.log(`\n✅ Migration terminée : ${updated} gateway(s) mis à jour.\n`);
}

main()
  .catch((err) => {
    console.error('❌ Erreur:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
