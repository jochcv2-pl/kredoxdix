import { z } from "zod";

// =============================================================================
// VALIDATORS ZOD — API Kredix
// SKILLS_CORE.md : validation Zod sur tous les endpoints sans exception.
// =============================================================================

// ----- Schéma de validation du simulateur (POST /api/simulate) -----
export const simulateSchema = z.object({
  loanType: z.enum(["immo", "conso", "rachat", "pro"]),
  amount: z
    .number()
    .int("Le montant doit être un entier")
    .min(5000, "Le montant minimum est de 5 000 €")
    .max(500000, "Le montant maximum est de 500 000 €"),
  durationYears: z
    .number()
    .int("La durée doit être un nombre entier d'années")
    .min(1, "La durée minimum est de 1 an")
    .max(30, "La durée maximum est de 30 ans"),
});

export type SimulateInput = z.infer<typeof simulateSchema>;

// ----- Schéma de validation d'un lead (POST /api/leads) -----
export const createLeadSchema = z.object({
  firstName: z
    .string()
    .min(1, "Le prénom est requis")
    .max(100, "Le prénom est trop long"),
  lastName: z
    .string()
    .min(1, "Le nom est requis")
    .max(100, "Le nom est trop long"),
  phone: z
    .string()
    .min(1, "Le téléphone est requis")
    .regex(/^[+0-9\s().-]{6,20}$/, "Format de téléphone invalide"),
  email: z
    .string()
    .email("Format d'email invalide")
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .min(1, "La ville est requise")
    .max(100),
  street: z
    .string()
    .max(200)
    .optional()
    .or(z.literal("")),
  zipCode: z
    .string()
    .max(20)
    .optional()
    .or(z.literal("")),
  country: z
    .string()
    .min(2, "Le pays est requis")
    .max(10)
    .default("FR"),
  loanType: z.enum(["immo", "conso", "rachat", "pro", "autre"]),
  amount: z
    .number()
    .int()
    .min(5000, "Le montant minimum est de 5 000 €")
    .max(500000, "Le montant maximum est de 500 000 €"),
  durationYears: z
    .number()
    .int()
    .min(1)
    .max(30),
  monthlyPayment: z.number().int().positive().optional(),
  annualRate: z.number().min(0).max(20).optional(),
  totalCost: z.number().int().positive().optional(),
  employmentStatus: z.enum([
    "cdi",
    "cdd",
    "independent",
    "civil-servant",
    "retired",
    "unemployed",
  ]),
  preferredLanguage: z
    .enum(["fr", "en", "de", "es", "pt", "it"])
    .default("fr"),
  whatsappConsent: z.boolean().default(false),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// ----- Helpers de réponse -----
export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Formate une réponse d'erreur API standardisée.
 */
export function errorResponse(
  error: string,
  code: string,
  details?: unknown,
  status = 400
): Response {
  const body: ApiErrorResponse = { error, code };
  if (details !== undefined) body.details = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Formate une réponse de succès API.
 */
export function successResponse<T>(data: T, status = 200): Response {
  const body: ApiSuccess<T> = { data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
