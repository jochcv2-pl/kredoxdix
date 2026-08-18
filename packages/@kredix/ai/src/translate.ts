import { getLLMClient } from './client';

// =============================================================================
// translate.ts — Traduction d'un modèle d'email via le LLM configuré (CRM).
// =============================================================================
// Utilisé par POST /api/templates/[id]/translate (duplication dans une autre
// langue). Contrainte forte : les variables {{...}} ne doivent JAMAIS être
// traduites ni altérées.
//
// Stratégie de protection (mai 2026, pattern "token masking") :
//   1. Avant l'appel, chaque occurrence de variable est remplacée par un token
//      opaque de même forme : {{Prénom}} → {{KXVAR0}}. Le LLM voit des
//      moustaches opaques qu'il n'essaie pas de traduire.
//   2. Après l'appel, chaque {{KXVARn}} est restauré en variable d'origine.
//   3. Vérification finale : tout token {{KXVAR restant = LLM destructeur →
//      erreur explicite (pas de modèle corrompu silencieusement).
//
// Sortie LLM par délimiteurs (plus robuste que JSON pour du HTML volumineux) :
//   <<<SUBJECT>>> ... <<<BODY>>> ... <<<HTML>>> ...
// =============================================================================

/** Langues supportées pour la duplication/traduction (aligné i18n web). */
export const SUPPORTED_TRANSLATION_LANGUAGES = ['fr', 'en', 'de', 'es', 'pt', 'it'] as const;
export type TranslationLanguage = (typeof SUPPORTED_TRANSLATION_LANGUAGES)[number];

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French',
  en: 'English',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
};

/** Taille max de contenu HTML accepté en entrée (protection tokens/contexte). */
const MAX_HTML_LENGTH = 40_000;

export interface TranslateEmailInput {
  subject: string;
  bodyText: string;
  htmlContent?: string | null;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslateEmailOutput {
  subject: string;
  bodyText: string;
  htmlContent: string | null;
}

interface VarMask {
  /** {{KXVARn}} → variable d'origine ({{Prénom}}...) */
  tokens: Map<string, string>;
}

/** Remplace chaque variable {{...}} par un token opaque {{KXVARn}}. */
function maskVariables(text: string, mask: VarMask): string {
  return text.replace(/\{\{[^}]+\}\}/g, (v) => {
    let token = `{{KXVAR${mask.tokens.size}}}`;
    // Réutilise le token si la variable a déjà été masquée (subject+body+html
    // partagent le même mask : la même variable = même token partout).
    for (const [t, orig] of mask.tokens) {
      if (orig === v) { token = t; break; }
    }
    if (!mask.tokens.has(token)) mask.tokens.set(token, v);
    return token;
  });
}

/** Restaure les tokens {{KXVARn}} en variables d'origine. */
function unmaskVariables(text: string, mask: VarMask): string {
  let out = text;
  for (const [token, orig] of mask.tokens) {
    out = out.split(token).join(orig);
  }
  return out;
}

/** Extrait une section entre deux délimiteurs <<<NAME>>>. */
function extractSection(raw: string, name: string): string | null {
  const re = new RegExp(`<<<${name}>>>\\s*([\\s\\S]*?)(?=<<<[A-Z]+>>>|$)`);
  const m = raw.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Traduit le contenu d'un modèle d'email vers la langue cible.
 * Throw en cas d'échec (IA indisponible, sortie incomplète, tokens détruits) —
 * le caller décide du message d'erreur à présenter.
 */
export async function translateEmailContent(input: TranslateEmailInput): Promise<TranslateEmailOutput> {
  const { subject, bodyText, htmlContent, sourceLanguage, targetLanguage } = input;

  if (htmlContent && htmlContent.length > MAX_HTML_LENGTH) {
    throw new Error(`Modèle HTML trop volumineux pour la traduction IA (${htmlContent.length} caractères, max ${MAX_HTML_LENGTH}).`);
  }

  const targetName = LANGUAGE_NAMES[targetLanguage];
  if (!targetName) throw new Error(`Langue cible non supportée : ${targetLanguage}`);

  const { client, config } = await getLLMClient();

  // 1. Masquage des variables (map partagée subject+body+html).
  const mask: VarMask = { tokens: new Map() };
  const maskedSubject = maskVariables(subject, mask);
  const maskedBody = maskVariables(bodyText, mask);
  const maskedHtml = htmlContent ? maskVariables(htmlContent, mask) : null;

  // 2. Prompt — règles strictes, sortie par délimiteurs.
  const system = `You are a professional email translator for a credit brokerage company. Translate the provided email content into ${targetName}.

STRICT RULES:
- Tokens like {{KXVAR7}} are runtime variables. Copy them EXACTLY as-is, never translate, rename, reorder or remove them.
- Preserve the tone, formality level and marketing intent.
- For HTML: return the COMPLETE translated HTML document, preserving ALL tags, attributes, inline styles and structure. Only translate visible text content and title/alt attributes.
- Do not add commentary.

Respond EXACTLY in this format:
<<<SUBJECT>>>
(translated subject)
<<<BODY>>>
(translated plain-text body)
<<<HTML>>>
(complete translated HTML — only if HTML was provided)`;

  const userParts = [
    `Translate the following email from ${LANGUAGE_NAMES[sourceLanguage] ?? sourceLanguage} into ${targetName}.`,
    ``,
    `<<<SUBJECT>>>`,
    maskedSubject,
    `<<<BODY>>>`,
    maskedBody,
  ];
  if (maskedHtml) {
    userParts.push(`<<<HTML>>>`, maskedHtml);
  }

  // 3. Appel LLM — température basse (fidélité de traduction), tokens élevés
  //    (le HTML est volumineux — le maxTokens global de génération est court).
  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.3,
    max_tokens: Math.max(config.maxTokens, 4000),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userParts.join('\n') },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  if (!raw) throw new Error('Réponse IA vide.');

  // 4. Extraction des sections.
  const outSubject = extractSection(raw, 'SUBJECT');
  const outBody = extractSection(raw, 'BODY');
  let outHtml = extractSection(raw, 'HTML');
  if (!maskedHtml) outHtml = null; // aucun HTML fourni → ignoré même si l'IA en produit

  if (!outSubject || !outBody) {
    throw new Error('Réponse IA incomplète (objet ou corps manquant).');
  }
  if (maskedHtml && !outHtml) {
    throw new Error('Réponse IA incomplète (HTML manquant).');
  }

  // 5. Restauration des variables + vérification d'intégrité.
  const restored = {
    subject: unmaskVariables(outSubject, mask),
    bodyText: unmaskVariables(outBody, mask),
    htmlContent: outHtml ? unmaskVariables(outHtml, mask) : null,
  };
  const leaked = [restored.subject, restored.bodyText, restored.htmlContent ?? '']
    .some((s) => s.includes('{{KXVAR'));
  if (leaked) {
    throw new Error('Intégrité des variables compromise pendant la traduction (tokens résiduels).');
  }

  return restored;
}
