// =============================================================================
// global-setup.ts — Reset de l'état DB avant chaque run E2E.
// =============================================================================
// Garantit que les tests partent d'un état propre, indépendamment de ce qu'ont
// laissé les runs précédents (ex: 2FA activée par un test qui a crashé avant
// son cleanup).
//
// Reset appliqué :
//   - AdminUser.twoFactorSecret = NULL (2FA désactivée)
//   - AdminUser.isActive = true (compte actif)
//
// Ce fichier tourne UNE fois avant tous les tests, dans le contexte Node de
// Playwright. Il utilise @kredix/db (Prisma) qui est un workspace package.

import { prisma } from '@kredix/db';

export default async function globalSetup() {
  console.log('\n[global-setup] Reset état DB pour tests E2E...');

  // Reset 2FA sur tous les admins — garantit que two-fa.spec.ts part propre.
  const result = await prisma.adminUser.updateMany({
    where: {},
    data: {
      twoFactorSecret: null,
      isActive: true,
    },
  });

  console.log(`[global-setup] ✓ ${result.count} admin(s) reset (2FA OFF, isActive true)`);

  await prisma.$disconnect();
}
