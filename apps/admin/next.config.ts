import type { NextConfig } from "next";
import { withSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
  // ESLint au build Docker : désactivé (le lint se fait en dev local + CI).
  // Évite l'échec du build sur des règles non résolues (@typescript-eslint plugin).
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
});

export default nextConfig;
