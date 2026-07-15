import { PrismaClient, AdminRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ---------------------------------------------------------------------------
  // BankPartners — 4 banques fictives (slugs stables, noms génériques)
  // ---------------------------------------------------------------------------
  const banks = await Promise.all(
    [
      { name: 'Banque A', slug: 'banque-a', order: 1 },
      { name: 'Banque B', slug: 'banque-b', order: 2 },
      { name: 'Banque C', slug: 'banque-c', order: 3 },
      { name: 'Banque D', slug: 'banque-d', order: 4 },
    ].map((b) =>
      prisma.bankPartner.upsert({
        where: { slug: b.slug },
        update: {},
        create: {
          name: b.name,
          slug: b.slug,
          displayOrder: b.order,
          contactEmail: `contact@${b.slug}.example`,
        },
      }),
    ),
  );

  // ---------------------------------------------------------------------------
  // Rates — échantillon indicatif par banque / type / palier
  // ---------------------------------------------------------------------------
  const rateSamples: Array<{
    bankSlug: string;
    loanType: string;
    amountMin: number;
    amountMax: number;
    annualRate: number;
  }> = [
    { bankSlug: 'banque-a', loanType: 'immo', amountMin: 0, amountMax: 500000, annualRate: 3.45 },
    { bankSlug: 'banque-a', loanType: 'immo', amountMin: 500001, amountMax: 1000000, annualRate: 3.3 },
    { bankSlug: 'banque-a', loanType: 'conso', amountMin: 0, amountMax: 50000, annualRate: 5.9 },
    { bankSlug: 'banque-b', loanType: 'immo', amountMin: 0, amountMax: 500000, annualRate: 3.55 },
    { bankSlug: 'banque-b', loanType: 'rachat', amountMin: 0, amountMax: 80000, annualRate: 4.9 },
    { bankSlug: 'banque-c', loanType: 'pro', amountMin: 0, amountMax: 250000, annualRate: 4.2 },
    { bankSlug: 'banque-c', loanType: 'conso', amountMin: 0, amountMax: 50000, annualRate: 6.1 },
    { bankSlug: 'banque-d', loanType: 'immo', amountMin: 0, amountMax: 500000, annualRate: 3.5 },
    { bankSlug: 'banque-d', loanType: 'autre', amountMin: 0, amountMax: 30000, annualRate: 7.2 },
  ];

  const bankBySlug = new Map(banks.map((b) => [b.slug, b]));

  for (const r of rateSamples) {
    const bank = bankBySlug.get(r.bankSlug);
    if (!bank) continue;
    // Clé d'unicité composite => upsert fiable et idempotent.
    await prisma.rate.upsert({
      where: {
        bankId_loanType_amountMin_amountMax: {
          bankId: bank.id,
          loanType: r.loanType,
          amountMin: r.amountMin,
          amountMax: r.amountMax,
        },
      },
      update: { annualRate: r.annualRate },
      create: {
        bankId: bank.id,
        loanType: r.loanType,
        amountMin: r.amountMin,
        amountMax: r.amountMax,
        annualRate: r.annualRate,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Settings — paramètres globaux éditables via CMS
  // ---------------------------------------------------------------------------
  const settings: Array<{ key: string; value: string; category: string; description: string }> = [
    {
      key: 'whatsapp_number',
      value: '+221770000000',
      category: 'contact',
      description: 'Numéro WhatsApp affiché pour le contact prospects.',
    },
    {
      key: 'orias_number',
      value: '00000000',
      category: 'legal',
      description: "Numéro ORIAS du courtier (obligation réglementaire d'affichage).",
    },
    {
      key: 'contact_email',
      value: 'contact@kredix.local',
      category: 'contact',
      description: 'Adresse e-mail générique de contact.',
    },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // ---------------------------------------------------------------------------
  // AdminUser — utilisateur de test (mapping Zitadel fictif)
  // ---------------------------------------------------------------------------
  await prisma.adminUser.upsert({
    where: { email: 'admin@kredix.local' },
    update: {},
    create: {
      zitadelSubjectId: '00000000-0000-0000-0000-000000000000',
      email: 'admin@kredix.local',
      displayName: 'Admin Kredix',
      role: AdminRole.admin,
      isActive: true,
    },
  });

  console.log('✅ Seed terminé :', banks.length, 'banques,', rateSamples.length, 'taux, 3 settings, 1 admin.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
