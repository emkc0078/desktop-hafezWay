# CI (GitHub Actions)

On push/PR to **`master`**: install, lint, Vite build.  
On push to **`master`** (or manual dispatch): also run `electron-builder` and upload installer artifacts.

This app is **not** deployed under nginx on `hafezway.com`. Download builds from the Actions **Artifacts** tab.

Server deploy for API + web app is documented in `back-hafezWay/deploy/GITHUB_ACTIONS.md`.
