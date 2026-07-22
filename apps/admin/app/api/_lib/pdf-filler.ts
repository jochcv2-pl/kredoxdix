// =============================================================================
// Remplissage des champs AcroForm d'un PDF template avec les données client.
// Aucune IA : substitution de variables pure (mêmes clés que PdfFillData).
// =============================================================================

import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

// Toutes les variables disponibles pour remplir un PDF.
export interface PdfFillData {
  // Identité
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  // Prêt
  amount?: number | null;
  annualRate?: number | null;
  durationYears?: number | null;
  monthlyPayment?: number | null;
  totalCost?: number | null;
  loanType?: string | null;
  // Dates
  date?: string;      // aujourd'hui formaté
  createdAt?: string; // date de demande formatée
  // Marque
  siteName?: string;
}

// Normalise une clé : minuscules, sans espaces/tirets/underscores.
function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s\-_]/g, '');
}

// Détecte les champs AcroForm d'un PDF et retourne leurs noms.
export async function detectPdfFields(filePath: string): Promise<string[]> {
  const absPath = path.join(process.cwd(), 'public', filePath);
  const bytes = await fs.readFile(absPath);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const fields = form.getFields();
  return fields.map((f) => f.getName()).filter(Boolean) as string[];
}

// Remplit un PDF template avec les données et retourne un Buffer.
export async function fillPdfTemplate(
  filePath: string,
  data: PdfFillData,
): Promise<Buffer> {
  const absPath = path.join(process.cwd(), 'public', filePath);
  const bytes = await fs.readFile(absPath);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();

  // Tableau des valeurs formatées en chaînes.
  const values: Record<string, string> = {
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
    phone: data.phone || '',
    city: data.city || '',
    country: data.country || '',
    amount: data.amount
      ? data.amount.toLocaleString('fr-FR') + ' €'
      : '',
    annualRate: data.annualRate ? data.annualRate.toFixed(2) + ' %' : '',
    durationYears: data.durationYears
      ? String(data.durationYears) + ' ans'
      : '',
    monthlyPayment: data.monthlyPayment
      ? data.monthlyPayment.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
      : '',
    totalCost: data.totalCost
      ? data.totalCost.toLocaleString('fr-FR') + ' €'
      : '',
    loanType: data.loanType || '',
    date: data.date || new Date().toLocaleDateString('fr-FR'),
    createdAt: data.createdAt || '',
    siteName: data.siteName || 'Kredix',
  };

  // Index normalisé : clé normalisée -> valeur (pour matching tolérant).
  const normalizedValues = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) {
    normalizedValues.set(normalizeKey(k), v);
  }

  // Remplissage de chaque champ reconnu.
  const fields = form.getFields();
  for (const field of fields) {
    const name = field.getName();
    if (!name) continue;

    const norm = normalizeKey(name);
    const value = normalizedValues.get(norm);
    if (value === undefined) continue;

    try {
      // Essai en tant que champ texte.
      try {
        const textField = form.getTextField(name);
        textField.setText(value);
        continue;
      } catch {
        // Pas un champ texte — on ignore les autres types pour l'instant.
      }
    } catch {
      // Champ en erreur — on skippe.
    }
  }

  // Aplatit le formulaire (rend les champs non éditables).
  form.flatten();

  const filledBytes = await doc.save();
  return Buffer.from(filledBytes);
}
