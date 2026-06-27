# Android app (Capacitor wrapper)

The Android app is a thin [Capacitor](https://capacitorjs.com) shell around the
**same web app** in [`www/`](www/). There is one codebase: edit `www/index.html`,
and both the website and the app get the change. iOS can be added later the same
way (`npx cap add ios`) from this same repo.

## How it fits together

- `www/` — the actual game (single `index.html` + images). Served on the web by
  Firebase Hosting, and bundled into the app by Capacitor.
- `capacitor.config.json` — `appId` `com.impostorgames.app`, `webDir` `www`.
- `android/` — generated native project (open in Android Studio to build/release).
- `package.json` — Capacitor deps + helper scripts.

## One edit, two targets

After editing anything in `www/`:

- **Web:** `firebase deploy` → live on impostorgames.com.
- **App:** `npx cap copy android` (or `npx cap sync android` if plugins changed)
  → then build a new release in Android Studio and upload to Play Console.

## Prerequisites (one-time, your machine)

Building requires tools not needed for web work:

1. **Android Studio** (bundles the Android SDK + a JDK).
2. Open the project: `npx cap open android` (or open the `android/` folder in
   Android Studio). Let Gradle sync.

## App icon & splash (optional but recommended)

Default Capacitor icons are used until you replace them. Easiest path:

```bash
npm i -D @capacitor/assets
# put a square 1024x1024 icon at resources/icon.png (and optional splash.png)
npx capacitor-assets generate --android
```

## Deep links / QR (host on app → friends on web)

Already wired:

- QR codes always encode `https://impostorgames.com/?join=CODE` (see `SHARE_BASE`
  in `www/index.html`) — never the app's internal `localhost` origin. So a host
  using the app produces a QR that works for everyone.
- Friends **without** the app: the link opens the website and they play on web.
- Friends **with** the app: Android App Links open it in the app. Handled in
  `www/index.html` via `@capacitor/app` (`appUrlOpen` / `getLaunchUrl`).

### Finishing App Links verification (required for in-app open)

1. Get your app's signing-key SHA-256 fingerprint:
   - **Play App Signing (recommended):** Play Console → your app → Setup → App
     integrity → copy the SHA-256 from the "App signing key certificate".
   - **Local debug testing:** `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android` and copy the SHA-256.
2. Paste it into `www/.well-known/assetlinks.json` (replace the placeholder).
   Add multiple fingerprints to the array if you test with debug + release keys.
3. `firebase deploy` so `https://impostorgames.com/.well-known/assetlinks.json`
   is live. Android verifies it automatically on install.

## Release checklist

- [ ] Bump `version` in `package.json` and `versionCode`/`versionName` in
      `android/app/build.gradle`.
- [ ] `npx cap sync android`.
- [ ] Real `assetlinks.json` fingerprint deployed.
- [ ] Android Studio → Build → Generate Signed App Bundle (.aab).
- [ ] Upload to Play Console (internal testing track first).
