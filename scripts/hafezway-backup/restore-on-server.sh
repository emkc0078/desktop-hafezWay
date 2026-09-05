#!/usr/bin/env bash
# Run on the production server to restore the .env files, nginx configs, systemd
# units, sudoers, and Let's Encrypt tree from a configs_*.tar.gz produced by
# server-backup.sh.
#
# The archive stores files at their original absolute paths (tar strips the
# leading "/"), so extracting with `-C /` puts them back where they came from:
#   /var/www/back-hafezway/.env
#   /var/www/front-hafezWay/.env
#   /var/www/front-hafezWay/.env.production
#   /etc/nginx/nginx.conf
#   /etc/nginx/sites-available/...
#   /etc/nginx/sites-enabled/...
#   /etc/systemd/system/node-backend.service
#   /etc/sudoers.d/hafezway-deploy
#   /etc/letsencrypt/...
#
# Usage:
#   sudo bash restore-on-server.sh                                  # newest configs_*.tar.gz in $BACKUP_DIR
#   sudo bash restore-on-server.sh /root/backups/configs_2026-05-12.tar.gz
#
# Optional env:
#   BACKUP_DIR=/root/backups
#   BACKEND_DIR=/var/www/back-hafezway
#   FRONTEND_DIR=/var/www/front-hafezWay
#   NGINX_SITE=/etc/nginx/sites-available/hafezway.com
#   NGINX_SITES_ENABLED=/etc/nginx/sites-enabled
#   ENV_OWNER=root            # user:group that should own the .env files
#   ONLY=env|nginx|all        # restore subset (default: all)
#   NO_RELOAD=1               # skip `nginx -t` + `systemctl reload nginx`
#   DRY_RUN=1                 # print the plan without changing anything
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/back-hafezway}"
FRONTEND_DIR="${FRONTEND_DIR:-/var/www/front-hafezWay}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/hafezway.com}"
NGINX_SITES_ENABLED="${NGINX_SITES_ENABLED:-/etc/nginx/sites-enabled}"
ENV_OWNER="${ENV_OWNER:-root}"
ONLY="${ONLY:-all}"

case "$ONLY" in
  env|nginx|all) ;;
  *)
    echo "ONLY must be one of: env | nginx | all (got: $ONLY)" >&2
    exit 1
    ;;
esac

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE="$(ls -1t "$BACKUP_DIR"/configs_*.tar.gz 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Could not find a configs archive." >&2
  echo "Pass it as the first argument or place one in $BACKUP_DIR." >&2
  exit 1
fi

echo "Restoring from: $ARCHIVE"
echo "Mode:           ONLY=$ONLY  DRY_RUN=${DRY_RUN:-0}  NO_RELOAD=${NO_RELOAD:-0}"
echo

echo "Archive contents:"
tar -tzf "$ARCHIVE" | sed 's/^/  /'
echo

