import { NextResponse } from 'next/server';
import { prisma } from '@kredix/db';
import { logger } from '@/lib/logger';

// =============================================================================
// GET /api/health — Health check public (pas d'auth requise).
// =============================================================================
// Utilisé par Docker/Kubernetes/Uptime Kuma pour le monitoring.
// Vérifie : DB connectivity, uptime, version de l'app.
// Réponse 200 = healthy, 503 = degraded.

const startedAt = Date.now();

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {};

  // --- DB ping ---
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch (err) {
    checks.db = 'error';
    logger.error('health_check_db_error', { error: (err as Error).message });
  }

  const isHealthy = Object.values(checks).every((v) => v === 'ok');
  const status = isHealthy ? 'healthy' : 'degraded';
  const httpStatus = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status,
      service: 'kredix-admin',
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      checks,
    },
    { status: httpStatus },
  );
}
