# CI (GitHub Actions)

## Pull requests / every push
- Install, lint, Vite build

## Push to `master` (or manual **workflow_dispatch**)
1. Bump `package.json` patch version and commit with `[skip ci]`
2. Build Windows installers on `windows-latest`
3. Publish a **GitHub Release** (`electron-builder --publish always`) with:
   - `Hafez Way Admin Setup x.y.z.exe` (installer)
   - `Hafez Way Admin x.y.z.exe` (portable)
   - `latest.yml` (used by **electron-updater**)

Uses the built-in `GITHUB_TOKEN` (`permissions: contents: write`). No personal `GH_TOKEN` secret is required for Actions.

## Auto-update for installed apps
Packaged installs already use `electron-updater`:
- On launch they check GitHub Releases for a newer version
- A banner asks the user to **Download update** (in-app) or **Open download page** (browser → latest release)
- After download: **Install & restart**

Manual download link (always latest):  
https://github.com/emkc0078/desktop-hafezWay/releases/latest

## Local publish (optional)
```bash
export GH_TOKEN='…'   # Contents: Read and write on this repo
npm run release:win
```

This app is **not** deployed under nginx on `hafezway.com`.  
Server deploy for API + web app is documented in `back-hafezWay/deploy/GITHUB_ACTIONS.md`.
