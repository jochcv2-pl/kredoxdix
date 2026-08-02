import type { Metadata } from "next";
import "./globals.css";
import { Montserrat } from "next/font/google";
import { TrackingHead } from "@/components/Tracking";

// Base URL utilisée par Next.js pour résoudre les URLs relatives dans les
// métadonnées (canonical, OG images, sitemap, etc.). Sans cela, Next.js
// utilise http://localhost:3000 par défaut → URLs cassées en production.
export const metadata: Metadata = {
  metadataBase: new URL("https://kredix.fr"),
};

// next/font/google — self-hosted, pas de render-blocking, display:swap automatique.
// Remplace les 3 <link> Google Fonts (preconnect + stylesheet) qui bloquaient le render.
// Migration A1 (audit visuel session 23) : performance + LCP.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-montserrat",
});

// Note : generateMetadata est volontairement absent ici.
// En Next.js App Router, le metadata du layout enfant ([locale]/layout.tsx)
// override celui du parent. La lecture DB des SEO settings se fait donc
// dans [locale]/layout.tsx (qui gagne réellement pour toutes les locales).

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={montserrat.variable}>
      <body>
        {/* Tracking (FB Pixel + GA) — injecté AVANT le contenu pour fire au plus tôt.
            N'injecte rien si les IDs ne sont pas configurés dans Settings (admin). */}
        <TrackingHead />
        {children}
      </body>
    </html>
  );
}
