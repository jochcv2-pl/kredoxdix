import { NextRequest } from "next/server";
import { prisma } from "@kredix/db";
import { createLeadSchema, errorResponse, successResponse } from "../validators";
import { sendReceptionAck, computeSequenceInitDates } from "../_lib/email-ack";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

// =============================================================================
// POST /api/leads
// Création d'un lead (demande de crédit) depuis le formulaire public.
// Endpoint PUBLIC (pas d'auth) — rate limiting : 5 soumissions/min/IP.
// =============================================================================

export async function POST(request: NextRequest) {
  // ----- Rate limiting (anti-spam) -----
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit(`leads:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return errorResponse(
      "Trop de demandes. Veuillez patienter une minute avant de réessayer.",
      "RATE_LIMITED",
      undefined,
      429,
    );
  }

  let body: unknown;

  // ----- Parse JSON -----
  try {
    body = await request.json();
  } catch {
    return errorResponse("Corps de requête JSON invalide", "INVALID_JSON", 400);
  }

  // ----- Validation Zod -----
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "Données d'entrée invalides",
      "VALIDATION_ERROR",
      parsed.error.flatten().fieldErrors,
      422
    );
  }

  // ----- Persistence + init séquence de relance -----
  try {
    // Init des dates séquence (J+3 prochaine relance, 48h rappel humain, etc.).
    // La séquence n'est activée QUE si on a un email (sinon pas de relance possible).
    const hasEmail = !!parsed.data.email;
    const seqDates = hasEmail ? computeSequenceInitDates() : {};

    const lead = await prisma.lead.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        city: parsed.data.city,
        country: parsed.data.country,
        loanType: parsed.data.loanType,
        amount: parsed.data.amount,
        durationYears: parsed.data.durationYears,
        monthlyPayment: parsed.data.monthlyPayment ?? null,
        annualRate: parsed.data.annualRate ?? null,
        totalCost: parsed.data.totalCost ?? null,
        employmentStatus: parsed.data.employmentStatus,
        preferredLanguage: parsed.data.preferredLanguage,
        whatsappConsent: parsed.data.whatsappConsent,
        ...seqDates,
      },
    });

    // ----- Envoi accusé de réception (Agent Accueil) -----
    // Défensif : un échec d'email ne doit JAMAIS casser la création du lead.
    // On loggue juste le résultat dans la réponse (pour debug côté admin).
    let ack: { sent: boolean; error?: string } | null = null;
    try {
      ack = await sendReceptionAck(lead);
    } catch (err) {
      // Backup : si sendReceptionAck lève (ne devrait pas), on capture.
      console.error("[API /leads POST] sendReceptionAck threw:", err);
      ack = { sent: false, error: (err as Error).message };
    }

    return successResponse(
      {
        lead: {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          status: lead.status,
          createdAt: lead.createdAt,
          sequenceActive: lead.sequenceActive,
          ackSent: ack?.sent ?? false,
        },
      },
      201,
    );
  } catch (err) {
    console.error("[API /leads POST] Erreur DB:", err);
    return errorResponse(
      "Erreur lors de l'enregistrement de la demande",
      "DB_ERROR",
      undefined,
      500
    );
  }
}
