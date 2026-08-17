// =============================================================================
// clean-parasite-emails.ts
// =============================================================================
// Script de détection/nettoyage des emails parasites hérités du bug parse-text
// (corrigé session 45 — commit 66e3aa3).
//
// CONTEXTE : avant le fix, tout lead créé via "Coller une notification" héritait
// d'un email parasite (émetteur de la notification : wordpress@, noreply@,
// destinataire admin du site...). Ces emails morts déclenchaient la séquence
// de relance → envois qui bounce → délivrabilité SMTP dégradée.
//
// CRITÈRES de détection (alignés sur SYSTEM_EMAIL_RE de
// apps/admin/app/api/leads/parse-text/route.ts — garder les deux en sync) :
//   A (sûr)     : local-part système — noreply, no-reply, donotreply,
//                 do-not-reply, wordpress, postmaster, webmaster,
//                 mailer-daemon, auto-reply, notifications
//   B (moyen)   : domaine de l'email == domaine du site (setting `site_url`)
//                 → typiquement le destinataire admin de la notification
//                 (An: info@kredix.fr). Non inclus par défaut dans --apply.
//
// SÉCURITÉ :
//   - DRY-RUN par défaut : rapport seul, AUCUNE écriture en base.
//   - --apply requis pour écrire (email → null).
//   - --stop-sequences : désactive AUSSI la séquence de relance des leads
//     nettoyés encore actifs (exitReason=bounced + libération de la charge
//     conseiller, même pattern que le timeout du cron). Sans ce flag, les
//     leads sans email restent actifs et seront clôturés par le timeout.
//   - Le cron relance skippe les leads sans email (relance/route.ts,
//     garde `if (!lead.email)`) : nullifier l'email stoppe les envois
//     immédiatement.
//
// Usage LOCAL (machine dev avec Docker postgres sur 5432 — CWD = ce package
// où @prisma/client est une dépendance directe, comme prisma/seed.ts) :
//   pnpm --filter @kredix/db exec tsx scripts/clean-parasite-emails.ts
//   pnpm --filter @kredix/db exec tsx scripts/clean-parasite-emails.ts --apply
//   pnpm --filter @kredix/db exec tsx scripts/clean-parasite-emails.ts --apply --include-site-domain
//   pnpm --filter @kredix/db exec tsx scripts/clean-parasite-emails.ts --apply --stop-sequences
//
// Usage VPS PROD (service `tools` du compose — sur kredix-network, DATABASE_URL
// injectée ; postgres n'est PAS exposé sur le host) :
//   docker compose -f docker-compose.prod.yml run --rm tools \
//     pnpm --filter @kredix/db exec tsx scripts/clean-parasite-emails.ts
//   docker compose -f docker-compose.prod.yml run --rm tools \
//     pnpm --filter @kredix/db exec tsx scripts/clean-parasite-emails.ts --apply
//
// Pré-requis : DATABASE_URL défini (env, .env racine du repo ou .env du package).
// =============================================================================

import { PrismaClient, Prisma, SequenceExitReason } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const APPLY = process.argv.includes('--apply');
const INCLUDE_SITE_DOMAIN = process.argv.includes('--include-site-domain');
const STOP_SEQUENCES = process.argv.includes('--stop-sequences');

// ---------------------------------------------------------------------------
// Env — fallback .env explicite (le client Prisma classique charge .env, mais
// selon le CWD d'invocation il peut le manquer ; on couvre racine + package).
// ---------------------------------------------------------------------------

function loadEnvFallback(): void {
  if (process.env.DATABASE_URL) return;
  // __dirname = <repo>/packages/@kredix/db/scripts
  const candidates = [
    resolve(__dirname, '../../../.env'), // .env de la racine du repo (VPS)
    resolve(__dirname, '../../.env'),    // .env du package @kredix/db
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
    if (process.env.DATABASE_URL) return;
  }
}

// ---------------------------------------------------------------------------
// Détection — MIROIR de SYSTEM_EMAIL_RE (parse-text/route.ts). Toute modif
// doit être répliquée des deux côtés.
// ---------------------------------------------------------------------------

