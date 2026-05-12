#!/usr/bin/env bash
# Pull MongoDB (*.gz) and Images backups (images-backup-*.zip) from the server
# into a local folder, then delete local files older than 3 days.
#
# Intended for nightly cron on your Mac.
#
# Env overrides:
#   HAFEZWAY_BACKUP_SERVER       (default: root@194.135.91.75)
#   HAFEZWAY_REMOTE_BACKUPS     (default: /root/backups)
#   HAFEZWAY_LOCAL_BACKUPS_DIR  (default: ~/Downloads/hafezway-backups)
#   BACKUP_RETENTION_DAYS      (default: 3)
set -euo pipefail

SERVER="${HAFEZWAY_BACKUP_SERVER:-root@194.135.91.75}"
REMOTE_BACKUPS="${HAFEZWAY_REMOTE_BACKUPS:-/root/backups}"
LOCAL_DIR="${HAFEZWAY_LOCAL_BACKUPS_DIR:-$HOME/Downloads/hafezway-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-3}"

mkdir -p "$LOCAL_DIR"

if ! command -v rsync >/dev/null 2>&1; then
  echo "Error: rsync not found. Please install it (brew install rsync) and retry." >&2
  exit 1
fi

# Download only what we need
rsync -avz --progress \
  --include='*.gz' \
  --include='images-backup-*.zip' \
  --exclude='*' \
  "$SERVER:$REMOTE_BACKUPS/" "$LOCAL_DIR/"

python3 "$(cd "$(dirname "$0")" && pwd)/cleanup-local-backups.py" \
  --dir "$LOCAL_DIR" \
  --retention-days "$RETENTION_DAYS"

echo "Done. Local backups stored at: $LOCAL_DIR"

