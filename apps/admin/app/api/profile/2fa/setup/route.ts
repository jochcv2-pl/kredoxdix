// =============================================================================
// /api/profile/2fa/setup — génère un secret TOTP + QR code (sans persister).
// =============================================================================
// Le secret généré est retourné au client. Le client scanne le QR, saisit un
// code TOTP, puis appelle POST /api/profile/2fa/enable { secret, code } qui
// persiste le secret après validation.
//
// Tant que /enable n'est pas appelé, admin.twoFactorSecret reste null.

import { NextRequest } from 'next/server'
import { generateSecret, generateURI } from 'otplib'
import QRCode from 'qrcode'
import { successResponse, errorResponse, ERR } from '../../../_lib/responses'
import { getCurrentAdmin } from '@/auth'

// issuer affiché dans les apps TOTP (Google Authenticator, Authy, 1Password…).
const ISSUER = 'Kredix CRM'

export async function POST(_req: NextRequest) {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) {
      return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
    }

    const secret = generateSecret()
    const otpauthUrl = generateURI({
      issuer: ISSUER,
      label: admin.email,
      secret,
    })
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    })

    return successResponse({
      secret,
      otpauthUrl,
      qrDataUrl,
    })
  } catch (err) {
    console.error('[API /profile/2fa/setup] error:', err)
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
