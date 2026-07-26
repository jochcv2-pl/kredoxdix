// =============================================================================
// /api/domains/[id] — Lecture, mise à jour et suppression d'un domaine.
// Règle métier : un seul domaine primaire par type ; le domaine primaire de
// type "site" ne peut pas être supprimé.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, DomainType } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';

// Validation basique du format de domaine (ex: kredix.fr, crm.kredix.fr).
const DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

// Schéma de mise à jour — champs éditables uniquement.
const updateDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(DOMAIN_REGEX, 'Format de domaine invalide')
    .optional(),
  type: z.nativeEnum(DomainType).optional(),
  brandName: z.string().trim().nullable().optional(),
  logoUrl: z.string().trim().nullable().optional(),
  primaryColor: z.string().trim().nullable().optional(),
  fromEmail: z.string().trim().nullable().optional(),
  spfRecord: z.string().trim().nullable().optional(),
  dkimRecord: z.string().trim().nullable().optional(),
  dmarcRecord: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  sslStatus: z.enum(['pending', 'active', 'error']).optional(),
});

// GET /api/domains/[id] — domaine seul.
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
    const domain = await prisma.domain.findUnique({ where: { id } });
    if (!domain) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    return successResponse(domain);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// PATCH /api/domains/[id] — met à jour les champs éditables.
// - Si isPrimary passe à true, retire le flag primaire des autres domaines du même type.
// - Si type change et que le domaine était primaire, on harmonise les primaires du nouveau type.
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
    const [data, error] = await parseBody(req, updateDomainSchema);
    if (error) return error;

    const existing = await prisma.domain.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // En cas de changement de domaine, vérifier l'unicité.
    if (data.domain && data.domain !== existing.domain) {
      const taken = await prisma.domain.findUnique({ where: { domain: data.domain } });
      if (taken) {
        return errorResponse(
          'Ce domaine est déjà utilisé',
          ERR.CONFLICT.code,
          { domain: data.domain },
          409,
        );
      }
    }

    // Type effectif après mise à jour (pour harmoniser les primaires).
    const effectiveType = data.type ?? existing.type;
    const becomingPrimary = data.isPrimary === true;

    const domain = await prisma.$transaction(async (tx) => {
      if (becomingPrimary) {
        await tx.domain.updateMany({
          where: { type: effectiveType, isPrimary: true, NOT: { id } },
          data: { isPrimary: false },
        });
      }
      return tx.domain.update({ where: { id }, data });
    });

    return successResponse(domain);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// DELETE /api/domains/[id] — supprime le domaine.
// Interdiction : supprimer le domaine primaire de type "site" (409).
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
    const existing = await prisma.domain.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    if (existing.type === 'site' && existing.isPrimary) {
      return errorResponse(
        'Impossible de supprimer le domaine site primaire',
        ERR.CONFLICT.code,
        { id, domain: existing.domain },
        409,
      );
    }

    await prisma.domain.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
