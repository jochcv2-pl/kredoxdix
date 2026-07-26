// =============================================================================
// /api/bank-partners — Liste + Création des banques partenaires (admin).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../_lib/auth-server';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  logoUrl: z.string().max(500).nullish(),
  contactEmail: z.string().max(200).nullish(),
  contactPhone: z.string().max(50).nullish(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

// Slugify un nom de banque (fallback si slug non fourni).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GET /api/bank-partners — liste tous les partenaires.
export async function GET() {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const partners = await prisma.bankPartner.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { rates: true } } },
    });
    return successResponse(partners);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/bank-partners — crée un partenaire.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const [data, err] = await parseBody(req, createSchema);
  if (err) return err;
  try {
    const slug = data.slug?.trim() || slugify(data.name.trim());

    // Vérifie l'unicité du slug.
    const existing = await prisma.bankPartner.findUnique({ where: { slug } });
    if (existing) {
      return errorResponse('Ce slug est déjà utilisé', ERR.CONFLICT.code, { slug }, 409);
    }

    const created = await prisma.bankPartner.create({
      data: {
        name: data.name.trim(),
        slug,
        logoUrl: data.logoUrl?.trim() || null,
        contactEmail: data.contactEmail?.trim() || null,
        contactPhone: data.contactPhone?.trim() || null,
        isActive: data.isActive,
        displayOrder: data.displayOrder,
      },
    });
    return successResponse(created, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
