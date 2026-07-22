import type { Lead } from '@kredix/db';

// =============================================================================
// @kredix/email/template — Interpolation des variables {{...}} dans les emails.
// =============================================================================
// Extrait depuis apps/admin/app/api/_lib/template-interpolation.ts.

const LOAN_TYPE_LABELS: Record<string, string> = {
  immo: 'immobilier',
  conso: 'consommation',
  rachat: 'rachat de crédit',
  pro: 'professionnel',
  autre: 'personnel',
};

export interface InterpolationContext {
  lead: Pick<
    Lead,
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'amount'
    | 'durationYears'
    | 'monthlyPayment'
    | 'annualRate'
    | 'loanType'
    | 'unsubscribeToken'
    | 'preferredLanguage'
  >;
  siteUrl: string;
  customMessage?: string;
}

export function buildUnsubscribeUrl(lead: InterpolationContext['lead'], siteUrl: string): string {
  return `${siteUrl}/api/unsubscribe?t=${lead.unsubscribeToken}`;
}

export function interpolateTemplate(text: string, ctx: InterpolationContext): string {
  const { lead, siteUrl, customMessage } = ctx;
  const unsubscribeUrl = buildUnsubscribeUrl(lead, siteUrl);

  const replacements: Record<string, string> = {
    '{{Prénom}}': lead.firstName,
    '{{Nom}}': lead.lastName,
    '{{Email}}': lead.email ?? '',
    '{{Téléphone}}': lead.phone,
    '{{Montant}}': formatEuro(lead.amount),
    '{{TypePrêt}}': LOAN_TYPE_LABELS[lead.loanType] ?? lead.loanType,
    '{{Durée}}': `${lead.durationYears} ans`,
    '{{Mensualité}}': lead.monthlyPayment ? `${formatEuro(lead.monthlyPayment)}/mois` : '—',
    '{{TAEG}}': lead.annualRate ? `${lead.annualRate.toFixed(2)}%` : '—',
    '{{LienDesinscription}}': unsubscribeUrl,
    '{{Message}}': customMessage ?? '',
  };

  let result = text;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a; line-height: 1.6;">
${escaped.split('\n').map((line) => `<p style="margin: 0 0 12px;">${line || '&nbsp;'}</p>`).join('\n')}
</body>
</html>`;
}
