import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const montserrat = Montserrat({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const ADMIN_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3101";

export const metadata: Metadata = {
  metadataBase: new URL(ADMIN_URL),
  title: "Kredix · CRM administrateur",
  description: "Admin CRM pour Kredix, courtier en financement",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={montserrat.variable}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}