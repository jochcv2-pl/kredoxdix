// =============================================================================
// middleware.ts — Rate limiting uniquement (Edge-safe)
// =============================================================================
// Ce middleware fait UNE SEULE chose :
//   - Rate limiting sur /api/auth/callback/credentials et /api/auth/check-2fa
//
// La protection des routes admin est gérée par chaque route individuellement
// via requireAuth() / requireAdmin() (cf. app/api/_lib/auth-server.ts).
//
// Les routes /api/cron/* sont protégées par CRON_SECRET (Bearer token).
//
// Ce middleware n'appelle JAMAIS auth() — il est Edge-safe et n'importe pas
// Prisma ni auth.ts. L'auth NextAuth est vérifiée au niveau route handler.

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from './lib/rate-limiter'

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method

  // --- Rate limiting sur les endpoints d'authentification sensibles ---
  // En dev : limites assouplies (x10) pour permettre les tests E2E.
  // En prod : limites strictes (brute force protection).
  const rlMultiplier = process.env.NODE_ENV === 'production' ? 1 : 10
  if (method === 'POST') {
    const ip = getClientIp(req.headers)

    if (pathname === '/api/auth/callback/credentials') {
      // Login : 10/min/IP en prod (100/min en dev).
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
      // Check-2fa : 20/min/IP en prod (200/min en dev).
      const rl = checkRateLimit(`check2fa:${ip}`, 20 * rlMultiplier, 60_000)
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Trop de requêtes. Réessayez dans 1 minute.' },
          { status: 429 },
        )
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/auth/callback/credentials',
    '/api/auth/check-2fa',
  ],
}
