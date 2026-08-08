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
import { requireAdmin } from '../../_lib/auth-server'
import { logAudit } from '@/app/api/_lib/audit'

// Champs publics d'un admin (jamais passwordHash ni twoFactorSecret).
const publicAdminSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  // DEC-K5 — identité conseiller + routing
  firstName: true,
  lastName: true,
  phone: true,
  loanTypes: true,
  countries: true,
  maxActiveLeads: true,
  currentActiveLeads: true,
  lastAssignedAt: true,
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
  // DEC-K5 — identité conseiller (variables email)
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  // DEC-K5 — routing automatique (vide = tous)
  loanTypes: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  maxActiveLeads: z.number().int().min(1).max(500).default(50),
})

// Garde-fou : au moins un admin actif doit rester en base.

// GET /api/admin/users — liste tous les comptes admin.
// Inclut l'agrégation `todayLeads` : prospects assignés à chaque admin aujourd'hui
// (createdAt >= minuit). Une seule requête Lead + regroupement en mémoire (évite le N+1).
export async function GET() {
  const [, deny] = await requireAdmin()
  if (deny) return deny

  try {
    const [users, todayLeads] = await Promise.all([
      prisma.adminUser.findMany({
        select: publicAdminSelect,
        orderBy: [{ createdAt: 'asc' }],
      }),
      // 1 seule requête pour tous les leads du jour (tous conseillers confondus).
      prisma.lead.findMany({
        where: {
          assignedToId: { not: null },
          createdAt: { gte: startOfToday() },
        },
        select: {
          id: true,
          assignedToId: true,
          firstName: true,
          lastName: true,
          amount: true,
          loanType: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Regroupe les leads du jour par assignedToId.
    const leadsByUser = new Map<string, typeof todayLeads>()
    for (const lead of todayLeads) {
      if (!lead.assignedToId) continue
      const arr = leadsByUser.get(lead.assignedToId)
      if (arr) arr.push(lead)
      else leadsByUser.set(lead.assignedToId, [lead])
    }

    // Attache todayLeads à chaque user (sérialisé en DTO).
    const result = users.map((u) => ({
      ...u,
      todayLeads: (leadsByUser.get(u.id) ?? []).map((l) => ({
        id: l.id,
        firstName: l.firstName,
        lastName: l.lastName,
        amount: l.amount,
        loanType: l.loanType,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
      })),
    }))

    return successResponse(result)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

/** Retourne la date à minuit aujourd'hui (début de journée, fuseau serveur). */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// POST /api/admin/users — crée un nouveau compte admin.
export async function POST(req: NextRequest) {
  const [admin, deny] = await requireAdmin()
  if (deny) return deny

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
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        phone: data.phone || null,
        loanTypes: data.loanTypes,
        countries: data.countries,
        maxActiveLeads: data.maxActiveLeads,
      },
      select: publicAdminSelect,
    })

    // Phase 7 Bloc F — audit log.
    await logAudit({
      admin,
      action: 'create',
      entity: 'AdminUser',
      entityId: user.id,
      metadata: { email: user.email, role: user.role, displayName: user.displayName },
    })

    return successResponse(user, 201)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
