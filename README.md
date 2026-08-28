# Impostor Games

Three free browser party games at **[impostorgames.com](https://impostorgames.com/)**. Everyone gets the same thing except one impostor, who gets something slightly different, and the group has to work out who is faking it.

| Game | Path | The twist | Needs |
|---|---|---|---|
| **Impostor Dance Game** | `/dance/` | Everyone hears the same 30-second song. The impostor hears a different one. | Headphones |
| **Impostor Word Game** | `/word/` | Everyone sees the same secret word. The impostor sees a vague hint. | Nothing |
| **Impostor Draw Game** | `/draw/` | Everyone draws the same word on one shared canvas. The impostor only has a hint. | Nothing |

3 to 20 players, each on their own phone, or all on one for the word and draw games' Pass the Phone mode. No app, no sign-up, no cost. Multiplayer runs on Firebase Realtime Database, so there is no backend to operate.

## Layout

```
www/                    everything that ships (firebase.json serves this as-is)
  index.html            the hub: game cards, SEO copy, FAQ
  dance/  word/  draw/  one folder per game: index.html + app.js + <game>.css
  shared/               code every game imports
    firebase.js         the one place FIREBASE_CONFIG lives
    analytics.js        cookie-free counters, production-gated
    auth.js/auth-ui.js  optional sign-in (Song Groups only, gates no gameplay)
    words/              one catalogue per locale, fetched not bundled
      index.js            loadCatalog(lang), and pickHint
      en.js  es.js        the words themselves
    played.js           per-device memory of words already dealt
    base.css            design tokens, buttons, cards, modals, lobby
    qrcode.js           vendored QR generator
  llms.txt              plain-language site description for AI crawlers
  sitemap.xml  robots.txt
  stats.html            private analytics dashboard
database.rules.json     RTDB security rules (deployed separately from hosting)
scripts/indexnow-ping.mjs   tells Bing and friends that pages changed
scripts/check-words.mjs     validates the word catalogues (run after editing one)
scripts/words-lib.mjs       accent folding the checker and its tests share
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

## Checking your names before you ship

```bash
npm run lint
```

One rule, `no-undef`, across the games, the shared modules and the maintenance scripts. It reads the code without running it and reports any name used that was never declared. No formatting rules and no style opinions, so a clean run means something and every finding is a real bug.

It exists because of a specific failure. A refactor removed `const meta = state.meta;` from the top of the dance game's `startPlayback`, leaving the round timer referencing a name that no longer existed. The line read perfectly, the file parsed, the app booted, and **the browser console stayed empty**, because the throw happened inside a `setInterval`: a failed tick is silently discarded and the next one is scheduled regardless. The visible symptom was a progress bar that never filled and rounds that never advanced to voting, and it was live for two weeks. `no-undef` finds that in seconds.

Run it after any refactor that moves code between functions, which is exactly where this class of bug comes from.

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

### Pass the Phone (word and draw games)

The word and draw games each have two modes, picked by the host in the lobby. **Everyone has a Phone** is the default and is the room game described above. **Pass the Phone** is one device shared by the whole group, and it runs entirely in the tab: no room, no network, no second client.

The trick that keeps it cheap is that it builds `state.players` and `state.meta` in **exactly the shape the room listener produces**. Every screen downstream reads those two and nothing else, so the card, the impostor banner, the category picker and the reveal all work unchanged. Handing the phone over is literally `state.myId = <that player>`, after which the existing card code deals them the right hand.

Things worth knowing before changing it:

- **The mode lives on `state.mode`, not in `meta`.** Dance stores its mode in the room's `meta.mode`; the word game cannot, because switching to Pass the Phone *deletes the room*, so there is no meta left to hold it. It resets to `online` whenever a sitting ends, so every new game starts on the room mode.
- **`state.roomCode` stays `null` for the whole mode**, deliberately. Every Firebase call site already guards on it, so a guard missed somewhere degrades into doing nothing rather than writing to `rooms-word/null`.
- **Detach the room listener before deleting the room**, or the `onValue` null-handler fires and sends the host home with a "Room closed" toast.
- **Nobody is the host.** Local players carry `isHost` and `isMe` false, so no row gets a Host tag, a YOU pill or a `(YOU)` at the reveal. The device still drives the round; that is `state.isHost`, which is unrelated.
- **The roster persists in `localStorage`** under `imp_roster_<game>`, names only. Row one is always overwritten with the nickname typed on the Create screen.
- **The lobby settings card is shared across all three games.** `.settings-card`, `.mode-block`, `.set-row` and `.set-row-value` live in `shared/base.css`. Game mode keeps a heading and a full-size trigger, because it is the one setting that decides what the sitting is; everything under it is one line, label left and value right. Three gotchas: word's and dance's cards are flex columns with a gap of their own, so `.settings-card` sets `gap: 0` or the rows drift off the rules they should sit flush against; `.cat-label` carries a 12px `margin-bottom`, which collapses over any smaller `margin-top`, so both halves of a gap have to be set; and `.card` and `.settings-card` both pad 20px at the sides, so `.section-divider`'s negative margin has to match that exactly or the rule stops short of the edges. Dance's DJ Mode is the one place a row cannot carry the value: the host picks two named tracks, so the row steps aside and the pickers keep their full width.
- **The card's CSS is shared.** `.flip-*` and `.pass-*` live in `shared/base.css`, not in either game's stylesheet, so the two cannot drift apart on how the card looks or turns. Both faces are written with two class selectors (`.flip-face.flip-back`) on purpose: each face also carries a game-level card class defined in the per-game stylesheet, which loads *after* `base.css`, and a single-class rule loses its padding to it.

Privacy in this mode is entirely a UI guarantee, since every card appears on a phone the whole group can see. Four rules hold it up, and all four are load-bearing:

1. The card's **back face is empty until a swipe passes 45°**, and empties again if that swipe is abandoned. A face turned less than 90° points away and cannot be read, so the word only enters the DOM once someone has committed to the gesture that reveals it.
2. **Tapping does not reveal.** Only a swipe, or a keyboard activation (a `click` with `detail === 0`), which is how assistive tech gets through.
3. **A turned card cannot be turned back**, and the card is emptied the instant Pass is tapped, then turned back only while faded out. No frame of it survives to the next player.
4. **Back is trapped** for the whole sitting, via one pushed history entry re-pushed on every intercepted press. Arming checks whether its marker is already the current entry, so repeat rounds do not pile up entries. Without this, a back swipe walks straight onto the card just handed over.

Nothing is persisted mid-sequence, so a reload drops to the home screen rather than resuming into somebody else's card.

Two touch details in here are load-bearing on a phone and easy to undo by accident:

- **The roster's buttons fire on a recognised tap, not on `pointerdown`.** On a touch screen `pointerdown` fires the instant a finger lands, so a fingertip resting on the pencil to scroll used to open a rename before the page had moved. A tap now means down and up on the same control within 10px, cancelled by `pointercancel`, which the browser fires the moment it claims the gesture for panning. The handlers are delegated to `#players-list` rather than bound per row, because these actions rebuild the list and a per-row binding can lose its element mid-gesture. Nothing else on the row edits: the pencil is the only way in.
- **`touch-action: manipulation` on buttons, tiles and triggers.** iOS Safari ignores `user-scalable=no`, so double-tap-to-zoom stays live and every tap waits to see whether a second one follows; right after another gesture that wait can swallow the tap entirely. Page pinch zoom is untouched. For the same reason `#btn-pass-next` fades in without moving, and sets no transform of its own: an id selector setting one outranks `.btn.is-pressed` and silently removes the press feedback from the button players tap most.
- **Pass to Next Player is driven by pointer events, not by `click`.** It gets tapped immediately after a drag, and on Android Chrome that is enough to lose the tap: the swipe finishes in the browser's gesture pipeline, and a tap arriving while that is still settling is swallowed there. The touch still produces `pointerdown` and `pointerup`, so the button lights up under the thumb and nothing happens, which is precisely how it was reported. `click` stays wired for keyboard and assistive tech. iOS does not behave this way, so this will look like dead code on an iPhone.

  The draw game generalises this into `wireTap(btn, fn)` and drives every forward button through it: Pass to Next Player, Done, Undo and Reveal Impostor. **Done** and **Undo** are the ones that matter, because they are tapped straight after drawing a stroke and so hit exactly the same thing, on the online path too, where the bug was equally real and simply never reported. `wireTap` swallows the `click` that a recognised tap still produces, and it does so on `document` in the capture phase rather than per button. That is not over-engineering: acting on `pointerup` means the screen can change before the click is dispatched, so the click lands on whatever is under the finger by then. Reveal Impostor and Play Again sit in the sticky bar at the foot of consecutive screens, and the click aimed at Reveal was arriving on Play Again and restarting the round. It also covers the non-idempotent case, where one tap on Undo removed two strokes. **Test these buttons by modelling what touch really does** — pointerdown, pointerup, then a click aimed at whatever is under that point a beat later. Synthetic pointer events alone never produce the trailing click, so they cannot see this class of bug.

#### What the draw game adds

The word game has nothing to do on the phone once the cards are dealt, so its round screen is a list of names. Draw has the canvas, so **the phone goes round twice**: once for the cards, then once per drawing turn.

- **There is no clock, and no screen between turns.** Done hands the pen straight to the next player: `meta.turn` moves on, `state.myId` and `state.myC` become theirs, and the pill changes to their name. The phone crosses the table with the canvas already live. `meta.turnAt` stays `null` for the whole mode, so the turn ticker never starts and `renderTurnBar`'s existing `if (turnAt)` branch leaves the timer, its tick and its urgency flash off by themselves. The mute button is hidden too, since the only thing it mutes is that tick.

  The 45-second expiry exists online to stop a player who has closed their tab stalling the room forever. Nobody can vanish from a phone that is being handed round, so the timer has no job here, and a countdown started when the previous player tapped Done would burn down while the phone was still in the air.
- **Done is guarded against a double tap**, which has no counterpart online. Online the button stops being yours the moment the turn moves on. Locally the next drawer is the same device, so `canDraw()` is true again immediately and a second tap 200ms later would hand the pen straight past somebody, silently, with nobody noticing until the reveal. A 350ms lockout covers a double tap without touching a real second press, which needs the phone to change hands first and so is seconds away.
- **Turn order is roster order locally**, not the shuffle the room game uses. The phone is going round a circle of people sitting together, and a shuffled order means someone announcing who is next before every pass. It leaks nothing: the impostor is drawn from an independent shuffle, so a seat says nothing about it. The room game keeps its shuffle, where it exists to stop the impostor always drawing first.
- **The play screen carries no word.** Online it prints "The word is X" at the foot of the canvas as a private reminder on your own phone. On a shared one that line is face-up on the table for the whole group, which hands the impostor the answer the moment anyone else takes a turn. Locally it reads "Draw what was on your card" instead. Players remember it, exactly as they would a physical card.
- **The turn pill always names the drawer**, rather than saying "Your turn" as it does online. On a shared phone that pill is read by everybody at once, and with no handover screen it is the only thing saying whose go it is. The name form already existed for spectators; locally it is simply always used. `(You)` comes off the turn strip for the same reason: `state.myId` is only ever whoever is holding the phone this turn.
- **Strokes never reach Firebase.** They already lived in a local `Map` that the room game merely mirrors, so the local path just mints its own ids and skips the writes (`live.ref` is `null`, which is what `flushStroke` checks). Undo is scoped to the current turn by clearing `myStrokeIds` in `takeLocalTurn`, so nobody can erase the previous player's work.
- **No ballot.** A secret vote needs a screen each. Rounds over leads to a "Find the Impostor" screen carrying the finished drawing, which is the evidence the argument is about, and the group talks it out and taps Reveal, the same shape the dance game ends on. The reveal's verdict, tally and ballot sections are hidden, because with no votes there is nothing to report.
- **An ink legend replaces the ballot on both end screens.** During play the turn strip maps colours to people, and it leaves with the play screen — precisely when the group starts arguing about whose line the red one was. `renderInkLegend()` puts that mapping back on the rounds-over screen and on the reveal, in turn order so it reads in the order the drawing was built. It deliberately does **not** reuse `.vote-row`: that class is in `shared/press.js`'s selector, so a non-interactive row wearing it would light up under a thumb and do nothing. `.legend-row` is flatter for the same reason, since a row that looks like a button people cannot press reads as a vote that will not register. Online the ballot already names everyone in their own ink, so the legend is hidden there.
- **Rounds default to 1 locally, not 2.** Every turn is also a handover, so the same setting is twice the sitting: five players at two rounds is ten turns and ten passes. The lobby stepper still goes to 5.

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
- **The song downloads during the countdown, not at zero.** `runCountdown` calls `preloadRoundAudio`; `startPlayback` only seeks and plays. The room already carries both track URLs when the phase turns to `countdown`, so this costs no extra request. It matters because the preview is about 1 MB and every device in the room hits zero within milliseconds of every other, so without it they all pull that megabyte at the same instant over the same wifi. It also makes a failure recoverable for free: nothing is running yet, so the loader just retries and the player never knows. Only the UI stays at zero, because naming the song or showing the impostor banner early would give the round away.
- **A player whose song fails to load must never be left in silence.** They cannot say so without outing themselves as the impostor, so `startPlayback` listens for `error` and puts `AUDIO_LOAD_TIMEOUT_MS` under it for loads that fire no event at all. The overlay's tap re-runs the load and re-seeks to the shared `startAt`, so a recovered player rejoins in step instead of restarting the song. Counted as `audio_load_failed`.
- **The lobby hint is not yours to write directly.** `start-hint` time-shares with the rotating "keep your screen on" tip, so go through `setLobbyStatus` and stand the rotation down first. Writing `textContent` means the tip paints over your message within seconds and then flips back to a stale one.

**Words** live in `www/shared/words/`, one file per locale, shared by the word and draw games. See [Editing the word catalogue](#editing-the-word-catalogue) below, because there are rules that are not obvious.

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

- **A Pass the Phone round is never counted as `started`, on purpose**, in the word game or the draw game. There is no room by then and nobody joined, so firing `rooms/started` would count a start under a room that no longer exists, which is exactly what corrupts the gaps above. `games/modes/{online,passphone}` is what tells the two apart, so read any `games/*` number against the mode split rather than assuming it is online play. This is not a gap to be closed later.
- **`rooms/created` does still fire for those sittings**, and that is honest rather than a leak: the mode picker lives in the lobby, and reaching the lobby genuinely creates a room, which is then deleted when the group switches. Anyone who switches therefore adds one to `created` with no `started` behind it, so the created-to-started gap carries them. Measured, not assumed: the 08-05 verification round moved `created` 21 → 22 and left `started` at 9.

QR deep links carry `&s=qr` purely so a scan can be told apart from a pasted link, which are otherwise the same URL.

Shipped 2026-08-03 (UTC). The first `created`, `joined2` and `joins/qr` in the data are each **+1 from the post-deploy verification**, not real users; subtract one from each when reading the earliest numbers.

## Editing the word catalogue

`www/shared/words/en.js` holds 550 words across seven categories, and each locale gets its own file beside it. The games call `loadCatalog(lang)` from `words/index.js`, which fetches exactly one of them, so a Spanish player never downloads the English 30KB. The category KEYS stay English in every locale: they are the cross-client value in `meta.categories`, the played-ledger key and the analytics counter key, so only the display names are translated. Every entry is `{ w, h, h2 }`: the secret word, and **two** vague hints. The impostor is shown one of them, picked fresh each round by `pickHint()`, so a word that comes round again still plays differently and nobody learns that "Cheesy means Pizza".

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
node scripts/check-words.mjs          # every locale
node scripts/check-words.mjs es       # just one
node scripts/check-words.mjs --strict # before shipping a locale
```

It prints the per-category counts and fails on duplicates across categories, missing fields, hints that leak the word, over-long hints and category sizes that drifted from the expected table. Update `EXPECTED` in that script when you deliberately change a size.

English is the reference locale and its sizes are enforced exactly. Another locale is written a category at a time, so a short or empty category there is reported and does not fail the run. `--strict` turns those into errors, which is the gate to run before a locale ships.

### Not repeating words

Two layers, both host-side, because only the host picks words.

1. **Within a room**, `meta/played` records every word dealt and `pickWord()` draws only from what is left. When the pool is genuinely exhausted it wipes the buckets and starts over.
2. **Across rooms**, `shared/played.js` keeps what this device has dealt in `localStorage` (`played:word`, `played:draw`, and `played:word:<lang>` for languages other than English) and hands it to `pickWord()` as a second exclusion list. Without this a new room starts blank and round 1 can deal the word the group had an hour ago.

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
