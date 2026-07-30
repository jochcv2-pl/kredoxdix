// =============================================================================
// /api/cms/upload — Upload de fichiers (logo, favicon) vers public/uploads/.
// Accepte multipart/form-data avec le champ "file" et un "type" optionnel.
// Valide : type MIME, poids, et dimensions (avec avertissements contextuels).
// =============================================================================

import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { successResponse, errorResponse, ERR } from '../../_lib/responses';
import { requireAuth } from '../../_lib/auth-server';

// Taille maximale autorisée : 500 Ko.
const MAX_FILE_SIZE = 500 * 1024;

// Types MIME acceptés (PNG, ICO, JPEG).
// SVG délibérément EXCLU : un SVG peut embarquer du JavaScript (XSS stocké).
// Si un logo SVG est nécessaire, l'admin doit le fournir via un autre canal
// (git, asset versionné) — pas via upload utilisateur.
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

// Extension associée à chaque type MIME (pour le nom de fichier généré).
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// =============================================================================
// Spécifications des dimensions par type d'asset.
// L'upload RÉUSSIT même si les dimensions sont hors spec — les warnings sont
// retournés pour que le frontend les affiche (information, pas blocage).
// =============================================================================
interface AssetSpec {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  recommendedLabel: string;
}

const ASSET_SPECS: Record<string, AssetSpec> = {
  logo: {
    minWidth: 200,
    minHeight: 50,
    maxWidth: 1200,
    maxHeight: 400,
    recommendedLabel: '400×100px',
  },
  favicon: {
    minWidth: 64,
    minHeight: 64,
    maxWidth: 1024,
    maxHeight: 1024,
    recommendedLabel: '512×512px',
  },
};

/**
 * Lit les dimensions de l'image via sharp et génère des avertissements
 * si les dimensions sont en dehors de la spec recommandée.
 */
async function checkImageDimensions(
  buffer: Buffer,
  mimeType: string,
  type: string,
): Promise<{ width?: number; height?: number; warnings: string[] }> {
  // SVG : pas supporté (sécurité — XSS store potentiel). Ignoré.
  if (mimeType === 'image/svg+xml') {
    return { warnings: [] };
  }

  const spec = ASSET_SPECS[type];
  if (!spec) {
    return { warnings: [] }; // type non reconnu — pas de vérification
  }

  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      return { warnings: ['Impossible de lire les dimensions de l\'image.'] };
    }

    const warnings: string[] = [];
    const dims = `${width}×${height}px`;
    const recommended = spec.recommendedLabel;

    if (width < spec.minWidth || height < spec.minHeight) {
      warnings.push(
        `Image trop petite (${dims}). Recommandé : ${recommended} minimum. ` +
        'Le logo risque d\'être flou en haute résolution.',
      );
    } else if (width > spec.maxWidth || height > spec.maxHeight) {
      warnings.push(
        `Image très grande (${dims}). Recommandé : ${recommended}. ` +
        'Elle sera redimensionnée par le navigateur mais alourdit le chargement de la page.',
      );
    }

    return { width, height, warnings };
  } catch {
    // sharp n'a pas pu lire l'image (format corrompu ?) — on ne bloque pas
    return { warnings: ['Impossible d\'analyser les dimensions (format non reconnu).'] };
  }
}

// POST /api/cms/upload — enregistre le fichier reçu dans public/uploads/.
// Retourne { url, filename, size, width?, height?, warnings[] }.
export async function POST(req: NextRequest) {
  const [, deny] = await requireAuth();
  if (deny) return deny;
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const type = formData.get('type'); // "logo" | "favicon" | null

    // Validation : champ "file" présent et de type File.
    if (!(file instanceof File)) {
      return errorResponse(
        'Champ "file" manquant ou invalide',
        ERR.VALIDATION.code,
        undefined,
        422,
      );
    }

    // Validation : type MIME autorisé.
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return errorResponse(
        `Type de fichier non supporté : ${file.type || 'inconnu'}`,
        ERR.VALIDATION.code,
        { allowed: Array.from(ALLOWED_MIME_TYPES) },
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

    // Génération du nom de fichier : <type>-<timestamp><ext>.
    const ext = EXT_BY_MIME[file.type] ?? path.extname(file.name) ?? '';
    const prefix = typeof type === 'string' && type ? type : 'asset';
    const filename = `${prefix}-${Date.now()}${ext}`;

    // Répertoire de destination.
    // Dev : process.cwd() = apps/admin → public/uploads/
    // Docker standalone : UPLOADS_DIR pointe vers le volume partagé
    const uploadsDir = process.env.UPLOADS_DIR
      || path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true });

    // Écriture du fichier sur le disque.
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadsDir, filename), buffer);

    // Vérification des dimensions (warnings non bloquants).
    const typeStr = typeof type === 'string' ? type : '';
    const { width, height, warnings } = await checkImageDimensions(
      buffer,
      file.type,
      typeStr,
    );

    return successResponse(
      {
        url: `/uploads/${filename}`,
        filename,
        size: file.size,
        width: width ?? null,
        height: height ?? null,
        warnings,
      },
      201,
    );
  } catch {
    return errorResponse(ERR.INTERNAL.msg, ERR.INTERNAL.code, undefined, 500);
  }
}
