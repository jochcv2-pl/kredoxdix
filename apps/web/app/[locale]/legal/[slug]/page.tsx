import { notFound } from 'next/navigation';
import { prisma } from '@kredix/db';
import { getPublicSetting, interpolateSiteName } from '@/lib/settings';
import { sanitizeHtml } from '@/lib/sanitize';
import type { Metadata } from 'next';

// =============================================================================
// /[locale]/legal/[slug] — page légale dynamique (CGU, mentions, RGPD...)
// =============================================================================
// Le contenu vient de la table LegalPage (éditable depuis le CRM admin).
// {{SiteName}} est interpolé avec le vrai nom du site.
// =============================================================================

// force-dynamic : aucun pré-render au build (la DB n'est pas disponible au build Docker).
// La page est rendue à chaque requête (SSR).
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
    const siteName = await getPublicSetting('site_name', 'Kredix');
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
  const { slug } = await params;

  let page;
  try {
    page = await prisma.legalPage.findUnique({
      where: { slug, isActive: true },
    });
  } catch {
    // DB indispo → 404 (la page ne peut pas être rendue)
    notFound();
  }

  if (!page) {
    notFound();
  }

  const siteName = await getPublicSetting('site_name', 'Kredix');
  const interpolatedContent = interpolateSiteName(page.content, siteName);
  // Sanitisation HTML (defense in depth) — neutralise les vecteurs XSS même si
  // du contenu malveillant a été stocké en DB. Sécurise le rendu via dangerouslySetInnerHTML.
  const safeContent = sanitizeHtml(interpolatedContent);

  return (
    <div className="legal-page-container">
      <article
        className="legal-content"
        dangerouslySetInnerHTML={{ __html: safeContent }}
      />
    </div>
  );
}
