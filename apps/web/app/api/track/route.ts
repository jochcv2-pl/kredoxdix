// =============================================================================
// GET /api/track — Endpoint PUBLIC de suivi de dossier (s44)
// =============================================================================
// Permet au client de suivre l'avancement de son dossier sans login.
// Accessible depuis :
//   - La page /suivi (formulaire de saisie du code KREDIX-XXXXXXXX)
//   - Les emails (lien magique {{lien_suivi}} avec token anti-énumération)
//
// Query params :
//   - ref (obligatoire)    : KREDIX-XXXXXXXX (8 derniers chars du id lead)
//   - token (optionnel)    : token magique stateless sha256(lead.id + SECRET)
//                            Si fourni et valide → PAS de rate limit renforcé.
//                            Si absent → rate limit strict (5 req/min/IP).
//
// Sécurité :
//   - Rate limiting (5/min/IP sans token, illimité avec token valide)
//   - Zod validation du format ref (KREDIX- + 8 alphanumériques)
//   - AUCUNE PII sensible (pas d'email, pas de téléphone, pas de montant exact)
//     Réponse limitée à : reference, statut global, étapes tracking, prénom conseiller
//
// Public : pas d'auth requise. Ne retourne JAMAIS d'information permettant de
// contacter le client directement (anti-phishing).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, isValidTrackingToken } from '@kredix/db';
import { successResponse, errorResponse } from '../validators';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

// Schéma Zod pour la référence : KREDIX- + exactement 8 alphanumériques majuscules.
const refSchema = z.string().regex(/^KREDIX-[A-Z0-9]{8}$/, 'Format invalide');
const tokenSchema = z.string().min(16).max(64).optional();

// GET /api/track?ref=KREDIX-XXXXXXXX[&token=YYYY]
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ref = searchParams.get('ref') ?? '';
  const token = searchParams.get('token') ?? undefined;

  // ----- Validation Zod stricte -----
  const refParsed = refSchema.safeParse(ref);
  if (!refParsed.success) {
    return errorResponse('Référence invalide', 'INVALID_REF', undefined, 400);
  }
  const tokenParsed = tokenSchema.safeParse(token);
  if (token !== undefined && !tokenParsed.success) {
    return errorResponse('Token invalide', 'INVALID_TOKEN', undefined, 400);
  }

  // ----- Rate limiting (renforcé si pas de token valide) -----
  // Le rate limiting définitif se fera après avoir identifié si le token est valide.
  // Première étape : charger le lead pour vérifier le token.
  const lead = await prisma.lead.findUnique({
    where: { reference: refParsed.data },
    select: {
      id: true,
      reference: true,
      status: true,
      preferredLanguage: true,
      assignedTo: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!lead) {
    // Sécurité : ne pas révéler si la référence existe ou non.
    // Retour 404 générique + rate limit strict (anti-énumération).
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(`track:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return errorResponse('Trop de tentatives. Réessayez dans une minute.', 'RATE_LIMITED', undefined, 429);
    }
    return errorResponse('Référence introuvable', 'NOT_FOUND', undefined, 404);
  }

  // ----- Validation token (si fourni) -----
  const hasValidToken = tokenParsed.success && token !== undefined && isValidTrackingToken(lead.id, token);

  // Rate limit : 20/min/IP si token valide, 5/min/IP sinon.
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit(`track:${ip}`, hasValidToken ? 20 : 5, 60_000);
  if (!rl.allowed) {
    return errorResponse('Trop de tentatives. Réessayez dans une minute.', 'RATE_LIMITED', undefined, 429);
  }

  // ----- Chargement des étapes tracking -----
  const [steps, trackings] = await Promise.all([
    prisma.trackingStep.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, name: true, description: true, icon: true },
    }),
    prisma.leadTracking.findMany({
      where: { leadId: lead.id },
      select: {
        trackingStepId: true,
        validatedAt: true,
        validatedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  // ----- Construction de la réponse (PAS de PII sensible) -----
  // Status traduits pour le client (FR par défaut, sinon langue préférée du lead).
  const STATUS_LABELS: Record<string, string> = {
    new: 'Demande reçue',
    contacted: 'En cours d\'analyse',
    progress: 'En cours d\'analyse',
    offer: 'Offre reçue',
    waiting: 'En attente de votre retour',
    client: 'Dossier finalisé',
    lost: 'Dossier clôturé',
  };

  const advisorName = lead.assignedTo?.firstName
    ? `${lead.assignedTo.firstName}${lead.assignedTo.lastName ? ` ${lead.assignedTo.lastName.charAt(0)}.` : ''}`
    : null;

  return successResponse({
    reference: lead.reference,
    status: lead.status,
    statusLabel: STATUS_LABELS[lead.status] ?? lead.status,
    advisor: advisorName ? { firstName: lead.assignedTo!.firstName } : null,
    steps: steps.map((s) => {
      const t = trackings.find((tt) => tt.trackingStepId === s.id);
      return {
        id: s.id,
        order: s.order,
        name: s.name,
        description: s.description,
        icon: s.icon,
        done: !!t,
        validatedAt: t?.validatedAt.toISOString() ?? null,
        validatedByFirstName: t?.validatedBy?.firstName ?? null,
      };
    }),
    // Date estimée de prochaine action : pas encore implémenté (placeholder pour Q8-C).
    // Pourrait être calculée en fonction de l'étape en cours et du délai configuré.
    nextActionEstimate: null,
  });
}
