// =============================================================================
// POST /api/admin/pipeline/pause — Bascule la pause d'urgence du pipeline.
// =============================================================================
// Body : { paused: boolean }
// Écrit pipeline.paused = "true" | "false" dans la table Setting.
// Effet immédiat au prochain cycle cron (≤ 60s).
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../../_lib/responses';
import { requireAdmin } from '../../../_lib/auth-server';

export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;

  try {
    const body = await req.json();
    const paused = !!body.paused;

    await prisma.setting.upsert({
      where: { key: 'pipeline.paused' },
      create: { key: 'pipeline.paused', value: paused ? 'true' : 'false', category: 'pipeline' },
      update: { value: paused ? 'true' : 'false' },
    });

    return successResponse({ paused }, 200);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
