// =============================================================================
// /api/admin/users — Gestion des comptes admin (CRUD multi-admin).
// =============================================================================
// Accès restreint : seul le rôle `admin` peut lister/créer/modifier/supprimer.
// Sécurité :
//   - Password jamais retourné en réponse (select explicite sans passwordHash)
//   - Validation Zod sur tous les champs
//   - Email unique (contrainte DB levée → message clair)
//   - Password min 8 chars, bcrypt cost 10
// =============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma, AdminRole } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses'
import { getCurrentAdmin } from '@/auth'

// Champs publics d'un admin (jamais passwordHash ni twoFactorSecret).
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

// Schéma de création
const createUserSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(AdminRole).default('advisor'),
  isActive: z.boolean().default(true),
})

// Garde-fou : au moins un admin actif doit rester en base.

// GET /api/admin/users — liste tous les comptes admin.
export async function GET() {
  const me = await getCurrentAdmin()
  if (!me) {
    return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
  }
  if (me.role !== 'admin') {
    return errorResponse('Droits insuffisants', 'FORBIDDEN', undefined, 403)
  }

  try {
    const users = await prisma.adminUser.findMany({
      select: publicAdminSelect,
      orderBy: [{ createdAt: 'asc' }],
    })
    return successResponse(users)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

// POST /api/admin/users — crée un nouveau compte admin.
export async function POST(req: NextRequest) {
  const me = await getCurrentAdmin()
  if (!me) {
    return errorResponse(ERR.UNAUTHORIZED.msg, ERR.UNAUTHORIZED.code, undefined, 401)
  }
  if (me.role !== 'admin') {
    return errorResponse('Droits insuffisants', 'FORBIDDEN', undefined, 403)
  }

  const [data, error] = await parseBody(req, createUserSchema)
  if (error) return error

  // Email unique
  const existing = await prisma.adminUser.findUnique({ where: { email: data.email.toLowerCase() } })
  if (existing) {
    return errorResponse('Email déjà utilisé', 'EMAIL_TAKEN', undefined, 409)
  }

  try {
    const passwordHash = await bcrypt.hash(data.password, 10)
    const user = await prisma.adminUser.create({
      data: {
        email: data.email.toLowerCase(),
        displayName: data.displayName,
        passwordHash,
        role: data.role,
        isActive: data.isActive,
      },
      select: publicAdminSelect,
    })
    return successResponse(user, 201)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
