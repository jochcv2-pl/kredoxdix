// Format d'erreur API standard (SKILLS_CORE.md)
export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

// Réponse standard des endpoints simulateur
export interface SimulatorResponse {
  result: import('./simulator').SimulatorResult;
}
