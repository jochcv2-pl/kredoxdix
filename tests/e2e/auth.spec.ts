import { test, expect } from '@playwright/test';
import { ADMIN_URL, TEST_CREDENTIALS, apiLogin } from './helpers';

// =============================================================================
// auth.spec.ts — Tests E2E du flow d'authentification admin.
// =============================================================================
// Couvre : login UI success, login UI failure, route protégée sans session,
// login API, logout, health check.

test.describe('Auth — Login Admin', () => {
  test('Login UI réussi → redirect /', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);

    // Remplir le formulaire
    await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
    await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
    await page.click('button[type="submit"]');

    // Attendre la redirection vers /
    await page.waitForURL(`${ADMIN_URL}/`, { timeout: 15_000 });

    // Vérifier qu'on est sur le CRM (pas sur /login)
    expect(page.url()).toBe(`${ADMIN_URL}/`);
  });

  test('Login UI échec (mauvais password) → message d\'erreur', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);

    await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
    await page.fill('input[type="password"]', 'wrongpassword123');
    await page.click('button[type="submit"]');

    // Attendre que le message d'erreur apparaisse
    await expect(page.locator('.login-error.show')).toBeVisible({ timeout: 10_000 });

    // Vérifier le texte d'erreur
    await expect(page.locator('.login-error')).toContainText(/incorrect/i);

    // Vérifier qu'on reste sur /login
    expect(page.url()).toContain('/login');
  });

  test('Login UI échec (email inexistant) → message d\'erreur', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);

    await page.fill('input[type="email"]', 'nonexistent@kredix.local');
    await page.fill('input[type="password"]', 'somepassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('.login-error.show')).toBeVisible({ timeout: 10_000 });
  });

  test('Route protégée sans session → redirect /login', async ({ page }) => {
    // Tenter d'accéder à une route API protégée
    const response = await page.goto(`${ADMIN_URL}/api/leads`);

    // NextAuth middleware redirige vers /login (307)
    // En mode navigateur, Playwright suit la redirection automatiquement
    expect(page.url()).toContain('/login');
    expect(response).toBeTruthy();
  });

  test('Login API réussi → session valide', async ({ request }) => {
    const success = await apiLogin(request);
    expect(success).toBe(true);

    // Vérifier que la session contient les bonnes infos
    const sessionRes = await request.get(`${ADMIN_URL}/api/auth/session`);
    const session = await sessionRes.json();
    expect(session.user).toBeTruthy();
    expect(session.user.email).toBe(TEST_CREDENTIALS.email);
    expect(session.user.role).toBe('admin');
  });

  test('Logout → session détruite', async ({ request }) => {
    // Login d'abord
    await apiLogin(request);
    let sessionRes = await request.get(`${ADMIN_URL}/api/auth/session`);
    let session = await sessionRes.json();
    expect(session.user).toBeTruthy();

    // Récupérer le CSRF token pour le logout
    const csrfRes = await request.get(`${ADMIN_URL}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();

    // Logout
    await request.post(`${ADMIN_URL}/api/auth/signout`, {
      data: new URLSearchParams({ csrfToken, callbackUrl: '/', json: 'true' }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // Vérifier que la session est détruite (NextAuth retourne null ou objet vide)
    sessionRes = await request.get(`${ADMIN_URL}/api/auth/session`);
    session = await sessionRes.json();
    expect(session?.user).toBeFalsy();
  });
});

test.describe('Health Check', () => {
  test('GET /api/health → 200 healthy', async ({ request }) => {
    const res = await request.get(`${ADMIN_URL}/api/health`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('kredix-admin');
    expect(body.checks.db).toBe('ok');
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeTruthy();
  });
});
