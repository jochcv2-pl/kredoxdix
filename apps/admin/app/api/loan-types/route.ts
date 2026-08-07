import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses'
import { requireAdmin } from '../_lib/auth-server'

// GET /api/loan-types — liste (tous les admin connectés).
export async function GET() {
  const [admin, deny] = await requireAdmin()
  if (deny) return deny
  void admin
  try {
    const types = await prisma.loanType.findMany({
      orderBy: { sortOrder: 'asc' },
    })
    return successResponse(types)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

const createLoanTypeSchema = z.object({
  code: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
})

// POST /api/loan-types — créer (super-admin only).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin()
  if (deny) return deny
  try {
    const [data, error] = await parseBody(req, createLoanTypeSchema)
    if (error) return error

    const existing = await prisma.loanType.findUnique({ where: { code: data.code.toLowerCase() } })
    if (existing) {
      return errorResponse('Ce code existe déjà', 'CONFLICT', undefined, 409)
    }

    const created = await prisma.loanType.create({
      data: { ...data, code: data.code.toLowerCase() },
    })
    return successResponse(created, 201)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
