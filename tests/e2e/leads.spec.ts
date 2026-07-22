import { test, expect } from '@playwright/test';
import { WEB_URL } from './helpers';

// =============================================================================
// leads.spec.ts — Tests E2E du endpoint public POST /api/leads (app web).
// =============================================================================
// Couvre : lead valide → 201, lead invalide → 422, rate limiting → 429.
//
// Note : chaque test utilise un X-Forwarded-For unique pour isoler le rate
// limiting (sinon les tests précédents consomment le quota de 5 req/min).

const VALID_LEAD = {
  firstName: 'Test',
  lastName: 'E2E',
  phone: '+33123456789',
  email: 'test-e2e@kredix.local',
  city: 'Paris',
  country: 'FR',
  loanType: 'immo',
  amount: 200000,
  durationYears: 20,
  employmentStatus: 'cdi',
  preferredLanguage: 'fr',
  whatsappConsent: false,
};

/** IP unique par test pour éviter l'interférence du rate limiter */
const uniqueIp = () => `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

/** Headers standard avec IP isolée */
const jsonHeaders = (ip?: string) => ({
  'Content-Type': 'application/json',
  ...(ip ? { 'X-Forwarded-For': ip } : {}),
});

test.describe('POST /api/leads — Lead public', () => {
  test('Lead valide → 201 + lead créé', async ({ request }) => {
    const res = await request.post(`${WEB_URL}/api/leads`, {
      data: {
        ...VALID_LEAD,
        email: `test-e2e-${Date.now()}@kredix.local`,
      },
      headers: jsonHeaders(uniqueIp()),
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.data.lead).toBeTruthy();
    expect(body.data.lead.id).toBeTruthy();
    expect(body.data.lead.firstName).toBe('Test');
    expect(body.data.lead.status).toBe('new');
    expect(body.data.lead.sequenceActive).toBe(true);
    expect(typeof body.data.lead.ackSent).toBe('boolean');
  });

  test('Lead sans prénom → 422', async ({ request }) => {
    const res = await request.post(`${WEB_URL}/api/leads`, {
      data: { ...VALID_LEAD, firstName: '' },
      headers: jsonHeaders(uniqueIp()),
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('Lead avec montant invalide (< 5000) → 422', async ({ request }) => {
    const res = await request.post(`${WEB_URL}/api/leads`, {
      data: { ...VALID_LEAD, amount: 1000 },
      headers: jsonHeaders(uniqueIp()),
    });

    expect(res.status()).toBe(422);
  });

  test('Lead sans téléphone → 422', async ({ request }) => {
    const res = await request.post(`${WEB_URL}/api/leads`, {
      data: { ...VALID_LEAD, phone: '' },
      headers: jsonHeaders(uniqueIp()),
    });

    expect(res.status()).toBe(422);
  });

  test('Lead sans email → 201 (email optionnel, sequenceActive=false)', async ({ request }) => {
    const res = await request.post(`${WEB_URL}/api/leads`, {
      data: { ...VALID_LEAD, email: '' },
      headers: jsonHeaders(uniqueIp()),
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.lead.sequenceActive).toBe(false);
  });

  test('Rate limiting → 429 après 5 soumissions', async ({ request }) => {
    // IP dédiée pour ce test — le rate limiter compte 5 req max/min/IP
    const testIp = '10.1.2.3';
    const results: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request.post(`${WEB_URL}/api/leads`, {
        data: {
          ...VALID_LEAD,
          email: `rate-test-${Date.now()}-${i}@kredix.local`,
        },
        headers: jsonHeaders(testIp),
      });
      results.push(res.status());
    }

    // Les 5 premières doivent être 201, les 2 suivantes 429
    const accepted = results.filter((s) => s === 201).length;
    const rejected = results.filter((s) => s === 429).length;

    expect(accepted).toBe(5);
    expect(rejected).toBe(2);
  });
});

test.describe('POST /api/simulate — Simulateur public', () => {
  test('Simulation immo 200k/20ans → 200 avec résultats', async ({ request }) => {
    const res = await request.post(`${WEB_URL}/api/simulate`, {
      data: {
        loanType: 'immo',
        amount: 200000,
        durationYears: 20,
      },
      headers: jsonHeaders(uniqueIp()),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toBeTruthy();
    expect(body.data.result).toBeTruthy();
    expect(body.data.result.monthlyPayment).toBeGreaterThan(0);
    expect(body.data.result.annualRate).toBeGreaterThan(0);
    expect(body.data.result.totalCost).toBeGreaterThan(200000);
  });

  test('Simulation montant < 5000 → 422', async ({ request }) => {
    const res = await request.post(`${WEB_URL}/api/simulate`, {
      data: { loanType: 'immo', amount: 2000, durationYears: 10 },
      headers: jsonHeaders(uniqueIp()),
    });

    expect(res.status()).toBe(422);
  });
});
