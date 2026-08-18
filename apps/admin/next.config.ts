import type { NextConfig } from "next";
import path from "path";
import { withSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
  // ESLint au build Docker : désactivé (le lint se fait en dev local + CI).
  eslint: { ignoreDuringBuilds: true },
  output: "standalone",
  // Monorepo : indiquer la racine pour le file tracing (standalone node_modules).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // pdfkit DOIT rester externe du bundle serveur : bundlé dans les chunks, sa
  // résolution interne de fonts (.afm relatifs à son module) casse en standalone
  // → ENOENT .next/server/chunks/data/Helvetica.afm (PDF d'amortissement).
  serverExternalPackages: ["pdfkit"],
});

export default nextConfig;
