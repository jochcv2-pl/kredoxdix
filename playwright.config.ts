import { defineConfig, devices } from '@playwright/test';

// =============================================================================
// playwright.config.ts — Configuration E2E Kredix
// =============================================================================
// Deux apps testées :
//   - Admin (CRM) : http://localhost:3200
//   - Web (landing) : http://localhost:3100
//
// Prérequis :
//   1. PostgreSQL Docker container `kredix-postgres` running
//   2. `pnpm --filter admin dev` (port 3200)
//   3. `pnpm --filter web dev` (port 3100)
//   4. DB seeded (`pnpm --filter @kredix/db db:seed`)
//
// Lancer : `pnpm test:e2e`

const ADMIN_URL = 'http://localhost:3200';
const WEB_URL = 'http://localhost:3100';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false, // Séquentiel — partage la même DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // 1 worker — les tests modifient la DB (2FA on/off)
  reporter: [
    ['html', { outputFolder: 'tests/e2e-report' }],
    ['list'],
  ],
  use: {
    baseURL: ADMIN_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Pas de webServer auto — les serveurs doivent tourner manuellement.
  // Décommenter pour auto-start en CI :
  // webServer: [
  //   { command: 'pnpm --filter admin dev', port: 3200, timeout: 60_000, reuseExistingServer: true },
  //   { command: 'pnpm --filter web dev', port: 3100, timeout: 60_000, reuseExistingServer: true },
  // ],
});
