import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// DEC-K1 : le HTML de référence utilise Montserrat. On la charge via next/font
// pour l'optimisation (subset, display swap, pas de layout shift).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kredix - Courtier en financement",
  description:
    "Kredix compare 40 banques pour vous obtenir le meilleur taux. Simulez gratuitement votre crédit et recevez une réponse en 24 heures.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        {/* Préchargement des polices Google — reproduction exacte du HTML */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={montserrat.variable}>{children}</body>
    </html>
  );
}
