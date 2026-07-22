import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSecurityHeaders } from "./lib/security-headers";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@kredix/ui"],
  },
  // output: "standalone" activé uniquement pour le build Docker de production
  ...(process.env.NODE_ENV === "production" && process.env.DOCKER_BUILD === "true"
    ? { output: "standalone" as const }
    : {}),
});

export default withNextIntl(nextConfig);
