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

// Génère les routes statiques pour toutes les pages légales actives
export async function generateStaticParams() {
  const pages = await prisma.legalPage.findMany({
    where: { isActive: true },
    select: { slug: true },
  });
  return pages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await prisma.legalPage.findUnique({
    where: { slug },
    select: { title: true },
  });
  if (!page) return { title: 'Page introuvable' };
  const siteName = await getPublicSetting('site_name', 'Kredix');
  return { title: `${page.title} — ${siteName}` };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;

  const page = await prisma.legalPage.findUnique({
    where: { slug, isActive: true },
  });

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
