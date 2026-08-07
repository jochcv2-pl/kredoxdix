// =============================================================================
// @kredix/db/routing — Routing automatique des leads vers les conseillers.
// =============================================================================
// DEC-K5 multi-admin : quand un lead arrive depuis le site public, il est
// automatiquement assigné au conseiller le moins chargé qui matche les
// critères (loanType + pays).
//
// Algorithme :
//   1. Filtrer les admins actifs qui matchent (loanType + country + non saturés)
//   2. Trier par charge relative (currentActiveLeads / maxActiveLeads) ASC
//   3. Tie-break : lastAssignedAt ASC (le moins récemment assigné gagne)
//   4. Claim atomique anti race condition (updateMany WHERE assignedToId IS NULL)
//   5. Incrémenter le compteur de charge + lastAssignedAt
//
// Si 0 admin matche → lead reste non assigné (file d'attente super-admin).
// =============================================================================

import { prisma } from '../prisma/client';

export interface RoutingResult {
  /** true si le lead a été assigné avec succès. */
  assigned: boolean;
  /** ID de l'admin assigné (null si non assigné). */
  adminId: string | null;
  /** Explication lisible du résultat. */
  reason: string;
}

/**
 * Assigne automatiquement un lead au conseiller le moins chargé qui matche.
 *
 * @param leadId ID du lead à assigner.
 * @returns RoutingResult avec le statut d'assignation.
 *
 * @example
 * const result = await assignLeadToAdmin(lead.id);
 * if (!result.assigned) {
 *   // Notifier le super-admin (lead en file d'attente)
 *   await createNotification({ ... });
 * }
 */
export async function assignLeadToAdmin(leadId: string): Promise<RoutingResult> {
  // 1. Charger le lead (loanType + country + assignedToId pour éviter re-routing).
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, loanType: true, country: true, assignedToId: true },
  });

  if (!lead) {
    return { assigned: false, adminId: null, reason: 'Lead introuvable' };
  }

  // Si déjà assigné, ne pas re-router.
  if (lead.assignedToId) {
    return { assigned: true, adminId: lead.assignedToId, reason: 'Déjà assigné' };
  }

  // 2. Trouver les admins éligibles (loanType + country match).
  // Option C hybride : les conseillers sont prioritaires. Le super-admin
  // n'est sollicité que si AUCUN conseiller n'est éligible (filet de sécurité).
  const eligibilityFilter = {
    isActive: true,
    AND: [
      {
        OR: [
          { loanTypes: { isEmpty: true } },
          { loanTypes: { has: lead.loanType } },
        ],
      },
      {
        OR: [
          { countries: { isEmpty: true } },
          { countries: { has: lead.country } },
        ],
      },
    ],
  };

  // Passe 1 : conseillers uniquement (priorité).
  let candidates = await prisma.adminUser.findMany({
    where: { ...eligibilityFilter, role: 'advisor' },
    select: { id: true, maxActiveLeads: true, currentActiveLeads: true, lastAssignedAt: true },
  });

  // Passe 2 : si aucun conseiller éligible, élargir au super-admin (fallback).
  if (candidates.length === 0) {
    candidates = await prisma.adminUser.findMany({
      where: { ...eligibilityFilter, role: { in: ['admin', 'advisor'] } },
      select: { id: true, maxActiveLeads: true, currentActiveLeads: true, lastAssignedAt: true },
    });
  }

  // 3. Filtrer la saturation en JS (Prisma ne compare pas 2 champs entre eux).
  const available = candidates.filter(
    (a) => a.currentActiveLeads < a.maxActiveLeads,
  );

  if (available.length === 0) {
    return {
      assigned: false,
      adminId: null,
      reason: `Aucun admin éligible pour loanType="${lead.loanType}" country="${lead.country}"`,
    };
  }

  // 4. Trier par charge relative ASC, puis lastAssignedAt ASC (tie-break).
  available.sort((a, b) => {
    const loadA = a.currentActiveLeads / a.maxActiveLeads;
    const loadB = b.currentActiveLeads / b.maxActiveLeads;
    if (loadA !== loadB) return loadA - loadB; // least-loaded d'abord
    const timeA = a.lastAssignedAt?.getTime() ?? 0;
    const timeB = b.lastAssignedAt?.getTime() ?? 0;
    return timeA - timeB; // le moins récent gagne
  });

  const chosen = available[0];

  // 5. Claim atomique : updateMany ne réussit que si assignedToId est toujours null.
  // Protège contre la race condition (2 leads simultanés vers le même admin).
  const claimed = await prisma.lead.updateMany({
    where: { id: leadId, assignedToId: null },
    data: {
      assignedToId: chosen.id,
      assignedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    // Un autre processus a assigné ce lead entre-temps.
    return { assigned: true, adminId: null, reason: 'Assigné par un autre processus' };
  }

  // 6. Incrémenter le compteur de charge + mettre à jour lastAssignedAt.
  await prisma.adminUser.update({
    where: { id: chosen.id },
    data: {
      currentActiveLeads: { increment: 1 },
      lastAssignedAt: new Date(),
    },
  });

  return {
    assigned: true,
    adminId: chosen.id,
    reason: `Assigné par routing (charge: ${chosen.currentActiveLeads}/${chosen.maxActiveLeads})`,
  };
}

/**
 * Recalcule currentActiveLeads pour un admin donné (maintenance).
 * À appeler périodiquement (cron nocturne) pour corriger les dérives du compteur.
 *
 * "Lead actif" = lead assigné à cet admin avec sequenceActive = true.
 */
export async function recalcAdminLoad(adminId: string): Promise<number> {
  const activeCount = await prisma.lead.count({
    where: {
      assignedToId: adminId,
      sequenceActive: true,
    },
  });

  await prisma.adminUser.update({
    where: { id: adminId },
    data: { currentActiveLeads: activeCount },
  });

  return activeCount;
}

/**
 * Recalcule currentActiveLeads pour TOUS les admins (cron nocturne).
 */
export async function recalcAllAdminLoads(): Promise<void> {
  const admins = await prisma.adminUser.findMany({
    where: { isActive: true, role: { in: ['admin', 'advisor'] } },
    select: { id: true },
  });

  await Promise.all(admins.map((a) => recalcAdminLoad(a.id)));
}
