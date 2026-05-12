#!/usr/bin/env bash
# Run on your Mac: pulls nightly backups from the server into a local folder.
# Usage: ./pull-from-server.sh
# Optional env overrides: HAFEZWAY_BACKUP_SERVER, HAFEZWAY_REMOTE_BACKUPS, HAFEZWAY_LOCAL_BACKUPS
set -euo pipefail

SERVER="${HAFEZWAY_BACKUP_SERVER:-root@194.135.91.75}"
REMOTE_BACKUPS="${HAFEZWAY_REMOTE_BACKUPS:-/root/backups}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCAL_DIR="${HAFEZWAY_LOCAL_BACKUPS:-$REPO_ROOT/backups/hafezway-server}"

mkdir -p "$LOCAL_DIR"

if command -v rsync >/dev/null 2>&1; then
  rsync -avz --progress "$SERVER:$REMOTE_BACKUPS/" "$LOCAL_DIR/"
else
  echo "rsync not found; using scp (single-file pattern may need a known filename)." >&2
  scp "$SERVER:$REMOTE_BACKUPS/"* "$LOCAL_DIR/" || true
fi

echo "Downloads complete: $LOCAL_DIR"