const SYSTEM_LOCAL_PART_RE = /^(noreply|no-?reply|donotreply|do-?not-?reply|wordpress|postmaster|webmaster|mailer-daemon|auto-?reply|notifications?)[@.\-]/i;

interface Flagged {
  id: string;
  reference: string | null;
  name: string;
  email: string;
  source: string;
  criterion: 'A (system)' | 'B (site domain)';
  sequenceActive: boolean;
  relanceCount: number;
  emailsSent: number;
  createdAt: Date;
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function main() {
  loadEnvFallback();

  if (!process.env.DATABASE_URL) {
    console.error('ERREUR : DATABASE_URL manquant (env ou .env à la racine du repo).');
    process.exit(1);
  }

  console.log('=== Nettoyage des emails parasites (bug parse-text pré-s45) ===');
  console.log(`Mode : ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN (rapport seul — par défaut)'}`);
  console.log(`Critère B (domaine du site) : ${INCLUDE_SITE_DOMAIN ? 'INCLUS' : 'exclu (rapport seul)'}`);
  console.log(`--stop-sequences : ${STOP_SEQUENCES ? 'OUI' : 'non'}\n`);

  // Domaine du site depuis les settings DB (pas d'arg manuel requis).
  const siteUrlSetting = await prisma.setting.findFirst({ where: { key: 'site_url' } });
  const siteDomain = siteUrlSetting?.value ? extractDomain(siteUrlSetting.value) : null;
  if (siteDomain) console.log(`Domaine du site (setting site_url) : ${siteDomain}`);
  else console.log('Setting site_url absent — critère B indisponible.');

  // -------------------------------------------------------------------------
  // 1. SCAN — tous les leads avec email
  // -------------------------------------------------------------------------
  const leads = await prisma.lead.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      reference: true,
      firstName: true,
      lastName: true,
      email: true,
      source: true,
      sequenceActive: true,
      relanceCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const flaggedA: Flagged[] = [];
  const flaggedB: Flagged[] = [];

  for (const lead of leads) {
    const email = (lead.email || '').trim().toLowerCase();
    if (!email) continue;
    const domain = email.split('@')[1] || '';

    const base = {
      id: lead.id,
      reference: lead.reference,
      name: `${lead.firstName} ${lead.lastName}`.trim(),
      email,
      source: lead.source,
      sequenceActive: lead.sequenceActive,
      relanceCount: lead.relanceCount,
      emailsSent: 0, // rempli ci-dessous
      createdAt: lead.createdAt,
    };

    // Test sur l'email COMPLET (comme parse-text) : le [@.\-] du pattern matche
    // le séparateur après le mot-clé. Ne pas tester le local-part seul.
    if (SYSTEM_LOCAL_PART_RE.test(email)) {
      flaggedA.push({ ...base, criterion: 'A (system)' });
    } else if (siteDomain && domain === siteDomain) {
      flaggedB.push({ ...base, criterion: 'B (site domain)' });
    }
  }

  // Compter les emails déjà envoyés (impact délivrabilité) — batch en une requête.
  const allFlagged = [...flaggedA, ...flaggedB];
  if (allFlagged.length > 0) {
    const sentCounts = await prisma.emailLog.groupBy({
      by: ['leadId'],
      where: { leadId: { in: allFlagged.map((l) => l.id) }, status: 'sent' },
      _count: { _all: true },
    });
    const countMap = new Map(sentCounts.map((c) => [c.leadId, c._count._all]));
    for (const f of allFlagged) f.emailsSent = countMap.get(f.id) ?? 0;
  }

  // -------------------------------------------------------------------------
  // 2. RAPPORT
  // -------------------------------------------------------------------------
  const printReport = (list: Flagged[], title: string) => {
    console.log(`\n--- ${title} : ${list.length} lead(s) ---`);
    for (const f of list) {
      const seq = f.sequenceActive ? `SÉQUENCE ACTIVE (${f.relanceCount}/3)` : 'séquence inactive';
      console.log(
        `  [${f.criterion}] ${f.name} — ${f.email} — source=${f.source} — ${seq} — ${f.emailsSent} email(s) envoyé(s) — créé le ${f.createdAt.toISOString().slice(0, 10)} — ${f.reference ?? `id=${f.id}`}`,
      );
    }
  };

  printReport(flaggedA, 'CRITÈRE A — adresses système (sûr)');
  printReport(flaggedB, `CRITÈRE B — domaine du site${siteDomain ? ` (${siteDomain})` : ''} (à vérifier manuellement)`);

  const total = allFlagged.length;
  const withActiveSeq = allFlagged.filter((f) => f.sequenceActive).length;
  const totalSent = allFlagged.reduce((sum, f) => sum + f.emailsSent, 0);

  console.log('\n=== Synthèse ===');
  console.log(`Leads avec email en base      : ${leads.length}`);
  console.log(`Critère A (système)           : ${flaggedA.length}`);
  console.log(`Critère B (domaine du site)   : ${flaggedB.length}`);
  console.log(`Séquences encore actives      : ${withActiveSeq}`);
  console.log(`Emails envoyés aux adresses mortes : ${totalSent}`);

  if (total === 0) {
    console.log('\n✓ Aucun email parasite détecté. Base propre.');
    return;
  }

  // -------------------------------------------------------------------------
  // 3. APPLY
  // -------------------------------------------------------------------------
  if (!APPLY) {
    console.log('\nDRY-RUN — aucune écriture. Relancez avec --apply pour nullifier les emails du critère A'
      + (INCLUDE_SITE_DOMAIN ? ' (+ B)' : '')
      + (INCLUDE_SITE_DOMAIN ? '' : ' (et --include-site-domain pour inclure le critère B)'));
    return;
  }

  const toClean = INCLUDE_SITE_DOMAIN ? allFlagged : flaggedA;
  if (toClean.length === 0) {
    console.log('\nRien à nettoyer avec ces critères.');
    return;
  }

  const now = new Date();
  let cleaned = 0;
  let sequencesStopped = 0;

  for (const f of toClean) {
    // Re-vérifier au moment de l'écriture (optimistic pattern — A-036) :
    // l'email peut avoir été corrigé manuellement entre-temps.
    const current = await prisma.lead.findUnique({
      where: { id: f.id },
      select: { email: true, sequenceActive: true, assignedToId: true },
    });
    if (!current?.email) {
      cleaned++; // déjà nettoyé — compté comme OK
      continue;
    }

    const data: Prisma.LeadUpdateInput = { email: null };

    if (STOP_SEQUENCES && current.sequenceActive) {
      // Même pattern que le timeout du cron : clôture + libération de charge.
      data.sequenceActive = false;
      data.sequenceEndedAt = now;
      data.exitReason = SequenceExitReason.bounced;
      sequencesStopped++;
      if (current.assignedToId) {
        await prisma.adminUser.update({
          where: { id: current.assignedToId },
          data: { currentActiveLeads: { decrement: 1 } },
        });
      }
    }

    await prisma.lead.update({ where: { id: f.id }, data });
    cleaned++;
    console.log(`  ✓ ${f.name} — email supprimé (${f.email})${STOP_SEQUENCES && current.sequenceActive ? ' + séquence stoppée' : ''}`);
  }

  console.log(`\n=== Rapport d'exécution ===`);
  console.log(`Emails nullifiés   : ${cleaned}/${toClean.length}`);
  console.log(`Séquences stoppées : ${sequencesStopped}`);
  console.log('\n✓ Nettoyage terminé.');
  if (!STOP_SEQUENCES && withActiveSeq > 0) {
    console.log(`\nNote : ${withActiveSeq} lead(s) nettoyé(s) ont une séquence encore active.`);
    console.log('Le cron les skippe (pas d\'email) et le timeout les clôturera (cadence_timeout_days).');
    console.log('Pour les clôturer immédiatement avec libération de charge : --stop-sequences.');
  }
}

main()
  .catch((err) => {
    console.error('Erreur fatale :', err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
