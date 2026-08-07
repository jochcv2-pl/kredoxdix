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
//   - KRX-015 : délai uniforme (250ms) anti-timing-attack. Un findUnique sur un
//     email inexistant est plus rapide qu'un findUnique sur un email existant
//     (pas de row à retourner) → le timing pourrait révéler l'existence du
//     compte. Le délai compense en normalisant le temps de réponse. Combiné au
//     rate-limit (20/min/IP) dans middleware.ts, rend l'énumération peu viable.
//     Compromis documenté : la distinction true/false reste pour l'UX (sinon il
//     faudrait toujours demander le code TOTP, ce qui dégraderait l'expérience
//     pour les comptes sans 2FA).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@kredix/db'
import { successResponse, parseBody } from '../../_lib/responses'

const checkSchema = z.object({
  email: z.string().email().max(255),
})

// Délai uniforme pour normaliser le temps de réponse (anti-timing-attack).
const UNIFORM_DELAY_MS = 250

async function respondUniformly(start: number, payload: { twoFactorRequired: boolean }) {
  const elapsed = Date.now() - start
  if (elapsed < UNIFORM_DELAY_MS) {
    await new Promise((r) => setTimeout(r, UNIFORM_DELAY_MS - elapsed))
  }
  return successResponse(payload)
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  const [data, error] = await parseBody(req, checkSchema)
  if (error) return error

  try {
    const admin = await prisma.adminUser.findUnique({
      where: { email: data.email.toLowerCase() },
      select: { twoFactorSecret: true, isActive: true },
    })

    // Booléen : true si compte actif + secret posé.
    const twoFactorRequired = !!(admin?.isActive && admin.twoFactorSecret)

    return await respondUniformly(start, { twoFactorRequired })
  } catch {
    // En cas d'erreur, on ne fail pas fermement — on retourne false
    // (login échouera normalement).
    return await respondUniformly(start, { twoFactorRequired: false })
  }
}
