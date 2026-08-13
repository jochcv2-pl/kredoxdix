-- =============================================================================
-- s44 — Ajout champ Lead.source (distinguer origine : site / manual / csv)
-- =============================================================================
-- Idempotente. Defaults to 'site' (rétro-compat : tous les leads existants
-- sont considérés comme venant du site public).
-- =============================================================================

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'site';
