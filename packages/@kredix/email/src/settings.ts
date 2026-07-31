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
 *  Utilisé pour la rétro-compatibilité — préférez getPrimaryGateway(). */
export async function getActiveGateway() {
  return prisma.emailGateway.findFirst({ where: { isActive: true } });
}

/** Récupère le gateway PRIMAIRE (prospects, relances, parcours client).
 *  Si aucun n'est marqué isPrimary, fallback sur le premier actif. */
export async function getPrimaryGateway() {
  const primary = await prisma.emailGateway.findFirst({ where: { isPrimary: true } });
  if (primary) return primary;
  // Fallback rétro-compat : premier gateway actif.
  return prisma.emailGateway.findFirst({ where: { isActive: true } });
}

/** Récupère le gateway pour une campagne spécifique.
 *  Si la campagne a un gatewayId → utilise ce gateway.
 *  Sinon → fallback sur le gateway primaire. */
export async function getGatewayForCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gatewayId: true },
  });
  if (campaign?.gatewayId) {
    const gw = await prisma.emailGateway.findUnique({ where: { id: campaign.gatewayId } });
    if (gw?.isActive) return gw;
  }
  // Fallback : gateway primaire.
  return getPrimaryGateway();
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
