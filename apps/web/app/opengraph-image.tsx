import { ImageResponse } from "next/og";

// =============================================================================
// Open Graph image (1200×630) générée dynamiquement pour le partage social.
// Reprend la charte Kredix : fond bleu dégradé + K stylisé + tagline.
// =============================================================================

export const runtime = "edge";
export const alt = "Kredix — Courtier en crédit 100% en ligne";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e3a8a 0%, #155a99 50%, #0f4c75 100%)",
          position: "relative",
        }}
      >
        {/* K stylisé */}
        <div
          style={{
            fontSize: 120,
            fontWeight: 800,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <span style={{ color: "#f97316" }}>K</span>
          <span style={{ fontSize: 72, letterSpacing: -2 }}>redix</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            color: "rgba(255,255,255,0.85)",
            maxWidth: 800,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Votre courtier en crédit 100% en ligne
        </div>

        {/* Trust badges */}
        <div
          style={{
            display: "flex",
            gap: 32,
            marginTop: 40,
            fontSize: 22,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <span>Simulation gratuite</span>
          <span>·</span>
          <span>Réponse en 24h</span>
          <span>·</span>
          <span>40+ banques partenaires</span>
        </div>
      </div>
    ),
    size
  );
}
