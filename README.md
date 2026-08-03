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
    played.js           per-device memory of words already dealt
    base.css            design tokens, buttons, cards, modals, lobby
    qrcode.js           vendored QR generator
  llms.txt              plain-language site description for AI crawlers
  sitemap.xml  robots.txt
  stats.html            private analytics dashboard
database.rules.json     RTDB security rules (deployed separately from hosting)
scripts/indexnow-ping.mjs   tells Bing and friends that pages changed
scripts/check-words.mjs     validates the word catalogue (run after editing it)
scripts/check-played.mjs    tests the played-word memory
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

**Words** live in `www/shared/words.js`, shared by the word and draw games. See [Editing the word catalogue](#editing-the-word-catalogue) below, because there are rules that are not obvious.

**Analytics** are aggregate counters under `analytics/{music,word,draw,hub}`: visits, games, categories, per-round leaderboards and host country. No cookies, no identifiers, nothing per-player. Read them at `/stats.html`. Note the dance game's namespace is `music`, not `dance`.

### The room funnel

Visits and rounds alone cannot tell you *why* a busy day produced few games, because "nobody created a room" and "rooms filled up but never started" look identical from outside and need opposite fixes. The stages in between close that gap:

```
rooms/created → joined2 → reachedMin → allReady → started
```

Read the gaps, not the bars. Each one is an abandonment reason and needs no counter of its own:

| Gap | Reads as |
| --- | --- |
| `created` − `joined2` | nobody ever joined the host |
| `joined2` − `reachedMin` | some joined, never enough to start |
| `reachedMin` − `allReady` | enough people, but they never readied up |
| `allReady` − `started` | all ready, the host never pressed Start |

Alongside them: `rooms/startFailed` (an event, not a stage, because a host can hit it and then retry), `joins/{code,link,qr,crossgame}` and `joinFail/{notFound,inProgress,full}`. Every key also has a `daily/<YYYY-MM-DD>/` copy.

Three things to know before changing any of it:

- **Stages are high-water marks, host side, once per room.** Nothing is counted on the way out, because most sittings end with a closed tab that runs no code, and an exit-time counter would under-count exactly the case worth measuring. Counting player side instead would multiply every stage by the group size.
- **`started` is hooked inside each game's `trackRound`**, not `fbStartGame`, because every successful start path already funnels through that one call, so the two cannot drift apart.
- **`joinFail` is hooked in `attemptCodeValidation`, not just `joinRoom`.** Validation is the real gate and returns before `joinRoom` is ever reached. Hooking only `joinRoom` leaves the counter reading near-zero while real users fail constantly. Both are instrumented and are mutually exclusive. A cross-game redirect is a successful hand-off, not a failed join, so it is not counted.

QR deep links carry `&s=qr` purely so a scan can be told apart from a pasted link, which are otherwise the same URL.

Shipped 2026-08-03 (UTC). The first `created`, `joined2` and `joins/qr` in the data are each **+1 from the post-deploy verification**, not real users; subtract one from each when reading the earliest numbers.

## Editing the word catalogue

`www/shared/words.js` holds 550 words across seven categories. Every entry is `{ w, h, h2 }`: the secret word, and **two** vague hints. The impostor is shown one of them, picked fresh each round by `pickHint()`, so a word that comes round again still plays differently and nobody learns that "Cheesy means Pizza".

| Category | Words | In draw? |
|---|---|---|
| Food | 100 | yes |
| Animals | 100 | yes |
| Everyday Objects | 100 | yes |
| Super Heroes | 50 | yes |
| Places | 100 | no |
| Movies & TV | 50 | no |
| Football | 50 | no |

The word game uses all seven. Draw uses only the four that are actually drawable in a 45-second turn, listed in `CATEGORY_GROUPS` at the top of `www/draw/app.js`. Adding a category to that array is what makes it drawable.

Rules for an entry, all enforced by the checker:

- **A word may appear in exactly one category.** This is the one that bites. The played ledger is keyed by category, so the same word in two of them can be dealt twice to a room that picked both. It is why the superhero names live in Super Heroes and not also in Movies & TV.
- A hint is one or two words, never contains the word or shares a stem with it, and is never a category name. The host's category pick is shown to the whole room, so that would tell the impostor nothing they don't already know.
- `h` and `h2` must differ. Hints repeating across *different* entries is fine and desirable: a hint that maps to exactly one word gives the game away.
- For the drawable categories, prefer words with a clear silhouette. Everyone else knows the word and has to prove it, so a word nobody can draw distinctly makes the round unwinnable for the crew.

After any edit:

```bash
node scripts/check-words.mjs
```

It prints the per-category counts and fails on duplicates across categories, missing fields, hints that leak the word, over-long hints and category sizes that drifted from the expected table. Update `EXPECTED` in that script when you deliberately change a size.

### Not repeating words

Two layers, both host-side, because only the host picks words.

1. **Within a room**, `meta/played` records every word dealt and `pickWord()` draws only from what is left. When the pool is genuinely exhausted it wipes the buckets and starts over.
2. **Across rooms**, `shared/played.js` keeps what this device has dealt in `localStorage` (`played:word`, `played:draw`) and hands it to `pickWord()` as a second exclusion list. Without this a new room starts blank and round 1 can deal the word the group had an hour ago.

Two things not to undo:

- The device history is **never written to the room.** Seeding `meta/played` would put hundreds of keys in a snapshot that `onValue` re-sends on every change, so every player would re-download it each time somebody tapped Ready.
- `reset` means one thing only: the *room* is out of words. Running dry on device history alone just drops the preference and falls back to room-only memory. Without that fallback a long night would wipe a ledger that still had words in it.

History is capped at 60% of each category, so it can never exclude everything and quietly stop working. Tests: `node scripts/check-played.mjs`.

## Known limitations

- **No host migration.** If the host disconnects, the room ends and players start a fresh lobby. Picking the earliest-joined remaining player would fix it.
- **Room state does not survive a refresh.** Reloading drops you from the lobby, though the room code stays valid and you can rejoin.
- **Draw has no chat yet.** Discussion happens on whatever call you are already on.

## More documentation

- **[WORKLOG.md](WORKLOG.md)** is the durable record: every change, the reasoning behind it, and how it was verified. Newest entries first. Read this before changing behaviour, because most decisions that look arbitrary were deliberate.
- **[ANDROID.md](ANDROID.md)** covers the Capacitor Android build.
- **[NATIVE_APP_NOTES.md](NATIVE_APP_NOTES.md)** covers packaging the same `www/` as a native app.
