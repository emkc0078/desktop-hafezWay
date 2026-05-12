#!/usr/bin/env bash
# One-shot "manual quick backup" on the server: full app dirs + hidden .env (per your guide).
# Run: sudo bash server-quick-archive.sh
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/var/www}"
BACKEND_NAME="${BACKEND_NAME:-back-hafezway}"
FRONTEND_NAME="${FRONTEND_NAME:-front-hafezWay}"
OUT="${WEB_ROOT}/hafezway_backup_$(date +%F).tar.gz"

cd "$WEB_ROOT"
tar -czvf "$OUT" "$BACKEND_NAME" "$FRONTEND_NAME"
echo "Created: $OUT"
echo "On your Mac, pull with: scp root@YOUR_SERVER:$OUT ~/Downloads/"
