// =============================================================================
// audit.ts — Helper de journalisation des actions admin (Phase 7 Bloc F).
// =============================================================================
// Insère une entrée dans AuditLog pour tracer toute mutation d'une entité
// métier (create/update/delete) + actions de sécurité (login, logout, reset
// mdp, révocation session, export, etc.).
//
// Usage typique dans une route API :
//   import { logAudit } from '@/app/api/_lib/audit'
//   await logAudit({ admin, action: 'update', entity: 'Lead', entityId: id, diff: { before, after } })
//
// IMPORTANT : logAudit est NON BLOQUANT. Une erreur d'audit ne doit JAMAIS
// casser le flux métier — on catch et log en console.error. L'audit est
// best-effort, pas transactionnel avec l'action principale.

import { prisma } from '@kredix/db'
import type { AdminUser } from '@prisma/client'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_change'
  | 'password_reset'
  | 'session_revoke'
  | 'role_change'
  | 'activate'
  | 'deactivate'
  | 'export'
  | 'import'
  | 'send'
  | 'cancel'
  | (string & {}) // permet d'étendre sans casser le typage

export interface LogAuditParams {
  /** Admin à l'origine de l'action. null = action système (cron, webhook). */
  admin: Pick<AdminUser, 'id' | 'email' | 'role'> | { id: string } | null
  action: AuditAction
  /** Nom de l'entité ("Lead", "Campaign", "AdminUser", "Setting", ...). */
  entity: string
  /** ID de l'entité. null pour une action globale (ex: export massif). */
  entityId?: string | null
  /** Delta avant/après (pour update). Sérialisé en JSON. */
  diff?: Record<string, unknown> | null
  /** Contexte additionnel (raison, source, etc.). Sérialisé en JSON. */
  metadata?: Record<string, unknown> | null
  /** IP de l'auteur (depuis req.headers). */
  ipAddress?: string | null
}

/**
 * Insère une entrée d'audit dans AuditLog. Non bloquant.
 *
 * @example
 * await logAudit({ admin, action: 'update', entity: 'Lead', entityId: id })
 * await logAudit({ admin: null, action: 'send', entity: 'Campaign', entityId: campaignId, metadata: { recipients: 42 } })
 */
export async function logAudit({
  admin,
  action,
  entity,
  entityId = null,
  diff = null,
  metadata = null,
  ipAddress = null,
}: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: admin?.id ?? null,
        action,
        entity,
        entityId,
        diff: diff as never,
        metadata: metadata as never,
        ipAddress,
      },
    })
  } catch (err) {
    // Audit non bloquant — on log l'erreur mais on ne throw pas.
    console.error(
      '[audit] logAudit failed:',
      err instanceof Error ? err.message : String(err),
      { action, entity, entityId },
    )
  }
}

/**
 * Extrait l'IP cliente depuis les headers d'une requête Next.js.
 * Tient compte des proxies (X-Forwarded-For, X-Real-IP).
 */
export function getClientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    // X-Forwarded-For: client, proxy1, proxy2 — on prend le premier.
    return xff.split(',')[0].trim() || null
  }
  const xRealIp = headers.get('x-real-ip')
  if (xRealIp) return xRealIp.trim() || null
  return null
}
