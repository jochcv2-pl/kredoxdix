// =============================================================================
// auth.ts — NextAuth v5 implémentation serveur complète
// =============================================================================
// Ce fichier importe Prisma + bcrypt — il NE DOIT PAS être consommé par le
// middleware Edge Runtime. Il est utilisé par :
//   - app/api/auth/[...nextauth]/route.ts (Handlers HTTP)
//   - app/api/admin/* (auth() pour résoudre l'admin courant)
//   - Server Components / Server Actions
//
// Pattern Edge-safe NextAuth v5 — conforme DEC-K4.

import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { verify as verifyTotp } from 'otplib'
import { prisma } from '@kredix/db'
import { authConfig } from './auth.config'
import { decryptSecret } from './lib/crypto'

// -----------------------------------------------------------------------------
// Types — extension Session/JWT avec le rôle admin
// -----------------------------------------------------------------------------

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      sessionTokenVersion: number
    } & DefaultSession['user']
  }

  interface User {
    role?: string
    sessionTokenVersion?: number
  }
}

// JWT module augmentation retiré : NextAuth v5 beta ne l'expose pas de façon stable.
// Le rôle est lu via `token.role as string` quand nécessaire.

// -----------------------------------------------------------------------------
// Credentials Provider — bcrypt compare sur AdminUser
// -----------------------------------------------------------------------------

const credentialsProvider = Credentials({
  id: 'credentials',
  name: 'Credentials',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Mot de passe', type: 'password' },
    totp: { label: 'Code TOTP (2FA)', type: 'text' },
  },
  async authorize(credentials) {
    const email = credentials?.email
    const password = credentials?.password
    const totp = credentials?.totp
    if (typeof email !== 'string' || typeof password !== 'string') return null

    const admin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    })
    if (!admin || !admin.isActive || !admin.passwordHash) return null

    const passwordOk = await bcrypt.compare(password, admin.passwordHash)
    if (!passwordOk) return null

    // 2FA TOTP : si admin.twoFactorSecret est posé, exiger un code TOTP valide.
    // Le secret est chiffré en DB (AES-256-GCM) — déchiffrement avant vérification.
    if (admin.twoFactorSecret) {
      if (typeof totp !== 'string' || !/^\d{6}$/.test(totp)) return null
      const decryptedSecret = decryptSecret(admin.twoFactorSecret)
      if (!decryptedSecret) return null // Secret corrompu — bloque le login par sécurité
      // epochTolerance 30s = ±1 période TOTP (standard Google Authenticator).
      const result = await verifyTotp({
        secret: decryptedSecret,
        token: totp,
        epochTolerance: 30,
      })
      if (!result.valid) return null
    }

    // Update lastLoginAt (non bloquant).
    await prisma.adminUser
      .update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {
        /* non bloquant */
      })

    return {
      id: admin.id,
      email: admin.email,
      name: admin.displayName,
      role: admin.role,
      // KRX-007 : version du token embarquée dans le JWT — permet la révocation
      // immédiate (getCurrentAdmin compare avec admin.sessionTokenVersion en DB).
      sessionTokenVersion: admin.sessionTokenVersion,
    }
  },
})

// -----------------------------------------------------------------------------
// Instance NextAuth — merge authConfig (Edge) + providers (serveur)
// -----------------------------------------------------------------------------

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [credentialsProvider],

  callbacks: {
    // Hérite du callback `authorized` défini dans authConfig.

    // JWT : on attache le rôle + la version du token à la connexion.
    async jwt({ token, user }) {
      if (user) {
        const u = user as { role?: string; sessionTokenVersion?: number }
        token.role = u.role
        if (typeof u.sessionTokenVersion === 'number') {
          token.sessionTokenVersion = u.sessionTokenVersion
        }
      }
      return token
    },

    // Session : on expose le rôle + la version du token au client.
    async session({ session, token }) {
      if (typeof token.sub === 'string') {
        session.user.id = token.sub
      }
      const role = (token as { role?: string }).role
      if (role) session.user.role = role
      const tokenVersion = (token as { sessionTokenVersion?: number }).sessionTokenVersion
      if (typeof tokenVersion === 'number') {
        session.user.sessionTokenVersion = tokenVersion
      }
      return session
    },
  },
})

// -----------------------------------------------------------------------------
// Helper — résout l'admin courant depuis une requête (server-side).
// Remplace `pickFirstAdmin()` dans les routes /api/admin/*.
// -----------------------------------------------------------------------------

export async function getCurrentAdmin() {
  const session = await auth()
  if (!session?.user?.id) return null
  // isActive check : un admin désactivé mais avec un JWT valide (24h max)
  // se voit refuser l'accès aux routes API côté serveur.
  // Le middleware (Edge) ne peut pas faire ce check DB, donc il est ici.
  const admin = await prisma.adminUser.findFirst({
    where: { id: session.user.id, isActive: true },
  })
  if (!admin) return null

  // KRX-007 — Révocation session immédiate (JWT stateless).
  // Compare la version du token (dans le JWT) avec celle en DB.
  // Si différents → le token a été révoqué (changement mdp, désactivation,
  // appel /api/profile/revoke-sessions). Migration douce : undefined → 0
  // (anciens JWT avant l'ajout de sessionTokenVersion restent valides tant
  // que admin.sessionTokenVersion === 0).
  const tokenVersion = session.user.sessionTokenVersion ?? 0
  if (tokenVersion !== admin.sessionTokenVersion) {
    return null
  }

  return admin
}
