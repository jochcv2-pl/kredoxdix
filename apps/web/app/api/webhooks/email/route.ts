import { NextRequest } from "next/server";
import { prisma, SequenceExitReason, SuppressionReason } from "@kredix/db";
import { successResponse, errorResponse } from "../../validators";

// =============================================================================
// POST /api/webhooks/email
// =============================================================================
// Route PUBLIQUE — recevant les webhooks des fournisseurs d'envoi email
// (Resend, Brevo) pour les événements de délivrabilité : bounce et complaint.
//
// L'IA ne lit jamais rien — c'est le FOURNISSEUR qui pousse un signal d'état,
// pas nous qui lisons une boîte de réception.
//
// Sécurité : le webhook est protégé par un secret partagé (WEBHOOK_EMAIL_SECRET)
// passé dans le header Authorization: Bearer <secret>.
//
// Événements gérés :
//   - bounce / bounced     → reason: bounce    → exitReason: bounced
//   - complaint / spam     → reason: complaint → exitReason: complaint
//   (les autres événements — delivered, open, click — sont ignorés)
//
// Format d'entrée (unifié Resend/Brevo) :
//   { "event": "bounced" | "complaint", "email": "user@example.com" }
// =============================================================================

const VALID_EVENTS: Record<string, SuppressionReason | null> = {
  // Bounce
  bounced: SuppressionReason.bounce,
  bounce: SuppressionReason.bounce,
  hard_bounce: SuppressionReason.bounce,
  // Complaint / spam
  complaint: SuppressionReason.complaint,
  spam: SuppressionReason.complaint,
  spam_report: SuppressionReason.complaint,
  marked_as_spam: SuppressionReason.complaint,
};

export async function POST(request: NextRequest) {
  // ----- Authentification : secret partagé -----
  const authHeader = request.headers.get("authorization");
  const webhookSecret = process.env.WEBHOOK_EMAIL_SECRET;

  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return errorResponse("Non autorisé", "UNAUTHORIZED", undefined, 401);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("JSON invalide", "BAD_JSON", undefined, 400);
    }

    // Format unifié : { event, email }
    // Les webhooks Resend et Brevo ont des structures différentes, mais on attend
    // que le proxy/middleware du fournisseur normalise vers ce format.
    // En production, on adaptera le parsing selon le provider détecté.
    const { event, email } = body as { event?: string; email?: string };

    if (!event || !email) {
      return errorResponse(
        "Champs manquants (event, email attendus)",
        "MISSING_FIELDS",
        undefined,
        422,
      );
    }

    const reason = VALID_EVENTS[event.toLowerCase()];
    if (!reason) {
      // Événement non pertinent (delivered, open, click...) → on ignore (200)
      return successResponse({ message: `Événement '${event}' ignoré` }, 200);
    }

    const now = new Date();

    // 1. Ajoute à la SuppressionList (upsert — un email = une entrée)
    await prisma.suppressionList.upsert({
      where: { email },
      update: { reason, createdAt: now },
      create: { email, reason },
    });

    // 2. Ferme la séquence de tous les leads actifs avec cet email
    const exitReason =
      reason === SuppressionReason.bounce
        ? SequenceExitReason.bounced
        : SequenceExitReason.complaint;

    const result = await prisma.lead.updateMany({
      where: {
        email,
        sequenceActive: true,
      },
      data: {
        sequenceActive: false,
        sequenceEndedAt: now,
        exitReason,
      },
    });

    return successResponse(
      {
        message: `Email ${email} traité (${event})`,
        reason,
        leadsClosed: result.count,
      },
      200,
    );
  } catch (err) {
    console.error("[WEBHOOK EMAIL] Erreur:", err);
    return errorResponse("Erreur interne", "INTERNAL_ERROR", undefined, 500);
  }
}
