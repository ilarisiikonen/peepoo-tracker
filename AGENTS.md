# Peepoo Tracker Agent Guide

## Project shape

This is a framework-free progressive web app hosted with Firebase Hosting. Runtime files are intentionally kept at the repository root because `firebase.json` serves `.` as the public directory.

- `index.html`, `loki.html`, `tilastot.html`, and `kasvu.html` are the protected application views.
- `kirjaudu.html` is the sign-in view.
- `app.js` contains authentication, Firestore access, form handling, rendering, and page-specific initialization.
- `theme.js` applies the saved light, dark, or automatic color preference before styles load.
- `styles.css` provides shared styling for every view.
- `firebase-config.js` contains the Firebase web configuration and shared family ID.
- `sw.js` defines the offline application shell. Keep its asset list and cache version in sync with runtime asset changes.
- `tools/generate-icons.ps1` recreates the standard and maskable app icons.
- `firestore.rules` controls access to all family data.
- `initial-*.js` and `init_data*.txt` are seed/import references. They are not runtime assets and are excluded from Hosting deployment.

## Data and security

Firestore data is grouped below `families/{FAMILY_ID}`. Current collection names are `feeds`, `breastfeeds`, `pumps`, and `measurements`.

Do not weaken `firestore.rules` or expose a new Firestore path without ensuring authenticated family members remain the only readers and writers. Firebase web configuration values are public identifiers, but do not add credentials, private keys, or exported user data to the repository.

## Working conventions

- Keep the interface language Finnish unless a change explicitly calls for another language.
- Preserve the root-relative asset layout; update every affected HTML page, `sw.js`, and `manifest.webmanifest` when renaming a runtime asset.
- Keep timestamps in ISO-compatible values and preserve the existing quarter-hour input behavior.
- Prefer small changes in the existing vanilla JavaScript style; do not add a bundler or framework for isolated changes.
- Add cache-busting updates deliberately: when a cached shell asset changes, update its reference in `sw.js` and increment `CACHE_NAME` when an old cache must be retired.

## Verification

Run the narrowest relevant checks before finishing:

```powershell
node --check app.js
node --check sw.js
Get-Content firebase.json | ConvertFrom-Json | Out-Null
& .\tools\generate-icons.ps1
firebase deploy --only hosting,firestore:rules
```

Use the final deployment command only after confirming the Firebase project is correct; it publishes production changes.