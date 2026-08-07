// =============================================================================
// /api/profile/2fa/disable — désactive la 2FA TOTP (vérification renforcée).
// =============================================================================
// Body : { password, code }
//   - password : mot de passe actuel (re-vérifié pour anti-session-hijack)
//   - code     : code TOTP 6 chiffres (re-vérifié pour anti-coercition)
//
// Les 2 vérifications sont requises : si une seule échoue → 401.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { verify as verifyTotp } from 'otplib'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '../../../_lib/responses'
import { getCurrentAdmin } from '@/auth'
import { decryptSecret } from '@/lib/crypto'

const disable2faSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/, 'Code TOTP invalide (6 chiffres)'),
})

export async function POST(req: NextRequest) {
  const [data, error] = await parseBody(req, disable2faSchema)
  if (error) return error

  try {
    const admin = await getCurrentAdmin()
    if (!admin) {
      return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
    }
    if (!admin.twoFactorSecret) {
      return errorResponse(
        'La 2FA n\'est pas activée sur ce compte',
        'TWOFA_NOT_ENABLED',
        undefined,
        409,
      )
    }

    // Vérification password.
    const passOk = admin.passwordHash
      ? await bcrypt.compare(data.password, admin.passwordHash)
      : false
    if (!passOk) {
      return errorResponse('Mot de passe incorrect', 'WRONG_PASSWORD', undefined, 401)
    }

    // Vérification TOTP (±30s tolérance) — déchiffrement du secret avant vérification.
    const decryptedSecret = decryptSecret(admin.twoFactorSecret)
    if (!decryptedSecret) {
      return errorResponse('Configuration 2FA invalide', 'TWOFA_CORRUPT', undefined, 500)
    }
    const totpResult = await verifyTotp({
      token: data.code,
      secret: decryptedSecret,
      epochTolerance: 30,
    })
    if (!totpResult.valid) {
      return errorResponse('Code TOTP invalide', 'INVALID_TOTP', undefined, 401)
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { twoFactorSecret: null },
    })

    return successResponse({ ok: true, twoFactorEnabled: false })
  } catch (err) {
    console.error('[API /profile/2fa/disable] error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
