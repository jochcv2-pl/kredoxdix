// =============================================================================
// /api/document-templates/upload — Upload d'un PDF AcroForm vers public/uploads/docs/.
// Détecte automatiquement les champs AcroForm et crée un DocumentTemplate.
// Le PDF est sauvegardé même sans champs (warning retourné).
// =============================================================================

import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { prisma } from '@kredix/db';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { requireAuth } from '../../_lib/auth-server';
import { detectPdfFields } from '../../_lib/pdf-filler';

// Taille maximale d'un PDF : 10 Mo.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Types MIME acceptés pour les PDF.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/octet-stream',
]);

// POST /api/document-templates/upload — enregistre le PDF, détecte les champs, crée le template.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const name = formData.get('name');
    const description = formData.get('description');
    const levelStr = formData.get('level');

    // Validation : champ "file" présent et de type File.
    if (!(file instanceof File)) {
      return errorResponse(
        'Champ "file" manquant ou invalide',
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Validation : nom de template fourni.
    if (typeof name !== 'string' || !name.trim()) {
      return errorResponse(
        'Champ "name" manquant',
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Validation : type MIME autorisé (ou extension .pdf en fallback).
    const isPdfMime = ALLOWED_MIME_TYPES.has(file.type);
    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfMime && !isPdfExt) {
      return errorResponse(
        `Type de fichier non supporté : ${file.type || 'inconnu'}. PDF requis.`,
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Validation : taille maximale.
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(
        `Fichier trop volumineux (${file.size} octets, max ${MAX_FILE_SIZE})`,
        ERR.VALIDATION.code,
        { size: file.size, max: MAX_FILE_SIZE },
        413,
      );
    }

    // Parsing optionnel du niveau (1-7).
    let level: number | null = null;
    if (typeof levelStr === 'string' && levelStr.trim()) {
      const parsed = Number(levelStr);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
        level = parsed;
      }
    }

    // Génération du nom de fichier unique + chemin relatif public.
    const bytes = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `doc-${Date.now()}-${safeName}`;
    const filePath = `uploads/docs/${fileName}`;

    // Création du répertoire de destination si nécessaire.
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'docs');
    await mkdir(uploadsDir, { recursive: true });

    // Écriture du fichier sur le disque.
    await writeFile(path.join(uploadsDir, fileName), bytes);

    // Détection des champs AcroForm.
    let fields: string[] = [];
    try {
      fields = await detectPdfFields(filePath);
    } catch {
      // PDF illisible ou non AcroForm — on enregistre quand même sans champs.
      fields = [];
    }

    // Création de l'enregistrement DocumentTemplate.
    const template = await prisma.documentTemplate.create({
      data: {
        name: name.trim(),
        description:
          typeof description === 'string' && description.trim()
            ? description.trim()
            : null,
        filePath,
        fileName: file.name,
        level,
        fields,
        isActive: true,
      },
    });

    // Warning si aucun champ AcroForm détecté (PDF plat non remplissable).
    const warnings: string[] = [];
    if (fields.length === 0) {
      warnings.push(
        "Aucun champ AcroForm détecté dans ce PDF. Le fichier est sauvegardé " +
          'mais ne pourra pas être rempli automatiquement.',
      );
    }

    return successResponse({ template, warnings }, 201);
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
