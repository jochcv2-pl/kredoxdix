import OpenAI from 'openai';
import { prisma } from '@kredix/db';

// =============================================================================
// client.ts — Factory du client LLM (OpenAI-compatible).
// =============================================================================
// Lit la config depuis les Settings DB (ai_model_name, ai_engine, ai_endpoint,
// ai_api_key, ai_temperature, ai_max_tokens).
//
// Clé API : DB (ai_api_key) > env (AI_API_KEY / OPENAI_API_KEY) > 'ollama'
//
// Compatible avec :
//   - Ollama local (ai_endpoint="http://host.docker.internal:11434/v1")
//     → Ollama n'exige pas de clé réelle, 'ollama' suffit.
//   - OpenAI (ai_endpoint vide, clé API requise)
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

async function loadConfig(): Promise<LLMConfig & { apiKey: string }> {
  const settings = await prisma.setting.findMany({
    where: {
      key: { in: ['ai_model_name', 'ai_engine', 'ai_endpoint', 'ai_temperature', 'ai_max_tokens', 'ai_api_key'] },
    },
    select: { key: true, value: true },
  });

  const map = new Map(settings.map((s: { key: string; value: string }) => [s.key, s.value]));

  // Clé API : priorité DB > env > 'ollama' (fallback pour usage local)
  const dbApiKey = map.get('ai_api_key') || '';

  return {
    model: map.get('ai_model_name') || 'gpt-4o-mini',
    endpoint: map.get('ai_endpoint') || '',
    engine: map.get('ai_engine') || 'OpenAI',
    temperature: parseFloat(map.get('ai_temperature') || '0.7'),
    maxTokens: parseInt(map.get('ai_max_tokens') || '800', 10),
    apiKey: dbApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || 'ollama',
  };
}

export async function getLLMClient(): Promise<{ client: OpenAI; config: LLMConfig }> {
  const config = await loadConfig();

  // Hash simple pour détecter si la config a changé (recréer le client si oui).
  const configHash = `${config.model}|${config.endpoint}|${config.engine}|${config.apiKey.slice(-4)}`;
  if (cachedClient && cachedConfigHash === configHash) {
    return { client: cachedClient, config };
  }

  // Création du client.
  // La clé API vient de la DB (ai_api_key) ou de env (AI_API_KEY / OPENAI_API_KEY).
  // Si endpoint est vide → OpenAI par défaut (api.openai.com).
  // Si endpoint est défini → serveur custom (Ollama, vLLM…).
  const client = new OpenAI({
    apiKey: config.apiKey,
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
