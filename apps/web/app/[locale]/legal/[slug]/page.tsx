import { notFound } from 'next/navigation';
import { prisma, getPublicSettings } from '@kredix/db';
import { interpolateSiteName } from '@/lib/settings';
import { sanitizeHtml } from '@/lib/sanitize';
import Navbar from '@/components/navbar';
import type { Metadata } from 'next';

// =============================================================================
// /[locale]/legal/[slug] — page légale dynamique (CGU, mentions, RGPD...)
// =============================================================================
// Le contenu vient de la table LegalPage (éditable depuis le CRM admin).
// {{SiteName}} est interpolé avec le vrai nom du site.
// =============================================================================

// force-dynamic : aucun pré-render au build (la DB n'est pas disponible au build Docker).
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const page = await prisma.legalPage.findUnique({
      where: { slug },
      select: { title: true },
    });
    if (!page) return { title: 'Page introuvable' };
    const settings = await getPublicSettings();
    const siteName = settings.site_name || 'Kredix';
    return { title: `${page.title} — ${siteName}` };
  } catch {
    return { title: 'Kredix' };
  }
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  let page;
  try {
    // Les pages légales sont stockées avec locale='all' (communes à toutes les langues).
    // On accepte aussi une page spécifique à la locale si elle existe.
    page = await prisma.legalPage.findFirst({
      where: { slug, isActive: true, locale: { in: [locale, 'all'] } },
      orderBy: [{ locale: 'desc' }],
    });
  } catch {
    notFound();
  }

  if (!page) {
    notFound();
  }

  const settings = await getPublicSettings();
  const siteName = settings.site_name || 'Kredix';
  const interpolatedContent = interpolateSiteName(page.content, siteName);
  const safeContent = sanitizeHtml(interpolatedContent);

  return (
    <>
      <Navbar siteName={siteName} logoUrl={settings.logo_url} />
      <div className="legal-page-container">
        <div className="wrap">
          <div className="legal-breadcrumb">
            <a href={`/${locale}`}>← {siteName}</a>
          </div>
          <h1 className="legal-page-title">{page.title}</h1>
          <article
            className="legal-content"
            dangerouslySetInnerHTML={{ __html: safeContent }}
          />
        </div>
      </div>
    </>
  );
}
