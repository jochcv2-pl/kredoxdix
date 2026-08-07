import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@kredix/db'
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses'
import { requireAdmin } from '../../_lib/auth-server'
import { isValidId } from '@/app/api/_lib/id-validation'

const updateLoanTypeSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
})

// PATCH /api/loan-types/[id] — modifier (super-admin only).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAdmin()
  if (deny) return deny
  try {
    const { id } = await params
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }
    const [data, error] = await parseBody(req, updateLoanTypeSchema)
    if (error) return error

    const existing = await prisma.loanType.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    const updated = await prisma.loanType.update({
      where: { id },
      data,
    })
    return successResponse(updated)
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}

// DELETE /api/loan-types/[id] — supprimer (super-admin only).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAdmin()
  if (deny) return deny
  try {
    const { id } = await params
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    const existing = await prisma.loanType.findUnique({ where: { id } })
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404)
    }

    await prisma.loanType.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500)
  }
}
