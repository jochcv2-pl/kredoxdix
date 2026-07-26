import { testConnection } from '@kredix/ai';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { requireAuth } from '../../_lib/auth-server';

// =============================================================================
// POST /api/ai/test — Teste la connexion au LLM configuré.
// =============================================================================
// Appelé par le bouton "Tester la connexion" dans Paramètres → Modèle d'IA.
// Envoie une requête minimale au LLM et retourne le modèle + la latence.

export async function POST() {
  const [, deny] = await requireAuth();
  if (deny) return deny;

  try {
    const result = await testConnection();

    if (result.success) {
      return successResponse({
        connected: true,
        model: result.model,
        engine: result.engine,
        endpoint: result.endpoint,
        latencyMs: result.latencyMs,
      });
    }

    return errorResponse(
      result.error || 'Connexion échouée',
      ERR.VALIDATION.code,
      {
        model: result.model,
        engine: result.engine,
        endpoint: result.endpoint,
      },
      422,
    );
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
