import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@kredix/ui"],
  },
  // output: "standalone" activé uniquement pour le build Docker de production
  ...(process.env.NODE_ENV === "production" && process.env.DOCKER_BUILD === "true"
    ? { output: "standalone" as const }
    : {}),
};

export default withNextIntl(nextConfig);
