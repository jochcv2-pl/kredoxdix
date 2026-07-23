import { NextResponse } from 'next/server';
import { prisma } from '@kredix/db';

// =============================================================================
// GET /api/brand — Identité de marque dynamique (publique, pas d'auth requise).
// =============================================================================
// Utilisé par Sidebar, Login, Topbar pour afficher le nom + logo configurés
// dans le CMS (Settings → cms.branding).
// Cache 60s côté client (Cache-Control) pour éviter les requêtes excessives.

export async function GET() {
  try {
    const rows = await prisma.setting.findMany({
      where: {
        key: { in: ['site_name', 'cms_logo_url', 'cms_logo_alt'] },
      },
      select: { key: true, value: true },
    });

    const map = new Map(rows.map((r) => [r.key, r.value]));

    return NextResponse.json(
      {
        siteName: map.get('site_name') || 'Kredix',
        logoUrl: map.get('cms_logo_url') || '',
        logoAlt: map.get('cms_logo_alt') || map.get('site_name') || 'Kredix',
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch {
    // DB indispo → fallback statique
    return NextResponse.json(
      { siteName: 'Kredix', logoUrl: '', logoAlt: 'Kredix' },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  }
}
