# Peepoo Tracker

Peepoo Tracker is a Finnish-language progressive web app for recording infant feeding, breastfeeding, pumping, and growth measurements. It uses Firebase Authentication, Cloud Firestore, Firebase Hosting, and a service worker for offline application-shell caching.

Current version: 1.1

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Feeding entry and recent entries |
| `loki.html` | Entry log |
| `tilastot.html` | Feeding statistics |
| `kasvu.html` | Growth measurements |
| `kirjaudu.html` | Google sign-in view |
| `app.js` | Shared client-side application logic |
| `styles.css` | Shared visual styles |
| `firebase-config.js` | Firebase web app configuration and family ID |
| `firestore.rules` | Firestore authorization rules |
| `sw.js` | Offline cache behavior |
| `tools/generate-icons.ps1` | Recreates the standard and maskable bottle icons |
| `initial-*.js`, `init_data*.txt` | Seed and import reference data, excluded from Hosting |

## Requirements

- Node.js, for local syntax checks
- Firebase CLI, installed with `npm install -g firebase-tools`
- Access to the `peepoo-tracker` Firebase project

## Local development

1. Authenticate with Firebase:

   ```powershell
   firebase login
   ```

2. Start the Hosting emulator from the repository root:

   ```powershell
   firebase emulators:start --only hosting
   ```

3. Open the local URL printed by the emulator.

The app loads Firebase modules directly from Google's CDN, so there is no package installation step for the application itself.

## Firebase setup

The checked-in Firebase web configuration targets the `peepoo-tracker` project. To use another Firebase project, update both `firebase-config.js` and `.firebaserc`, then configure these Firebase services:

- Enable Google as an Authentication sign-in provider.
- Create a Firestore database.
- Create `families/{FAMILY_ID}` with a `memberIds` array containing each permitted Firebase Authentication UID.
- Deploy the rules before using the application.

Firestore data is stored in these subcollections below the configured family document:

- `feeds`: bottle amount, milk type, and timestamp
- `breastfeeds`: breastfeeding timestamp
- `pumps`: pumped amount and timestamp
- `measurements`: growth measurement values and timestamp

## Verification and deployment

Run the quick local checks:

```powershell
node --check app.js
node --check sw.js
Get-Content firebase.json | ConvertFrom-Json | Out-Null
```

Deploy Hosting and Firestore rules:

```powershell
firebase deploy --only hosting,firestore:rules
```

This command publishes to the Firebase project configured in `.firebaserc`.

## Offline cache

`sw.js` precaches the application shell. When changing an asset referenced there, keep the path current and increment `CACHE_NAME` when users should discard prior cached versions.

## App icons

The icon artwork is generated with PowerShell and saved to the PNG files referenced by the web manifest:

```powershell
& .\tools\generate-icons.ps1
```

After regenerating an icon that is already precached, increment `CACHE_NAME` in `sw.js`.

## Agent guidance

Repository-specific guidance for coding agents and contributors is in [AGENTS.md](AGENTS.md).