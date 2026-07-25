// =============================================================================
// /api/content-blocks — Liste (admin) + Upsert (admin).
// =============================================================================
// ContentBlock a une contrainte @@unique([section, locale]) → on UPSERT
// plutôt que CREATE. L'admin édite donc un seul bloc par (section, locale).
//
// Le web public lit la DB directement via getContentBlock() (@kredix/db).

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../_lib/auth-server';

// Un item = une carte d'une section (icône + titre + description).
const itemSchema = z.object({
  icon: z.string().max(60).default('check'),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
});

const upsertSchema = z.object({
  section: z.string().min(1).max(60),
  locale: z.string().min(2).max(8).default('de'),
  eyebrow: z.string().max(120).nullish(),
  title: z.string().max(160).nullish(),
  lead: z.string().max(300).nullish(),
  items: z.array(itemSchema).min(1).max(12),
});

// GET /api/content-blocks?section=engagements — liste les blocs (admin).
export async function GET(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section');
    const blocks = await prisma.contentBlock.findMany({
      where: section ? { section } : undefined,
      orderBy: [{ section: 'asc' }, { locale: 'asc' }],
    });
    return successResponse(blocks);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/content-blocks — upsert (crée OU met à jour le bloc section+locale).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  const [data, err] = await parseBody(req, upsertSchema);
  if (err) return err;
  try {
    const block = await prisma.contentBlock.upsert({
      where: { section_locale: { section: data.section, locale: data.locale } },
      create: {
        section: data.section,
        locale: data.locale,
        eyebrow: data.eyebrow || null,
        title: data.title || null,
        lead: data.lead || null,
        items: data.items,
      },
      update: {
        eyebrow: data.eyebrow || null,
        title: data.title || null,
        lead: data.lead || null,
        items: data.items,
      },
    });
    return successResponse(block, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
