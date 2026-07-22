import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Banques partenaires
  const banks = await Promise.all([
    prisma.bankPartner.upsert({
      where: { slug: 'banque-a' },
      update: {},
      create: {
        name: 'Banque A',
        slug: 'banque-a',
        isActive: true,
        displayOrder: 1,
      },
    }),
    prisma.bankPartner.upsert({
      where: { slug: 'banque-b' },
      update: {},
      create: {
        name: 'Banque B',
        slug: 'banque-b',
        isActive: true,
        displayOrder: 2,
      },
    }),
    prisma.bankPartner.upsert({
      where: { slug: 'banque-c' },
      update: {},
      create: {
        name: 'Banque C',
        slug: 'banque-c',
        isActive: true,
        displayOrder: 3,
      },
    }),
    prisma.bankPartner.upsert({
      where: { slug: 'banque-d' },
      update: {},
      create: {
        name: 'Banque D',
        slug: 'banque-d',
        isActive: true,
        displayOrder: 4,
      },
    }),
  ]);

  console.log(`✅ Created ${banks.length} banks`);

  // 2. Taux indicatifs pour chaque banque / type de prêt
  const loanTypes = ['immo', 'conso', 'rachat', 'pro'];
  let ratesCount = 0;

  for (const bank of banks) {
    for (const loanType of loanTypes) {
      // Créer 3 paliers de montants par banque/type
      await prisma.rate.create({
        data: {
          bankId: bank.id,
          loanType,
          amountMin: 5000,
          amountMax: 50000,
          annualRate: loanType === 'immo' ? 3.5 : 4.5,
          isActive: true,
        },
      });
      await prisma.rate.create({
        data: {
          bankId: bank.id,
          loanType,
          amountMin: 50001,
          amountMax: 150000,
          annualRate: loanType === 'immo' ? 3.2 : 4.2,
          isActive: true,
        },
      });
      await prisma.rate.create({
        data: {
          bankId: bank.id,
          loanType,
          amountMin: 150001,
          amountMax: 500000,
          annualRate: loanType === 'immo' ? 2.9 : 3.9,
          isActive: true,
        },
      });
      ratesCount += 3;
    }
  }

  console.log(`✅ Created ${ratesCount} rates`);

  // 3. Settings globaux
  await prisma.setting.upsert({
    where: { key: 'whatsapp_number' },
    update: {},
    create: {
      key: 'whatsapp_number',
      value: '+33612345678',
      category: 'contact',
      description: 'Numéro WhatsApp pour le support',
    },
  });

  await prisma.setting.upsert({
    where: { key: 'orias_number' },
    update: {},
    create: {
      key: 'orias_number',
      value: '12345678',
      category: 'legal',
      description: 'Numéro ORIAS de courtage',
    },
  });

  console.log('✅ Created settings');

  // 4. Admin user (placeholder pour Zitadel mapping)
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@kredix.com' },
    update: {},
    create: {
      email: 'admin@kredix.com',
      zitadelSubjectId: 'placeholder-zitadel-subject',
      displayName: 'Admin Kredix',
      role: 'admin',
      isActive: true,
    },
  });

  console.log('✅ Created admin user');
  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });