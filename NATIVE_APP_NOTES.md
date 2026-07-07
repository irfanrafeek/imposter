# Native app — decision & status record

Context notes for the Android/iOS wrapper work. This is the "what & why & where
we are" record; [ANDROID.md](ANDROID.md) is the step-by-step build/release guide.
Last updated: 2026-06-27 (app version stamp `v2026.06.27.4`).

## Goal

Ship the existing web game as native apps **from one codebase**, Android first,
iOS later. The web app stays the single source of truth. Decided against
hand-written WebView shells and against TWA (no iOS path) in favor of
**Capacitor**, bundling web assets locally (store-safe) rather than loading a
remote URL.

## Current status (2026-06-27)

- ✅ Capacitor Android project scaffolded and **verified working on a real
  Pixel 9** (create/join room, Firebase multiplayer, audio previews, QR).
- ✅ Web app deployed with the optimizations (WebP images, v2026.06.27.4).
- ✅ App icon + splash generated from the logo.
- ✅ App Links wired; debug-keystore fingerprint live in `assetlinks.json`.
- ⏸️ **Play Store publishing deliberately deferred** — the user wants website
  engagement first, then publish. Running as web-app-only for now.
- Everything native is **dormant for web users** — `firebase deploy` only ships
  `www/`; the `android/` folder, Capacitor, and node deps never reach the site.

## What changed and why

### Repo restructure
- Web app moved from repo root into **`www/`** (Capacitor `webDir`).
- `firebase.json` `hosting.public` → `"www"`. Removed the `**/.*` ignore glob so
  `www/.well-known/assetlinks.json` deploys (it starts with a dot).

### Capacitor scaffolding
- `package.json`, `capacitor.config.json` (appId `com.impostorgames.app`,
  appName "Impostor Dance Game", webDir `www`).
- `android/` native project (committed). Plugin: `@capacitor/app` (deep links).
- Capacitor **6.x**. iOS later: `npx cap add ios` (needs a Mac + Xcode).

### QR / deep-link routing — the one real code change (the "host on app,
friends on web" requirement)
- Added `SHARE_BASE = 'https://impostorgames.com'` constant in `www/index.html`.
  QR/share URLs use it instead of `location.origin`. **Why:** inside the app the
  WebView origin is `https://localhost`, so a QR built from `location.origin`
  would be useless to friends. Hardcoding the public base means a host on the app
  still generates a QR that works for everyone.
- Deep-link handling split into shared `routeJoinCode()` called by:
  - `handleWebJoinDeepLink()` — reads `location.search` (website path).
  - `handleNativeJoinDeepLink()` — uses `@capacitor/app` `appUrlOpen` +
    `getLaunchUrl` (app path, since the code never appears in `location.search`).
- **Routing outcome:** scan a room QR → no app installed opens the website and
  plays on web; app installed → Android App Links open it in the app. QR always
  encodes a plain `https://` URL (never a custom scheme) — that's what makes the
  web fallback automatic.

### App Links
- `AndroidManifest.xml`: `<intent-filter android:autoVerify="true">` for
  `https://impostorgames.com`.
- `www/.well-known/assetlinks.json` holds the **debug keystore** SHA-256
  (`D5:1A:5C:...:C1:84`). ⚠️ The **release / Play App Signing** fingerprint must
  be added to the array after the first Play Console upload, or App Links won't
  open the production-signed app.

### App icon & splash
- Generated at all densities via `@capacitor/assets` from `resources/icon.png`
  (upscaled from `www/logo.png`). Regenerate with
  `npx @capacitor/assets generate --android`.

### Image optimization (also benefits the website)
- Converted PNGs → **WebP q=80**; resized `friends` to 473×512 (was displayed at
  320 but stored at 946×1024).
- Runtime image weight **920 KB → ~125 KB** (~86% smaller); on-disk total 268 KB.
- **`logo.png` kept** — only for `og:image` / Twitter card / JSON-LD in `<head>`
  (some social scrapers mishandle WebP). Users load `logo.webp`.

## Ship / deploy model (two separate manual steps, both run by the user)

- **Web:** edit `www/` → `firebase deploy`. Bump the version stamp on every edit.
- **App:** edit `www/` → `npx cap copy android` (or `cap sync` if plugins change)
  → build/upload in Android Studio. The only duplication is the publish step.

## Open decisions / pending (for future me)

1. **Play Store publish** — on hold until engagement. When resumed, first tasks:
   512×512 icon + 1024×500 feature graphic (from logo), store copy, **privacy
   policy page at impostorgames.com/privacy** (app sends feedback text + coarse
   country to Firebase — legally required), release signing in Gradle.
2. **Personal vs Organization Play account** — unresolved. Personal accounts
   created after 2023-11-13 must run a closed test with ~12 testers for 14 days
   before production. Org accounts are exempt. This changes the rollout timeline.
3. **Release App Links fingerprint** — add Play App Signing SHA-256 to
   `assetlinks.json` + redeploy after first upload.
4. **iOS** — not started; same repo, `npx cap add ios` when there's a Mac+Xcode.

## Key files

| Path | Purpose |
|---|---|
| `www/` | The actual app (single source of truth for web + native) |
| `www/index.html` | Whole app; `SHARE_BASE`, `routeJoinCode`, version stamp live here |
| `www/.well-known/assetlinks.json` | App Links fingerprints (debug only so far) |
| `capacitor.config.json` | appId / appName / webDir |
| `android/` | Generated native project |
| `firebase.json` | Hosting serves `www/` |
| `ANDROID.md` | Build/release + App Links how-to |
| `resources/icon.png` | Source for icon/splash generation |

## Relevant commits

- `6c7df76` — Capacitor Android wrapper (one codebase) + WebP image shrink
- `090b422` — App icon from logo + debug-keystore App Links fingerprint
