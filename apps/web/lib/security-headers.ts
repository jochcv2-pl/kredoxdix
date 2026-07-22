// =============================================================================
// security-headers.ts — Headers HTTP de sécurité appliqués aux 2 apps.
// =============================================================================
// Defense-in-depth : même si Caddy ajoute déjà certains headers en prod,
// les apps Next.js les appliquent directement. Couvre :
//   - Le dev local (pas de Caddy)
//   - Le cas où l'app est servie sans reverse proxy
//   - Le cas où Caddy est mal configuré
//
// CSP commence permissive (unsafe-inline nécessaire pour Next.js App Router
// en dev/SSR). On n'inclut PAS unsafe-eval (anti-XSS strict).
// Resserrer en prod avec nonce strict-dynamic quand Next.js le supportera nativement.

import type { NextConfig } from 'next'

// CSP :
//   - En dev : Next.js HMR a besoin de 'unsafe-eval' pour compiler les modules
//     à la volée. Sans ça, le JS client ne se charge pas (form de login cassé).
//   - En prod : CSP stricte sans 'unsafe-eval' (anti-XSS).
// 'unsafe-inline' reste nécessaire partout car Next.js App Router injecte du
// CSS/JS inline pour le bootstrap SSR. Resserrer avec nonce strict-dynamic
// quand Next.js le supportera nativement en prod.
const cspValue = process.env.NODE_ENV === 'production'
  ? [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
  : [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')

const SECURITY_HEADERS = [
  // Protection clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Empêcher le MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Réferrer limité à l'origine cross-origin
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // HSTS — 1 an, includeSubDomains, preload
  // Note : HSTS n'est respecté par le navigateur QUE sur HTTPS. En dev HTTP
  // localhost, le header est ignoré (pas d'effet négatif).
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  // Permissions Policy — bloque caméra, micro, géoloc, payment sans opt-in
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // CSP — voir cspValue ci-dessus
  { key: 'Content-Security-Policy', value: cspValue },
  // CORP — isole le contexte browsing
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
]

/**
 * Applique les headers de sécurité à un NextConfig.
 * Désactive aussi X-Powered-By.
 *
 * Usage :
 *   export default withSecurityHeaders({ reactStrictMode: true, ... })
 */
export function withSecurityHeaders<T extends NextConfig>(config: T): T {
  return {
    ...config,
    poweredByHeader: false, // Cache X-Powered-By: Next.js
    async headers() {
      const base = await config.headers?.()
      return [
        ...(base ?? []),
        {
          source: '/:path*',
          headers: SECURITY_HEADERS,
        },
      ]
    },
  }
}
