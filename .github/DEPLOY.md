# CI (GitHub Actions)

## Pull requests / every push
- Install, lint, Vite build

## Push to `master` (or manual **workflow_dispatch**)
1. Bump `package.json` patch version from the latest `master` tip, commit with `[skip ci]`, and push (retries on non-fast-forward if master moved)
2. Build Windows installers on `windows-latest`
3. Publish a **GitHub Release** (`electron-builder --publish always`) with:
   - `Hafez Way Admin Setup x.y.z.exe` (installer)
   - `latest.yml` (used by **electron-updater**)
   - `.blockmap` (for differential updates)
4. Optionally mirror the release onto `hafezway.com` via `POST /api/desktop-updates/sync-ci` when `DESKTOP_UPDATES_SYNC_SECRET` is set

Uses the built-in `GITHUB_TOKEN` (`permissions: contents: write`). No personal `GH_TOKEN` secret is required for Actions.

## Auto-update for installed apps
1. Packaged installs check for a newer version (GitHub publish remains the source of truth).
2. When an update is available, the dashboard asks the API host to **download that release from GitHub onto the server** and **delete older mirrored copies**.
3. Clicking download opens the installer from the server:
   `https://hafezway.com/api/desktop-updates/files/Hafez-Way-Admin-Setup-X.Y.Z.exe`
4. Optional nginx alias: `/downloads/admin/` → `/var/www/hafezway-downloads/admin/`

## Server env (back-hafezWay)
| Variable | Purpose |
|----------|---------|
| `DESKTOP_UPDATES_DIR` | Mirror directory (default `/var/www/hafezway-downloads/admin`) |
| `DESKTOP_UPDATES_GITHUB_TOKEN` / `GH_TOKEN` | Needed only if the desktop repo is private |
| `DESKTOP_UPDATES_SYNC_SECRET` | Optional shared secret for CI sync |
| `DESKTOP_UPDATES_USE_NGINX=true` | Prefer `/downloads/admin` URLs after nginx is updated |

## Local publish (optional)
```bash
export GH_TOKEN='…'   # Contents: Read and write on this repo
npm run release:win
```

This Electron app is **not** deployed under nginx as a web SPA.  
Installers are mirrored under `/var/www/hafezway-downloads/admin` by the API.  
Server deploy for API + web app is documented in `back-hafezWay/deploy/GITHUB_ACTIONS.md`.
