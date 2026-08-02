// =============================================================================
// amortization — Génération d'un tableau d'amortissement de prêt au format PDF.
// =============================================================================
// Utilisé par les emails d'offre (template.trigger === 'offer') pour joindre
// un échéancier mensuel détaillé en pièce jointe.
//
// Formule standard d'amortissement à mensualités constantes :
//   M = P · r · (1+r)^n / ((1+r)^n - 1)
// avec P = capital, r = taux mensuel, n = nombre de mensualités.
// =============================================================================

import PDFDocument from 'pdfkit';
import { join } from 'path';

// =============================================================================
// Fonts PDFKit — fix Docker/standalone : les .afm ne sont pas trouvés par
// pdfkit dans le build Next.js standalone. On les résout explicitement
// depuis les données internes du package pdfkit.
// =============================================================================
function resolvePdfkitFont(name: string): string {
  // 1. Essai : données internes pdfkit (node_modules/pdfkit/js/data/)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfkitDir = require.resolve('pdfkit');
    const jsDataDir = join(pdfkitDir, '..', 'js', 'data');
    // pdfkit stocke les fonts dans js/data/ (Helvetica.afm, Helvetica-Bold.afm, etc.)
    const fs = require('fs');
    if (fs.existsSync(join(jsDataDir, `${name}.afm`))) {
      return join(jsDataDir, `${name}.afm`);
    }
  } catch { /* next */ }

  // 2. Fallback : laisser pdfkit chercher (marche en local dev)
  return name;
}

// Pré-résolution des fonts utilisées dans ce module
const FONTS = {
  helvetica: resolvePdfkitFont('Helvetica'),
  helveticaBold: resolvePdfkitFont('Helvetica-Bold'),
  helveticaOblique: resolvePdfkitFont('Helvetica-Oblique'),
};

export interface AmortizationParams {
  amount: number;          // montant du prêt en €
  annualRate: number;      // taux annuel en % (ex: 3.5 pour 3.5%)
  durationYears: number;   // durée en années
  firstName?: string;
  lastName?: string;
  siteName?: string;       // nom de la marque
}

export interface AmortizationRow {
  month: number;
  payment: number;         // mensualité fixe
  interest: number;        // intérêts du mois
  principal: number;       // capital remboursé
  remaining: number;       // capital restant dû
}

/**
 * Calcule la mensualité fixe (formule standard d'amortissement).
 */
export function calculateMonthlyPayment(
  amount: number,
  annualRate: number,
  durationYears: number,
): number {
  const monthlyRate = annualRate / 100 / 12;
  const numPayments = durationYears * 12;
  if (monthlyRate === 0) return amount / numPayments;
  return (
    (amount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1)
  );
}

/**
 * Génère le tableau complet d'amortissement (une ligne par mois).
 */
export function generateAmortizationTable(
  amount: number,
  annualRate: number,
  durationYears: number,
): AmortizationRow[] {
  const monthlyPayment = calculateMonthlyPayment(amount, annualRate, durationYears);
  const monthlyRate = annualRate / 100 / 12;
  let remaining = amount;
  const rows: AmortizationRow[] = [];

  for (let month = 1; month <= durationYears * 12; month++) {
    const interest = remaining * monthlyRate;
    const principal = monthlyPayment - interest;
    remaining = Math.max(0, remaining - principal);
    rows.push({ month, payment: monthlyPayment, interest, principal, remaining });
  }
  return rows;
}

/**
 * Génère un PDF du tableau d'amortissement et retourne un Buffer.
 *
 * Le rendu pdfkit est asynchrone : la Promise ne résout qu'à l'événement 'end'.
 */
