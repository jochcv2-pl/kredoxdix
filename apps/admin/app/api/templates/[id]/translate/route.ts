// =============================================================================
// POST /api/templates/[id]/translate — Dupliquer un modèle dans une autre langue.
// =============================================================================
// Duplique le modèle sélectionné vers la langue cible choisie par l'admin :
//   - même langue → copie simple (juste un nouveau titre)
//   - langue différente → traduction IA (config CRM : Paramètres → IA) du
//     sujet, du corps texte et du HTML, avec variables {{...}} préservées
//     à l'identique (masquage par tokens opaques — voir @kredix/ai/translate).
//
// Le clone est créé en statut 'draft' : aucun impact sur les templates actifs
// (l'admin relit puis active). blocksJson n'est PAS copié : le clone devient
// un modèle autonome texte/HTML (l'éditeur de blocs ne gère pas le multilingue).
//
// Body : { targetLanguage: 'fr'|'en'|'de'|'es'|'pt'|'it', name?: string }
// Réponse : le template créé (201) ou erreur 400/404/503.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { translateEmailContent } from '@kredix/ai';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAdmin } from '@/app/api/_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';
import { logAudit, getClientIpFromHeaders } from '@/app/api/_lib/audit';

const translateSchema = z.object({
  targetLanguage: z.enum(['fr', 'en', 'de', 'es', 'pt', 'it']),
  /** Titre du clone — défaut géré côté route (suffixe langue ou « Copie de »). */
  name: z.string().max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [admin, deny] = await requireAdmin();
  if (deny) return deny;

  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    const [data, error] = await parseBody(req, translateSchema);
    if (error) return error;

    // 1. Modèle source.
    const source = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!source) {
      return errorResponse('Modèle introuvable.', ERR.NOT_FOUND.code, undefined, 404);
    }

    const sameLanguage = source.language === data.targetLanguage;

    // 2. Titre du clone : fourni, ou défaut (suffixe langue / Copie de).
    const cloneName = (data.name ?? '').trim() || (
      sameLanguage
        ? `Copie de ${source.name}`
        : `${source.name} (${data.targetLanguage.toUpperCase()})`
    );

    // 3. Contenu : copie directe (même langue) ou traduction IA.
    let subject = source.subject;
    let bodyText = source.bodyText;
    let htmlContent = source.htmlContent;

    if (!sameLanguage) {
      try {
        const translated = await translateEmailContent({
          subject: source.subject,
          bodyText: source.bodyText,
          htmlContent: source.htmlContent,
          sourceLanguage: source.language || 'fr',
          targetLanguage: data.targetLanguage,
        });
        subject = translated.subject;
        bodyText = translated.bodyText;
        htmlContent = translated.htmlContent;
      } catch (err) {
        return errorResponse(
          `Traduction IA échouée : ${err instanceof Error ? err.message : String(err)}`,
          ERR.INTERNAL.code,
          undefined,
          502,
        );
      }
    }

    // 4. Création du clone en brouillon — jamais d'impact sur les actifs.
    const clone = await prisma.emailTemplate.create({
      data: {
        name: cloneName,
        trigger: source.trigger,
        language: data.targetLanguage,
        agentId: source.agentId,
        status: 'draft',
        subject,
        bodyText,
        htmlContent,
        // blocksJson volontairement absent : clone autonome texte/HTML.
        bannerEnabled: source.bannerEnabled,
        isConfidential: source.isConfidential,
      },
    });

    // 5. Audit.
    await logAudit({
      admin: admin!,
      action: 'create',
      entity: 'email_template',
      entityId: clone.id,
      metadata: {
        kind: 'duplicate_translate',
        sourceId: source.id,
        sourceName: source.name,
        targetLanguage: data.targetLanguage,
        translated: !sameLanguage,
      },
      ipAddress: getClientIpFromHeaders(req.headers),
    });

    return successResponse(clone, 201);
  } catch (err) {
    console.error('[POST /api/templates/[id]/translate] Erreur:', err instanceof Error ? err.message : String(err));
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
