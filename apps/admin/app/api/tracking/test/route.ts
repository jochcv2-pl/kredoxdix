// =============================================================================
// POST /api/tracking/test — Valide un ID de tracking + vérifie l'injection live.
// =============================================================================
// Étape 1 : validation du format (regex).
// Étape 2 (FB Pixel uniquement) : fetch du site (site_url en DB) et recherche
//   de fbq('init', '{id}') dans le HTML pour confirmer que le pixel est
//   réellement injecté sur le site.
//
// Réponse : { valid: boolean, message: string, liveCheck?: 'found' | 'not_found' | 'error', siteUrl?: string }

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';
import { getSetting } from '@/app/api/_lib/settings';
import { assertPublicUrl } from '@/app/api/_lib/ssrf-guard';

const schema = z.object({
  type: z.enum(['fb_pixel', 'ga4']),
  id: z.string(),
});

// Timeout pour le fetch du site (ne pas bloquer plus de 8s).
const FETCH_TIMEOUT_MS = 8_000;

export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
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
      // Étape 1 : validation du format (15-16 chiffres).
      if (!/^\d{15,16}$/.test(trimmed)) {
        return successResponse({ valid: false, message: 'Format invalide — un Facebook Pixel ID contient 15 à 16 chiffres.' });
      }

      // Étape 2 : vérification live — fetch du site et recherche du pixel dans le HTML.
      const siteUrl = await getSetting('site_url', '');
      if (!siteUrl) {
        return successResponse({
          valid: true,
          message: `ID Pixel valide (${trimmed.length} chiffres). ⚠️ Configurez l'URL du site dans le CMS pour activer la vérification live.`,
        });
      }

      // SSRF guard : refuser les URLs internes/privées (site_url est modifiable par admin,
      // mais défense en profondeur contre toute pollution de la DB).
      const ssrf = await assertPublicUrl(siteUrl);
      if (!ssrf.ok) {
        return successResponse({
          valid: true,
          message: `ID Pixel valide (${trimmed.length} chiffres), mais l'URL du site est bloquée (SSRF guard) : ${ssrf.reason}.`,
          liveCheck: 'error',
          siteUrl,
        });
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const res = await fetch(siteUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Kredix-Tracking-Check/1.0' },
          redirect: 'follow',
        });
        clearTimeout(timer);

        if (!res.ok) {
          return successResponse({
            valid: true,
            message: `ID Pixel valide, mais le site (${siteUrl}) a répondu HTTP ${res.status}.`,
            liveCheck: 'error',
            siteUrl,
          });
        }

        const html = await res.text();
        // Cherche fbq('init', '{pixelId}') dans le HTML injecté par Tracking.tsx.
        const pixelFound = html.includes(`fbq('init', '${trimmed}')`)
          || html.includes(`fbq("init", "${trimmed}")`);

        if (pixelFound) {
          return successResponse({
            valid: true,
            message: `✅ Pixel détecté sur ${siteUrl} — ID ${trimmed}. Le tracking est actif.`,
            liveCheck: 'found',
            siteUrl,
          });
        } else {
          return successResponse({
            valid: true,
            message: `⚠️ ID valide mais pixel non détecté sur ${siteUrl}. Causes possibles : cache (attendez 60s), ID non enregistré, ou site non déployé.`,
            liveCheck: 'not_found',
            siteUrl,
          });
        }
      } catch {
        return successResponse({
          valid: true,
          message: `ID Pixel valide (${trimmed.length} chiffres), mais impossible de joindre ${siteUrl}.`,
          liveCheck: 'error',
          siteUrl,
        });
      }
    }

    if (type === 'ga4') {
      // GA4 Measurement ID : G-XXXXXXXXXX
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
