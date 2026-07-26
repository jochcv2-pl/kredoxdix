// =============================================================================
// GET /api/ai/status — Retourne le modèle IA actif (pour le sidebar).
// =============================================================================
// Lightweight : retourne seulement ai_model_name + ai_engine.
// Ne nécessite pas de masquage (pas de clé API retournée).

import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { requireAuth } from '../../_lib/auth-server';

export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ['ai_model_name', 'ai_engine'] },
      },
      select: { key: true, value: true },
    });

    const map = new Map(settings.map((s) => [s.key, s.value]));

    const engine = map.get('ai_engine') || 'OpenAI';
    const model = map.get('ai_model_name') || 'gpt-4o-mini';

    // Label lisible pour le sidebar.
    const engineLabel =
      engine === 'Ollama' ? 'Modèle local' :
      engine === 'OpenAI' ? 'OpenAI' :
      engine;

    return successResponse({
      model,
      engine,
      engineLabel,
      // "actif" tant qu'un modèle est configuré.
      active: !!model,
    });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
