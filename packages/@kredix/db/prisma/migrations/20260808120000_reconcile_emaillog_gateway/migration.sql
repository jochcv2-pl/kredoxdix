-- =============================================================================
-- Migration : 20260808120000_reconcile_emaillog_gateway
-- =============================================================================
-- Ajoute le snapshot du gateway utilisé sur chaque EmailLog (traçabilité SMTP).
-- DEC-K5 multi-admin : permet de vérifier quel SMTP a envoyé chaque email
-- (utile pour valider la résolution par lead du cron relance).
--
-- Idempotente (peut être rejouée sur une DB déjà à jour via db push).
-- =============================================================================

-- 3 nouvelles colonnes (snapshot — pas de FK, historique immuable).
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "gatewayId"    TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "gatewayLabel" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "fromEmail"    TEXT;

-- Index pour filtrage par gateway (vue historique, audit).
CREATE INDEX IF NOT EXISTS "EmailLog_gatewayId_idx" ON "EmailLog" ("gatewayId");
