#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Back up the database and uploaded documents to /var/backups/sak-staffing.
#
#   deploy/backup.sh            # nightly (scheduled by cron – see docs/KVM-SETUP.md)
#   deploy/backup.sh pre-deploy # taken automatically before every deploy
#
# Keeps 14 days. These files hold confidential staff data: the folder is
# readable by the deploy user only. Copy them off the server too (see guide).
#
# Restore a database backup:
#   docker compose --env-file .env.docker exec -T db \
#     pg_restore -U sak_admin -d sak_staff --clean --if-exists < FILE.dump
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${BACKUP_DIR:-/var/backups/sak-staffing}"
tag="${1:-daily}"
ts="$(date +%F_%H%M)"
keep_days="${BACKUP_KEEP_DAYS:-14}"

cd "$app_dir"
compose() { docker compose --env-file .env.docker "$@"; }

umask 077
mkdir -p "$dest"

db_file="$dest/db_${ts}_${tag}.dump"
compose exec -T db pg_dump -U sak_admin -d sak_staff -Fc > "$db_file.tmp"
mv "$db_file.tmp" "$db_file"

uploads_file="$dest/uploads_${ts}_${tag}.tar.gz"
if compose exec -T app tar czf - -C /data/uploads . > "$uploads_file.tmp"; then
  mv "$uploads_file.tmp" "$uploads_file"
else
  rm -f "$uploads_file.tmp"
  echo "WARNING: uploads not backed up (app container not running?)" >&2
fi

find "$dest" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.tar.gz' \) -mtime +"$keep_days" -delete

echo "Backup written: $db_file ($(du -h "$db_file" | cut -f1))"
