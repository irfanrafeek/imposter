# Impostor Games

Three free browser party games at **[impostorgames.com](https://impostorgames.com/)**. Everyone gets the same thing except one impostor, who gets something slightly different, and the group has to work out who is faking it.

| Game | Path | The twist | Needs |
|---|---|---|---|
| **Impostor Dance Game** | `/dance/` | Everyone hears the same 30-second song. The impostor hears a different one. | Headphones |
| **Impostor Word Game** | `/word/` | Everyone sees the same secret word. The impostor sees a vague hint. | Nothing |
| **Impostor Artist** | `/draw/` | Everyone draws the same word on one shared canvas. The impostor only has a hint. | Nothing |

3 to 20 players, each on their own phone, or all on one for the word and draw games' Pass the Phone mode. No app, no sign-up, no cost. Multiplayer runs on Firebase Realtime Database, so there is no backend to operate.

## Layout

```
src/                    what you EDIT. `npm run build` compiles this into www/
  site.json             the manifest: pages, locales, versions, per-page <head>
  pages/                one template per page (hub, word, draw, dance)
    styleguide*.njk     the component gallery, and its specimens (#201)
  components/           head, FAQ, How to Play, the language switcher
    story.njk           one gallery specimen: rendered live, and as its source
    howto-lead.njk      the How to Play illustrations, and the marks over them
  content/<lang>/       every word a reader sees, one JSON per page per language
    en/  es/            en is the reference; es exists for the hub and word
  art/                  illustration masters. www/ ships processed copies built
                        by scripts/build-howto-lead.mjs; art/README.md says why
www/                    everything that ships (firebase.json serves this as-is)
  index.html            GENERATED from src/. Editing it here is overwritten.
  es/                   the Spanish pages, same templates and different content
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
  styleguide/           GENERATED. The component gallery; noindex, not in the
                        sitemap, loads no app.js. See "The component gallery".
  llms.txt              plain-language site description for AI crawlers
  sitemap.xml  robots.txt
  admin.html            private dashboard: the counters and the inbox
database.rules.json     RTDB security rules (deployed separately from hosting)
scripts/indexnow-ping.mjs   tells Bing and friends that pages changed
scripts/build-howto-lead.mjs  composes the How to Play illustrations from art/
scripts/check-words.mjs     validates the word catalogues (run after editing one)
scripts/words-lib.mjs       accent folding the checker and its tests share
scripts/check-played.mjs    tests the played-word memory
android/  capacitor.config.json   native wrapper, see ANDROID.md
design/                 source artwork, not deployed
WORKLOG.md              the project journal: decisions and why, newest first
```

The JavaScript has **no build step**: plain ES modules, loaded straight from
the browser, so `www/*/app.js` and `www/shared/*` are what ships.

The **HTML does** have one (#129). Every page under `www/` is generated from a
template in `src/pages/` plus a content file in `src/content/<lang>/`, so the
topbar, the FAQ and thirty-odd meta tags are written once instead of once per
page per language. `firebase.json` runs `npm run build` as a predeploy step, so
a hand-edit to a generated `index.html` survives exactly until the next deploy
and then vanishes. Edit `src/`.

```bash
npm run build          # write www/
npm run build:check    # render and compare, write nothing
npm run build:watch    # rebuild as you edit
```

`build:check` is the gate: it re-renders every page and compares against what is
committed, ignoring only whitespace, attribute order and HTML comments. It is
how a change meant to touch one page is proven not to have touched the others.

## Running it locally

```bash
python3 scripts/dev-server.py
```

Then open http://localhost:8123/. Any static server works, but it must serve the `www` directory, because the games import `/shared/*` by absolute path.

Use that script rather than plain `python3 -m http.server`. The built-in server sends no `Cache-Control`, so browsers heuristically cache CSS and JS: edit a stylesheet, reload, and you can get the old file with the new markup, which renders as a half-broken page and looks like a design bug rather than a stale asset. The script mirrors what `firebase.json` already sends in production, which is `no-cache, no-store, must-revalidate` for everything except images.

Two things to know about local runs:

- **The app always talks to production Realtime Database.** Rooms are ephemeral and expire on their own, so testing against it is fine, but the rooms you create are real.
- **Analytics writes nothing outside production.** The gate in `shared/analytics.js` allows `impostorgames.com` and the Capacitor WebView only. Preview channels, `localhost` and `file://` are all treated as testing.

## The component gallery

Open http://localhost:8123/styleguide/ once the dev server is up. It shows the design tokens and the shared components together, each specimen beside the markup that produces it. It is generated by the same build as every other page, so `npm run build:check` covers it.

It is two documents on purpose. `base.css` dresses an app rather than a page: `html, body { height: 100%; overflow: hidden }`, and everything inside a 480px `#app`. A gallery loading it directly could not scroll. So `/styleguide/` is the shell, holding the nav, the width toolbar and an iframe, and `/styleguide/frame/` holds the specimens under the real stylesheets.

The toolbar's three widths are 360, 390 and full, and the frame is an iframe rather than a narrowed element because `@media (max-width: 360px)` answers to the viewport and never to a container. 360 is the only narrow breakpoint in the whole stylesheet.

Two rules for adding to it:

- **Copy the markup from the page that ships it, never invent it.** A specimen that disagrees with the real screen is worse than no specimen, because it will be trusted. Where a component is a nunjucks macro, call the macro.
- **Nothing in the gallery may style a specimen.** If a component needs a rule to look right, that rule belongs in `shared/`.

The tokens are parsed out of the files that declare them, at build time, so one added appears with no second edit. All four `:root` blocks are listed: `shared/tokens.css`, the page-only set in `shared/page.css`, the hub's single override in `src/pages/hub.njk`, and the two chart hues in `admin.html`. A local token that reuses a shared name is flagged on its row with the value it departs from, which is how the hub's `--radius-lg` reads as the open decision it is (#142).

The page is served `noindex, nofollow` and is absent from the sitemap, which `scripts/sitemap.test.mjs` asserts. It is deliberately **not** disallowed in `robots.txt`: that would stop a crawler reading the page and therefore reading the noindex.

It sits in `site.json` under `internal`, a separate list from `pages`. Pages there are built and deployed but carry no manifest, no structured data, no cross-links and no sitemap entry. The list is separate rather than a flag so the four test files that iterate `site.pages` keep asserting exactly what they assert about the public site.

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

Bump the version stamp on every edit. It lives in `src/site.json` under `version`, from where the build writes it into every page, and it is hidden on the page but it is how you confirm which build is actually live.

## Firebase setup, for a fresh clone

You need a Firebase project with Realtime Database enabled. The free tier covers a busy party game comfortably.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com), then **Build → Realtime Database → Create database**, picking a region near your players.
2. **Project settings → Your apps → Add app → Web**, and copy the `firebaseConfig` object.
3. Paste it into **`www/shared/firebase.js`**. Make sure `databaseURL` is present. Firebase's snippet sometimes omits it; for a non-US region it looks like `https://<project-id>-default-rtdb.<region>.firebasedatabase.app`.
4. Deploy the rules with `firebase deploy --only database`. Do not hand-write them in the console, because `database.rules.json` in this repo is the source of truth. It covers six top-level keys: `rooms`, `rooms-word`, `rooms-draw`, `analytics`, `users` and `feedback`. Each game node is `.read: false` at the top with read and write allowed beneath `$code`, so knowing a room code gets you that room and nothing else. Listing every room is denied.

That trust level suits friends at a party. Anything more public wants Anonymous Auth and a tighter scope.

## Music, words and analytics

**Songs** come from Apple's iTunes Search API: free, no key, 30-second previews. Categories live in `CATEGORIES` at the top of `www/dance/app.js`, each entry a `"track artist"` search string. Roughly 5% of tracks have no preview because of label deals, so the picker retries. Always validate new entries against the real API before committing; a large share of plausible-looking queries silently return nothing.

**Validate with `node scripts/check-songs.mjs`**, which makes the same call the game makes and reports three things. Run it with `--strict` for a new pool, which turns all three into a non-zero exit instead of only the first.

`BROKEN` is no playable preview at all, and the round skips the song.

`BRITTLE` is exactly ONE playable preview: it works today with no fallback, and it is the shape of the only pool entry that has ever shown up in `errors/songMiss`.

`MISMATCH` is the one that matters, and the two above are blind to it. **The iTunes Search API always returns something for a plausible query.** A track that is not in the storefront comes back as a different track by the same artist, and a track that is in demand comes back as a karaoke version, a children's cover, a mashup or a soundalike act. All of them carry a playable preview and a clean bill of health. `Safaera Bad Bunny` returns five playable Bad Bunny songs and not one of them is Safaera. `Todo de Ti Rauw Alejandro` returns KIDZ BOP in the US, a duo called Yessia & Mario in Spain, and a third cover in Mexico. A wrong song is worse for a round than a missing one, because a missing one is silently skipped and a wrong one is played.

`mismatchReason()` in `scripts/song-pools.mjs` is the check, and it is a screen rather than a proof: the query is `Title Artist` with nothing marking where one ends. It asks four things, and every one of them was added because a real result defeated the version before it. Read the comment there before loosening any of it, and read `scripts/songs.test.mjs`, which pins each rule to the iTunes row that motivated it.

**It cannot judge the five Indian pools, and that is a fact about the pools.** Those are written `Title FilmName` rather than `Title Artist`, so the second half of the query is a film that iTunes puts in the track name (`Naatu Naatu (From "RRR")`) or nowhere at all (`Srivalli Pushpa` returns `Srivalli / Javed Ali`, which is correct). The first full English audit reported 185 mismatches; 181 were this, and 4 were real. Treat an artist-only failure in those pools as unproven rather than wrong, and read the title failures, which are still meaningful. Transliteration is a second source of noise there: `Anisutide` is returned as `Anisuthide` and `Aaradhike` as `Aaraadhike`, both correct. Making those pools follow the same convention as the rest is the real fix and belongs with #172, which is already about their over-qualified queries.

**A catalogue per language, one id namespace.** `www/dance/categories.js` holds one table keyed by language: English offers eleven pools under two headings, Spanish the four curated in #164 under one (#165). Two questions come out of it and it matters which you ask. `songCategoryIds(lang)` is *what that language's picker offers*, and is what the build holds to having a `category.<id>.name` in that locale's bundle. `ALL_SONG_CATEGORY_IDS` is *every id that must have a pool behind it, in any language*, and is what the validator, the build's pool gate and the load-time integrity check use. The two are deliberately not the same list: a room created in Spanish is played from the same `CATEGORIES` literal by a client whose own picker never offers that id, and a pool no picker offers yet still has to be validated or it rots in the dark, which is the whole lesson of #163.

Which pools a language offers is a data change in that one table. It is not a translation: Spanish does not get the eleven English pools with Spanish names on them, because the five Indian-language pools are dead weight for that audience and eleven rows to scroll is worse than four. The accepted cost is that an English host cannot pick Reggaeton and Urbano even though the pool is right there. Draw already works this way, offering four of the word catalogue's seven categories through `DRAWABLE`; the reason is a language rather than a drawability, and the shape is the same.

`default` sits in that table beside the groups rather than as one constant in `app.js`, because a default outside the language's own list is a room playing a category its host's picker shows no row for. `npm test` holds it: every language offers the category it defaults to.

Ids stay English and unique across the whole table, because `games/categories/<id>` has no language dimension: two different song lists under one id merge into a single lifetime counter and make a room ambiguous about which list it meant. Only `TikTok and Reels` collided, so only it is qualified (`Spanish TikTok and Reels`). `Global Hits` deliberately carries no language tag, because that pool is language-neutral by construction and an English picker could legitimately offer the same list. Two languages offering one id is expected rather than a collision, which is why `ALL_SONG_CATEGORY_IDS` is a set. `scripts/songs.test.mjs` holds the minimum pool size, the defaults, and the ids-to-pools correspondence in both directions, so they fail `npm test` rather than a `console.error` in one player's browser. `npm run build` asserts the same two directions against the pools themselves, since neither shows up in the HTML it compares.

Unlike the word catalogues, the song pools are **not** split per language into files fetched at runtime. They are search queries, so the four Spanish pools cost 2 KB gzipped on top of a file that is already 58 KB, and a dynamic import would trade that for a round trip on a phone on a stranger's wifi. The word catalogues are split because they are an order of magnitude larger; this is the same trade made with different numbers, not a different rule.

**A new language's pools are validated in three storefronts.** The app sends no `country`, so live players resolve against **US** and that is the storefront that has to pass. Spain and Mexico are checked as well, because the audience is Spanish speakers globally and a query that works in the US store but not in Spain is a query that breaks the day storefront routing changes.

Checking three is not belt-and-braces. In the #164 run the union of bad queries was larger than any single storefront's list: `Dakiti Bad Bunny Jhay Cortez` is correct in the US and Spain and wrong in Mexico, and `Pepas Farruko` is the reverse. Either one alone would have shipped a defect.

The category ids come from `www/dance/categories.js`, the same module `app.js` and the build read; only the song lists are parsed out of `app.js`, by `scripts/song-pools.mjs`. That is not tidiness, it is #163: the parser's header regex was single-quote-only, so `"Today's Pop"` (double-quoted, because the label has an apostrophe) never matched and its 40 songs were dropped in silence. The script reported 10 categories while the game shipped 11, exited zero, and was used to gate releases. The unvalidated one was the chart pool, which rots fastest, with 500 rounds behind it. The parse is now checked against the module in both directions and refuses to run if the two disagree, because a validator that quietly audits nine tenths of the thing is worse than no validator.

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

**Analytics** are aggregate counters under `analytics/{music,word,draw,hub}`: visits, games, categories, per-round leaderboards, host country, the language the round was played in, and two account splits under `hub/accounts`: where accounts were created (`countries`, #195) and where signed-in people open the site (`seen`, #194). Visits and rounds are also crossed with language under `<seg>/bylang/<lang>/` (#196), which is what the dashboard's Language field filters on; the untagged paths are still written unchanged, so "All languages" keeps its full history. No cookies, no identifiers, nothing per-player. The round-milestone feedback popup has its own funnel at `<game>/fbprompt` (`shown`, `dismissed`, `rated`, and since #197 `typed` and `sent`, where a sent note goes into the visitor's support thread rather than a counter). Read them at `/admin.html`, behind sign-in (#204). Note the dance game's namespace is `music`, not `dance`.

### The language split (#140)

Every played round adds one to `games/langs/<lang>` and to
`games/daily/<YYYY-MM-DD>/langs/<lang>`. It comes from `gameLangPaths(day)` in
`www/shared/analytics.js`, spread into the update each game already builds, so a
round is still one atomic write. `/admin.html` shows it as "Games by language".

Four decisions worth keeping:

- **A path segment, not a namespace.** `analytics/word-es` would have meant
  every existing chart quietly stopped counting Spanish rounds, and every number
  after that had to be summed across languages by hand. `SECTIONS` in
  `admin.html` hardcodes the game list, and a per-language namespace would have
  to be added to it by hand for every language forever.
- **On `games/`, not `visits/`.** The question is whether people *play* in a
  language. A visit cannot answer it, and the per-language visit is already
  readable from the country split.
- **The base code only.** `langKey()` in `www/shared/lang.js` folds `es-ES` and
  `es-419` to `es`, and parks anything that is not a language code under
  `unknown`. A counter tree is permanent, so one malformed key sits in it for
  good. A regional catalogue, if one ever ships, is a different *catalogue*
  rather than a different counter.
- **The page's language is the room's language.** `createAnalytics(game, lang)`
  defaults to `pageLang()`, which is correct rather than convenient: #138 sends
  anyone whose room is in another language to that language's page before they
  can join, so the two can never disagree. The parameter exists for tests.

Two traps when reading the numbers:

- **The counter starts at zero on the day it shipped.** For any range that
  reaches back past that, the language rows total *less* than `games/total`.
  The gap is untagged history, not a missing language.
- **A game with one page has one possible value.** Dance and Draw are
  English-only, so their rounds are all `en`, and Overview's English row is
  those two as well as English Word. Only sections with a `langSeed` in
  `admin.html` get the panel at all, for exactly this reason: a permanent
  "English 100%" row answers nothing.

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

## Adding a language

English lives at `/`, `/word/`, `/draw/`, `/dance/`. Every other language sits
under its own directory: Spanish is `/es/`, `/es/word/` and `/es/draw/`.
English URLs never move, so no redirect and no existing link ever breaks.

A language is content, not code, provided the games are already built to
take one. What that means is below the list, and it is where the Spanish
Draw Game spent most of its time. To add a language:

1. `src/site.json` -> `locales`: the `lang` tag, the `dir` (`de/`), the `label`
   the switcher shows (write the endonym, `Deutsch`, not `German`), and the
   `intl` tag the `Intl` formatters use.
2. `src/content/de/`: a `shared.json` plus one file per page you are shipping.
   Copy the English file for its SHAPE and then write the values. Do not
   translate them. A translated interface reads translated. Keep the meaning,
   intent and personality of the English; change the wording, sentence
   structure, idiom and tone so the result reads as though it was written in
   that language first. The English sentence shape is the thing that gives a
   translation away even when every word in it is correct.

   That extends past word choice. Plurals, gender, formality, punctuation,
   capitalization and number formats follow the target language's own rules,
   not English's: Spanish sentence-cases common nouns, so `Objetos cotidianos`
   rather than `Objetos Cotidianos`, and a count-bearing string needs a real
   `{one, other}` pair rather than one string that reads correctly at 1 and
   wrongly at 2 (#151). For SEO strings, follow how people actually search in
   that language rather than translating the English keyword; `gratis` beat
   the more polished `gratuito` for exactly that reason.

   Per-language rules that are not obvious from the copy belong in a `_note`
   at the top of that locale's `shared.json`, the way the Spanish one records
   no vosotros, no vocabulary that splits by country, and `tú` for one player.

   Set `inLanguage` on every `VideoGame` node in `jsonldGraph`; every page
   declares its own language there, and a page that does not is the odd one
   out rather than the default.
3. `src/site.json` -> each page's `locales`: add `"de"` only to the pages that
   actually have content. A page ships in the languages it lists, and the
   switcher, the hreflang block and the sitemap all read that same list.
4. `www/shared/words/de.js` and a line in `words/index.js`, if the game deals
   words. Write the catalogue for the LANGUAGE, not for one country; parity
   with English is not a goal, and the English list is a shape to copy, not a
   source to translate. See the rule below.
5. `www/sitemap.xml`: the new URLs, with the same `xhtml:link` alternate set
   on every page in the set including itself. `npm test` checks this against
   what the build emits and fails if the two disagree.
6. `www/<dir>/manifest.webmanifest` per page that has one, with `start_url` and
   `scope` inside the language. Without it, installing to the home screen from
   a translated page opens the English one.
7. `www/admin.html`: add the code to `LANG_LABELS`, and to the `langSeed` of
   every section that now has more than one language. Nothing breaks if you
   forget: the counter still lands, and an unseeded language still shows once
   it has a round. What you lose is the zero row that says the language is
   offered and nobody has played it yet, which is the number you want in the
   first week.

### Before a game can take a second language

Steps 2 to 7 are content and data. They assume the GAME is already built for
more than one language, and a game that has only ever shipped in English
usually is not. Spanish Draw found three of these (#152), and all three are
invisible until a second language exists, which is why nothing catches them
in advance:

1. **Every runtime string goes through `t()`.** The build fails on a key
   missing from a locale, but it cannot see a string that was never a key. It
   also cannot see `t(cond ? 'a' : 'b')`, because the checker looks for a
   quote straight after `t(`. Write `cond ? t('a') : t('b')`, and never build
   a sentence by concatenation. That includes a helper handed a noun to slot
   into a sentence: pass it the whole `t('...')` instead, or the key is
   invisible to the checker and the fragment is untranslatable anyway (#161).
   Some strings are values rather than copy. A default written to the database
   and read back verbatim is one, and localising it at the write site puts one
   host's language into another's stored data. Split it the way a category id
   is split from a category label: a fixed constant on the wire, `t()` only
   where it is shown. `UNNAMED_GROUP` in `www/dance/app.js` is the worked
   example.
2. **The page template calls `langSwitch`**, inside a `.home-topbar` wrapper,
   and guards with `{% if %}` any block a translated locale leaves out. The
   switcher does not appear by itself: `alternates` decides whether it has
   anything to offer, but the page still has to ask for it. Two things hide
   here until a second language arrives, and dance had both (#166). A block
   rendered unguarded is fine until a locale omits it: `moreReading` points at
   English-only guides, so a translated file leaves it out and an unguarded
   `c.moreReading.heading` then fails the build. And prose written straight
   into the template renders in English on every page, in the middle of
   translated copy, without erroring at all. `throwOnUndefined` catches a
   MISSING key; a literal asks for no key at all, so the build renders it
   into every locale and the page looks complete in review. Grepping the
   `.njk` for sentences is no longer the check: `scripts/i18n.test.mjs`
   fails on any text node in `src/pages/*.njk` that is not an expression,
   exempting only the dev-only Firebase setup screen (#169).
   A topbar that already carries a control has a third problem: `.home-topbar`
   is `space-between`, so a third child spreads instead of grouping. Wrap the
   right-hand pair in `.home-topbar-end` and then check the widths, because
   the longest language is not the one you develop in. Dance's Spanish back
   link, switcher and account button came to 327px in a 327px bar, and the
   account button moved into a hamburger to fit (#167).
3. **The game writes `meta.lang` when it creates a room, and checks
   `redirectFor()` before letting anyone join one.** Without the first, every
   room looks like the default language. Without the second, a player is
   handed a translated shell around words they cannot read, which is the one
   thing #138 exists to prevent. This needs the confirm sheet to be generic,
   since the language question is the second thing to use it.

4. **What a language OFFERS is not what the game HAS.** A list of categories,
   modes or pools is a per-language table before it is a constant, and its
   default belongs in that table beside it. Otherwise a host who never opens
   the picker plays something their own picker cannot show as selected, and
   the first language to need a different list has to be threaded through
   every place that read the old constant. `www/dance/categories.js` is the
   worked example (#165); draw's `DRAWABLE` is the same idea with
   drawability rather than language as the reason. The ids stay shared, so
   any room still plays from any language.

5. **Every path the game hands out, and every asset its head links, is
   per-language.** `SHARE_BASE` is what a QR code and a shared link point at:
   hardcode the path in it and a Spanish host's QR lands friends on English,
   where the #138 dialog immediately bounces them back to Spanish. Nothing
   breaks, which is why it survives. Take the path from
   `pagePaths()[pageLang()]` and keep only the host hardcoded, so the native
   app does not generate a QR for localhost. The manifest is the other half:
   `manifestHref` is assembled from the locale's directory, so the head
   confidently links `/es/<game>/manifest.webmanifest` whether or not anybody
   wrote that file, and the only symptom is that installing to the home screen
   from the Spanish page opens the English app. `scripts/manifest.test.mjs`
   checks that every linked manifest exists and scopes itself to the page that
   links it (#167).

Word has the first three and the fifth, and does not need the fourth: its
categories are the same list in every locale. Draw got the first three in
#152 and the fifth in #169, and does not need the fourth either. Dance has
all five: the first in #160 and #161, the fourth in #165, the second in #166,
and the third and fifth in #167.

The share-path half of the fifth was the last one outstanding, and it is worth
saying how long it lasted. `/es/draw/` handed out English QR codes from #152
until #169, through two epics and a release that was specifically about
Spanish. Nobody reported it, because from the outside it looks like the
language dialog working: friends scan, land on English, get asked, say yes,
and play. The cost is a hop that should not exist and a moment where the game
appears not to know what language it is in.

`scripts/crosslinks.test.mjs` now asserts that every game builds `SHARE_BASE`
from `pagePaths()[pageLang()]`. That is a source-text check on a `const` in a
browser module, which is blunt, and it is there because everything less blunt
had already failed to notice: the constant is assembled at runtime, never
appears in any HTML, and produces a URL that is valid, reachable and wrong.

### Before a language can take a second game

The list above is about a GAME's first language. A LANGUAGE's second game is a
different problem, and it fails differently: nothing errors, every page is
correct, and the new page is reachable from nowhere.

`/es/draw/` shipped that way in #152. It was built right, it played right, and
the only route to it was typing the URL. What was missing was not code, it was
five pieces of content nobody thinks of as navigation:

1. **A card in `src/content/<lang>/hub.json`.** Cards render straight from
   `c.cards`; no code path derives them from `site.games`. A game missing from
   the content file is simply absent from the hub, with no warning.
2. **A `VideoGame` node in the hub's `jsonldGraph`**, following that file's own
   conventions rather than English's. `/es/` listed one game to search engines
   while offering two.
3. **An `altGames` block in each sibling game's content file.** These are the
   rows under the FAQ. Since #158 the build drops any game with no page in this
   locale, so list all of them: the row appears on its own the day that page
   exists, with no second edit.
4. **A footer link in `hub.json`.** The quietest of the five, and the one that
   went unnoticed longest: `/es/draw/` was missing from the Spanish footer from
   #152 until #168, through two epics, because nobody thinks of a footer as
   navigation until it is the only route left.
5. **The hub's own copy.** Title, meta description, OG description, the info
   block and the FAQ are usually written for one game, because when the
   language shipped there was one. A multi-game hub with single-game copy is
   the thing a reader notices first. Copy that says "everyone" about a mode one
   of the games does not have belongs here too: `/es/`'s "can we play on one
   phone?" answer described Pass the Phone, which dance has no equivalent of
   and cannot, and it was simply true until dance joined the hub.

Titles are the exception to shipping this one game at a time. `/es/` was held
out of every IndexNow ping from #152 to #168 rather than have its title
rewritten twice in a month; see the change-once-hold rule in SEO.md.

Nothing is needed for the cross-game room lookup any more. It used to hardcode
English paths, so a Spanish code typed on a Spanish page detoured through an
English page and an English modal before self-healing; since #159 it reads
`data-games`, which the build emits from `site.json`.

**The failure mode here is "correct and unreachable", and no amount of reading
the code finds it.** `scripts/crosslinks.test.mjs` reads the shipped HTML
instead and asserts that a game page which exists in a locale is linked from a
sibling in that locale, and, since #168, that the hub in that locale carries
both a card and a footer link for it. That test exists because every layer of
the build agreed with every other layer while the pages were wrong.

### Write for the language, not for one country (#139)

Spanish was first written for Spain and had to be redone. The rule that came
out of it applies to any language spoken in more than one place, which is most
of them.

**In the INTERFACE, a regionalism is the wrong tone.** In the CATALOGUE it is
a dead round: everyone at the table sees the same secret word and has to give
a clue for it, so a word half of them do not know stops the game rather than
colouring it.

Two failure modes, and the second is the one that reads fine and still breaks:

- **The thing only exists there.** Fabada, Chiringuito. Obvious once you look.
- **The thing is universal and the word is not.** `ordenador`/`computadora`,
  `gafas`/`lentes`, `patatas`/`papas`. Take the form the most speakers use;
  where it splits three ways with no majority, pick a different object rather
  than pretending one form wins.

Watch for two traps that are not vocabulary. A word that names DIFFERENT
things in different places is worse than an unknown one, because the table
gives clues for two different objects and then accuses the honest players
(`tortilla` is an omelette in Spain and a flatbread in Mexico). And a word
that is ordinary in one country and vulgar in another (`chaqueta`).

The same goes for grammar: Spanish avoids `vosotros` entirely, using third
person for anything descriptive and the `ustedes` imperative for real
commands. Each locale's rules live in the header of its `shared.json`.

Per-region catalogues stay possible. `loadCatalog()` resolves `es-MX` the same
way it resolves `es`, so a regional list can sit BESIDE the neutral default
rather than replacing it. Do that when there is demand, not before.

Two things the build refuses to ship, both of which are otherwise invisible
until a player hits them:

- a string the JavaScript calls but the language does not define
  (`assertI18nKeys`), and
- a word category with no display name in that language
  (`assertCategoryStrings`). The category IDS stay English forever: they are
  the value in `meta.categories`, the played-ledger key and the analytics
  counter key, so only `category.<id>.name` and `.desc` move.

**The language belongs to the ROOM, not to the player** (#138). It is written
into `meta.lang` when the room is created, and everyone in that room plays in
it: same words, same buttons. A player who follows a link into a room in
another language is asked once, then moved to that language's page. So the
switcher only appears where switching costs nothing, which is the hub and a
game's home screen, and never inside a room.

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
