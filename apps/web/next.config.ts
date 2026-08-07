import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";
import { withSecurityHeaders } from "./lib/security-headers";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
  output: "standalone",
  // Monorepo : indiquer la racine pour le file tracing (standalone node_modules).
  // Sans cela, pnpm symlinks ne sont pas résolus et next/react manquent dans standalone.
  outputFileTracingRoot: path.join(__dirname, "../../"),
});

export default withNextIntl(nextConfig);
