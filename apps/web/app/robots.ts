// =============================================================================
// robots.ts — Génération automatique de robots.txt (Next.js App Router).
// =============================================================================
// Autorise tous les crawlers, référence le sitemap.
// En production, ajuster si certaines routes doivent être exclues.

import type { MetadataRoute } from "next";

// Normalisation du slash final pour éviter les doubles slashes dans les URLs.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kredix.fr").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Pages non indexables (API, admin)
        disallow: ["/api/", "/legal/*/preview"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
