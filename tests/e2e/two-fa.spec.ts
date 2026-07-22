import { test, expect } from '@playwright/test';
import { ADMIN_URL, TEST_CREDENTIALS, apiLogin, generateTotp } from './helpers';

// =============================================================================
// two-fa.spec.ts — Tests E2E du cycle complet 2FA TOTP.
// =============================================================================
// Prérequis : 2FA doit être désactivé au départ (état par défaut du seed).
// Le test nettoie après lui (disable 2FA à la fin).
//
// Flow testé :
//   1. Login sans 2FA
//   2. Setup 2FA → récupère le secret
//   3. Enable 2FA avec code TOTP valide
//   4. Vérifie check-2fa = true
//   5. Logout
//   6. Login sans TOTP → bloqué
//   7. Login avec TOTP valide → réussi
//   8. Disable 2FA (cleanup)

test.describe('2FA TOTP — Cycle complet', () => {
  test('Setup → Enable → Login avec TOTP → Disable', async ({ request }) => {
    // --- 1. Login initial (sans 2FA) ---
    const loggedIn = await apiLogin(request);
    expect(loggedIn).toBe(true);

    // --- 2. Setup 2FA → récupère le secret ---
    const setupRes = await request.post(`${ADMIN_URL}/api/profile/2fa/setup`);
    expect(setupRes.status()).toBe(200);

    const setupBody = await setupRes.json();
    const secret = setupBody.data?.secret ?? setupBody.secret;
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(16);

    // --- 3. Enable 2FA avec un code TOTP valide ---
    const validCode = generateTotp(secret);

    const enableRes = await request.post(`${ADMIN_URL}/api/profile/2fa/enable`, {
      data: { secret, code: validCode },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(enableRes.status()).toBe(200);

    const enableBody = await enableRes.json();
    expect(enableBody.data?.twoFactorEnabled ?? enableBody.twoFactorEnabled).toBe(true);

    // --- 4. Vérifie check-2fa = true ---
    // Il faut d'abord se déconnecter pour que check-2fa teste l'email sans session
    const csrfRes = await request.get(`${ADMIN_URL}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();
    await request.post(`${ADMIN_URL}/api/auth/signout`, {
      data: new URLSearchParams({ csrfToken, callbackUrl: '/', json: 'true' }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const checkRes = await request.post(`${ADMIN_URL}/api/auth/check-2fa`, {
      data: { email: TEST_CREDENTIALS.email },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(checkRes.status()).toBe(200);

    const checkBody = await checkRes.json();
    const required = checkBody.data?.twoFactorRequired ?? checkBody.twoFactorRequired;
    expect(required).toBe(true);

    // --- 5. Login SANS TOTP → doit échouer ---
    const loginNoTotp = await apiLogin(
      request,
      TEST_CREDENTIALS.email,
      TEST_CREDENTIALS.password,
    );
    expect(loginNoTotp).toBe(false);

    // --- 6. Login AVEC TOTP valide → doit réussir ---
    const freshCode = generateTotp(secret);
    const loginWithTotp = await apiLogin(
      request,
      TEST_CREDENTIALS.email,
      TEST_CREDENTIALS.password,
      freshCode,
    );
    expect(loginWithTotp).toBe(true);

    // Vérifier la session
    const sessionRes = await request.get(`${ADMIN_URL}/api/auth/session`);
    const session = await sessionRes.json();
    expect(session.user).toBeTruthy();
    expect(session.user.email).toBe(TEST_CREDENTIALS.email);

    // --- 7. Cleanup : disable 2FA ---
    const disableCode = generateTotp(secret);
    const disableRes = await request.post(`${ADMIN_URL}/api/profile/2fa/disable`, {
      data: { password: TEST_CREDENTIALS.password, code: disableCode },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(disableRes.status()).toBe(200);

    const disableBody = await disableRes.json();
    expect(disableBody.data?.twoFactorEnabled ?? disableBody.twoFactorEnabled).toBe(false);
  });

  test('Enable 2FA avec code invalide → rejeté', async ({ request }) => {
    // Login
    await apiLogin(request);

    // Setup
    const setupRes = await request.post(`${ADMIN_URL}/api/profile/2fa/setup`);
    const setupBody = await setupRes.json();
    const secret = setupBody.data?.secret ?? setupBody.secret;

    // Tenter enable avec code invalide
    const enableRes = await request.post(`${ADMIN_URL}/api/profile/2fa/enable`, {
      data: { secret, code: '000000' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(enableRes.status()).toBeGreaterThanOrEqual(400);

    // Vérifier que 2FA n'est pas activé
    const profileRes = await request.get(`${ADMIN_URL}/api/profile`);
    const profile = await profileRes.json();
    const enabled = profile.data?.twoFactorEnabled ?? profile.twoFactorEnabled;
    expect(enabled).toBe(false);
  });
});
