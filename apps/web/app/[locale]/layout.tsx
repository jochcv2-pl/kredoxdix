import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LOCALES } from "@kredix/types";
import { getPublicSetting } from "@/lib/settings";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kredix.fr";

// force-dynamic : toutes les pages sous [locale] sont SSR (pas de pré-render au build).
// Nécessaire car les pages interrogent la DB (settings CMS, taux, legal pages).
// Sans cela, next build tente de pré-render et crash (aucune DB disponible au build Docker).
export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  // Fallbacks SEO multilingues (la DB reste la source primaire via settings).
  // Ces valeurs ne s'affichent que si la DB est indispo OU la clé absente.
  const SEO_FALLBACKS: Record<string, { title: string; description: string }> = {
    fr: {
      title: 'Kredix - Courtier en financement',
      description: 'Kredix compare 40 banques pour vous obtenir le meilleur taux.',
    },
    de: {
      title: 'Kredix – Finanzierungsvermittler',
      description: 'Kredix vergleicht 40 Banken, um Ihnen den besten Zins zu sichern.',
    },
    en: {
      title: 'Kredix – Loan Broker',
      description: 'Kredix compares 40 banks to get you the best rate.',
    },
    es: {
      title: 'Kredix – Broker de crédito',
      description: 'Kredix compara 40 bancos para conseguirte la mejor tasa.',
    },
    pt: {
      title: 'Kredix – Broker de crédito',
      description: 'Kredix compara 40 bancos para obter a melhor taxa.',
    },
    it: {
      title: 'Kredix – Broker di credito',
      description: 'Kredix confronta 40 banche per offrirti il miglior tasso.',
    },
  };
  const fb = SEO_FALLBACKS[locale] ?? SEO_FALLBACKS.de;
  let title = fb.title;
  let description = fb.description;
  let favicon = '';
  try {
    [title, description, favicon] = await Promise.all([
      getPublicSetting('seo_meta_title', title),
      getPublicSetting('seo_meta_description', description),
      getPublicSetting('cms_favicon_url', ''),
    ]);
  } catch {
    // DB indispo → fallback statique (build Docker ou panne DB)
  }

  // Hreflang alternates : une entrée par locale supportée.
  // Permet à Google de servir la bonne langue aux utilisateurs.
  const alternates: Record<string, string> = {};
  for (const l of LOCALES) {
    alternates[l] = `${SITE_URL}/${l}`;
  }
  // x-default → locale par défaut (depuis @kredix/types DEFAULT_LOCALE = 'de')
  alternates["x-default"] = `${SITE_URL}/de`;

  return {
    title,
    description,
    ...(favicon ? { icons: { icon: favicon } } : {}),
    alternates: {
      languages: alternates,
      canonical: `${SITE_URL}/${locale}`,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // hasLocale n'existe pas dans next-intl 3.26 — vérification manuelle
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* Set <html lang> dynamiquement — le root layout ne connaît pas la locale */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang='${locale}'`,
        }}
      />
      {children}
    </NextIntlClientProvider>
  );
}
