// =============================================================================
// POST /api/domains/[id]/test — Teste un domaine (résolution DNS + SSL).
// =============================================================================
// Vérifie :
// 1. Résolution DNS (A / AAAA records)
// 2. Connexion HTTPS + validité du certificat SSL
// 3. Temps de réponse
// Retourne { dns: { resolved, ips, records }, ssl: { valid, issuer, daysLeft }, https: { reachable, statusCode, latencyMs } }
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { isValidId } from '@/app/api/_lib/id-validation';
import { requireAdmin } from '../../../_lib/auth-server';
import { assertPublicHostname } from '../../../_lib/ssrf-guard';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const domain = await prisma.domain.findUnique({ where: { id } });
    if (!domain) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const hostname = domain.domain;

    // SSRF guard : refuser les hostnames internes/privés avant tout fetch/tls.connect.
    const ssrf = await assertPublicHostname(hostname);
    if (!ssrf.ok) {
      return errorResponse(`Domaine bloqué (SSRF guard) : ${ssrf.reason}`, 'SSRF_BLOCKED', undefined, 400);
    }

    const results = {
      dns: { resolved: false, ips: [] as string[], error: null as string | null },
      ssl: { valid: false, issuer: null as string | null, daysLeft: null as number | null, error: null as string | null },
      https: { reachable: false, statusCode: null as number | null, latencyMs: null as number | null, error: null as string | null },
    };

    // 1. Test DNS — utilise dns.resolve4 / dns.resolve6 (Node.js nat)
    try {
      const dns = await import('node:dns/promises');
      const [ipv4, ipv6] = await Promise.allSettled([
        dns.resolve4(hostname),
        dns.resolve6(hostname),
      ]);
      const ips: string[] = [];
      if (ipv4.status === 'fulfilled') ips.push(...ipv4.value);
      if (ipv6.status === 'fulfilled') ips.push(...ipv6.value);

      if (ips.length > 0) {
        results.dns.resolved = true;
        results.dns.ips = ips;
      } else {
        results.dns.error = 'Aucun enregistrement A/AAAA trouvé';
      }
    } catch (e) {
      results.dns.error = e instanceof Error ? e.message : 'Échec résolution DNS';
    }

    // 2 + 3. Test HTTPS + SSL — fetch avec vérification du certificat
    if (results.dns.resolved) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(`https://${hostname}`, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'manual',
        });
        clearTimeout(timeout);

        results.https.reachable = true;
        results.https.statusCode = res.status;
        results.https.latencyMs = Date.now() - start;

        // Le certificat SSL est valide si le fetch HTTPS réussit (Node.js rejette
        // automatiquement les certificats invalides/expirés avant la résolution de la Promise).
        results.ssl.valid = true;

        // Tente de récupérer l'émetteur du certificat via tls
        try {
          const tls = await import('node:tls');
          const sock = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: true }, () => {
            const cert = sock.getPeerCertificate();
            if (cert && cert.issuer) {
              results.ssl.issuer = String(cert.issuer.O || cert.issuer.CN || '') || null;
            }
            if (cert && cert.valid_to) {
              const expiry = new Date(cert.valid_to);
              const msLeft = expiry.getTime() - Date.now();
              results.ssl.daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
            }
            sock.destroy();
          });
          await new Promise<void>((resolve) => {
            sock.on('close', () => resolve());
            sock.on('error', () => resolve());
            setTimeout(() => { sock.destroy(); resolve(); }, 5000);
          });
        } catch {
          // Non bloquant — le certificat est valide (le fetch HTTPS a réussi),
          // on n'a juste pas pu récupérer les détails.
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Échec connexion HTTPS';
        results.https.latencyMs = Date.now() - start;
        // Distinguer certificat SSL invalide vs serveur injoignable
        if (msg.includes('certificate') || msg.includes('CERT') || msg.includes('UNABLE_TO_VERIFY')) {
          results.ssl.error = msg;
        } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('abort')) {
          results.https.error = msg;
        } else {
          results.ssl.error = msg;
        }
      }
    }

    // Met à jour le sslStatus en DB selon les résultats
    let newSslStatus = domain.sslStatus;
    if (results.ssl.valid && results.https.reachable) {
      newSslStatus = 'active';
    } else if (results.dns.resolved && !results.ssl.valid) {
      newSslStatus = 'error';
    } else if (results.dns.resolved) {
      newSslStatus = 'pending';
    }
    if (newSslStatus !== domain.sslStatus) {
      await prisma.domain.update({
        where: { id },
        data: { sslStatus: newSslStatus },
      });
    }

    return successResponse({
      domain: hostname,
      ...results,
      sslStatus: newSslStatus,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return errorResponse(msg, ERR.INTERNAL.code, undefined, 500);
  }
}
