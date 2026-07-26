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
  let config: { model: string; endpoint: string; engine: string } | null = null;

  try {
    const result = await getLLMClient();
    const client = result.client;
    config = result.config;

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

    // Enrichir l'erreur avec l'endpoint et le modèle testés pour le debug.
    let hint = '';
    if (config?.endpoint?.includes('ollama') || config?.engine === 'Ollama') {
      if (msg.includes('404')) {
        hint = ' — Vérifiez que l\'endpoint se termine par /v1 (ex: http://ollama:11434/v1) et que le modèle est téléchargé (ollama pull)';
      } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        hint = ' — Ollama est injoignable. Vérifiez que le container est sur le même réseau Docker (docker network connect kredix-network ollama)';
      }
    }

    return {
      success: false,
      model: config?.model,
      engine: config?.engine,
      endpoint: config?.endpoint || 'api.openai.com',
      error: `${msg}${hint}`,
    };
  }
}
