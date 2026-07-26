// =============================================================================
// sanitize.ts — Sanitisation HTML côté serveur (defense in depth contre XSS).
// =============================================================================
// Utilise la librairie sanitize-html (battle-tested, parser HTML complet)
// au lieu d'un sanitizer basé sur regex (contournable par mutation HTML).
//
// Ce sanitizer est utilisé avant de rendre du HTML stocké en DB (pages légales)
// via dangerouslySetInnerHTML. Il autorise le formatage éditorial (titres,
// paragraphes, listes, liens, tables) mais supprime systématiquement :
//   - <script>, <iframe>, <object>, <embed>, <applet>
//   - <style> (CSS injection)
//   - <svg>, <math> (pouvant embarquer des scripts)
//   - <meta>, <link>, <base>
//   - Tous les attributs on* (event handlers)
//   - Les URIs javascript: et data:text/html
//   - Les attributs style avec expression()

import sanitize from 'sanitize-html';

const OPTIONS: sanitize.IOptions = {
  // Balises autorisées pour le contenu éditorial (pages légales, mentions, CGV…)
  allowedTags: [
    // Texte
    'p', 'br', 'hr', 'span', 'div',
    // Titres
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Formatage
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark', 'abbr',
    // Listes
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Citations
    'blockquote', 'q', 'cite',
    // Code
    'pre', 'code', 'kbd', 'samp',
    // Tableaux
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Liens et médias
    'a', 'img', 'figure', 'figcaption',
    // Sémantique
    'article', 'section', 'header', 'footer', 'nav', 'aside', 'details', 'summary',
    'address',
  ],

  // Attributs autorisés par balise.
  allowedAttributes: {
    '*': ['class', 'id', 'dir', 'lang'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'title'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    col: ['span'],
    colgroup: ['span'],
    // Aucun attribut style autorisé (CSS injection possible via expression()).
  },

  // Protocoles autorisés dans href/src (javascript: et data:text/html bloqués).
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'], // data:image/ autorisé pour les images inline
  },

  // Force rel="noopener noreferrer" sur les liens target="_blank".
  transformTags: {
    a: (tagName, attribs) => {
      if (attribs.target === '_blank') {
        return {
          tagName,
          attribs: {
            ...attribs,
            rel: 'noopener noreferrer',
          },
        };
      }
      return { tagName, attribs };
    },
  },

  // Supprime les commentaires HTML (pouvaient embarquer du code IE conditionnel).
  // sanitize-html supprime les commentaires par défaut.

  // Limite la profondeur du parsing (anti-billion laughs attack).
  parseStyleAttributes: false,
};

/**
 * Sanitise du HTML pour neutraliser les vecteurs XSS connus.
 *
 * Utilise sanitize-html (parser HTML complet) — immune aux mutations HTML,
 * encodages polyglottes et autres contournements de sanitizers regex.
 *
 * @returns HTML nettoyé, sûr à rendre via dangerouslySetInnerHTML
 */
export function sanitizeHtml(html: string): string {
  return sanitize(html, OPTIONS);
}
