// =============================================================================
// /api/admin/users/[id] — Mise à jour et suppression d'un compte admin.
// =============================================================================
// Règles de sécurité :
//   - PATCH role/isActive : réservé admin
//   - PATCH password : réservé admin (réinitialisation) — ancien mdp non requis
//     (le self-change-password se fait via /api/profile/password étape 4)
//   - DELETE : réservé admin, ne peut pas se supprimer soi-même,
//     ne peut pas supprimer le dernier admin actif
// =============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma, AdminRole } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses'
import { isValidId } from '@/app/api/_lib/id-validation'
import { requireAdmin } from '../../../_lib/auth-server'

const publicAdminSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const

const updateUserSchema = z.object({
  email: z.string().email().max(255).optional(),
  displayName: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(), // si fourni → re-hash
  role: z.nativeEnum(AdminRole).optional(),
  isActive: z.boolean().optional(),
})

// GET /api/admin/users/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [me, err] = await requireAdmin()
  if (err) return err
  void me

  try {
    const { id } = await params
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }
    const user = await prisma.adminUser.findUnique({
      where: { id },
      select: publicAdminSelect,
    })
    if (!user) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }
    return successResponse(user)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

// PATCH /api/admin/users/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [me, err] = await requireAdmin()
  if (err) return err

  const [data, error] = await parseBody(req, updateUserSchema)
  if (error) return error

  try {
    const { id } = await params
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }
    const existing = await prisma.adminUser.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    // Email unique si changé
    if (data.email && data.email.toLowerCase() !== existing.email) {
      const taken = await prisma.adminUser.findUnique({ where: { email: data.email.toLowerCase() } })
      if (taken) {
        return errorResponse('Email déjà utilisé', 'EMAIL_TAKEN', undefined, 409)
      }
    }

    // Garde-fou : ne pas désactiver/rétrograder le dernier admin actif
    if (
      (data.isActive === false || data.role !== undefined) &&
      existing.role === 'admin' &&
      existing.isActive
    ) {
      const activeAdmins = await prisma.adminUser.count({
        where: { role: 'admin', isActive: true },
      })
      const willLoseAdmin =
        data.role !== undefined && data.role !== 'admin'
      const willBeInactive = data.isActive === false
      if ((willLoseAdmin || willBeInactive) && activeAdmins <= 1) {
        return errorResponse(
          'Impossible : au moins un admin actif doit rester en base',
          'LAST_ADMIN',
          undefined,
          409,
        )
      }
    }

    // Build update data
    const update: Record<string, unknown> = {}
    if (data.email !== undefined) update.email = data.email.toLowerCase()
    if (data.displayName !== undefined) update.displayName = data.displayName
    if (data.role !== undefined) update.role = data.role
    if (data.isActive !== undefined) update.isActive = data.isActive
    if (data.password !== undefined) {
      update.passwordHash = await bcrypt.hash(data.password, 10)
    }

    const user = await prisma.adminUser.update({
      where: { id },
      data: update,
      select: publicAdminSelect,
    })
    void me
    return successResponse(user)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

// DELETE /api/admin/users/[id] — suppression (avec garde-fous).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [me, err] = await requireAdmin()
  if (err) return err

  try {
    const { id } = await params
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }
    if (id === me.id) {
      return errorResponse(
        'Vous ne pouvez pas supprimer votre propre compte',
        'SELF_DELETE',
        undefined,
        409,
      )
    }

    const existing = await prisma.adminUser.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    // Garde-fou : ne pas supprimer le dernier admin actif
    if (existing.role === 'admin' && existing.isActive) {
      const activeAdmins = await prisma.adminUser.count({
        where: { role: 'admin', isActive: true },
      })
      if (activeAdmins <= 1) {
        return errorResponse(
          'Impossible : au moins un admin actif doit rester en base',
          'LAST_ADMIN',
          undefined,
          409,
        )
      }
    }

    await prisma.adminUser.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
