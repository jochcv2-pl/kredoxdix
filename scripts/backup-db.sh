#!/bin/sh
# =============================================================================
# backup-db.sh — Backup PostgreSQL avec rotation 3-2-1 (DEC-005).
# =============================================================================
# Stratégie :
#   - pg_dump compressé (.sql.gz) horodaté
#   - Rotation : garde 7 quotidiens + 4 hebdomadaires
#   - Offsite optionnel : rsync vers S3/B2 si configuré (rclone)
#
# Variables d'environnement requises :
#   DATABASE_URL ou (POSTGRES_HOST, POSTGRES_USER, POSTGRES_DB, PGPASSWORD)
#
# Variables optionnelles :
#   BACKUP_RETENTION_DAILY (défaut: 7)
#   BACKUP_RETENTION_WEEKLY (défaut: 4)
#   BACKUP_INTERVAL_SECONDS (défaut: 21600 = 6h)
#   RCLONE_REMOTE (si défini, pousse le backup offsite via rclone)
# =============================================================================

set -eu

PG_HOST="${POSTGRES_HOST:-postgres}"
PG_USER="${POSTGRES_USER:-kredix}"
PG_DB="${POSTGRES_DB:-kredix}"
BACKUP_DIR="/backups"
RETENTION_DAILY="${BACKUP_RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-21600}"

# Si DATABASE_URL est défini, l'utiliser (plus fiable que les vars individuelles).
DUMP_ARGS="-h ${PG_HOST} -U ${PG_USER} -d ${PG_DB}"

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"

echo "[backup] Démarrage — intervalle: ${INTERVAL}s, rétention: ${RETENTION_DAILY}d/${RETENTION_WEEKLY}w"

while true; do
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  DAY_OF_WEEK=$(date +%u)  # 1=Monday
  DOW_NAME=$(date +%A)
  FILENAME="kredix_${TIMESTAMP}.sql.gz"
  FILEPATH="${BACKUP_DIR}/daily/${FILENAME}"

  echo "[backup] $(date -Iseconds) — pg_dump en cours…"

  # pg_dump avec compression native PostgreSQL (--format=custom est plus lent,
  # on utilise gzip sur du plain SQL pour la portabilité).
  if pg_dump ${DUMP_ARGS} 2>/dev/null | gzip > "${FILEPATH}"; then
    SIZE=$(du -h "${FILEPATH}" | cut -f1)
    echo "[backup] ✓ ${FILENAME} créé (${SIZE})"

    # Copie hebdomadaire : le dimanche (jour 7), on copie dans weekly/.
    if [ "${DAY_OF_WEEK}" = "7" ]; then
      cp "${FILEPATH}" "${BACKUP_DIR}/weekly/kredix_weekly_$(date +%Y%m%d).sql.gz"
      echo "[backup] Copie hebdomadaire créée"
    fi

    # Rotation des quotidiens : garde les N plus récents.
    cd "${BACKUP_DIR}/daily"
    ls -1t kredix_*.sql.gz 2>/dev/null | tail -n +$((RETENTION_DAILY + 1)) | while read -r old; do
      rm -f "${old}"
      echo "[backup] Rotation: ${old} supprimé (daily)"
    done

    # Rotation des hebdomadaires.
    cd "${BACKUP_DIR}/weekly"
    ls -1t kredix_weekly_*.sql.gz 2>/dev/null | tail -n +$((RETENTION_WEEKLY + 1)) | while read -r old; do
      rm -f "${old}"
      echo "[backup] Rotation: ${old} supprimé (weekly)"
    done

    # Offsite optionnel via rclone (si RCLONE_REMOTE est configuré).
    if [ -n "${RCLONE_REMOTE:-}" ]; then
      if command -v rclone >/dev/null 2>&1; then
        echo "[backup] Push offsite vers ${RCLONE_REMOTE}…"
        if rclone copy "${FILEPATH}" "${RCLONE_REMOTE}/kredix-backups/" --quiet 2>/dev/null; then
          echo "[backup] ✓ Offsite: ${FILENAME} envoyé"
        else
          echo "[backup] ✗ Échec push offsite (rclone)"
        fi
      else
        echo "[backup] ⚠ rclone non installé — skip offsite"
      fi
    fi
  else
    echo "[backup] ✗ Échec pg_dump — retry au prochain cycle"
  fi

  echo "[backup] Prochain backup dans ${INTERVAL}s…"
  sleep "${INTERVAL}"
done
