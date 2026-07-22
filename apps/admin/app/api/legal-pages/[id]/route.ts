// =============================================================================
// /api/legal-pages/[id] — Lecture, mise à jour et suppression d'une page légale.
// Tous les champs sont optionnels en PATCH ; changement de slug vérifié.
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';

// Champs optionnels pour la mise à jour d'une page légale.
interface UpdateLegalPageBody {
  slug?: unknown;
  title?: unknown;
  category?: unknown;
  content?: unknown;
  order?: unknown;
  isActive?: unknown;
}

// GET /api/legal-pages/[id] — récupère une page légale par son id.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const page = await prisma.legalPage.findUnique({ where: { id } });
    if (!page) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    return successResponse(page);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/legal-pages/[id] — met à jour les champs fournis.
// Vérifie l'unicité du slug si celui-ci change (409 en cas de conflit).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // La page doit exister avant toute modification.
    const existing = await prisma.legalPage.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const body = (await req.json()) as UpdateLegalPageBody;

    // Construction des données à mettre à jour (uniquement les champs fournis).
    const data: Record<string, unknown> = {};

    if (body.slug !== undefined) {
      if (typeof body.slug !== 'string' || !body.slug.trim()) {
        return errorResponse(
          'Champ "slug" invalide',
          ERR.VALIDATION.code,
          undefined,
          422,
        );
      }
      const slug = body.slug.trim();
      // Unicité du slug si différent du slug actuel.
      if (slug !== existing.slug) {
        const conflict = await prisma.legalPage.findUnique({
          where: { slug },
        });
        if (conflict) {
          return errorResponse(
            `Une page avec le slug "${slug}" existe déjà`,
            ERR.CONFLICT.code,
            { slug },
            409,
          );
        }
      }
      data.slug = slug;
    }

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return errorResponse(
          'Champ "title" invalide',
          ERR.VALIDATION.code,
          undefined,
          422,
        );
      }
      data.title = body.title.trim();
    }

    if (body.category !== undefined) {
      if (typeof body.category !== 'string' || !body.category.trim()) {
        return errorResponse(
          'Champ "category" invalide',
          ERR.VALIDATION.code,
          undefined,
          422,
        );
      }
      data.category = body.category.trim();
    }

    if (body.content !== undefined) {
      if (typeof body.content !== 'string') {
        return errorResponse(
          'Champ "content" invalide',
          ERR.VALIDATION.code,
          undefined,
          422,
        );
      }
      data.content = body.content;
    }

    if (body.order !== undefined) {
      if (typeof body.order !== 'number' || !Number.isFinite(body.order)) {
        return errorResponse(
          'Champ "order" invalide (nombre attendu)',
          ERR.VALIDATION.code,
          undefined,
          422,
        );
      }
      data.order = body.order;
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return errorResponse(
          'Champ "isActive" invalide (booléen attendu)',
          ERR.VALIDATION.code,
          undefined,
          422,
        );
      }
      data.isActive = body.isActive;
    }

    // Aucun champ valide fourni : on renvoie la ressource inchangée.
    if (Object.keys(data).length === 0) {
      return successResponse(existing);
    }

    const updated = await prisma.legalPage.update({
      where: { id },
      data: data as Parameters<typeof prisma.legalPage.update>[0]['data'],
    });

    return successResponse(updated);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/legal-pages/[id] — supprime la page légale (204 ou 404).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const existing = await prisma.legalPage.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    await prisma.legalPage.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
