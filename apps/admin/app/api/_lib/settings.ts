import { prisma } from '@kredix/db';

// =============================================================================
// Lecture des paramètres cadence / configuration depuis la table Setting.
// Cache en mémoire simple pour la durée d'une requête (évite N requêtes).
// =============================================================================

const cache = new Map<string, { value: string; ts: number }>();
const TTL = 60_000; // 1 minute

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.value;

  const row = await prisma.setting.findUnique({ where: { key } });
  const value = row?.value ?? fallback;
  cache.set(key, { value, ts: Date.now() });
  return value;
}

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key, String(fallback));
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

/** Récupère le gateway d'envoi actif (rétro-compat — sans notion d'owner). */
export async function getActiveGateway() {
  return prisma.emailGateway.findFirst({ where: { isActive: true } });
}

/**
 * Récupère le gateway SMTP système (réservé aux leads non assignés — DEC-K5).
 * Un seul SMTP système actif à la fois (isSystem=true, isActive=true).
 */
export async function getSystemGateway() {
  return prisma.emailGateway.findFirst({
    where: { isSystem: true, isActive: true },
  });
}

/**
 * Récupère le gateway PRIMAIRE (prospects, relances, parcours client).
 *
 * DEC-K5 multi-admin :
 *   - Si ownerId fourni : SMTP primaire DE CET ADMIN (isPrimary + ownerId + isActive).
 *     Fallback : premier actif de cet admin, puis SMTP système.
 *   - Si ownerId absent : SMTP primaire global (ownerId IS NULL) — rétro-compat.
 *
 * @param ownerId ID de l'admin propriétaire (optionnel — absent = comportement legacy)
 */
export async function getPrimaryGateway(ownerId?: string) {
  if (ownerId) {
    const primary = await prisma.emailGateway.findFirst({
      where: { isPrimary: true, ownerId, isActive: true },
    });
    if (primary) return primary;
    const anyActive = await prisma.emailGateway.findFirst({
      where: { ownerId, isActive: true },
    });
    if (anyActive) return anyActive;
    return getSystemGateway();
  }
  const primary = await prisma.emailGateway.findFirst({
    where: { isPrimary: true, ownerId: null },
  });
  if (primary) return primary;
  return prisma.emailGateway.findFirst({ where: { isActive: true } });
}

/**
 * Récupère le gateway pour un lead donné (DEC-K5).
 * - Lead assigné → SMTP primaire de l'owner.
 * - Lead non assigné → SMTP système.
 */
export async function getGatewayForLead(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { assignedToId: true },
  });
  if (lead?.assignedToId) {
    return getPrimaryGateway(lead.assignedToId);
  }
  return getSystemGateway();
}

/**
 * Récupère le gateway pour une campagne (spécifique ou primaire de l'owner).
 * DEC-K5 : utilise campaign.ownerId pour trouver le bon SMTP.
 */
export async function getGatewayForCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gatewayId: true, ownerId: true },
  });
  if (campaign?.gatewayId) {
    const gw = await prisma.emailGateway.findUnique({ where: { id: campaign.gatewayId } });
    if (gw?.isActive) return gw;
  }
  if (campaign?.ownerId) {
    return getPrimaryGateway(campaign.ownerId);
  }
  return getPrimaryGateway();
}

/**
 * Récupère le contexte conseiller pour un lead (DEC-K5 multi-admin).
 * - Lead assigné → AdminUser (firstName, lastName, phone, email, displayName).
 * - Lead non assigné → null (le caller fait fallback sur settings CMS).
 */
export async function getConseillerContext(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      assignedTo: {
        select: { firstName: true, lastName: true, phone: true, email: true, displayName: true },
      },
    },
  });
  return lead?.assignedTo ?? null;
}
