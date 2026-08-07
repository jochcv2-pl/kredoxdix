// =============================================================================
// /api/profile — Profil de l'admin courant (lecture + mise à jour).
// =============================================================================
//
// Phase 5 étape 4 : utilise getCurrentAdmin() basé sur la session NextAuth v5.
// Le panneau "demo" est supprimé — authProvider retiré de la réponse.
//
// Champs éditables :
//   - displayName
//   - email (unique — vérifie conflit)
//   - phone (stocké en Setting, pas sur AdminUser)
//
// Notifications : stockées dans Setting (clés notif_*).
// Password change : /api/profile/password (POST).
// 2FA TOTP : /api/profile/2fa/* (setup/enable/disable).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '../_lib/responses'
import { getCurrentAdmin } from '@/auth'

const NOTIF_KEYS = [
  'notif_new_prospect',
  'notif_urgent_file',
  'notif_agent_activity',
  'notif_seo_audit',
  'notif_sound',
] as const

const patchProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  email: z.string().email().max(120).optional(),
  // Oblatoire si l'email change : confirmation du mot de passe courant.
  currentPassword: z.string().min(1).max(128).optional(),
  phone: z.string().max(40).optional(),
  notifications: z
    .record(z.string(), z.boolean())
    .refine((obj) => Object.keys(obj).every((k) => NOTIF_KEYS.includes(k as (typeof NOTIF_KEYS)[number])), {
      message: 'Clé notification inconnue',
    })
    .optional(),
})

async function getNotifSettings(): Promise<Record<string, boolean>> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...NOTIF_KEYS] } },
  })
  const out: Record<string, boolean> = {}
  for (const k of NOTIF_KEYS) {
    const row = rows.find((r) => r.key === k)
    out[k] = row ? row.value === 'true' : true // défaut true
  }
  return out
}

// -----------------------------------------------------------------------------
// GET /api/profile
// -----------------------------------------------------------------------------

export async function GET() {
  try {
    const admin = await getCurrentAdmin()
    if (!admin) {
      return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
    }

    const [phoneRow, notifs] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'contact_phone' } }),
      getNotifSettings(),
    ])

    return successResponse({
      id: admin.id,
      displayName: admin.displayName,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
      phone: phoneRow?.value ?? '',
      lastLoginAt: admin.lastLoginAt,
      notifications: notifs,
      twoFactorEnabled: admin.twoFactorSecret !== null,
    })
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

// -----------------------------------------------------------------------------
// PATCH /api/profile
// -----------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const [data, error] = await parseBody(req, patchProfileSchema)
  if (error) return error

  try {
    const admin = await getCurrentAdmin()
    if (!admin) {
      return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
    }

    // ----- Vérifier conflit email si changement -----
    if (data.email && data.email !== admin.email) {
      // Sécurité : exiger le mot de passe courant pour un changement d'email
      // (anti-takeover si la session est compromise / CSRF).
      if (!data.currentPassword || !admin.passwordHash) {
        return errorResponse(
          'Confirmation du mot de passe requise pour changer l\'email',
          'PASSWORD_REQUIRED',
          undefined,
          403,
        )
      }
      const pwOk = await bcrypt.compare(data.currentPassword, admin.passwordHash)
      if (!pwOk) {
        return errorResponse(
          'Mot de passe incorrect',
          'WRONG_PASSWORD',
          undefined,
          401,
        )
      }

      const conflict = await prisma.adminUser.findUnique({ where: { email: data.email.toLowerCase() } })
      if (conflict && conflict.id !== admin.id) {
        return errorResponse('Cet email est déjà utilisé', ERR.CONFLICT.msg, ERR.CONFLICT.code, 409)
      }
    }

    // ----- Update AdminUser -----
    // currentPassword n'est jamais écrit en DB — il sert uniquement de gate.
    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        ...(data.displayName ? { displayName: data.displayName } : {}),
        ...(data.email ? { email: data.email.toLowerCase() } : {}),
      },
    })

    // ----- Update téléphone (Setting) -----
    if (data.phone !== undefined) {
      await prisma.setting.upsert({
        where: { key: 'contact_phone' },
        update: { value: data.phone },
        create: { key: 'contact_phone', value: data.phone, category: 'contact' },
      })
    }

    // ----- Update notifications (Setting) -----
    if (data.notifications) {
      const upserts = Object.entries(data.notifications).map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value), category: 'notifications' },
        }),
      )
      await Promise.all(upserts)
    }

    const notifs = await getNotifSettings()
    const phoneRow = await prisma.setting.findUnique({ where: { key: 'contact_phone' } })

    return successResponse({
      id: updated.id,
      displayName: updated.displayName,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      phone: phoneRow?.value ?? '',
      lastLoginAt: updated.lastLoginAt,
      notifications: notifs,
      twoFactorEnabled: updated.twoFactorSecret !== null,
    })
  } catch (err) {
    console.error('[API /profile PATCH] error:', err instanceof Error ? err.message : String(err))
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
