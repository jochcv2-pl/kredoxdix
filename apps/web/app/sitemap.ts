// =============================================================================
// sitemap.ts — Génération automatique du sitemap.xml (Next.js App Router).
// =============================================================================
// Inclut toutes les locales × pages publiques principales.
// DEC-K1 : URLs canoniques avec locale prefixée.

import type { MetadataRoute } from "next";
import { LOCALES } from "@kredix/types";

// En production : configurer NEXT_PUBLIC_SITE_URL=https://kredix.fr
// Normalisation du slash final pour éviter les doubles slashes dans les URLs.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kredix.fr").replace(/\/$/, "");

// Pages publiques principales (hors dynamiques comme legal/[slug]).
const STATIC_PAGES = ["", "/#contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    for (const path of STATIC_PAGES) {
      // URL avec locale prefixée : /fr, /en, etc.
      // Path "" → page d'accueil, "/#contact" → section contact
      const url = path.startsWith("/#")
        ? `${SITE_URL}/${locale}${path}`
        : `${SITE_URL}/${locale}`;

      entries.push({
        url,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: path === "" ? 1.0 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            LOCALES.map((l) => [l, `${SITE_URL}/${l}`]),
          ),
        },
      });
    }
  }

  return entries;
}
