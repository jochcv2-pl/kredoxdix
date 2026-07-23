import { getLLMClient } from './client';

// =============================================================================
// test.ts — Test de connexion au LLM (pour le bouton "Tester la connexion").
// =============================================================================

export interface TestConnectionResult {
  success: boolean;
  model?: string;
  engine?: string;
  endpoint?: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Envoie une requête minimale au LLM pour vérifier la connexion.
 * Retourne le modèle détecté et la latence.
 */
export async function testConnection(): Promise<TestConnectionResult> {
  try {
    const { client, config } = await getLLMClient();

    const start = Date.now();
    const completion = await client.chat.completions.create({
      model: config.model,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Ping. Reply with "OK".' }],
    });
    const latencyMs = Date.now() - start;

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply && !completion.choices[0]) {
      return {
        success: false,
        model: config.model,
        engine: config.engine,
        endpoint: config.endpoint || 'api.openai.com',
        error: 'Réponse vide du LLM',
      };
    }

    return {
      success: true,
      model: config.model,
      engine: config.engine,
      endpoint: config.endpoint || 'api.openai.com',
      latencyMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return { success: false, error: msg };
  }
}
