// =============================================================================
// middleware.ts — Rate limiting + Protection des routes admin (Edge-safe)
// =============================================================================
// Ce middleware fait DEUX choses :
//   1. Rate limiting sur /api/auth/callback/credentials et /api/auth/check-2fa
//   2. Protection NextAuth sur toutes les routes non-publiques
//
// IMPORTANT : le middleware NextAuth (`auth()`) NE DOIT PAS traiter les routes
// /api/auth/* — il interfère avec le CSRF flow de NextAuth v5. Les routes
// /api/auth/* reçoivent donc un NextResponse.next() simple après rate limiting.
//
// Routes publiques (pas de protection NextAuth) :
//   - /api/auth/*   → NextAuth handlers (rate limités sur login/check-2fa)
//   - /api/cron/*   → protégés par CRON_SECRET
//   - /login        → page de connexion
//   - /             → page admin (gère son propre state)
//   - /_next/*      → assets
//   - /favicon*     → favicon

import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from './auth.config'
import { checkRateLimit, getClientIp } from './lib/rate-limiter'

const { auth } = NextAuth(authConfig)

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method

  // --- Rate limiting sur les endpoints d'authentification sensibles ---
  // En dev : limites assouplies (x10) pour permettre les tests E2E
  // (51 tests qui font chacun plusieurs apiLogin — sinon le 10e login est bloqué).
  // En prod : limites strictes (brute force protection).
  const rlMultiplier = process.env.NODE_ENV === 'production' ? 1 : 10
  if (method === 'POST') {
    const ip = getClientIp(req.headers)

    if (pathname === '/api/auth/callback/credentials') {
      // Login : 10/min/IP en prod (100/min en dev pour tests E2E).
      const rl = checkRateLimit(`login:${ip}`, 10 * rlMultiplier, 60_000)
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Trop de tentatives. Réessayez dans 1 minute.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            },
          },
        )
      }
    }

    if (pathname === '/api/auth/check-2fa') {
      // Check-2fa : 20/min/IP en prod (200/min en dev pour tests E2E).
      const rl = checkRateLimit(`check2fa:${ip}`, 20 * rlMultiplier, 60_000)
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Trop de requêtes. Réessayez dans 1 minute.' },
          { status: 429 },
        )
      }
    }
  }

  // --- Routes /api/auth/* : pas de traitement NextAuth (interfère avec CSRF) ---
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // --- Routes /api/cron/* : protégées par CRON_SECRET (header Bearer), pas NextAuth ---
  if (pathname.startsWith('/api/cron')) {
    return NextResponse.next()
  }

  // --- Toutes les autres routes : protection NextAuth ---
  // auth() est le middleware NextAuth qui attend un NextAuthRequest (= NextRequest
  // augmenté avec .auth). Le cast via unknown est nécessaire car NextAuth v5
  // n'exporte pas le type NextAuthRequest publiquement.
  return auth(req as unknown as Parameters<typeof auth>[0])
}

export const config = {
  matcher: [
    // Intercepte TOUT sauf les assets statiques, les uploads publics et les routes cron.
    '/((?!_next/static|_next/image|favicon.ico|uploads|api/cron).*)',
  ],
}
