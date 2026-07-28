# Impostor Games

Three free browser party games at **[impostorgames.com](https://impostorgames.com/)**. Everyone gets the same thing except one impostor, who gets something slightly different, and the group has to work out who is faking it.

| Game | Path | The twist | Needs |
|---|---|---|---|
| **Impostor Dance Game** | `/dance/` | Everyone hears the same 30-second song. The impostor hears a different one. | Headphones |
| **Impostor Word Game** | `/word/` | Everyone sees the same secret word. The impostor sees a vague hint. | Nothing |
| **Impostor Draw Game** | `/draw/` | Everyone draws the same word on one shared canvas. The impostor only has a hint. | Nothing |

3 to 20 players, each on their own phone. No app, no sign-up, no cost. Multiplayer runs on Firebase Realtime Database, so there is no backend to operate.

## Layout

```
www/                    everything that ships (firebase.json serves this as-is)
  index.html            the hub: game cards, SEO copy, FAQ
  dance/  word/  draw/  one folder per game: index.html + app.js + <game>.css
  shared/               code every game imports
    firebase.js         the one place FIREBASE_CONFIG lives
    analytics.js        cookie-free counters, production-gated
    auth.js/auth-ui.js  optional sign-in (Song Groups only, gates no gameplay)
    words.js            the word catalogue shared by word and draw
    base.css            design tokens, buttons, cards, modals, lobby
    qrcode.js           vendored QR generator
  llms.txt              plain-language site description for AI crawlers
  sitemap.xml  robots.txt
  stats.html            private analytics dashboard
database.rules.json     RTDB security rules (deployed separately from hosting)
scripts/indexnow-ping.mjs   tells Bing and friends that pages changed
android/  capacitor.config.json   native wrapper, see ANDROID.md
design/                 source artwork, not deployed
WORKLOG.md              the project journal: decisions and why, newest first
```

**No build step.** Plain ES modules, loaded straight from the browser. What you edit is what ships.

## Running it locally

```bash
python3 -m http.server 8123 --directory www
```

Then open http://localhost:8123/. Any static server works, but it must serve the `www` directory, because the games import `/shared/*` by absolute path.

Two things to know about local runs:

- **The app always talks to production Realtime Database.** Rooms are ephemeral and expire on their own, so testing against it is fine, but the rooms you create are real.
- **Analytics writes nothing outside production.** The gate in `shared/analytics.js` allows `impostorgames.com` and the Capacitor WebView only. Preview channels, `localhost` and `file://` are all treated as testing.

## Data model

Each game has its **own room namespace**, so all three can hand out the same 4-character code without colliding:

| Game | RTDB path |
|---|---|
| Dance | `rooms/{CODE}` |
| Word | `rooms-word/{CODE}` |
| Draw | `rooms-draw/{CODE}` |

A room holds `meta` (phase, host, impostor ids, the secret, timing stamps) and `players/{playerId}`. Draw adds `strokes/` and `votes/`.

Phase transitions drive screen routing on every client. Only the host writes phase changes; everyone else reacts to the listener. Dance and word use `onValue` on the whole room. Draw uses `onChildAdded`/`onChildChanged` for strokes specifically, so a long drawing does not re-send every stroke on every change.

Presence is `onDisconnect().remove()`, so closing a tab drops you from the lobby. A room with no deliberate activity for 15 minutes is considered dead and its code can be recycled.

## Deploying

Hosting and database rules are **separate deploys**, and each is manual:

```bash
firebase deploy --only hosting
```

```bash
firebase deploy --only database
```

After a hosting deploy that changed page content, tell the search engines:

```bash
node scripts/indexnow-ping.mjs
```

To test on a real URL without touching production, use a preview channel:

```bash
firebase hosting:channel:deploy my-test --expires 7d
```

Bump the version stamp (`id="app-version"` in each `index.html`) on every edit. It is hidden on the page but it is how you confirm which build is actually live.

## Firebase setup, for a fresh clone

You need a Firebase project with Realtime Database enabled. The free tier covers a busy party game comfortably.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com), then **Build → Realtime Database → Create database**, picking a region near your players.
2. **Project settings → Your apps → Add app → Web**, and copy the `firebaseConfig` object.
3. Paste it into **`www/shared/firebase.js`**. Make sure `databaseURL` is present. Firebase's snippet sometimes omits it; for a non-US region it looks like `https://<project-id>-default-rtdb.<region>.firebasedatabase.app`.
4. Deploy the rules with `firebase deploy --only database`. Do not hand-write them in the console, because `database.rules.json` in this repo is the source of truth. It covers six top-level keys: `rooms`, `rooms-word`, `rooms-draw`, `analytics`, `users` and `feedback`. Each game node is `.read: false` at the top with read and write allowed beneath `$code`, so knowing a room code gets you that room and nothing else. Listing every room is denied.

That trust level suits friends at a party. Anything more public wants Anonymous Auth and a tighter scope.

## Music, words and analytics

**Songs** come from Apple's iTunes Search API: free, no key, 30-second previews. Categories live in `CATEGORIES` at the top of `www/dance/app.js`, each entry a `"track artist"` search string. Roughly 5% of tracks have no preview because of label deals, so the picker retries. Always validate new entries against the real API before committing; a large share of plausible-looking queries silently return nothing.

**Words** live in `www/shared/words.js`, shared by the word and draw games. Each word carries its own vague hint, which is what the impostor sees. The hint is never the category, since the category is shown to the whole room in the lobby.

**Analytics** are aggregate counters under `analytics/{music,word,draw,hub}`: visits, games, categories, per-round leaderboards and host country. No cookies, no identifiers, nothing per-player. Read them at `/stats.html`.

## Known limitations

- **No host migration.** If the host disconnects, the room ends and players start a fresh lobby. Picking the earliest-joined remaining player would fix it.
- **Room state does not survive a refresh.** Reloading drops you from the lobby, though the room code stays valid and you can rejoin.
- **Draw has no chat yet.** Discussion happens on whatever call you are already on.

## More documentation

- **[WORKLOG.md](WORKLOG.md)** is the durable record: every change, the reasoning behind it, and how it was verified. Newest entries first. Read this before changing behaviour, because most decisions that look arbitrary were deliberate.
- **[ANDROID.md](ANDROID.md)** covers the Capacitor Android build.
- **[NATIVE_APP_NOTES.md](NATIVE_APP_NOTES.md)** covers packaging the same `www/` as a native app.