# Build the list of members to extract based on ONLY.
MEMBERS=()
case "$ONLY" in
  env)
    MEMBERS+=("${BACKEND_DIR#/}/.env" "${FRONTEND_DIR#/}/.env" "${FRONTEND_DIR#/}/.env.production")
    MEMBERS+=("var/www/back-hafezWay-dev/.env" "var/www/front-hafezWay-dev/.env" "var/www/front-hafezWay-dev/.env.production")
    ;;
  nginx)
    MEMBERS+=("${NGINX_SITE#/}" "etc/nginx/nginx.conf")
    while IFS= read -r entry; do
      case "$entry" in
        etc/nginx/*|etc/letsencrypt/*|etc/systemd/system/node-backend*|etc/sudoers.d/hafezway-deploy)
          MEMBERS+=("$entry")
          ;;
      esac
    done < <(tar -tzf "$ARCHIVE")
    ;;
  all)
    : # extract everything
    ;;
esac

# Filter MEMBERS down to entries that actually exist in the archive,
# so tar doesn't fail when a path is absent (e.g. only one .env was backed up).
if ((${#MEMBERS[@]} > 0)); then
  AVAILABLE=()
  while IFS= read -r entry; do
    for m in "${MEMBERS[@]}"; do
      if [[ "$entry" == "$m" ]]; then
        AVAILABLE+=("$entry")
      fi
    done
  done < <(tar -tzf "$ARCHIVE")

  if ((${#AVAILABLE[@]} == 0)); then
    echo "ONLY=$ONLY but none of the expected paths were found in the archive." >&2
    echo "Expected one of: ${MEMBERS[*]}" >&2
    exit 1
  fi
  MEMBERS=("${AVAILABLE[@]}")
fi

# 1) Pre-image of files we are about to overwrite, so a restore is reversible.
SAFETY_DIR="/root/restore_pre_$(date +%Y-%m-%d_%H%M%S)"
echo "Saving current versions to $SAFETY_DIR ..."
if [[ "${DRY_RUN:-0}" != "1" ]]; then
  mkdir -p "$SAFETY_DIR"
fi

backup_existing() {
  local p="$1"
  if [[ -e "$p" ]]; then
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  [DRY_RUN] would save $p -> $SAFETY_DIR${p}"
    else
      install -D -m "$(stat -c '%a' "$p" 2>/dev/null || echo 600)" "$p" "$SAFETY_DIR$p"
      echo "  saved $p"
    fi
  fi
}

if [[ "$ONLY" == "all" || "$ONLY" == "env" ]]; then
  backup_existing "$BACKEND_DIR/.env"
  backup_existing "$FRONTEND_DIR/.env"
  backup_existing "$FRONTEND_DIR/.env.production"
  backup_existing "/var/www/back-hafezWay-dev/.env"
  backup_existing "/var/www/front-hafezWay-dev/.env"
  backup_existing "/var/www/front-hafezWay-dev/.env.production"
fi
if [[ "$ONLY" == "all" || "$ONLY" == "nginx" ]]; then
  backup_existing "$NGINX_SITE"
  backup_existing "/etc/nginx/nginx.conf"
  backup_existing "/etc/systemd/system/node-backend.service"
  backup_existing "/etc/systemd/system/node-backend-dev.service"
  backup_existing "/etc/sudoers.d/hafezway-deploy"
fi
echo

# 2) Extract.
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  if ((${#MEMBERS[@]} > 0)); then
    echo "[DRY_RUN] would run: tar -xzpf $ARCHIVE -C / ${MEMBERS[*]}"
  else
    echo "[DRY_RUN] would run: tar -xzpf $ARCHIVE -C /"
  fi
else
  if ((${#MEMBERS[@]} > 0)); then
    tar -xzpf "$ARCHIVE" -C / "${MEMBERS[@]}"
  else
    tar -xzpf "$ARCHIVE" -C /
  fi
  echo "Extracted to /"
fi
echo

# 3) Tighten ownership and permissions on .env files.
secure_env() {
  local f="$1"
  if [[ -f "$f" ]]; then
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  [DRY_RUN] would chown $ENV_OWNER:$ENV_OWNER and chmod 600 $f"
    else
      if id -u "$ENV_OWNER" >/dev/null 2>&1; then
        chown "$ENV_OWNER:$ENV_OWNER" "$f" || true
      fi
      chmod 600 "$f"
      echo "  secured $f"
    fi
  fi
}

if [[ "$ONLY" == "all" || "$ONLY" == "env" ]]; then
  echo "Securing .env files ..."
  secure_env "$BACKEND_DIR/.env"
  secure_env "$FRONTEND_DIR/.env"
  secure_env "$FRONTEND_DIR/.env.production"
  secure_env "/var/www/back-hafezWay-dev/.env"
  secure_env "/var/www/front-hafezWay-dev/.env"
  secure_env "/var/www/front-hafezWay-dev/.env.production"
  echo
fi

# 4) Ensure nginx site is symlinked into sites-enabled, validate, reload.
if [[ "$ONLY" == "all" || "$ONLY" == "nginx" ]]; then
  if [[ -f "$NGINX_SITE" ]]; then
    link_name="$(basename "$NGINX_SITE")"
    link_path="$NGINX_SITES_ENABLED/$link_name"
    if [[ ! -L "$link_path" ]]; then
      if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo "  [DRY_RUN] would ln -sf $NGINX_SITE $link_path"
      else
        ln -sf "$NGINX_SITE" "$link_path"
        echo "  enabled site: $link_path"
      fi
    fi
  fi

  if [[ -f /etc/systemd/system/node-backend.service || -f /etc/systemd/system/node-backend-dev.service ]]; then
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  [DRY_RUN] would run: systemctl daemon-reload"
    else
      systemctl daemon-reload
      echo "  systemd daemon-reload done"
    fi
  fi

  if [[ "${NO_RELOAD:-0}" != "1" ]]; then
    echo "Validating nginx config ..."
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  [DRY_RUN] would run: nginx -t && systemctl reload nginx"
    else
      if nginx -t; then
        systemctl reload nginx
        echo "nginx reloaded."
      else
        echo "nginx -t failed; not reloading. Pre-image kept at $SAFETY_DIR." >&2
        exit 2
      fi
    fi
  else
    echo "NO_RELOAD=1 -> skipping nginx validate/reload."
  fi
  echo
fi

echo "Restore complete."
if [[ "${DRY_RUN:-0}" != "1" ]]; then
  echo "Pre-image of replaced files: $SAFETY_DIR"
fi
echo
echo "Next steps:"
echo "  - Restart the backend: systemctl restart node-backend"
echo "  - If staging was restored: systemctl restart node-backend-dev"
echo "  - If the frontend is built from its .env, rebuild it (cd $FRONTEND_DIR && expo export / npm run build)."
echo "  - Restore MongoDB and images from System & logs if this is a new host."
