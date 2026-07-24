import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSecurityHeaders } from "./lib/security-headers";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@kredix/ui"],
  },
  output: "standalone",
});

export default withNextIntl(nextConfig);
