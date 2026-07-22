// =============================================================================
// /api/document-templates — Liste et création (métadonnées) des templates PDF.
// L'upload du fichier PDF se fait via /api/document-templates/upload.
// =============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR, parseBody } from '@/app/api/_lib/responses';
import { requireAuth } from '../_lib/auth-server';

// Schéma de création d'un template (métadonnées uniquement, pas de fichier).
const createTemplateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  level: z.number().int().min(1).max(7).nullable().optional(),
});

// GET /api/document-templates — liste tous les templates triés par niveau puis date.
export async function GET() {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const templates = await prisma.documentTemplate.findMany({
      orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    });
    return successResponse(templates);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}

// POST /api/document-templates — crée l'entrée métadonnées (sans fichier).
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const [data, error] = await parseBody(req, createTemplateSchema);
    if (error) return error;

    const template = await prisma.documentTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        level: data.level ?? null,
        // Pas de fichier ici : filePath/fileName vides jusqu'à un upload.
        filePath: '',
        fileName: '',
      },
    });

    return successResponse(template, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
