import { NextRequest } from 'next/server';

// =============================================================================
// Helpers partagés pour toutes les routes API de l'admin Kredix.
// Même convention que le web (successResponse / errorResponse).
// =============================================================================

export type ApiSuccess<T> = { data: T };
export type ApiErrorResponse = { error: string; code: string; details?: unknown };

export function successResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data } satisfies ApiSuccess<T>), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  error: string,
  code: string,
  details?: unknown,
  status = 400,
): Response {
  return new Response(
    JSON.stringify({ error, code, details } satisfies ApiErrorResponse),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

// Codes d'erreur standardisés
export const ERR = {
  VALIDATION: { msg: 'Données invalides', code: 'VALIDATION_ERROR' },
  NOT_FOUND: { msg: 'Ressource introuvable', code: 'NOT_FOUND' },
  CONFLICT: { msg: 'Conflit de ressource', code: 'CONFLICT' },
  UNAUTHORIZED: { msg: 'Non autorisé', code: 'UNAUTHORIZED' },
  INTERNAL: { msg: 'Erreur interne', code: 'INTERNAL_ERROR' },
} as const;

/** Parse + valide un body JSON via un schema Zod. Retourne [data, errorResponse]. */
export async function parseBody<T>(
  req: NextRequest,
  schema: { safeParse: (d: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } } },
): Promise<[T, null] | [null, Response]> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return [null, errorResponse('JSON invalide', 'BAD_JSON', undefined, 400)];
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return [null, errorResponse(ERR.VALIDATION.msg, ERR.VALIDATION.code, result.error.issues, 422)];
  }
  return [result.data, null];
}
