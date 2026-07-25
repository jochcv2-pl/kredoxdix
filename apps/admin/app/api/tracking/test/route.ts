// =============================================================================
// POST /api/tracking/test — Valide un ID de tracking (Facebook Pixel / GA4).
// =============================================================================
// Vérifie le format de l'ID sans réellement contacter Facebook/Google.
// { valid: boolean, message: string }

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../_lib/auth-server';

const schema = z.object({
  type: z.enum(['fb_pixel', 'ga4']),
  id: z.string(),
});

export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;

  try {
    const [data, error] = await parseBody(req, schema);
    if (error) return error;

    const { type, id } = data;
    const trimmed = id.trim();

    if (!trimmed) {
      return successResponse({ valid: false, message: 'Aucun ID renseigné — le tracking est désactivé.' });
    }

    if (type === 'fb_pixel') {
      // Facebook Pixel ID : 15-16 chiffres
      if (/^\d{14,18}$/.test(trimmed)) {
        return successResponse({ valid: true, message: `ID Pixel valide (${trimmed.length} chiffres).` });
      }
      return successResponse({ valid: false, message: 'Format invalide — un Facebook Pixel ID contient 15 à 16 chiffres.' });
    }

    if (type === 'ga4') {
      // GA4 Measurement ID : G-XXXXXXXXXX (10+ caractères alphanumériques)
      if (/^G-[A-Z0-9]{6,}$/.test(trimmed)) {
        return successResponse({ valid: true, message: `Measurement ID GA4 valide : ${trimmed}` });
      }
      return successResponse({ valid: false, message: 'Format invalide — un GA4 ID commence par "G-" suivi de caractères alphanumériques.' });
    }

    return successResponse({ valid: false, message: 'Type non reconnu.' });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
