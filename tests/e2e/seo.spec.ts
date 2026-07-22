import { test, expect } from '@playwright/test';
import { WEB_URL } from './helpers';

// =============================================================================
// seo.spec.ts — Tests E2E du SEO (meta tags, sitemap, robots, hreflang).
// =============================================================================
// Couvre : <title>, <meta description>, <link canonical>, <link hreflang>,
// sitemap.xml, robots.txt, <html lang>.

const LOCALES = ['fr', 'en', 'de', 'es', 'pt', 'it'];

test.describe('SEO — Meta tags par locale', () => {
  for (const locale of LOCALES) {
    test(`GET /${locale} → <title> non vide`, async ({ page }) => {
      await page.goto(`${WEB_URL}/${locale}`);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(3);
      expect(title).not.toBe('Kredix'); // Pas le fallback default
    });

    test(`GET /${locale} → <meta description> présente`, async ({ page }) => {
      await page.goto(`${WEB_URL}/${locale}`);
      const desc = await page.getAttribute('meta[name="description"]', 'content');
      expect(desc).toBeTruthy();
      expect(desc!.length).toBeGreaterThan(10);
    });

    test(`GET /${locale} → <link rel="canonical"> présente`, async ({ page }) => {
      await page.goto(`${WEB_URL}/${locale}`);
      const canonical = await page.getAttribute('link[rel="canonical"]', 'href');
      expect(canonical).toBeTruthy();
      expect(canonical!).toContain(`/${locale}`);
    });

    test(`GET /${locale} → hreflang alternates pour les 6 langues + x-default`, async ({ page }) => {
      await page.goto(`${WEB_URL}/${locale}`);

      // Vérifier hreflang pour chaque locale
      for (const altLocale of LOCALES) {
        const hreflang = await page.getAttribute(
          `link[rel="alternate"][hreflang="${altLocale}"]`,
          'href',
        );
        expect(hreflang).toBeTruthy();
        expect(hreflang!).toContain(`/${altLocale}`);
      }

      // x-default
      const xDefault = await page.getAttribute(
        'link[rel="alternate"][hreflang="x-default"]',
        'href',
      );
      expect(xDefault).toBeTruthy();
    });
  }
});

test.describe('SEO — Sitemap & Robots', () => {
  test('GET /sitemap.xml → 200 avec URLs', async ({ request }) => {
    const res = await request.get(`${WEB_URL}/sitemap.xml`);
    expect(res.status()).toBe(200);

    const xml = await res.text();
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<url>');
    expect(xml).toContain('/fr');
    expect(xml).toContain('/en');
    expect(xml).toContain('/de');
    expect(xml).toContain('/es');
    expect(xml).toContain('/pt');
    expect(xml).toContain('/it');
    // Alternates
    expect(xml).toContain('hreflang');
  });

  test('GET /robots.txt → 200 avec disallow /api/', async ({ request }) => {
    const res = await request.get(`${WEB_URL}/robots.txt`);
    expect(res.status()).toBe(200);

    const text = await res.text();
    expect(text.toLowerCase()).toContain('user-agent');
    expect(text).toContain('Disallow: /api/');
    expect(text).toContain('Sitemap:');
  });
});

test.describe('SEO — HTML lang attribute', () => {
  test('GET /fr → <html lang="fr">', async ({ page }) => {
    await page.goto(`${WEB_URL}/fr`);
    // Le lang est set par script inline, on attend un court instant
    await page.waitForTimeout(500);
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('fr');
  });

  test('GET /en → <html lang="en">', async ({ page }) => {
    await page.goto(`${WEB_URL}/en`);
    await page.waitForTimeout(500);
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBe('en');
  });
});
