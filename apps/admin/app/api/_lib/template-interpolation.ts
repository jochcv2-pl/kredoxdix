// Re-export depuis @kredix/email — le code canonique vit dans le package partagé.
// Ce fichier existe pour backward compat avec les imports existants dans apps/admin.
export {
  interpolateTemplate,
  buildUnsubscribeUrl,
  textToHtml,
  formatEuro,
  type InterpolationContext,
} from '@kredix/email';
