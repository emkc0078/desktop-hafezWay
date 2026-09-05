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
# These are the files you need to stand up the same stack on another Linux host.
# Mongo dump is written above; also copy images from the API backup tab.
STAGING_BACKEND_DIR="${STAGING_BACKEND_DIR:-/var/www/back-hafezWay-dev}"
STAGING_FRONTEND_DIR="${STAGING_FRONTEND_DIR:-/var/www/front-hafezWay-dev}"

CONFIG_PATHS=()
[[ -f "$BACKEND_DIR/.env" ]] && CONFIG_PATHS+=("$BACKEND_DIR/.env")
[[ -f "$FRONTEND_DIR/.env" ]] && CONFIG_PATHS+=("$FRONTEND_DIR/.env")
[[ -f "$FRONTEND_DIR/.env.production" ]] && CONFIG_PATHS+=("$FRONTEND_DIR/.env.production")
[[ -f "$STAGING_BACKEND_DIR/.env" ]] && CONFIG_PATHS+=("$STAGING_BACKEND_DIR/.env")
[[ -f "$STAGING_FRONTEND_DIR/.env" ]] && CONFIG_PATHS+=("$STAGING_FRONTEND_DIR/.env")
[[ -f "$STAGING_FRONTEND_DIR/.env.production" ]] && CONFIG_PATHS+=("$STAGING_FRONTEND_DIR/.env.production")
[[ -f "$NGINX_SITE" ]] && CONFIG_PATHS+=("$NGINX_SITE")
[[ -f /etc/nginx/nginx.conf ]] && CONFIG_PATHS+=("/etc/nginx/nginx.conf")
[[ -d /etc/nginx/sites-available ]] && CONFIG_PATHS+=("/etc/nginx/sites-available")
[[ -d /etc/nginx/sites-enabled ]] && CONFIG_PATHS+=("/etc/nginx/sites-enabled")
[[ -d /etc/nginx/conf.d ]] && CONFIG_PATHS+=("/etc/nginx/conf.d")
[[ -d /etc/nginx/snippets ]] && CONFIG_PATHS+=("/etc/nginx/snippets")
[[ -f /etc/systemd/system/node-backend.service ]] && CONFIG_PATHS+=("/etc/systemd/system/node-backend.service")
[[ -f /etc/systemd/system/node-backend-dev.service ]] && CONFIG_PATHS+=("/etc/systemd/system/node-backend-dev.service")
[[ -f /etc/sudoers.d/hafezway-deploy ]] && CONFIG_PATHS+=("/etc/sudoers.d/hafezway-deploy")
[[ -d /etc/letsencrypt ]] && CONFIG_PATHS+=("/etc/letsencrypt")

if ((${#CONFIG_PATHS[@]} > 0)); then
  tar -czf "$BACKUP_DIR/configs_${DATE}.tar.gz" "${CONFIG_PATHS[@]}"
else
  echo "Warning: no config paths found; skipping configs archive." >&2
fi

echo "Backup completed for $DATE in $BACKUP_DIR"
