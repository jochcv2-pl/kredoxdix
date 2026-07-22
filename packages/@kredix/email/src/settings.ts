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

/** Récupère le gateway d'envoi actif (un seul). */
export async function getActiveGateway() {
  return prisma.emailGateway.findFirst({ where: { isActive: true } });
}

/** Récupère le template d'email actif pour un trigger donné. */
export async function getActiveTemplate(trigger: EmailTemplate['trigger']) {
  return prisma.emailTemplate.findFirst({
    where: { trigger, status: 'active' },
  });
}
