// =============================================================================
// /api/domains — Liste et création des domaines (multi-domaines / multi-marques).
// Règle métier : un seul domaine primaire par type (contrainte app).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, DomainType } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth, requireAdmin } from '../_lib/auth-server';

// Validation basique du format de domaine (ex: kredix.fr, crm.kredix.fr).
const DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

// Schéma de création d'un domaine.
const createDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(DOMAIN_REGEX, 'Format de domaine invalide'),
  type: z.nativeEnum(DomainType),
  brandName: z.string().trim().optional(),
  primaryColor: z.string().trim().optional(),
  fromEmail: z.string().trim().optional(),
  spfRecord: z.string().trim().optional(),
  dkimRecord: z.string().trim().optional(),
  dmarcRecord: z.string().trim().optional(),
  isPrimary: z.boolean().optional(),
});

// GET /api/domains — liste tous les domaines, triés par type puis date de création.
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const domains = await prisma.domain.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
    return successResponse(domains);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/domains — crée un domaine.
// - 409 si le domaine existe déjà.
// - Si isPrimary = true, retire le flag primaire des autres domaines du même type (transaction).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createDomainSchema);
    if (error) return error;

    // Vérification d'unicité du domaine.
    const existing = await prisma.domain.findUnique({ where: { domain: data.domain } });
    if (existing) {
      return errorResponse(
        'Ce domaine est déjà utilisé',
        ERR.CONFLICT.code,
        { domain: data.domain },
        409,
      );
    }

    // Règle métier : un seul domaine primaire par type (transaction).
    const domain = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.domain.updateMany({
          where: { type: data.type, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.domain.create({
        data: {
          domain: data.domain,
          type: data.type,
          brandName: data.brandName ?? null,
          primaryColor: data.primaryColor ?? null,
          fromEmail: data.fromEmail ?? null,
          spfRecord: data.spfRecord ?? null,
          dkimRecord: data.dkimRecord ?? null,
          dmarcRecord: data.dmarcRecord ?? null,
          isPrimary: data.isPrimary ?? false,
        },
      });
    });

    return successResponse(domain, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
