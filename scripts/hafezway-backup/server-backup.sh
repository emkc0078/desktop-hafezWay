#!/usr/bin/env bash
# Run on the production server (e.g. copy to /root/backup_script.sh, chmod +x, cron nightly).
# Adjust paths and DB_* variables for your stack.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
DATE="$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# --- Web app paths (match your /var/www layout) ---
BACKEND_DIR="${BACKEND_DIR:-/var/www/back-hafezway}"
FRONTEND_DIR="${FRONTEND_DIR:-/var/www/front-hafezWay}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/hafezway.com}"

# --- Database: set one of mongo | postgres | none ---
DB_ENGINE="${DB_ENGINE:-mongo}"

if [[ "$DB_ENGINE" == "mongo" ]]; then
  # Set MONGODB_URI if needed, e.g. export MONGODB_URI='mongodb://user:pass@127.0.0.1:27017/dbname'
  if [[ -n "${MONGODB_URI:-}" ]]; then
    mongodump --uri="$MONGODB_URI" --archive="$BACKUP_DIR/db_${DATE}.gz" --gzip
  else
    mongodump --archive="$BACKUP_DIR/db_${DATE}.gz" --gzip
  fi
elif [[ "$DB_ENGINE" == "postgres" ]]; then
  : "${PGDATABASE:?Set PGDATABASE (and PGUSER/PGHOST/PGPASSWORD as needed)}"
  pg_dump --no-owner "$PGDATABASE" >"$BACKUP_DIR/db_${DATE}.sql"
fi

# --- Config / secrets on disk (never commit these to Git) ---
CONFIG_PATHS=()
[[ -f "$BACKEND_DIR/.env" ]] && CONFIG_PATHS+=("$BACKEND_DIR/.env")
[[ -f "$FRONTEND_DIR/.env" ]] && CONFIG_PATHS+=("$FRONTEND_DIR/.env")
[[ -f "$NGINX_SITE" ]] && CONFIG_PATHS+=("$NGINX_SITE")

if ((${#CONFIG_PATHS[@]} > 0)); then
  tar -czf "$BACKUP_DIR/configs_${DATE}.tar.gz" "${CONFIG_PATHS[@]}"
else
  echo "Warning: no config paths found; skipping configs archive." >&2
fi

echo "Backup completed for $DATE in $BACKUP_DIR"
