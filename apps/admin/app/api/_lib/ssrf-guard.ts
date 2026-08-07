// =============================================================================
// ssrf-guard.ts — Protection SSRF (Server-Side Request Forgery).
// =============================================================================
// Bloque les requêtes sortantes vers des hôtes internes / privés / link-local.
// À appeler AVANT tout fetch/tls.connect vers une URL ou hostname issu de l'input
// utilisateur ou de la base de données (qui peut elle-même avoir été polluée).
//
// Usage :
//   const check = await assertPublicUrl(siteUrl)
//   if (!check.ok) return errorResponse(check.reason, 'SSRF_BLOCKED', undefined, 400)
//
// Blocks :
//   - IPv4 loopback (127.0.0.0/8)
//   - IPv4 private (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
//   - IPv4 link-local (169.254.0.0/16) — inclut le metadata AWS/GCP/Azure (169.254.169.254)
//   - IPv6 loopback (::1)
//   - IPv6 link-local (fe80::/10)
//   - IPv6 unique-local (fc00::/7)
//   - 0.0.0.0, ::, metadata hostnames connus

import dns from 'node:dns/promises'
import net from 'node:net'

export type SsrfCheck =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Valide qu'une URL pointe vers un hôte public.
 * Résout le hostname et vérifie TOUTES les IPs retournées.
 */
export async function assertPublicUrl(rawUrl: string): Promise<SsrfCheck> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'URL invalide' }
  }

  const hostname = parsed.hostname
  if (!hostname) {
    return { ok: false, reason: 'Hostname manquant' }
  }

  // 1. Bloquer les hostnames connus problématiques (metadata cloud, localhost).
  const lowered = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(lowered) || lowered.endsWith('.internal') || lowered.endsWith('.local')) {
    return { ok: false, reason: `Hostname bloqué : ${hostname}` }
  }

  // 2. Si hostname est déjà une IP littérale, la valider directement.
  if (net.isIP(hostname)) {
    return isPublicIp(hostname)
      ? { ok: true }
      : { ok: false, reason: `IP non publique : ${hostname}` }
  }

  // 3. Sinon, résoudre le hostname et vérifier toutes les IPs résolues.
  try {
    const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)])
    const ips: string[] = []
    if (v4.status === 'fulfilled') ips.push(...v4.value)
    if (v6.status === 'fulfilled') ips.push(...v6.value)

    if (ips.length === 0) {
      return { ok: false, reason: `Aucune IP résolue pour ${hostname}` }
    }
    for (const ip of ips) {
      if (!isPublicIp(ip)) {
        return { ok: false, reason: `Hostname ${hostname} résout vers une IP non publique : ${ip}` }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: `Échec résolution DNS pour ${hostname}` }
  }
}

/**
 * Valide qu'un hostname (sans schéma) pointe vers un hôte public.
 * Variante pour les routes qui reçoivent un hostname brut (ex : domains test).
 */
export async function assertPublicHostname(hostname: string): Promise<SsrfCheck> {
  return assertPublicUrl(`https://${hostname}/`)
}

/**
 * Vérifie qu'une IP (v4 ou v6) est publique.
 * Returns true si l'IP peut être contactée sans risque SSRF.
 */
function isPublicIp(ip: string): boolean {
  const v4 = isPrivateV4(ip)
  if (v4 !== null) return !v4 // null = pas une IPv4, on continue
  // IPv6
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return false
    if (lower.startsWith('fe80:')) return false // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return false // unique-local fc00::/7
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 — extraire et revérifier
      const v4part = lower.slice('::ffff:'.length)
      if (net.isIPv4(v4part)) {
        const priv = isPrivateV4(v4part)
        return priv === null ? true : !priv
      }
    }
    return true
  }
  return false
}

/**
 * Retourne true si l'IPv4 est privée/loopback/link-local, false si publique,
 * null si ce n'est pas une IPv4.
 */
function isPrivateV4(ip: string): boolean | null {
  if (!net.isIPv4(ip)) return null
  const parts = ip.split('.').map(Number)
  const [a, b] = parts
  // 0.0.0.0/8
  if (a === 0) return true
  // 10.0.0.0/8
  if (a === 10) return true
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true
  // 169.254.0.0/16 (link-local, inclut 169.254.169.254 metadata cloud)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  // 100.64.0.0/10 (CGNAT) — bloquer aussi par sécurité
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  '169.254.169.254',
  'metadata.aws.internal',
])
