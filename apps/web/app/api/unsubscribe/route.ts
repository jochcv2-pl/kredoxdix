import { NextRequest } from "next/server";
import { prisma, SequenceExitReason, SuppressionReason } from "@kredix/db";
import { successResponse, errorResponse } from "../validators";

// =============================================================================
// GET /api/unsubscribe?t=<token>
// =============================================================================
// Route PUBLIQUE (sans authentification) — déclenchée par le clic du prospect
// sur le lien de désinscription en pied d'email.
//
// Le token est unique par lead (Lead.unsubscribeToken, généré à la création).
// Le lien est de la forme : https://kredix.fr/api/unsubscribe?t=abc123...
//
// Actions :
//   1. Valide le token → retrouve le lead.
//   2. Ajoute l'email à SuppressionList (reason: unsubscribe).
//   3. Ferme la séquence (sequenceActive=false, exitReason=unsubscribe).
//   4. Marque unsubscribedAt.
//
// L'IA ne lit jamais rien — c'est le prospect lui-même qui agit via ce lien.
// =============================================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("t");

  if (!token) {
    return errorResponse("Token manquant", "MISSING_TOKEN", undefined, 400);
  }

  try {
    const lead = await prisma.lead.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, email: true, sequenceActive: true },
    });

    if (!lead) {
      return errorResponse("Token invalide ou expiré", "INVALID_TOKEN", undefined, 404);
    }

    // Si pas d'email sur ce lead, on ne peut pas l'ajouter à la SuppressionList
    // (la liste est indexée par email). On ferme quand même la séquence.
    const now = new Date();

    // Ajoute à la SuppressionList (upsert — un email = une entrée)
    if (lead.email) {
      await prisma.suppressionList.upsert({
        where: { email: lead.email },
        update: {
          reason: SuppressionReason.unsubscribe,
          leadId: lead.id,
          createdAt: now,
        },
        create: {
          email: lead.email,
          reason: SuppressionReason.unsubscribe,
          leadId: lead.id,
        },
      });
    }

    // Ferme la séquence de prospection
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        sequenceActive: false,
        sequenceEndedAt: now,
        exitReason: SequenceExitReason.unsubscribe,
        unsubscribedAt: now,
      },
    });

    return successResponse(
      {
        message: "Vous avez été désinscrit avec succès. Vous ne recevrez plus d'emails de Kredix.",
      },
      200,
    );
  } catch (err) {
    console.error("[UNSUBSCRIBE] Erreur:", err);
    return errorResponse(
      "Erreur lors de la désinscription",
      "INTERNAL_ERROR",
      undefined,
      500,
    );
  }
}
