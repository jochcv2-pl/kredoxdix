import { NextRequest } from "next/server";
import { calculateLoan } from "@kredix/simulator";
import { getActiveRates } from "@kredix/db";
import { simulateSchema, errorResponse, successResponse } from "../validators";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

// =============================================================================
// POST /api/simulate
// Calcul backend de la mensualité, taux et coût total.
// DEC-K2 : simulateur double (client JS + backend API).
// Utilise les taux RÉELS des banques partenaires (table Rate) si disponibles,
// avec fallback sur les taux indicatifs hardcoded sinon.
// Rate limiting : 30 simulations/min/IP (anti-abus calcul intensif).
// =============================================================================

export async function POST(request: NextRequest) {
  // ----- Rate limiting (anti-abus) -----
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit(`simulate:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return errorResponse(
      "Trop de simulations. Veuillez patienter une minute avant de réessayer.",
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
  const parsed = simulateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "Données d'entrée invalides",
      "VALIDATION_ERROR",
      parsed.error.flatten().fieldErrors,
      422
    );
  }

  // ----- Calcul -----
  try {
    // Récupère les taux actifs DB (tous types confondus — findBestRate filtrera).
    const rates = await getActiveRates();
    const result = calculateLoan(parsed.data, rates);
    return successResponse({ result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur de calcul inconnue";
    return errorResponse(message, "SIMULATION_ERROR", undefined, 500);
  }
}
