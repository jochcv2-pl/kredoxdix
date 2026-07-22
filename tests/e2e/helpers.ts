import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { generateSync } from 'otplib';

// =============================================================================
// helpers.ts — Fixtures et utilitaires partagés pour les tests E2E Kredix.
// =============================================================================

export const ADMIN_URL = 'http://localhost:3200';
export const WEB_URL = 'http://localhost:3100';

export const TEST_CREDENTIALS = {
  email: 'admin@kredix.local',
  password: 'admin123',
};

// -----------------------------------------------------------------------------
// Génération TOTP — otplib v13 API : generateSync({ secret })
// -----------------------------------------------------------------------------

export function generateTotp(secret: string): string {
  return generateSync({ secret });
}

// -----------------------------------------------------------------------------
// Login via API — retourne les cookies de session pour les requêtes suivantes.
// -----------------------------------------------------------------------------

/** Login via l'API NextAuth Credentials Provider. Retourne true si succès. */
export async function apiLogin(
  request: APIRequestContext,
  email: string = TEST_CREDENTIALS.email,
  password: string = TEST_CREDENTIALS.password,
  totp?: string,
): Promise<boolean> {
  // 1. Récupérer le CSRF token
  const csrfRes = await request.get(`${ADMIN_URL}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();

  // 2. POST /api/auth/callback/credentials
  const body = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: '/',
    json: 'true',
  });
  if (totp) body.append('totp', totp);

  await request.post(`${ADMIN_URL}/api/auth/callback/credentials`, {
    data: body.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    maxRedirects: 0,
  });

  // 3. Vérifier la session
  const sessionRes = await request.get(`${ADMIN_URL}/api/auth/session`);
  const session = await sessionRes.json();
  return !!session?.user;
}

/** Login via UI navigateur — remplit le formulaire et attend la redirection. */
export async function uiLogin(
  page: Page,
  email: string = TEST_CREDENTIALS.email,
  password: string = TEST_CREDENTIALS.password,
): Promise<void> {
  await page.goto(`${ADMIN_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${ADMIN_URL}/`, { timeout: 10_000 });
}

// -----------------------------------------------------------------------------
// Fixtures personnalisées
// -----------------------------------------------------------------------------

// Test fixture avec authentification déjà faite (session cookie posée)
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page, request }, use) => {
    // Login via API (pose le cookie via le request context partagé)
    await apiLogin(request);
    // Le cookie est maintenant dans le context, page.goto l'utilisera
    await use(page);
  },
});

export { expect };
