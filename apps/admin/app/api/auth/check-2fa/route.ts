// =============================================================================
// /api/auth/check-2fa — prédicateur public pour savoir si l'email a 2FA.
// =============================================================================
// Appelé par Login.tsx AVANT signIn() pour décider si afficher le champ TOTP.
// Route PUBLIQUE (pas de session requise) :
//   - body { email }
//   - 200 { twoFactorRequired: boolean }
//
// Sécurité :
//   - Retourne toujours 200 (même si l'email n'existe pas) — évite l'énumération
//     d'utilisateurs. Si email inexistant, retourne twoFactorRequired=false
//     (signIn() échouera de toute façon sur CredentialsSignin).
//   - Ne retourne JAMAIS le secret, juste un booléen.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@kredix/db'
import { successResponse, parseBody } from '../../_lib/responses'

const checkSchema = z.object({
  email: z.string().email().max(255),
})

export async function POST(req: NextRequest) {
  const [data, error] = await parseBody(req, checkSchema)
  if (error) return error

  try {
    const admin = await prisma.adminUser.findUnique({
      where: { email: data.email.toLowerCase() },
      select: { twoFactorSecret: true, isActive: true },
    })

    // Booléen : true si compte actif + secret posé.
    const twoFactorRequired = !!(admin?.isActive && admin.twoFactorSecret)

    return successResponse({ twoFactorRequired })
  } catch {
    // En cas d'erreur, on ne fail pas fermement — on retourne false
    // (login échouera normalement).
    return successResponse({ twoFactorRequired: false })
  }
}
