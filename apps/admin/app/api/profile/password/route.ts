// =============================================================================
// /api/profile/password — Changement du mot de passe (self-service).
// =============================================================================
// Sécurité :
//   - Vérifie l'ancien password (bcrypt.compare)
//   - Nouveau password min 8 chars, max 128
//   - Re-hash bcrypt cost 10
//   - Résout l'admin via getCurrentAdmin() (session JWT NextAuth)
//
// Note : la réinitialisation par un admin tiers se fait via
// /api/admin/users/[id] PATCH password (sans ancien requis).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '../../_lib/responses'
import { getCurrentAdmin } from '@/auth'
import { logAudit } from '../../_lib/audit'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
})

export async function POST(req: NextRequest) {
  const [data, error] = await parseBody(req, changePasswordSchema)
  if (error) return error

  try {
    const admin = await getCurrentAdmin()
    if (!admin) {
      return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
    }
    if (!admin.passwordHash) {
      return errorResponse(
        'Aucun mot de passe actif sur ce compte',
        'NO_PASSWORD',
        undefined,
        409,
      )
    }

    // Vérifie l'ancien mot de passe.
    const ok = await bcrypt.compare(data.currentPassword, admin.passwordHash)
    if (!ok) {
      return errorResponse(
        'Mot de passe actuel incorrect',
        'WRONG_PASSWORD',
        undefined,
        401,
      )
    }

    // Refuse si nouveau == ancien.
    if (data.currentPassword === data.newPassword) {
      return errorResponse(
        'Le nouveau mot de passe doit être différent de l\'actuel',
        'SAME_PASSWORD',
        undefined,
        409,
      )
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10)
    // KRX-007 : incrémenter sessionTokenVersion pour révoquer toutes les sessions
    // existantes (le JWT courant inclus — l'utilisateur devra se reconnecter avec
    // le nouveau mot de passe). S'il est sur un autre appareil, l'ancien JWT est invalidé.
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordHash,
        sessionTokenVersion: { increment: 1 },
      },
    })

    // Phase 7 Bloc F — audit log.
    await logAudit({
      admin,
      action: 'password_change',
      entity: 'AdminUser',
      entityId: admin.id,
    })

    return successResponse({ ok: true })
  } catch (err) {
    console.error('[API /profile/password POST] error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
