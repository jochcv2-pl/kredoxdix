import { prisma, type EmailTemplate, type EmailGateway } from '@kredix/db';

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
 * VERSION BATCH de getGatewayForLead() — DEC-K5 multi-admin.
 *
 * Précharge en UNE seule requête tous les gateways actifs, puis retourne une
 * closure qui applique la même hiérarchie que getGatewayForLead :
 *   - Lead assigné → SMTP primaire du conseiller → 1er SMTP actif du conseiller → SMTP système
 *   - Lead non assigné → SMTP système
 *
 * Usage : cron relance, traitements par lots (évite le N+1 : 1 requête quel que
 *         soit le nombre de leads). Pour un seul lead, préférez getGatewayForLead().
 *
 * @param assignedToIds Liste des assignedToId des leads à traiter (nulls + doublons OK).
 * @returns Fonction (assignedToId) => EmailGateway | null prête à appeler par lead.
 */
export async function resolveGatewaysForLeadsBatch(
  _assignedToIds: ReadonlyArray<string | null>,
): Promise<(assignedToId: string | null) => EmailGateway | null> {
  // 1 requête unique : tous les gateways actifs.
  // isPrimary/isSystem d'abord → pour chaque owner, le primaire est rencontré en 1er.
  const gateways = await prisma.emailGateway.findMany({
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { isSystem: 'desc' }, { createdAt: 'asc' }],
  });

  const primaryByOwner = new Map<string, EmailGateway>();
  const firstActiveByOwner = new Map<string, EmailGateway>();
  let systemGateway: EmailGateway | null = null;

  for (const gw of gateways) {
    // SMTP système (isSystem=true, ownerId=null) — fallback unassigned.
    if (gw.isSystem) {
      if (!systemGateway) systemGateway = gw;
      continue;
    }
    if (!gw.ownerId) continue; // ownerId null hors système = legacy, ignoré

    if (gw.isPrimary && !primaryByOwner.has(gw.ownerId)) {
      primaryByOwner.set(gw.ownerId, gw);
    }
    // 1er actif pour cet owner = primaire (grâce à orderBy) sinon autre actif.
    if (!firstActiveByOwner.has(gw.ownerId)) {
      firstActiveByOwner.set(gw.ownerId, gw);
    }
  }

  return (assignedToId: string | null): EmailGateway | null => {
    if (assignedToId) {
      return (
        primaryByOwner.get(assignedToId) ??
        firstActiveByOwner.get(assignedToId) ??
        systemGateway
      );
    }
    return systemGateway;
  };
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
