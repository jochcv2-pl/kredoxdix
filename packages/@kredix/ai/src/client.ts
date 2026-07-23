import OpenAI from 'openai';
import { prisma } from '@kredix/db';

// =============================================================================
// client.ts — Factory du client LLM (OpenAI-compatible).
// =============================================================================
// Lit la config depuis les Settings DB (ai_model_name, ai_engine, ai_endpoint).
// La clé API vient de process.env.AI_API_KEY (jamais stockée en DB).
//
// Compatible avec :
//   - OpenAI (ai_endpoint vide, ai_engine="OpenAI")
//   - Ollama local (ai_endpoint="http://localhost:11434/v1", ai_engine="Ollama")
//   - vLLM / LM Studio / tout serveur compatible OpenAI API
//
// Le client est mis en cache pour éviter de recréer une instance à chaque appel.

let cachedClient: OpenAI | null = null;
let cachedConfigHash = '';

interface LLMConfig {
  model: string;
  endpoint: string;
  engine: string;
  temperature: number;
  maxTokens: number;
}

async function loadConfig(): Promise<LLMConfig> {
  const settings = await prisma.setting.findMany({
    where: {
      key: { in: ['ai_model_name', 'ai_engine', 'ai_endpoint', 'ai_temperature', 'ai_max_tokens'] },
    },
    select: { key: true, value: true },
  });

  const map = new Map(settings.map((s: { key: string; value: string }) => [s.key, s.value]));

  return {
    model: map.get('ai_model_name') || 'gpt-4o-mini',
    endpoint: map.get('ai_endpoint') || '',
    engine: map.get('ai_engine') || 'OpenAI',
    temperature: parseFloat(map.get('ai_temperature') || '0.7'),
    maxTokens: parseInt(map.get('ai_max_tokens') || '800', 10),
  };
}

export async function getLLMClient(): Promise<{ client: OpenAI; config: LLMConfig }> {
  const config = await loadConfig();

  // Hash simple pour détecter si la config a changé (recréer le client si oui).
  const configHash = `${config.model}|${config.endpoint}|${config.engine}`;
  if (cachedClient && cachedConfigHash === configHash) {
    return { client: cachedClient, config };
  }

  // Création du client.
  // Si endpoint est vide → OpenAI par défaut (api.openai.com).
  // Si endpoint est défini → serveur custom (Ollama, vLLM…).
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || 'ollama';

  const client = new OpenAI({
    apiKey,
    baseURL: config.endpoint || undefined,
  });

  cachedClient = client;
  cachedConfigHash = configHash;

  return { client, config };
}

/** Invalide le cache (utile après un changement de config dans les tests). */
export function invalidateClientCache(): void {
  cachedClient = null;
  cachedConfigHash = '';
}
