// =============================================================================
// /api/testimonials — Liste (admin) + Création (admin).
// =============================================================================
// Le web public lit la DB directement via getVisibleTestimonials() (@kredix/db).
// Cette route sert uniquement au CRUD admin.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../_lib/auth-server';

const createSchema = z.object({
  authorName: z.string().min(1).max(120),
  authorRole: z.string().max(120).nullish(),
  authorLocation: z.string().max(120).nullish(),
  authorAvatar: z.string().max(500).nullish(),
  rating: z.number().int().min(1).max(5).default(5),
  content: z.string().min(1),
  locale: z.string().min(2).max(8).default('de'),
  isVisible: z.boolean().default(true),
  order: z.number().int().default(0),
});

// GET /api/testimonials?locale=de — liste tous les témoignages (admin).
// Sans `locale` : toutes locales confondues.
export async function GET(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const { searchParams } = new URL(req.url);
    const locale = searchParams.get('locale');
    const testimonials = await prisma.testimonial.findMany({
      where: locale ? { locale } : undefined,
      orderBy: [{ locale: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
    });
    return successResponse(testimonials);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/testimonials — crée un témoignage.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const [data, err] = await parseBody(req, createSchema);
  if (err) return err;
  try {
    const created = await prisma.testimonial.create({
      data: {
        authorName: data.authorName.trim(),
        authorRole: data.authorRole?.trim() || null,
        authorLocation: data.authorLocation?.trim() || null,
        authorAvatar: data.authorAvatar?.trim() || null,
        rating: data.rating,
        content: data.content.trim(),
        locale: data.locale,
        isVisible: data.isVisible,
        order: data.order,
      },
    });
    return successResponse(created, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
