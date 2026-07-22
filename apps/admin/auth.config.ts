// =============================================================================
// auth.config.ts — Edge-safe config (proxy, sans Prisma)
// =============================================================================
// Ce fichier est CONSOMMÉ par le middleware Next.js qui tourne en Edge Runtime.
// Il NE DOIT PAS importer `@kredix/db` (Prisma n'est pas Edge-compatible).
// La logique serveur (Providers + Prisma) vit dans `auth.ts`.
//
// Le rate limiting est géré directement dans middleware.ts (pas ici).
//
// Pattern Edge-safe NextAuth v5 — conforme DEC-K4.

import type { NextAuthConfig } from 'next-auth'

export const authConfig: NextAuthConfig = {
  // Page de login custom (au lieu de la page NextAuth par défaut).
  pages: {
    signIn: '/login',
  },

  // Stratégie de session : JWT (pas de table Session en DB — scalable).
  session: {
    strategy: 'jwt',
    // 24h au lieu de 30j (défaut NextAuth).
    // Mitigation : un token JWT volé reste valide au maximum 24h au lieu de 30j.
    // Note : le logout côté client supprime le cookie mais le JWT reste techniquement
    // valide jusqu'à expiration (limitation JWT stateless). Pour une révocation
    // immédiate en production multi-admins, prévoir une blocklist Redis (session DB).
    maxAge: 24 * 60 * 60,
  },

  // Callbacks — autorisation basique côté Edge.
  // La logique métier complète (rôle, 2FA) est dans auth.ts (jwt/session callbacks).
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      // Routes publiques — accessibles sans login.
      const isPublic =
        pathname.startsWith('/api/cron') || // Cron jobs — protégés par CRON_SECRET (header Bearer)
        pathname === '/api/health' ||       // Health check public (Docker/Uptime Kuma)
        pathname.startsWith('/login') ||
        pathname === '/' ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon')

      if (isPublic) return true

      // Le reste (pages admin + API admin) requiert un login.
      return isLoggedIn
    },
  },

  // Providers définis dans auth.ts (côté serveur).
  // Tableau vide ici — NextAuth merge avec auth.ts.
  providers: [],
}
