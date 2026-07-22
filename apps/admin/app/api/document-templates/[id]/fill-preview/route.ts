// =============================================================================
// /api/document-templates/[id]/fill-preview — Prévisualisation du PDF rempli
// avec les données d'un lead. Retourne le PDF en inline (application/pdf).
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../../../_lib/auth-server';
import { isValidId } from '@/app/api/_lib/id-validation';
import { fillPdfTemplate, PdfFillData } from '@/app/api/_lib/pdf-filler';
import { getSetting } from '@/app/api/_lib/settings';

// Schéma du body : identifiant du lead à utiliser pour le remplissage.
const previewSchema = z.object({
  leadId: z.string(),
});

// POST /api/document-templates/[id]/fill-preview — génère le PDF prévisualisé.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    const [data, error] = await parseBody(req, previewSchema);
    if (error) return error;

    // Récupération du template.
    const template = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }
    if (!template.filePath) {
      return errorResponse(
        "Ce template n'a pas de fichier PDF associé",
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Récupération du lead.
    const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
    if (!lead) {
      return errorResponse(ERR.NOT_FOUND.msg, ERR.NOT_FOUND.code, undefined, 404);
    }

    // Nom du site (marque) depuis les settings.
    const siteName = await getSetting('site_name', 'Kredix');

    // Construction des données de remplissage à partir du lead.
    const fillData: PdfFillData = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      city: lead.city,
      country: lead.country,
      amount: lead.amount,
      annualRate: lead.annualRate,
      durationYears: lead.durationYears,
      monthlyPayment: lead.monthlyPayment,
      totalCost: lead.totalCost,
      loanType: lead.loanType,
      createdAt: lead.createdAt.toLocaleDateString('fr-FR'),
      siteName,
    };

    // Génération du PDF rempli.
    const pdfBuffer = await fillPdfTemplate(template.filePath, fillData);

    // Retour inline (affichage dans le navigateur, pas de téléchargement forcé).
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${template.fileName || 'preview.pdf'}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
