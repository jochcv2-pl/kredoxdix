// =============================================================================
// Logger structuré — JSON stdout, zero dépendance, Edge + Node compatible.
// =============================================================================
// Copie conforme de apps/admin/lib/logger.ts — intentional duplication
// (logger trop léger pour justifier un package @kredix/logger).
// Format: {"ts":"...","level":"info","msg":"...","ctx":{...}}

const isDev = process.env.NODE_ENV !== 'production';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (isDev ? 'debug' : 'info');

function formatTimestamp(): string {
  return new Date().toISOString();
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const entry = {
    ts: formatTimestamp(),
    level,
    msg,
    ...(ctx ? { ctx } : {}),
  };

  if (isDev) {
    const prefix = `[${entry.ts.slice(11, 23)}] ${level.toUpperCase().padEnd(5)}`;
    const ctxStr = ctx ? ' ' + JSON.stringify(ctx) : '';
    const line = `${prefix} ${msg}${ctxStr}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } else {
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};

export async function withRequestLogging<T>(
  method: string,
  path: string,
  handler: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await handler();
    const duration = Date.now() - start;
    logger.info('request', { method, path, duration_ms: duration, status: 'ok' });
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error('request_failed', {
      method,
      path,
      duration_ms: duration,
      error: (err as Error).message,
    });
    throw err;
  }
}
