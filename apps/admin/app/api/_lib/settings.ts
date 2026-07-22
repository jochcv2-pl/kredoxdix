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

/** Récupère le gateway d'envoi actif (un seul). */
export async function getActiveGateway() {
  return prisma.emailGateway.findFirst({ where: { isActive: true } });
}
