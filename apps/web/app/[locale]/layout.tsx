import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LOCALES } from "@kredix/types";
import { getPublicSetting } from "@/lib/settings";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kredix.fr";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  // Lecture des SEO settings en DB (override admin via vue SEO).
  // Fallback multilingue préservé si la clé n'existe pas encore en DB.
  const [title, description, favicon] = await Promise.all([
    getPublicSetting('seo_meta_title', 'Kredix - Courtier en financement'),
    getPublicSetting('seo_meta_description', 'Kredix compare 40 banques pour vous obtenir le meilleur taux.'),
    getPublicSetting('cms_favicon_url', '/favicon.ico'),
  ]);

  // Hreflang alternates : une entrée par locale supportée.
  // Permet à Google de servir la bonne langue aux utilisateurs.
  const alternates: Record<string, string> = {};
  for (const l of LOCALES) {
    alternates[l] = `${SITE_URL}/${l}`;
  }
  // x-default → version par défaut (français)
  alternates["x-default"] = `${SITE_URL}/fr`;

  return {
    title,
    description,
    icons: { icon: favicon },
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
