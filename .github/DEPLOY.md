# CI (GitHub Actions)

On push/PR to **`master`**: install, lint, Vite build.  
On push to **`master`** (or manual dispatch): also run `npm run dist:ci` (`electron-builder --publish never`) and upload installer artifacts.

GitHub Releases are **not** created by CI. Publish a release locally with `GH_TOKEN=… npm run release` (or `release:win` / `release:mac`).

This app is **not** deployed under nginx on `hafezway.com`. Download builds from the Actions **Artifacts** tab.

Server deploy for API + web app is documented in `back-hafezWay/deploy/GITHUB_ACTIONS.md`.
