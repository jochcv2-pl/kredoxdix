import { NextRequest } from 'next/server';
import { recalcAllAdminLoads } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { verifyBearerSecret } from '../../_lib/security';

// =============================================================================
// POST /api/cron/recalc-loads — Recalcule currentActiveLeads pour tous les admins.
// =============================================================================
// DEC-K5 multi-admin : le compteur currentActiveLeads est incrémenté à chaque
// assignation (assignLeadToAdmin) mais n'est PAS décrémenté en temps réel quand
// un lead devient inactif (séquence terminée, statut client/lost).
//
// Ce cron (à exécuter une fois par jour, ex: 03h00) recalcule le compteur
// depuis la vérité base (COUNT des leads actifs assignés).
//
// Protégé par Authorization: Bearer <CRON_SECRET>.
// Crontab VPS : 0 3 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3100/api/cron/recalc-loads
// =============================================================================

export async function POST(req: NextRequest) {
  if (!verifyBearerSecret(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return errorResponse('Non autorisé', ERR.UNAUTHORIZED.code, undefined, 401);
  }

  try {
    await recalcAllAdminLoads();
    return successResponse({
      recalculated: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[CRON recalc-loads] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
