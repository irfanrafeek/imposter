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
python3 scripts/dev-server.py
```

Then open http://localhost:8123/. Any static server works, but it must serve the `www` directory, because the games import `/shared/*` by absolute path.

Use that script rather than plain `python3 -m http.server`. The built-in server sends no `Cache-Control`, so browsers heuristically cache CSS and JS: edit a stylesheet, reload, and you can get the old file with the new markup, which renders as a half-broken page and looks like a design bug rather than a stale asset. The script mirrors what `firebase.json` already sends in production, which is `no-cache, no-store, must-revalidate` for everything except images.

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

### Pass the Phone (word game)

The word game has two modes, picked by the host in the lobby. **Everyone has a Phone** is the default and is the room game described above. **Pass the Phone** is one device shared by the whole group, and it runs entirely in the tab: no room, no network, no second client.

The trick that keeps it cheap is that it builds `state.players` and `state.meta` in **exactly the shape the room listener produces**. Every screen downstream reads those two and nothing else, so the card, the impostor banner, the category picker and the reveal all work unchanged. Handing the phone over is literally `state.myId = <that player>`, after which the existing card code deals them the right hand.

Things worth knowing before changing it:

- **The mode lives on `state.mode`, not in `meta`.** Dance stores its mode in the room's `meta.mode`; the word game cannot, because switching to Pass the Phone *deletes the room*, so there is no meta left to hold it. It resets to `online` whenever a sitting ends, so every new game starts on the room mode.
- **`state.roomCode` stays `null` for the whole mode**, deliberately. Every Firebase call site already guards on it, so a guard missed somewhere degrades into doing nothing rather than writing to `rooms-word/null`.
- **Detach the room listener before deleting the room**, or the `onValue` null-handler fires and sends the host home with a "Room closed" toast.
- **Nobody is the host.** Local players carry `isHost` and `isMe` false, so no row gets a Host tag, a YOU pill or a `(YOU)` at the reveal. The device still drives the round; that is `state.isHost`, which is unrelated.
- **The roster persists in `localStorage`** under `imp_roster_word`, names only. Row one is always overwritten with the nickname typed on the Create screen.

Privacy in this mode is entirely a UI guarantee, since every card appears on a phone the whole group can see. Four rules hold it up, and all four are load-bearing:

1. The card's **back face is empty until a swipe passes 45°**, and empties again if that swipe is abandoned. A face turned less than 90° points away and cannot be read, so the word only enters the DOM once someone has committed to the gesture that reveals it.
2. **Tapping does not reveal.** Only a swipe, or a keyboard activation (a `click` with `detail === 0`), which is how assistive tech gets through.
3. **A turned card cannot be turned back**, and the card is emptied the instant Pass is tapped, then turned back only while faded out. No frame of it survives to the next player.
4. **Back is trapped** for the whole sitting, via one pushed history entry re-pushed on every intercepted press. Arming checks whether its marker is already the current entry, so repeat rounds do not pile up entries. Without this, a back swipe walks straight onto the card just handed over.

Nothing is persisted mid-sequence, so a reload drops to the home screen rather than resuming into somebody else's card.

Two touch details in here are load-bearing on a phone and easy to undo by accident:

- **The roster's buttons fire on a recognised tap, not on `pointerdown`.** On a touch screen `pointerdown` fires the instant a finger lands, so a fingertip resting on the pencil to scroll used to open a rename before the page had moved. A tap now means down and up on the same control within 10px, cancelled by `pointercancel`, which the browser fires the moment it claims the gesture for panning. The handlers are delegated to `#players-list` rather than bound per row, because these actions rebuild the list and a per-row binding can lose its element mid-gesture. Nothing else on the row edits: the pencil is the only way in.
- **`touch-action: manipulation` on buttons, tiles and triggers.** iOS Safari ignores `user-scalable=no`, so double-tap-to-zoom stays live and every tap waits to see whether a second one follows; right after another gesture that wait can swallow the tap entirely. Page pinch zoom is untouched. For the same reason `#btn-pass-next` fades in without moving, and sets no transform of its own: an id selector setting one outranks `.btn.is-pressed` and silently removes the press feedback from the button players tap most.

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

### When songs fail to load

Apple's API fails a few percent of the time, which is normal for a free keyless service and not something to fix. Roughly 5% of individual requests fail, but only about 0.6% of rounds are actually blocked, because the pickers just move on to another song. Do not read the raw `errors/songFetch` tally as a problem count. `errors/song_load_failed` is the one that means a host pressed Start and got nothing.

What the code guarantees, and why each part is there:

- **Every picker gives up early.** `pickPair`, `pickDistinctSongs`, `pickPairFromGroup`, `pickDistinctFromGroup` and `autoPickContrastTrack` all stop at `MAX_SONG_ATTEMPTS` tries or a `SONG_BUDGET_MS` deadline, whichever comes first. The count catches a fast-failing network, the clock catches a slow one where each request burns its full 6s abort timeout. Without both, a flaky connection meant minutes of a dead Start button.
- **The silent retry only fires on a fast failure.** Past `FAST_FAIL_MS` the first sweep was slow rather than blipping, and a second sweep would only double the wait.
- **Errors name the real culprit.** `songLoadError()` splits offline from service-not-responding off `navigator.onLine`, and the counters follow (`song_load_offline` vs `song_load_failed`). Blaming the host's connection for Apple's outage sends them off to fight their own wifi.
- **A player whose song fails to load must never be left in silence.** They cannot say so without outing themselves as the impostor, so `startPlayback` listens for `error` and puts `AUDIO_LOAD_TIMEOUT_MS` under it for loads that fire no event at all. The overlay's tap re-runs the load and re-seeks to the shared `startAt`, so a recovered player rejoins in step instead of restarting the song. Counted as `audio_load_failed`.
- **The lobby hint is not yours to write directly.** `start-hint` time-shares with the rotating "keep your screen on" tip, so go through `setLobbyStatus` and stand the rotation down first. Writing `textContent` means the tip paints over your message within seconds and then flips back to a stale one.

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

- **The funnel is silent for word-game Pass the Phone rounds, on purpose.** There is no room and nobody joins, so firing `rooms/*` or `joins/*` there would count rooms that were never created and joins that never happened, which is exactly what corrupts the gaps above. `games/modes/{online,passphone}` is what tells the two apart, so read any `games/*` number against the mode split rather than assuming it is online play. This is not a gap to be closed later.

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
