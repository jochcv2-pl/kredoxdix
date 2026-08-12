import { NextRequest } from "next/server";
import { prisma, createNotification, assignLeadToAdmin, generateLeadReference } from "@kredix/db";
import { createLeadSchema, errorResponse, successResponse } from "../validators";
import { computeSequenceInitDates } from "../_lib/email-ack";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

// =============================================================================
// POST /api/leads
// Création d'un lead (demande de crédit) depuis le formulaire public.
// Endpoint PUBLIC (pas d'auth) — rate limiting : 5 soumissions/min/IP.
//
// IMPORTANT : Le welcome email (reception_ack) n'est PAS envoyé ici.
// Il est programmé via nextRelanceAt = now + 5 min et envoyé par le cron
// relance. Le cron garantit l'ordre chronologique :
//   T+5min : welcome → J+3 : relance_1 → J+6 : relance_2 → J+9 : relance_3
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

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: parsed.data.phone,
          email: parsed.data.email || null,
          city: parsed.data.city,
          street: parsed.data.street || null,
          zipCode: parsed.data.zipCode || null,
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
      })
      // Génère la référence publique KREDIX-XXXXXXXX (s44 — page /suivi client).
      // Nécessite l'id Prisma, donc en 2 temps dans une transaction.
      return await tx.lead.update({
        where: { id: created.id },
        data: { reference: generateLeadReference(created.id) },
      })
    })

    // ----- Envoi accusé de réception (Agent Accueil) -----
    // DÉPLACÉ VERS LE CRON — le welcome email est envoyé 5 min après la création
    // par le cron relance (garantit l'ordre chronologique + délai humain).
    // nextRelanceAt = now + 5min a déjà été setté par computeSequenceInitDates().
    // Le cron détectera ackSentAt = null et enverra le reception_ack.

    // ----- Routing automatique (DEC-K5 multi-admin) -----
    // Assigne le lead au conseiller le moins chargé qui matche (loanType + pays).
    // Si aucun match → lead reste non assigné (notification warning super-admin).
    const routing = await assignLeadToAdmin(lead.id);

    // ----- Notification admin : nouveau prospect -----
    await createNotification({
      type: 'new_prospect',
      title: routing.assigned ? 'Nouveau prospect' : 'Prospect non assigné',
      message: routing.assigned
        ? `${lead.firstName} ${lead.lastName} a soumis une demande de ${lead.loanType} de ${lead.amount.toLocaleString('fr-FR')}€.`
        : `${lead.firstName} ${lead.lastName} (${lead.loanType}/${lead.country}) — aucun conseiller éligible. Assignez manuellement.`,
      icon: routing.assigned ? 'user-plus' : 'alert-triangle',
      severity: routing.assigned ? 'info' : 'warning',
      linkUrl: `/leads?id=${lead.id}`,
      relatedEntityId: lead.id,
      recipientId: routing.adminId,
    });

    return successResponse(
      {
        lead: {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          status: lead.status,
          createdAt: lead.createdAt,
        sequenceActive: lead.sequenceActive,
        ackSent: false, // Sera envoyé par le cron dans ~5 min
        ackScheduled: true,
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
