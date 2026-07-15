import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A-006 : typedRoutes prématuré tant que toutes les routes ne sont pas créées.
  // React 19 strict : pas besoin de transpilePackages pour des packages workspace simples.
  // output: "standalone" — activé uniquement pour le build Docker de production.
  // Désactivé en dev car Windows nécessite les privilèges admin pour les symlinks.
  ...(process.env.NODE_ENV === "production" && process.env.DOCKER_BUILD === "true"
    ? { output: "standalone" as const }
    : {}),
  reactStrictMode: true,
  experimental: {
    // Activer au fur et à mesure que l'app grossit
    optimizePackageImports: ["@kredix/ui"],
  },
};

export default nextConfig;
