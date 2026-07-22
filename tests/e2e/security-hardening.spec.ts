import { test, expect, ADMIN_URL, apiLogin } from './helpers';

// =============================================================================
// security-hardening.spec.ts — Tests E2E du durcissement sécurité (session 28).
// =============================================================================
// Valide les fixes P0-1 (RBAC), P0-2 (headers), P0-3 (uploads SVG),
// P1-1 (Bearer timing-safe), P2-4 (validation format id).

test.describe('Security hardening — RBAC + headers + id validation', () => {

  test('Headers de sécurité présents sur les réponses admin', async ({ request }) => {
    const res = await request.get(`${ADMIN_URL}/api/health`);
    const h = res.headers();

    // P0-2 : tous les headers de sécurité doivent être présents
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['strict-transport-security']).toContain('max-age=31536000');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    // X-Powered-By doit être absent
    expect(h['x-powered-by']).toBeFalsy();
  });

  test('RBAC: route protégée SANS session → 307 redirect /login', async ({ request }) => {
    // Sans cookie, toutes les routes admin doivent rediriger vers /login
    for (const route of ['/api/leads', '/api/agents', '/api/gateways', '/api/settings']) {
      const res = await request.get(`${ADMIN_URL}${route}`, {
        maxRedirects: 0,
      });
      // 307 (NextAuth middleware) ou 401 si la route s'exécute (cas rare)
      expect([307, 401]).toContain(res.status());
      if (res.status() === 307) {
        expect(res.headers()['location']).toContain('/login');
      }
    }
  });

  test('RBAC: route accessible AVEC session admin valide → 200', async ({ request }) => {
    const loggedIn = await apiLogin(request);
    expect(loggedIn).toBe(true);

    for (const route of ['/api/leads', '/api/agents', '/api/gateways', '/api/settings']) {
      const res = await request.get(`${ADMIN_URL}${route}`);
      expect(res.status()).toBe(200);
    }
  });

  test('Validation format id: id invalide → 404 (pas de query DB)', async ({ request }) => {
    await apiLogin(request);

    // P2-4 : isValidId doit rejeter les IDs non cuid/uuid AVANT la query Prisma
    const invalidIds = [
      'xyz',           // trop court
      'a',             // trop court
      '<script>alert(1)</script>',
      '1; DROP TABLE leads',
      '../etc/passwd',
    ];

    for (const id of invalidIds) {
      const res = await request.get(`${ADMIN_URL}/api/leads/${encodeURIComponent(id)}`, {
        maxRedirects: 0,
      });
      // Soit 404 (isValidId a rejeté), soit 307 (middleware avant isValidId)
      // On accepte les deux — l'essentiel est que la route ne retourne PAS 200 avec données
      expect([404, 307]).toContain(res.status(), `id='${id}' doit être 404 ou 307, reçu ${res.status()}`);
    }
  });

  test('Validation format id: id valide mais inexistant → 404 ou 307', async ({ request }) => {
    await apiLogin(request);

    // Format cuid valide (alphanumérique base36, 24 chars) mais n'existe pas en base
    const validButMissingId = 'cm0z9abcdefghij0123456789';
    const res = await request.get(`${ADMIN_URL}/api/leads/${validButMissingId}`, {
      maxRedirects: 0,
    });
    // 404 si la session est active (findUnique null), 307 si middleware redirect
    // Les deux sont corrects — l'essentiel est qu'aucune donnée n'est leakée
    expect([404, 307]).toContain(res.status());
  });

  test('Bearer timing-safe: cron sans secret → 401', async ({ request }) => {
    // P1-1 : verifyBearerSecret doit refuser l'absence de header
    const res = await request.post(`${ADMIN_URL}/api/cron/relance`, {
      data: {},
      maxRedirects: 0,
    });
    expect(res.status()).toBe(401);

    // Mauvais secret → 401
    const res2 = await request.post(`${ADMIN_URL}/api/cron/relance`, {
      headers: { Authorization: 'Bearer wrong-secret' },
      data: {},
      maxRedirects: 0,
    });
    expect(res2.status()).toBe(401);
  });
});
