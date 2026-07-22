import "./globals.css";
import { Montserrat } from "next/font/google";
import { TrackingHead } from "@/components/Tracking";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={montserrat.variable}>
      <body>
        {children}
        {/* Tracking (FB Pixel + GA) — injecté seulement si les IDs sont configurés */}
        <TrackingHead />
      </body>
    </html>
  );
}
