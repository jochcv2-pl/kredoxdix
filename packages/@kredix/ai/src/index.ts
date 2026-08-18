// =============================================================================
// @kredix/ai — Runtime LLM pour génération d'emails par les agents IA.
// =============================================================================
// Utilise le SDK openai (compatible OpenAI / Ollama / vLLM via baseURL custom).
// La config (modèle, endpoint, température) vient des Settings DB (admin CMS).
// La clé API vient d'une variable d'environnement (jamais en DB).

export { generateEmail, type GenerateEmailInput, type GenerateEmailOutput } from './generate';
export { testConnection, type TestConnectionResult } from './test';
export { getLLMClient } from './client';
export {
  translateEmailContent,
  SUPPORTED_TRANSLATION_LANGUAGES,
  type TranslateEmailInput,
  type TranslateEmailOutput,
  type TranslationLanguage,
} from './translate';
