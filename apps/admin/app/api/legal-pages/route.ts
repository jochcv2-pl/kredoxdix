// =============================================================================
// /api/legal-pages — Liste et création des pages légales (CGU, mentions, etc.).
// Validation manuelle (pas de Zod) conformément aux conventions de cette route.
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';

// Champs attendus pour la création d'une page légale.
interface CreateLegalPageBody {
  slug?: unknown;
  title?: unknown;
  category?: unknown;
  content?: unknown;
  order?: unknown;
}

// GET /api/legal-pages — liste toutes les pages légales, triées par ordre.
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const pages = await prisma.legalPage.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return successResponse(pages);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/legal-pages — crée une nouvelle page légale.
// Retourne 201 ou 409 si le slug existe déjà.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const body = (await req.json()) as CreateLegalPageBody;

    // Validation manuelle : slug requis (chaîne non vide).
    if (typeof body.slug !== 'string' || !body.slug.trim()) {
      return errorResponse(
        'Champ "slug" requis',
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Validation manuelle : title requis (chaîne non vide).
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return errorResponse(
        'Champ "title" requis',
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Validation manuelle : content requis (chaîne non vide).
    if (typeof body.content !== 'string' || !body.content.trim()) {
      return errorResponse(
        'Champ "content" requis',
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    const slug = body.slug.trim();

    // Vérification de l'unicité du slug (conflit → 409).
    const existing = await prisma.legalPage.findUnique({ where: { slug } });
    if (existing) {
      return errorResponse(
        `Une page avec le slug "${slug}" existe déjà`,
        ERR.CONFLICT.code,
        { slug },
        409,
      );
    }

    // Catégorie par défaut : "legal". Ordre par défaut : 0.
    const category =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim()
        : 'legal';
    const order =
      typeof body.order === 'number' && Number.isFinite(body.order)
        ? body.order
        : 0;

    const page = await prisma.legalPage.create({
      data: {
        slug,
        title: body.title.trim(),
        category,
        content: body.content,
        order,
      },
    });

    return successResponse(page, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