export function generateAmortizationPDF(params: AmortizationParams): Promise<Buffer> {
  const { amount, annualRate, durationYears, firstName, lastName, siteName } = params;
  const rows = generateAmortizationTable(amount, annualRate, durationYears);
  const monthlyPayment = calculateMonthlyPayment(amount, annualRate, durationYears);
  const totalInterest = rows.reduce((sum, r) => sum + r.interest, 0);
  const totalCost = amount + totalInterest;

  // Formatage montants en français.
  const fmtEuros = (n: number) =>
    n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const fmtIntEuros = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' €';

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // ----- En-tête marque -----
    doc.fontSize(20).font(FONTS.helveticaBold).fillColor('#0f2942');
    doc.text(siteName || 'Kredix', { align: 'left' });
    doc.fontSize(10).font(FONTS.helvetica).fillColor('#64748b');
    doc.text("Tableau d'amortissement détaillé", { align: 'left' });
    doc.moveDown(1);

    // ----- Bloc infos du prêt -----
    doc.fillColor('#0f2942').fontSize(14).font(FONTS.helveticaBold);
    doc.text('Détails de votre prêt');
    doc.moveDown(0.5);

    const infoY = doc.y;
    doc.fontSize(10).font(FONTS.helvetica).fillColor('#333333');
    doc.text(`Emprunteur : ${firstName || ''} ${lastName || ''}`.trim(), 50, infoY);
    doc.text(`Montant emprunté : ${amount.toLocaleString('fr-FR')} €`, 50, infoY + 16);
    doc.text(`Taux annuel : ${annualRate.toFixed(2)} %`, 50, infoY + 32);
    doc.text(`Durée : ${durationYears} ans (${durationYears * 12} mois)`, 50, infoY + 48);
    doc.text(`Mensualité : ${fmtEuros(monthlyPayment)}`, 320, infoY);
    doc.text(`Coût total des intérêts : ${fmtIntEuros(totalInterest)}`, 320, infoY + 16);
    doc.text(`Coût total du crédit : ${fmtIntEuros(totalCost)}`, 320, infoY + 32);
    doc.text(`Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`, 320, infoY + 48);
    doc.moveDown(3);

    // ----- Titre de l'échéancier -----
    doc.fillColor('#0f2942').fontSize(14).font(FONTS.helveticaBold);
    doc.text('Échéancier mensuel');
    doc.moveDown(0.5);

    // ----- En-têtes de colonnes -----
    // Colonnes : Mois | Mensualité | Intérêts | Capital remboursé | Capital restant
    const colX = [50, 110, 230, 340, 470];
    const colWidths = [55, 110, 100, 120, 120];
    const headers = ['Mois', 'Mensualité', 'Intérêts', 'Capital remboursé', 'Capital restant'];

    const drawHeader = (topY: number) => {
      doc.fontSize(8).font(FONTS.helveticaBold);
      doc.rect(50, topY, 495, 18).fill('#0f2942');
      headers.forEach((h, i) => {
        doc.fillColor('white').text(h, colX[i], topY + 5, { width: colWidths[i] });
      });
    };

    const tableTop = doc.y;
    drawHeader(tableTop);

    // ----- Lignes du tableau -----
    let y = tableTop + 20;
    doc.font(FONTS.helvetica).fontSize(7).fillColor('#333333');

    rows.forEach((row, idx) => {
      // Couleur alternée pour la lisibilité.
      if (idx % 2 === 1) {
        doc.rect(50, y, 495, 14).fill('#f8fafc');
      }
      doc.fillColor('#333333');
      const values = [
        String(row.month),
        row.payment.toFixed(2) + ' €',
        row.interest.toFixed(2) + ' €',
        row.principal.toFixed(2) + ' €',
        row.remaining.toFixed(2) + ' €',
      ];
      values.forEach((v, i) => {
        doc.text(v, colX[i], y + 3, { width: colWidths[i] });
      });

      y += 14;

      // Saut de page : on réimprime l'en-tête sur la nouvelle page.
      if (y > 780) {
        doc.addPage();
        drawHeader(50);
        doc.font(FONTS.helvetica).fontSize(7).fillColor('#333333');
        y = 72;
      }
    });

    // ----- Pied de page (dernière page) -----
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8').font(FONTS.helveticaOblique);
    doc.text(
      `Document généré par ${siteName || 'Kredix'} le ${new Date().toLocaleDateString('fr-FR')}. ` +
        "Ce tableau est fourni à titre indicatif. Les mensualités définitives seront communiquées lors de l'offre de prêt formelle.",
      { align: 'center', width: 495 },
    );

    doc.end();
  });
}
