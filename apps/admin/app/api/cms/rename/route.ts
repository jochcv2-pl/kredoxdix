// =============================================================================
// /api/cms/rename — Renomme globalement le site à travers Settings + EmailTemplates.
// Utilise le Setting "site_name" comme source de l'ancien nom.
// =============================================================================

import { NextRequest } from 'next/server';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { requireAdmin } from '../../_lib/auth-server';

// Validation du nouveau nom : lettres (incl. accents), chiffres, espaces,
// et ponctuation courante. Max 100 caractères. Empêche injections HTML/JS
// dans les templates d'email et les settings.
const SITE_NAME_RE = /^[\p{L}\p{N}\s'.,&()\-]{1,100}$/u;

// POST /api/cms/rename — remplace oldName par newName dans toute la base.
// Body : { newName: string }
// Retourne { oldName, newName, settingsUpdated, templatesUpdated }.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAdmin();
  if (deny) return deny;
  try {
    const body = (await req.json()) as { newName?: unknown };
    const newName = typeof body.newName === 'string' ? body.newName.trim() : '';

    // Validation : newName requis, format strict (anti-injection).
    if (!newName || !SITE_NAME_RE.test(newName)) {
      return errorResponse(
        'Champ "newName" invalide (1-100 caractères : lettres, chiffres, espaces et ponctuation courante)',
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Récupération de l'ancien nom depuis le Setting "site_name".
    const settingName = await prisma.setting.findUnique({
      where: { key: 'site_name' },
    });
    if (!settingName) {
      return errorResponse(
        'Setting "site_name" introuvable',
        ERR.NOT_FOUND.code,
        undefined,
        404,
      );
    }

    const oldName = settingName.value;

    // Cas nominal : aucun changement nécessaire.
    if (oldName === newName) {
      return successResponse({
        oldName,
        newName,
        settingsUpdated: 0,
        templatesUpdated: 0,
      });
    }

    // 1. Récupère tous les Settings dont la valeur contient oldName.
    const settingsToRename = await prisma.setting.findMany({
      where: { value: { contains: oldName } },
      select: { id: true, value: true },
    });

    // 2. Récupère tous les EmailTemplates dont l'un des champs contient oldName.
    const templatesToRename = await prisma.emailTemplate.findMany({
      where: {
        OR: [
          { subject: { contains: oldName } },
          { bodyText: { contains: oldName } },
          { htmlContent: { contains: oldName } },
        ],
      },
      select: { id: true, subject: true, bodyText: true, htmlContent: true },
    });

    // Transaction : remplace oldName par newName partout, puis met à jour site_name.
    const result = await prisma.$transaction(async (tx) => {
      let settingsUpdated = 0;

      // Remplacement dans chaque Setting concerné.
      for (const s of settingsToRename) {
        const next = s.value.split(oldName).join(newName);
        if (next !== s.value) {
          await tx.setting.update({
            where: { id: s.id },
            data: { value: next },
          });
          settingsUpdated += 1;
        }
      }

      // Force la valeur de site_name à newName (couvre le cas où il était déjà ok).
      await tx.setting.update({
        where: { key: 'site_name' },
        data: { value: newName },
      });

      let templatesUpdated = 0;

      // Remplacement dans chaque EmailTemplate concerné (subject + bodyText + htmlContent).
      for (const t of templatesToRename) {
        const nextSubject = t.subject.split(oldName).join(newName);
        const nextBody = t.bodyText.split(oldName).join(newName);
        const nextHtml =
          t.htmlContent != null ? t.htmlContent.split(oldName).join(newName) : null;

        if (
          nextSubject !== t.subject ||
          nextBody !== t.bodyText ||
          nextHtml !== t.htmlContent
        ) {
          await tx.emailTemplate.update({
            where: { id: t.id },
            data: {
              subject: nextSubject,
              bodyText: nextBody,
              ...(nextHtml !== t.htmlContent ? { htmlContent: nextHtml } : {}),
            },
          });
          templatesUpdated += 1;
        }
      }

      return { settingsUpdated, templatesUpdated };
    });

    return successResponse({
      oldName,
      newName,
      settingsUpdated: result.settingsUpdated,
      templatesUpdated: result.templatesUpdated,
    });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
