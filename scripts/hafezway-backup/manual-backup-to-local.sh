#!/usr/bin/env bash
# Manual backup from your Mac: archive on server, then copy here.
# Requires: SSH access as root (or a user that can read /var/www and write the temp archive path).
#
# Usage:
#   ./manual-backup-to-local.sh
#
# Optional env:
#   HAFEZWAY_BACKUP_SERVER=root@194.135.91.75
#   HAFEZWAY_LOCAL_BACKUPS=...   (default: repo/backups/hafezway-manual)
set -euo pipefail

SERVER="${HAFEZWAY_BACKUP_SERVER:-root@194.135.91.75}"
WEB_ROOT="${HAFEZWAY_WEB_ROOT:-/var/www}"
BACKEND_NAME="${BACKEND_NAME:-back-hafezway}"
FRONTEND_NAME="${FRONTEND_NAME:-front-hafezWay}"
# Fixed path on server so we do not have to guess the remote date for scp.
REMOTE_ARCHIVE="${HAFEZWAY_REMOTE_ARCHIVE:-/root/hafezway_manual_backup_latest.tar.gz}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCAL_DIR="${HAFEZWAY_LOCAL_BACKUPS:-$REPO_ROOT/backups/hafezway-manual}"
LOCAL_NAME="hafezway_backup_$(date +%Y-%m-%d)_$(date +%H%M).tar.gz"

mkdir -p "$LOCAL_DIR"

echo "Creating archive on $SERVER ..."
ssh "$SERVER" bash -s <<EOF
set -euo pipefail
cd "$WEB_ROOT"
tar -czf "$REMOTE_ARCHIVE" "$BACKEND_NAME" "$FRONTEND_NAME"
echo "Remote file: $REMOTE_ARCHIVE"
ls -lh "$REMOTE_ARCHIVE"
EOF

echo "Downloading to $LOCAL_DIR/$LOCAL_NAME ..."
scp "$SERVER:$REMOTE_ARCHIVE" "$LOCAL_DIR/$LOCAL_NAME"
echo "Done. Backup is at:"
echo "  $LOCAL_DIR/$LOCAL_NAME"
