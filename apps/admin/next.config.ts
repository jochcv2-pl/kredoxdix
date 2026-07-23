import type { NextConfig } from "next";
import { withSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
  // ESLint au build Docker : désactivé (le lint se fait en dev local + CI).
  // Évite l'échec du build sur des règles non résolues (@typescript-eslint plugin).
  eslint: { ignoreDuringBuilds: true },
  // output: "standalone" requis pour le build Docker de production.
  // Activé en NODE_ENV=production (build local l'active aussi, sans incidence).
  ...(process.env.NODE_ENV === "production"
    ? { output: "standalone" as const }
    : {}),
});

export default nextConfig;
