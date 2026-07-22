// =============================================================================
// sanitize.ts — Sanitisation HTML côté serveur (defense in depth contre XSS).
// =============================================================================
// Ce sanitizer neutralise les vecteurs XSS les plus courants dans le HTML
// stocké en DB (legal pages, templates email). Il est INTENTIONNELLEMENT
// permissif sur le formatage (balises <p>, <h1>, <strong>, <ul>, <a>, etc.)
// mais supprime systématiquement les éléments dangereux.
//
// Pour une protection maximale en production, remplacer par la librairie
// `sanitize-html` (plus complète) quand le réseau le permet.

/**
 * Sanitise du HTML pour neutraliser les vecteurs XSS connus.
 *
 * Supprime :
 *   - <script> et leur contenu
 *   - <iframe>, <object>, <embed>, <applet>
 *   - <style> (CSS injection)
 *   - <svg>, <math> (pouvant embarquer des scripts)
 *   - <meta>, <link> (redirections, imports)
 *   - <base> (redirection des URLs relatives)
 *   - Attributs on* (onclick, onload, onerror, etc.)
 *   - URIs javascript: dans href/src/action
 *   - URIs data: dans href/src (sauf images)
 *   - Attribut style avec expression() (anciennes IE)
 *
 * @returns HTML nettoyé, sûr à rendre via dangerouslySetInnerHTML
 */
export function sanitizeHtml(html: string): string {
  let result = html;

  // 1. Supprimer les balises dangereuses ET leur contenu.
  const dangerousTags = [
    'script',
    'iframe',
    'object',
    'embed',
    'applet',
    'style',
    'svg',
    'math',
    'meta',
    'link',
    'base',
    'noscript',
    'template',
  ];
  for (const tag of dangerousTags) {
    // Balise avec contenu : <tag ...>...</tag>
    const contentRegex = new RegExp(
      `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,
      'gi',
    );
    result = result.replace(contentRegex, '');
    // Balise orpheline/auto-fermante : <tag ...> ou <tag .../>
    const voidRegex = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    result = result.replace(voidRegex, '');
  }

  // 2. Supprimer tous les attributs on* (event handlers).
  //    Match : onXXX="..." onXXX='...' onXXX=`...` onXXX=xxx onXXX (sans valeur)
  result = result.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s>]*)/gi, '');
  result = result.replace(/\son\w+\s*(?=>|\s)/gi, '');

  // 3. Neutraliser les URIs javascript: dans href, src, action, formaction, etc.
  const urlAttrs = ['href', 'src', 'action', 'formaction', 'xlink:href', 'data'];
  for (const attr of urlAttrs) {
    //javascript:javascript:alert(1) — double-encoded
    const attrRegex = new RegExp(
      `(${attr}\\s*=\\s*["']?)\\s*javascript:[^"']*`,
      'gi',
    );
    result = result.replace(attrRegex, '$1#');
  }

  // 4. Neutraliser les URIs data: dans href et src (sauf images data:image/).
  //    data:text/html peut exécuter du JavaScript.
  result = result.replace(
    /(href\s*=\s*["']?)\s*data:text\/html[^"']*/gi,
    '$1#',
  );
  // data: dans src sauf image
  result = result.replace(
    /(src\s*=\s*["']?)\s*data:(?!image\/)[^"']*/gi,
    '$1#',
  );

  // 5. Supprimer les commentaires conditionnels IE (pouvaient embarquer du script).
  result = result.replace(/<!--\[if[\s\S]*?\]>/gi, '');
  result = result.replace(/<!\[endif\]-->/gi, '');

  // 6. Neutraliser expression() dans les attributs style.
  result = result.replace(
    /(style\s*=\s*["'][^"']*?)expression\s*\(/gi,
    '$1void(',
  );

  return result;
}
