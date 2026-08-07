// =============================================================================
// /api/profile/2fa/enable — active la 2FA TOTP après validation du code.
// =============================================================================
// Body : { secret, code }
//   - secret  : base32 secret généré par /setup (en state client, jamais persisté)
//   - code    : code TOTP 6 chiffres saisi par l'utilisateur
//
// Vérifie le code contre le secret via otplib. Si OK → persiste le secret
// (admin.twoFactorSecret = secret). Sinon → 401.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { verify as verifyTotp } from 'otplib'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '../../../_lib/responses'
import { getCurrentAdmin } from '@/auth'
import { encryptSecret } from '@/lib/crypto'

const enable2faSchema = z.object({
  secret: z.string().min(16).max(64),
  code: z.string().regex(/^\d{6}$/, 'Code TOTP invalide (6 chiffres)'),
})

export async function POST(req: NextRequest) {
  const [data, error] = await parseBody(req, enable2faSchema)
  if (error) return error

  try {
    const admin = await getCurrentAdmin()
    if (!admin) {
      return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
    }
    if (admin.twoFactorSecret) {
      return errorResponse(
        'La 2FA est déjà activée sur ce compte',
        'TWOFA_ALREADY_ENABLED',
        undefined,
        409,
      )
    }

    // Vérifie le code TOTP contre le secret fourni (±30s tolérance).
    const result = await verifyTotp({
      token: data.code,
      secret: data.secret,
      epochTolerance: 30,
    })
    if (!result.valid) {
      return errorResponse(
        'Code TOTP invalide. Vérifiez votre app et réessayez.',
        'INVALID_TOTP',
        undefined,
        401,
      )
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      // Chiffrement AES-256-GCM du secret avant stockage (jamais en clair en DB).
      data: { twoFactorSecret: encryptSecret(data.secret) },
    })

    return successResponse({ ok: true, twoFactorEnabled: true })
  } catch (err) {
    console.error('[API /profile/2fa/enable] error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
