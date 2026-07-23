import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSecurityHeaders } from "./lib/security-headers";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@kredix/ui"],
  },
  // output: "standalone" requis pour le build Docker de production.
  // Activé en NODE_ENV=production (le build local active aussi standalone,
  // ce qui est sans incidence — juste un dossier .next/standalone supplémentaire).
  ...(process.env.NODE_ENV === "production"
    ? { output: "standalone" as const }
    : {}),
});

export default withNextIntl(nextConfig);
