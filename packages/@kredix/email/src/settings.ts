import { prisma, type EmailTemplate } from '@kredix/db';

// =============================================================================
// @kredix/email/settings — Lecture des paramètres email depuis la DB.
// =============================================================================
// Extrait depuis apps/admin/app/api/_lib/settings.ts.
// Ajout de getActiveTemplate (présent côté web, absent côté admin).

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

/** Récupère le gateway d'envoi actif (le premier trouvé).
 *  Utilisé pour la rétro-compatibilité — préférez getPrimaryGateway() ou getGatewayForLead(). */
export async function getActiveGateway() {
  return prisma.emailGateway.findFirst({ where: { isActive: true } });
}

/**
 * Récupère le gateway SMTP système (réservé aux leads non assignés — DEC-K5).
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
 *   - Si ownerId fourni : SMTP primaire DE CET ADMIN.
 *     Fallback : premier actif de cet admin, puis SMTP système.
 *   - Si ownerId absent : SMTP primaire global (ownerId IS NULL) — rétro-compat.
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
 * Récupère le gateway pour une campagne spécifique (DEC-K5).
 * Utilise campaign.ownerId pour trouver le SMTP de l'owner.
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

/** Récupère le template d'email actif pour un trigger + langue donnés.
 *  Fallback sur "fr" si la langue demandée n'a pas de template actif. */
export async function getActiveTemplate(
  trigger: EmailTemplate['trigger'],
  language = 'fr',
) {
  // 1. Cherche le template actif pour la langue demandée.
  const template = await prisma.emailTemplate.findFirst({
    where: { trigger, status: 'active', language },
  });
  if (template) return template;

  // 2. Fallback sur le français (langue par défaut).
  if (language !== 'fr') {
    return prisma.emailTemplate.findFirst({
      where: { trigger, status: 'active', language: 'fr' },
    });
  }
  return null;
}
