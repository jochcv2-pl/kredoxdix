import { prisma } from '@kredix/db';

// =============================================================================
// Lecture des settings publics côté serveur (server components / API).
// =============================================================================
// Ces settings sont lus directement depuis Prisma (pas d'API nécessaire).
// Le frontend les utilise pour : nom du site, logo, favicon, tracking, etc.
// =============================================================================

const settingsCache = new Map<string, string>();
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/** Récupère une valeur de setting par clé. Retourne fallback si introuvable. */
export async function getPublicSetting(key: string, fallback = ''): Promise<string> {
  // Revalidation toutes les 60s (évite N requêtes par page)
  if (Date.now() - cacheTime > CACHE_TTL) {
    settingsCache.clear();
    cacheTime = Date.now();
  }

  if (settingsCache.has(key)) return settingsCache.get(key)!;

  const row = await prisma.setting.findUnique({ where: { key } });
  const value = row?.value ?? fallback;
  settingsCache.set(key, value);
  return value;
}

/** Récupère toutes les settings publiques en une seule requête (pour le layout). */
export async function getPublicSettings(): Promise<Record<string, string>> {
  const PUBLIC_KEYS = [
    'site_name',
    'cms_logo_url',
    'cms_logo_alt',
    'cms_favicon_url',
    'fb_pixel_id',
    'ga_tracking_id',
    'seo_meta_title',
    'seo_meta_description',
  ];

  const rows = await prisma.setting.findMany({
    where: { key: { in: PUBLIC_KEYS } },
    select: { key: true, value: true },
  });

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

/** Remplace {{SiteName}} par le vrai nom du site dans un contenu HTML. */
export function interpolateSiteName(content: string, siteName: string): string {
  return content.replaceAll('{{SiteName}}', siteName);
}
