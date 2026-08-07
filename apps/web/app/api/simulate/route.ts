import { NextRequest } from "next/server";
import { calculateLoan } from "@kredix/simulator";
import { getActiveRates } from "@kredix/db";
import { simulateSchema, errorResponse, successResponse } from "../validators";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";

// =============================================================================
// POST /api/simulate — API PUBLIQUE de simulation de crédit.
// =============================================================================
// DEC-K2 : simulateur double (client JS pour UX instantanée + backend API pour
// calculs avancés / intégrations externes / tests e2e).
//
// L'UI web (apps/web/components/simulator.tsx) calcule CÔTÉ CLIENT via
// @kredix/simulator (sans appeler cette route). Cette route backend sert à :
//   1. Les tests e2e (tests/e2e/leads.spec.ts) qui valident le contrat d'API.
//   2. Les intégrations externes éventuelles (partenaires, calculatrices tierces).
//   3. Les calculs serveur nécessitant les taux RÉELS des banques partenaires
//      (table Rate) — utile quand le client n'a pas accès à la DB.
//
// Utilise les taux RÉELS des banques partenaires (table Rate) si disponibles,
// avec fallback sur les taux indicatifs hardcoded sinon.
// Rate limiting : 30 simulations/min/IP (anti-abus calcul intensif).
//
// KRX-simulate (audit s43) : décider de garder (API publique documentée) plutôt
// que supprimer — la double logique de calcul est intentionnelle (DEC-K2) et
// le risque de divergence est maîtrisé par le package partagé @kredix/simulator
// qui contient la logique unique (calculateLoan) consommée par les deux côtés.
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
