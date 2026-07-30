# WORKLOG — Impostor Games

Project journal: what's being worked on, decisions made, and status. Newest entries first.
(Tickets are tracked in-session; this file is the durable record.)

---

## 2026-07-30: cleared 2,176 abandoned rooms, added a purge script

New `scripts/purge-idle-rooms.mjs`. No app code changed, no version bump.

The database had 2,257 rooms in it, the oldest from 21 June, and only one was
alive. Each game already closes its own room after `IDLE_MS` of inactivity, but
that watchdog is a `setInterval` living inside the page: it can only fire while
somebody still has the tab open. When the last person closes their tab the room
is orphaned with nobody left to clean it up. `createRoom` reclaims a code only
if a new room happens to roll that exact string, which at well under 1%
occupancy of the 32^4 code space is close to never. So they accumulate forever.

Storage was never the problem. 1.1 MB against the free tier's 1 GB is 0.1%, and
2,257 rooms is 0.2% of the code space. The reason to care was the cross-game
lookup shipped earlier the same day: it prefers a `lobby`-phase hit, and 1,502
of those orphans were sitting in `lobby`, so a mistyped code could forward a
player into a ghost room.

The script is the missing enforcer: the same rule the games already apply, run
by something that does not depend on a browser tab. Dry run is the default.

Three kinds of dead room, each deleted for its own stated reason:

- **idle**, past the cutoff. This is the games' own rule, so a room the script
  removes is one the in-app watchdog would already have removed had anyone been
  present to run it. That is the argument for why it cannot destroy a room the
  app itself considers alive.
- **ghost**, a `players` node with no `meta`. Worth writing down because the
  first reading was wrong: these are not rooms caught mid-creation. `createRoom`
  writes meta and players in a single atomic `set()`, so the state is only
  reachable *afterwards*, when the presence system re-adds a player to a room
  whose meta was already deleted. Both `joinRoom` and `attemptCodeValidation`
  require `.meta`, so such a room is unjoinable and invisible by construction.
- **corrupt**, a stamp more than an hour in the future. Two rooms were stamped
  for the year 2286, presumably a client writing a raw `9999999999999` rather
  than `serverTimestamp()`. These matter more than their count suggests: no
  time-based rule will ever catch them, so without this case they are immortal.

Deliberately kept at 15 minutes rather than a larger safety margin. The margin
would have implied the purge is a looser second rule, when it is the same rule
with a different enforcer. Confirmed against the data: 15 minutes and 1 hour
selected identical sets, because nothing lives in that band when the watchdog
works.

Both timestamps are `serverTimestamp()` in all three games, so a client with a
wrong clock cannot make a fresh room look ancient and get it purged.

Verified before deleting anything: created a live room and re-ran the dry run,
which reported `keep (active) 1` with the delete count unchanged, proving the
cutoff protects a real room. After the run the live control room was still
present and counts had gone 1,565 → 41, 663 → 38, 29 → 4, with room data down
from 976 KB to 8 KB.

Not addressed, and the bigger prize: **67% of the orphans (1,502) were rooms
created and then abandoned before anyone joined**, someone tapping Create,
seeing the code, and closing the tab. The tempting fix is an `onDisconnect` that
drops the room when the host's socket dies, but the host's socket dies exactly
when they switch apps to paste the code into WhatsApp. That would delete rooms
at the precise moment the host is inviting people. Needs a real design, not a
patch.

Automating the purge was left open on purpose. Firebase scheduled functions need
the Blaze plan; a GitHub Action avoids that but needs a service-account key
stored as a secret. Neither is worth deciding until we have seen how fast the
pile actually regrows.

---

## 2026-07-30: a room code now works from any game's page

New `www/shared/roomlookup.js`, plus an import and a six-line hook in each of
`www/{dance,word,draw}/app.js`.
Version stamps `dance v2026.07.30.2`, `word v2026.07.30.3`, `draw v2026.07.30.3`.

The three games keep rooms in separate trees (`rooms`, `rooms-word`,
`rooms-draw`) so they can hand out the same 4-char code without colliding. The
side effect was that a player standing on the wrong game's page got a flat "No
room found with that code" for a code that was perfectly valid one page over.
Nobody reads that message and thinks "wrong game"; they think the code is
broken. Same for a QR scanned while a different game's tab happened to be open.

Now, when a game's own tree comes up empty, it checks the other two before
giving up. On a hit it shows "That code is a Word Game room. Taking you there…"
and forwards to `/word/?join=CODE`, which is the deep-link parameter every game
already handles, so the receiving page needed no new code.

Decisions:

- **Lookup on the miss path, not a global room index.** An index
  (`roomIndex/{code} → game`) would be one read instead of two and would make
  codes globally unique for free, but rooms are deleted from several places in
  each game (host leaves, the onDisconnect cleanup, the idle watchdog). Every
  one of those would have to remember to delete the index entry, and a single
  miss leaves a stale pointer that confidently sends players to a room that no
  longer exists. That is a worse failure than an honest error, in exchange for
  saving one read on a path that rarely fires. Not worth the consistency
  surface.
- **Costs nothing on the happy path.** The extra reads only run after the local
  lookup has already failed, so a correct code never pays for this. The two go
  out together via `Promise.all`, so it is one round-trip, and they read
  `/meta` rather than the whole room.
- **Cannot hijack a valid join.** The cross-game search is only reachable once
  the current game's own tree has returned nothing, so a real local room always
  wins. Codes can legitimately live in two other trees at once; in that case we
  prefer the one still in `lobby` phase and otherwise take the first.
- **No pre-check of phase or capacity before forwarding.** The target game runs
  its own validation and reports "Game already in progress" or "Room is full".
  One source of truth, less code, and the player lands on the correct page to
  retry rather than being told no on the wrong one.
- **Same-origin path, never the canonical URL.** `/word/…` rather than
  `https://impostorgames.com/word/…`, so a preview channel, a laptop on the
  LAN, and the native app (Capacitor serves `www/` from `https://localhost`)
  all keep the player inside the build they are already running.
- **One hop, enforced.** The forward adds `&via=<fromGame>`, read at module
  import time before the deep-link handler strips the query string. A loop was
  already near-impossible since forwarding requires a positive hit, but this
  rules it out rather than leaving it to timing.

Falls out for free: the hub forwards any legacy `?join=` to `/dance/`
(`www/index.html`), a holdover from when dance was the only game. Those links
now get bounced onward to whichever game actually owns the code.

No database rules change. Each `rooms*/$code` was already `.read: true`, so a
Word page could always read a Draw room's meta; nothing new is exposed.

Verified against live rooms on the local server, deleting both test rooms
afterwards: Word code typed on the Dance page forwarded and joined for real
(the player appeared in `rooms-word/<code>/players`); Draw code forwarded
correctly from both the Word and Dance pages; an unknown code still showed "No
room found with that code" with no forward; a room flipped to `playing` still
forwarded, with the Draw page correctly reporting "Game already in progress";
and arriving at `/dance/?join=<wordCode>&via=word` did not bounce back, proving
the hop guard. No console errors on any page.

---

## 2026-07-30: run-length analytics, how long a group actually plays

`www/shared/analytics.js`, plus two lines each in `www/{word,dance,draw}/app.js`.
Version stamps `dance v2026.07.30.1`, `word v2026.07.30.2`, `draw v2026.07.30.2`.

We could already see that rounds happened, but not whether a group plays once
and leaves or settles in for ten. That gap showed up while looking into a dip on
2026-07-29: sessions held steady while rounds fell, and there was no way to tell
whether groups were playing shorter or fewer groups were playing at all. This
adds the missing dimension.

The hard part is that there is no reliable "the group finished" event. People
close the tab, so a final "group of 5 played 5 rounds" record can never be
written. The fix is to re-bucket as the run goes: on round N we add to the N
bucket and take back the N-1 written last time. At any moment
`runs/<size>/<n>` reads as "groups whose run ended at exactly n rounds", and it
corrects itself when the group plays on. `bumpAnalytics` already forwards its
values to `increment()`, so negative amounts worked with no change to the helper.

New counters, both lifetime:
- `analytics/<game>/runs/<size>/<rounds>` the run-length histogram.
- `analytics/<game>/games/size/<size>` rounds played, by group size.

Decisions:
- **Lifetime, never per-day.** A group still playing at midnight would add to
  tomorrow and take back from yesterday, driving the older day negative. Chosen
  deliberately over a daily split.
- **Size frozen at the run's first round.** Players drift in and out, and a
  take-back aimed at a different size bucket would corrupt two buckets at once.
- **Tails bucketed** at `12plus` for size and `20plus` for rounds, keeping the
  tree small and readable. Once clamped the bucket stops moving, so the write is
  skipped entirely rather than doing +1 and -1 on the same key, which would
  cancel out and lose the run.
- **A run is one host's sitting.** There is no host migration and ids are not
  persisted, so a host who reloads can no longer start rounds. An in-memory
  counter reset in `leaveRoom()` matches a real run exactly, with no room writes.

Draw counts a *game* (one press of Start), not its individual drawing turns, so
the number stays comparable across all three games.

Privacy model unchanged: aggregate counters only, no room codes, no ids, no
per-group records.

Verified: `node --check` on all four files; a simulation of the bucketing against
a ledger of 13 groups (including a 25-round run, a 19 vs 20 boundary pair, and a
size-14 group) reproduced the exact expected histogram, left no bucket negative,
and accounted for all 106 rounds in `games/size`.

### Stats page display

`www/stats.html` gains two panels, in Overview and in each game's view:

- **How long groups play** — the run-length histogram, ordered by round count
  rather than by size, with the headline in the panel title: total groups, the
  share that played more than once, and the median run. That share is the
  engagement number the page could not answer before.
- **Groups by size** — groups per starting size, with the average run length
  beside each. This is what answers "do bigger groups play longer".

Both deliberately **ignore the range chips** and read all time, because `runs/*`
has no per-day node by design. The panel hints and the footer say so, since
every other panel on the page does respect the range. Overview sums the three
games, which means a group that plays Word and then Dance counts twice; there
are no user ids to link them by and none are wanted. Same caveat already applies
to the page's other combined totals.

Verified in the browser: empty state renders "No runs recorded yet." in all four
views against live data; with a seeded fixture, Word read 81 groups / 60% played
again / median 2 rounds, and the per-size averages (size 3 → 1.7, size 5 → 4.9)
match hand calculation, including a 20+ run counted as 20. Overview summed to
119 groups across the three games. Bucket ordering puts `20plus` and `12plus`
last rather than sorting them as strings. The fixture was removed afterwards and
its absence re-confirmed in the page.

---

## 2026-07-30: words and hints for a global audience (word + draw)

`www/shared/words.js`, version stamps `word v2026.07.30.1`, `draw v2026.07.30.1`.
`words.js` is shared, so the word game and the drawable subset both pick this up.

The catalogue is meant to be played by people anywhere, in normal English. The
secret words were mostly fine, but a review turned up two problems worth fixing:
a handful of words whose *name* is rare even though the thing is common, and a
larger set of hints that were hard for the wrong reason. The rule we kept: a
hint may be vague or tricky (that is the game), but the hint word itself has to
be one ordinary English speakers actually use. Difficulty comes from vagueness,
not vocabulary.

Words swapped for globally-recognised ones (name too regional or obscure):
- Everyday Objects: `Colander` to `Balloon` (many fluent speakers don't know the
  name, and it also has to be *drawn*).
- Places: `Laundromat` to `Balcony` (American term; the place barely exists in
  much of the world).
- Movies & TV: `Doraemon` to `Mickey Mouse` (huge in Asia, near-zero elsewhere).
- Animals: `Armadillo`, `Anteater`, `Meerkat` to `Ladybug`, `Grasshopper`,
  `Firefly`, keeping the deliberate 100-per-category count (enforced by
  `scripts/check-words.mjs`).

Regional foods (`Biryani`, `Dosa`, `Idli`, `Jalebi`, `Gulab Jamun`, `Chai`,
`Pho`, `Gyoza`, `Kimchi`) were deliberately kept: a big part of the audience is
Asia, and food names travel.

59 hints reworded across all seven categories, in three groups:
- Invented words that aren't really English (`Kernelled`, `Aisled`, `Jugged`,
  `Willpowered`, `Souvenired`, `Pincered`, ...).
- Trap words where a common word is read in its uncommon sense (`Minute` for
  tiny, `Live` for powered, `Sheer`, `Blistering`).
- Real but rare, literary vocabulary (`Quadrennial`, `Monosyllabic`, `Russet`,
  `Opulent`, `Cavernous`, `Perforated`, `Swashbuckling`, ...).

Each replacement stays one or two common words, never names the secret word,
and passes `scripts/check-words.mjs` (no cross-category duplicates, no shared
stems, both hints distinct, counts intact). `Manchester United`'s `Storied` was
caught during verification and changed to `Historic` to match the same fix made
to `Ruins`. No game logic touched; `pickHint` and the dealing flow are unchanged.

---

## 2026-07-29: buttons feel the tap (all games + hub)

`www/shared/press.js` (new), `www/shared/base.css`, `www/draw/draw.css`,
`www/{dance,word,draw}/index.html`, `www/index.html`, version stamps
`hub v2026.07.29.1`, `dance v2026.07.29.1`, `word v2026.07.29.1`,
`draw v2026.07.29.4`.

Taps felt dead on phones. Two causes: `base.css` zeroes the native tap flash
(`-webkit-tap-highlight-color: transparent` on `*`), and the only feedback
left was `.btn:active { scale(0.97) }`, which is barely visible and, worse,
unreliable on touch. Mobile browsers cancel `:active` the instant a finger
drifts a pixel (guessing you meant to scroll), so a quick tap often shows
nothing.

Fix, shipped hub-wide since `base.css` is shared:

- New `www/shared/press.js`, a plain script loaded by all three games before
  `app.js`. One delegated `pointerdown`/`pointerup`/`pointercancel` listener
  toggles an `.is-pressed` class on `.btn`, `.tile`, `.vote-row`. Because we
  drive the state ourselves, feedback fires instantly and consistently on both
  mouse and touch, and it covers buttons rendered later. A `pointermove` guard
  drops the visual if the finger slides off before lifting.
- `base.css`: `.btn` and `.tile` now animate off both `:active` and
  `.is-pressed`. Press-in is a quick 0.06s dip (`.btn` scale 0.95 plus a soft
  shadow and 0.97 brightness; `.tile` scale 0.965); release springs back on a
  0.22s `cubic-bezier(0.34, 1.56, 0.64, 1)` so it pops rather than snaps.
- `draw.css`: `.vote-row` gets the same treatment (scale 0.97, spring release).
- `prefers-reduced-motion` guard drops the scaling for those users but keeps
  the non-motion feedback (shadow and brightness), so a press still registers.

The landing page (`www/index.html`, stamp `v2026.07.29.1`) is self-contained
and shares neither `base.css` nor `press.js`, so it was handled alongside. Its
`SELECTOR` in `press.js` was extended to include `.game-card`, and the hub now
loads `press.js`. Catch on the cards: their entrance animation uses `forwards`
fill, which pins the card's `transform` — the existing `:active { scale(0.99) }`
never actually rendered, and neither would any new scale. So the card presses
via a property the animation leaves alone: its shadow flattens from the raised
`0 2px 12px` to a tight `0 1px 5px` (settles into the page), and the inner
`.play-btn` (no animation on it) does the visible click — `scale(0.96)` plus a
0.9 brightness dip, spring release on the same `cubic-bezier`. Reduced-motion
drops the pill's scale. The dead hover-lift caused by the same `forwards` fill
was left as-is (out of scope for this pass).

Verified on the preview across all three games and the hub: `press.js` loads with no
console errors, the class toggles on press and clears on release, and computed
styles confirm the target transforms when rendered (`.btn` scale 0.95, `.tile`
0.965). Note: reading a `.btn`'s transform while its screen is `display:none`
returns `none` in Chromium (un-rendered elements resolve transform to none),
which is a measurement artifact, not a miss. Screenshot of the draw home shows
the Create tile in its pressed state. Not deployed.

---

## 2026-07-29: draw vote screen names the action

`www/draw/index.html`, `www/draw/draw.css`, version stamp `v2026.07.29.3`.

The vote screen asks "Who was the impostor?" at the top, then shows the
drawing, then the ballot. By the time the eye reaches the rows the question is
a screen away and the rows are just a list of names. A serif line, **"Vote for
the Impostor."**, now sits directly above the first row, 32px below the
drawing and 12px above the ballot so it reads as a label for the rows rather
than a caption for the picture. The list points at it with
`aria-labelledby`.

Also in this session, but by hand rather than by me: the play screen was
respaced. The header and the strip tightened up (`.turn-round` 15px to 12px,
turn pill top margin 8px to 4px, `.play-stage` and `.turn-strip` gaps 8px to
6px, `.pchip` padding trimmed, `.pdot` 13px to 12px, the `.sound-btn` bottom
margin dropped) while `.screen-play`'s gap opened up from 10px to 24px, so the
three bands of the screen breathe and everything inside each band sits closer
together. Net effect on the canvas is a wash, and the header comment about an
exact 8px gap was updated to stop naming a number.

Checked with a real three-player round on the preview: at 375x812 and 375x667
the canvas, Done button and word hint all fit with no scroll. At 375x600 the
screen does overflow into a scroll, but that is not new, the same thing
happens at the old 10px gap. The canvas only shrinks to the smaller of the
wrap's width and height, and on a very short viewport the wrap stops shrinking
before the canvas does. Left alone.

---

## 2026-07-29: draw lobby settings card collapses for players

`www/draw/index.html`, `www/draw/draw.css`, `www/draw/app.js`, version stamp
`v2026.07.29.2`.

The lobby settings card was built for the host: word category on top, a
hairline, then the drawing-rounds stepper, each with a hint line underneath.
Players get none of the controls, so on their screen the same card was four
lines of read-only text taking a third of the phone and pushing the player
list (the thing they actually watch) down.

For players it now renders as one row: **WORD CATEGORY** with the chosen
category in serif on the left, the round count as a teal pill on the right.
The hairline, the "Drawing Rounds" heading and both hint lines are gone. Card
height drops from roughly 210px to 91px on a 375px viewport.

**Host view is untouched** - same stepper, same hints, same hairline.

How it works: `renderLobby()` toggles a single `.settings-compact` class on
the card for non-hosts, and the CSS does the rest (flex row, hidden heading
and hints, stack spacing zeroed). No markup is moved or duplicated, so the two
layouts can't drift apart. The pill loses its heading in this layout, so it
carries an `aria-label` ("3 drawing rounds") for screen readers.

Verified with two local tabs on a real room: player card matches the target
design, host card unchanged, the pill updates live when the host changes the
count, singular "1 Round" reads correctly, and a maximum-length category
summary wraps without colliding with the pill. No console errors. Analytics
untouched (localhost is not counted).

---

## 2026-07-29: draw page title leads with "Imposter"

Branch `seo/draw-title`. One line in `www/draw/index.html`, plus the version
stamp (`v2026.07.29.1`).

The three game titles had drifted apart:

```
/dance/  Imposter Dance Game | ...     <- misspelling
/word/   Imposter Word Game | ...      <- misspelling
/draw/   Impostor Draw Game | ...      <- correct spelling
```

Search Console shows essentially every real query uses **Imposter**, which is
why dance and word already lead with it. Draw was the odd one out, and since
it was a day old with no rankings to lose, switching it was free upside rather
than a risk. Raised twice during the draw build and left undecided; decided
now.

**Only the `<title>` changed.** The `<h1>`, `og:title`, `twitter:title`,
schema `name` and all body copy stay "Impostor". The schema already carried
`alternateName: ["Imposter Draw Game", ...]`, so the misspelling was declared
there anyway. A comment above the tag explains this so nobody "fixes" the typo
later.

**The hub title was deliberately left alone**, even though it does not mention
the draw game at all. It is already 80 characters against roughly 60 that
display, so adding Draw would push it past the cut or force out wording that
currently earns clicks.

### On getting the new game picked up

Audited the whole surface live, and everything else was already in place:
robots.txt explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
PerplexityBot and Google-Extended and declares the sitemap; `/draw/` is in the
sitemap with a current lastmod; canonical is self-referencing; og:url and
og:image resolve; five crawlable `<a href="/draw/">` anchors from the hub.

Two things worth remembering:

- **IndexNow does not reach Google.** `scripts/indexnow-ping.mjs` posts to
  `api.indexnow.org`, which feeds Bing, Yandex, Seznam and Naver. Google
  declined to participate. The only lever for Google is Search Console URL
  Inspection → Request Indexing, which is a manual, logged-in action.
- **llms.txt is speculative.** No major AI provider has committed to consuming
  it. Keep it, it costs nothing, but the robots.txt allowances and ordinary
  crawlability are what actually do the work. ChatGPT is in better shape than
  Google here, because ChatGPT Search leans on Bing plus OAI-SearchBot and
  both are covered.

---

## 2026-07-28: stats per-day average now divides by the game's own lifetime

Branch `fix/stats-per-day-average`. Closes #50. `www/stats.html` only, no game
code touched.

`nDays` came from `lastNDays(RANGE)`, which always returns the full range
length. So every game's total was divided by 30 on the default view, whether
or not the game existed for those 30 days. Draw launched today and read **0.7
games per day** off 22 real games.

It was never a draw-only problem. Measured against live data:

| Game | First day | Real days | Total | Was | Now |
|---|---|---|---|---|---|
| Draw | 28 Jul | 1 | 22 | 0.7 | 22 |
| Word | 8 Jul | 21 | 3,023 | 100.8 | 144 |
| Dance | 7 Jul | 22 | 6,039 | 201.3 | 275 |

Word was understated by 43% and dance by 27%. The same dilution hit visits and
every per-game view, not just the Overview cards.

**The denominator is now the days in the selected range on or after that
source's first recorded day.** First-recorded-day is used as the launch date
because it maintains itself; a hardcoded table would be a second source of
truth and would count pre-analytics days as real zeros.

**Days with no activity still count.** A quiet Tuesday is a genuine zero, and
skipping it would flatter a game played on 3 days out of 30 into looking as
busy as one played daily. This also fixed `rangeDays('all')`, which enumerated
only days that *had* data, so zero days silently vanished from the denominator
and from the chart. It now spans first day to today continuously.

Each source divides by its own lifetime, so `avg()` takes the daily map the
total came from rather than closing over a single shared `nDays`.

The card shows `over N days` **only when the source is younger than the
range**, so a big number off one day of data explains itself while a mature
game in a 7-day view stays uncluttered.

### Verification

Against live production analytics, all six figures match hand calculation
(6039/22, 3023/21, 22/1, 4435/22, 9084/22, 8093/22). Across ranges:

- **7 days**: dance and word show no note (they cover the whole window),
  draw shows `over 1 day`
- **90 days**: all three noted, values unchanged from 30 days because that is
  their entire lifetime
- **All time**: dance has no note (it defines the span), word `over 21 days`,
  draw `over 1 day`
- `?view=draw` section correct too, so this is not Overview-only

No console errors. `stats.html` has no version stamp to bump; it is a private
dashboard, not a game page.

**Self-inflicted, worth recording.** A throwaway `perl -0pi` substitution I
ran with `2>/dev/null` used `$1` for a group that captured the whole match,
nesting the markup inside its own `id` attribute on three lines. The symptom
was subtle: dance rendered, then the combined loop threw on a null element and
word, draw and hub silently stayed at `–`. Caught only because the browser
check compared every card, not just the one being fixed.

---

## 2026-07-28: word catalogue to 550, two hints per word, cross-room memory

Branch `feat/word-catalogue-v2`. Closes #47, #48, #49. Word and draw only;
dance untouched.

Groups are playing 40+ rounds and reported words coming round again.

**The diagnosis first, because it changed the fix.** Words already never
repeat inside a room: `meta/played` records every word dealt and `pickWord()`
draws only from what's left. So the repeats were not a bug in that logic. They
came from two places:

- **a new room starts with a blank ledger**, so round 1 can deal the word the
  group had an hour ago
- **a single category was only 50 words**, so by round 40 the room is scraping
  the last ten, which feels repetitive even when nothing has actually repeated

Three changes, one per cause plus one for variety.

**1. Catalogue 300 → 550 (#47).** Food, Animals, Places and Everyday Objects
went 50 → 100. Movies & TV and Football deliberately stayed at 50: past that
they drift into names most rooms won't recognise, and an unrecognised word
stalls a round. New **Super Heroes** category, 50 entries, drawable so both
games get it. Draw's pool went 150 → 350.

Super Heroes forced a decision. Movies & TV already held Spider-Man, Batman,
Superman, Iron Man, Wonder Woman, Black Panther and Deadpool. Leaving them
there and repeating them under Super Heroes would have been a real bug, not
untidiness: **the played ledger is keyed by category**, so the same word in
two categories can be dealt twice to a room that picked both. The seven
characters moved to Super Heroes and Movies & TV was backfilled with seven
film titles (The Godfather, Forrest Gump, Up, Wall-E, Rocky, Jaws, Back to the
Future) to hold it at 50. Joker and Avengers stayed put as film titles.

**This is a deliberate exception, confirmed with the user.** The brief was to
add no words to Movies & TV. Holding the count at 50 does not satisfy that:
seven entries in it are genuinely new. The alternatives were shrinking Movies
& TV to 43, or reverting it and leaving Super Heroes without Batman,
Spider-Man, Superman, Iron Man, Wonder Woman, Black Panther and Deadpool. The
swap was reviewed against both and kept. Do not "fix" it back.

Drawability drove the new Food and Animals entries toward things with a clear
silhouette (fruit, vegetables, distinct creatures) and away from dishes that
all sketch as a bowl of stuff. In draw everyone knows the word, so a word
nobody can draw distinctly means crewmates cannot prove they know it.

**2. Two hints per word, one shown at random (#48).** Every entry gained `h2`,
and `pickHint(entry)` in `shared/words.js` returns one of the two per round.
Shared rather than duplicated in each game so both deal hints identically and
the missing-`h2` fallback lives in one place. The impostor still sees exactly
one hint, so no balance change, but a word that does come back plays
differently and nobody learns that "Cheesy means Pizza".

**3. Cross-room memory on the host device (#49).** `shared/played.js` keeps
what this device has dealt in localStorage and hands it to `pickWord()` as a
second exclusion list.

Two design points worth keeping:

- **It is not written to the room.** The first attempt seeded `meta/played` at
  room creation. That would have put up to ~420 keys in meta from round zero,
  and since `onValue` re-sends the whole room snapshot on every change, every
  player would re-download it each time somebody tapped Ready. Filtering
  host-side costs nothing on the wire; the host is the only client that picks
  words anyway.
- **`reset` still means one thing only: the room is out of words.** Running
  dry on device history alone just drops the preference and falls back to
  room-only memory. Without that two-tier fallback a long night would wipe a
  ledger that still had words in it, causing the exact repetition this is
  meant to prevent.

History is capped at 60% of each category. At 100% the device would eventually
exclude everything and the feature would quietly stop doing anything; the cap
keeps at least 40% of every category genuinely fresh. Per game (`played:word`,
`played:draw`) because drawing a word you said out loud last night is a
different experience, not a repeat. No identifiers and not a cookie, so the
cookie-free claim is unaffected.

### Verification

Two new scripts, both run clean:

- `scripts/check-words.mjs` enforces the catalogue rules: category sizes,
  missing fields, `h` equal to `h2`, hints containing the word or sharing a
  stem with it, hints that are a category name, hint word count, and the one
  that actually matters, **duplicate words across categories**. It caught two
  real errors on the first run (`Spring Roll` hinted "Rolled", `Orca` hinted
  "Black-and-white", three words) and two hints that were themselves secret
  words elsewhere ("Frozen"). All four fixed.
- `scripts/check-played.mjs` covers the store: recording, the 60% cap keeping
  the most recent, `clear()`, dropping words the catalogue no longer has, four
  shapes of corrupt localStorage, and localStorage throwing outright. It also
  simulates two rooms and asserts the second reuses none of the first's words,
  printing what a blank-ledger room would have reused for contrast.

Live, on the local server with three tabs in a real room:

- all seven categories render in the word picker, four in draw (Places, Movies
  & TV and Football correctly absent)
- Super Heroes dealt real words and `pickHint` served Loki's second hint,
  proving `h2` is reachable
- localStorage recorded each word, and the 60% cap fired live: a hand-seeded
  45-word history was trimmed to 30 on the next round
- **the exclusion test.** With 30 of the 50 Super Heroes hidden in device
  history, six consecutive rounds all came from the other 20, none from the
  hidden 30. If the history were being ignored that is roughly a 1-in-400
  coincidence.
- draw and dance both load with no console errors; dance was not touched

**One thing worth knowing for the next person.** Mid-testing the word page
went completely blank: the browser had cached the old `shared/words.js`, so
the fresh `app.js` threw `does not provide an export named 'pickHint'` and no
screen ever activated. That is a local-server artifact only. `firebase.json`
sends `no-cache, no-store, must-revalidate` for everything except
`/icons/**`, `/favicon.ico` and `/avatars/**`, so production cannot serve a
stale module against a fresh one. Checked before assuming.

### Also in this branch

- Word FAQ "What word categories are there?" now has a schema answer that is
  **byte-identical to its visible twin**, verified by decoding both. They had
  drifted apart ("Six categories at launch:" vs "Six at launch —"), which
  invalidates the rich result. Pre-existing, fixed while editing the copy.
- `llms.txt` corrected: it claimed draw used all six categories. It uses the
  drawable four.
- Version stamps: word `v2026.07.28.2`, draw `v2026.07.28.6`.

---

## 2026-07-28: README rewritten as a project document

Branch `docs/readme-rewrite`. Docs only, no behaviour change.

The README had stopped being true somewhere around the word game shipping. It
described a one-game, single-file project called "Imposter Music Game", and
three of its instructions actively failed:

- "Open `index.html` in a browser" — there is no root `index.html`; the site
  is `www/`
- "Paste into `index.html`" for the Firebase config — it lives in
  `www/shared/firebase.js`
- the rules block showed only `rooms`, so pasting it would have broken the
  word game, draw game, analytics, sign-in and feedback in one go

Also stale: "single HTML file" (9 modules now), "60s timer" (`ROUND_SECONDS`
is 30), `CATEGORIES` located in `index.html` (it is in `dance/app.js`), and a
known limitation reading "No voting UI ... would be ~50 lines" when draw ships
a full vote, auto-close, ballot and verdict.

Rewritten around what someone actually needs: the three games in a table, the
`www/` layout, the local-server command, and the fact that matters most when
touching the code — **each game owns its own room namespace** (`rooms`,
`rooms-word`, `rooms-draw`), which is why all three can issue the same 4-char
code without colliding. Added the real six-key rules description, the split
hosting/database deploys, preview channels, the IndexNow step, the analytics
production gate, and links to WORKLOG, ANDROID and NATIVE_APP_NOTES, none of
which were referenced before.

Every path in the file was checked to exist, every factual claim re-read from
the source, and the quickstart command was run to confirm it serves the hub,
`/draw/` and `/shared/base.css`. Kept clear of spaced em dashes per house
style.

---

## 2026-07-28: Stats page reads the draw game — #46

Branch `feat/draw-stats`. **Not deployed.** The last piece of #46.

The counters themselves were already built during the game work, identical to
the word game's: `trackSession()` on load, `trackRound()` writing
`games/total`, `games/categories/*`, `games/words/*`, the daily rollups and
`games/countries/*`. Only the dashboard was missing.

Five edits to `www/stats.html`:

- `draw` option in the view selector, and added to the `VIEW` allowlist so
  `?view=draw` survives a refresh
- a `SECTIONS` entry using `itemsKey: 'words'`, since draw writes the same
  per-round leaderboard shape the word game does
- `COMBINED_SRC` from `['music','word']` to `['music','word','draw']`
- **a hand-written `drawKpi` card.** The per-game cards in the overview are
  literal HTML while the fill logic loops `COMBINED_SRC`, so adding draw to
  that array without adding the card would have thrown on a null element.
  This was the only non-obvious part of the change.
- footer note and the load comment, which both said "music/word/hub"

No read change needed: `load()` already fetches the whole `analytics` node, so
`DATA.draw` arrives on its own.

Verified against production data by writing sample counters to
`analytics/draw`, reloading, and confirming the Draw section rendered (40
visits, 12 games, "Noodles 5" on the words leaderboard, country and category
panels present) and that the combined KPI moved from 9,005 to 9,021 —
5,998 + 3,011 + 12. Sample counters deleted afterwards and the node confirmed
back to null.

---

## 2026-07-28: Draw card promoted to second, with a self-retiring New flag

Branch `feat/impostor-draw`. **Not deployed.** Hub v2026.07.28.4.

- **Card order is now Dance, Draw, Word.** The block moved verbatim; the
  stagger animation is keyed on `nth-child`, so draw inherited the 0.38s delay
  and needed no CSS change.
- **"✨ New Game" pill** pinned to the draw card's top-right corner, teal
  rather than the Play button's near-black so it reads as a label and not as a
  second call to action. `a.game-card` gained `position: relative` to anchor
  it. The card's `aria-label` picked up ", new" because an `aria-label` on the
  link replaces its inner text, so the badge would otherwise be silent to a
  screen reader.
- **It retires itself after 3 weeks.** The date lives in one place,
  `data-new-until` on the element, and four lines at the end of the hub's
  module script remove any element whose date has passed. Written into the
  markup rather than injected, so it degrades to simply staying visible if the
  script never runs.

**`data-new-until` is provisional at `2026-08-18`.** The user asked for three
weeks from deploy day, and deploy day is not set, so this must be reset to
`deploy + 21 days` when production actually ships.

Verified on localhost: order reads Dance / Draw / Word, pill sits 15px in from
the card's top-right, and the retirement logic was replayed against four
dates — shown on 17 and 18 Aug, hidden on 19 Aug and 20 Sep.

---

## 2026-07-28: Hub + llms.txt learn about the third game (additive only)

Branch `feat/impostor-draw`. **Not deployed.** Hub v2026.07.28.1. The draw
game's own page was already SEO-complete; the hub and `llms.txt` were still
two-game documents. Draw had **one** inbound link from the hub and appeared
nowhere in its structured data.

Constraint from the user: **do not risk the traffic dance and word already
earn.** Everything here is therefore additive or a factual correction. No
ranking copy was rewritten.

**Deliberately not touched.** The hub `<title>` stays byte-for-byte identical.
It is the strongest on-page signal for the terms that currently earn traffic,
it is already 80 characters against Google's ~60 of display, and adding a
third game name would push the existing two further out of view for no gain:
`/draw/` has its own title and schema and is the page that should rank for
drawing terms. The `og:title` and `twitter:title` are untouched for the same
reason, as are all eight existing FAQ answers and both existing explainer
blocks.

**Added:** a third `VideoGame` entry in the hub's JSON-LD; a "What is the
Impostor Draw Game?" explainer section; a matching FAQ entry in both the
visible list and the schema; a footer link; drawing terms in the `keywords`
meta (cosmetic, Google ignores the tag); a full `## Impostor Draw Game`
section in `llms.txt` plus its Common-questions and Pages entries.

**Corrected**, because a three-game site claiming two is a visible error:
the meta description (311 chars of two-game copy down to 143 covering three),
the `og:` and `twitter:` descriptions, "both games" in four places, and
"difference between the two games" which now compares three. None of these
carry target keywords; meta descriptions are not a ranking factor.

Inbound hub links to `/draw/` went **1 → 5**, which is the change most likely
to actually get the page crawled and ranked. Hub `lastmod` bumped to invite a
recrawl.

**Known and left alone:** five hub FAQ schema questions have no identical
`<summary>` twin. Most are covered by the `<h2>` explainer blocks, which
satisfies Google's "content must be visible" rule, and the rest predate this
work. Fixing them means editing the exact dance and word copy that earns the
traffic, so it wants its own ticket and its own before/after measurement.

---

## 2026-07-28: Impostor Draw Game — renamed to match its siblings

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.5.

"Impostor Draw" is now "Impostor Draw Game", matching Impostor Dance Game and
Impostor Word Game. Sixteen occurrences across `<title>`, OG and Twitter
titles, the OG image alt, the VideoGame schema name, both FAQ schema entries
that carried the name, the meta description, the `<h1>`, the how-to intro, the
visible FAQ summary, the logo alt text, the hub card heading and its
aria-label, and the web manifest.

Details worth recording:

- **`short_name` is "Draw Game", not "Impostor Draw Game".** It is the label
  under a home-screen icon, where long names get truncated. The word game uses
  "Word Game" for the same reason.
- **"Impostor Draw" survives as an `alternateName`** alongside a new "Imposter
  Draw Game", so the shorter form and the common misspelling both still match.
- **Two FAQ schema/visible mismatches fixed while here**, both pre-existing:
  the remote-play question and "Is it free?" vs "Is it free to play?". Every
  schema question now has an identical visible twin, which is how the word
  game is built and what Google checks against.
- **The `<title>` keeps the correct "Impostor" spelling.** Dance and word both
  lead their title tags with the misspelling "Imposter" to catch that search
  traffic. Left as-is because it was not asked for and changing a title tag
  moves rankings; the misspelling is already covered in the keywords meta and
  the alternateName list.

Schema and manifest JSON both re-parsed clean.

---

## 2026-07-28: Impostor Draw — stop advertising a chat we don't have

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.4.

The "Discuss in chat" how-to step is gone and the list renumbered 1-5. Chat
(#44) was deferred, so it comes back when the feature does.

The step was the visible half of it. Chat was claimed in **eight** places on
the page, including the meta description, the OG and Twitter descriptions, the
VideoGame schema description, and the FAQ answer in both its visible and
structured-data copies. All are now accurate. The two copies of the "Can I
play remotely?" answer were edited together on purpose: Google cross-checks
FAQ structured data against what a visitor can actually see, and a mismatch
loses the rich result.

Wording changes were kept minimal so the page's keyword density is unchanged.
Schema JSON re-parsed clean after editing.

Verified on localhost: five steps numbered 1-5 ending on "Vote and reveal",
and the word "chat" no longer appears anywhere in the rendered page.

---

## 2026-07-28: Impostor Draw — its own artwork at last

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.2. The game
stops borrowing the word game's pictures.

Three PNGs supplied, converted to match what dance and word already use rather
than inventing a new convention:

| source | output | why |
|---|---|---|
| `game-draw.png` 702×413 | `game-draw.webp` 468×275, 20K | same size as `game-*.webp` |
| `logo-draw.png` 503×503 | `logo-draw.webp` 448×448, 28K | same size as `logo-*.webp` |
| `og-draw.png` 1200×630 | `og-draw.jpg` 1200×630, 80K | **JPG, not WebP** |

**The OG image stays JPG on purpose.** WebP support among link-preview
scrapers is still patchy, and a preview that fails is worse than one that is
40K larger. Both existing games use `og-*.jpg` for the same reason. Everything
that renders in a browser is WebP.

Alpha is preserved on both WebP files, matching `game-word.webp` and
`logo-word.webp`.

Wired up: hub card art (`www/index.html`), the game's home logo and lobby head
icon, `og:image` / `twitter:image` / the schema `image`, and a sitemap entry
for `/draw/` that previously had no images at all.

Source PNGs moved to `design/draw-art/` alongside `design/mode-icons/`. They
were sitting in `www/`, which Firebase deploys wholesale, so ~900K of unused
originals would have shipped.

Verified on localhost: all three cards load their own art at 468×275, both
logo slots resolve to `logo-draw.webp` at 448×448 and render undistorted at
160×160, and all three OG references point at `og-draw.jpg`.

---

## 2026-07-28: Impostor Draw — one payoff screen, held breath before it

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.1. Phase order
is `lobby → countdown → card → playing → vote → reveal → over`.

- **The ballot moved to the final screen.** "Who voted whom" is no longer its
  own screen: it now sits under the vote counts on the round-over screen, so
  the whole payoff is one scroll. Order is verdict, impostor card, word, Votes,
  Who voted whom, on the reasoning that you want how it ended, then by how
  much, then exactly who did it.
- **The five-second ballot screen became a three-second held breath.** The
  `tally` phase is renamed `reveal` (`meta/tallyAt` → `meta/revealAt`,
  `TALLY_MS` → `REVEAL_MS = 3000`) and the screen now carries nothing but
  "And the Impostor is…" over a 3-2-1. Deliberately empty: anything readable
  there would get read instead of felt.
- **Play Again is sticky.** With six players the screen is 1240px against an
  812px viewport, so the action pair uses the shared `.sticky-actions` and
  pins to the bottom edge at every scroll position. `.tally` lost its own
  `margin-top` now that `.over-section` owns the spacing.

Verified in room `C3D9` (six players, deleted after): last vote landed and the
countdown ran 3-2-1 then the final screen at ~4s; final screen showed both
labelled sections with six ballot rows and three tally rows; Play Again stayed
pinned at scroll 0/200/400 and at the bottom; replay cleared `cardAt`,
`revealAt`, votes and strokes; a second round ran the pre-roll unaided. No
console errors.

---

## 2026-07-27: Impostor Draw — the round runs itself now

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.9. Phase order
is `lobby → countdown → card → playing → vote → tally → over`.

- **The word card starts the drawing.** No more host button: the card holds
  for 5 seconds behind its own countdown and then opens the canvas. The 3-2-1
  stays, so the pre-roll is about 9 seconds in total.
- **The vote closes itself.** The moment every present player has picked, the
  room moves to a new ballot screen showing who voted for whom, counts down 5
  seconds and names the impostor. Players who have left are not counted as
  owing a vote, so a closed tab can't hold the room up.
- **The host's Reveal button survives** as the override for a player who is
  present but unresponsive, and now leads to the same ballot screen rather
  than skipping it. Anyone who hasn't voted shows as "Did not vote", which is
  only reachable through that button.
- **New `phaseGuard` + phase clock.** `cardAt` and `tallyAt` are deadlines in
  meta, so every client counts down to the same instant; only the host writes
  the phase change, guarded by `<phase>:<deadline>` so a 250ms ticker can't
  fire the same write twice. Guard clears on every phase change.
- **Canvas shadow fixed.** `.canvas-wrap` was `overflow: hidden`, which sliced
  the drop shadow off flush at the canvas edges (the canvas is exactly as wide
  as its wrapper). Now `overflow: clip` with `overflow-clip-margin: 30px`: the
  shadow gets room, the resize-frame scrollbar guard still holds, and browsers
  without the property degrade to the old behaviour.

Verified in room `ZPWH` (deleted after): pre-roll timed at 3-2-1 then 5-4-3-2-1
then playing at ~9.5s with `turnAt` set; three of four votes changed nothing
and the fourth opened the ballot immediately; ballot counted 5 down to 1 then
revealed; host override reached the ballot with two "Did not vote" rows; replay
cleared `cardAt`, `tallyAt`, votes and strokes, and a second round ran the
whole pre-roll again unaided. Shadow measured with 30px of clip margin on all
sides and no horizontal overflow. No console errors.

---

## 2026-07-27: Impostor Draw — QR follows the serving host

Branch `feat/impostor-draw`. Draw v2026.07.27.8. Prep for preview-channel
testing.

`SHARE_BASE` was pinned to `https://impostorgames.com/draw`, which is correct
in the native app (a Capacitor WebView's `https://localhost` origin is no use
to a friend) but wrong everywhere else: on a preview channel or a laptop on
the LAN the QR led to production, i.e. to a different build, and right now to
a path that is not deployed at all. It now falls back to `location.origin` and
only uses the canonical URL under Capacitor or a non-http(s) protocol. On
production `location.origin` *is* impostorgames.com, so nothing changes there.

Verified on localhost: QR encodes `http://localhost:8123/draw/?join=MAYF`.
Room deleted after.

---

## 2026-07-27: Impostor Draw — ballot redesign, winner's emoji, turn clock

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.7.

- **Ballot rows redesigned** to the supplied mockup: animal avatar, name in
  bold, then the player's ink as a dot *after* the name, with a ticked "Voted"
  tag pushed to the far edge. The dot moved because you look for who it is
  first and what colour they drew in second. Rows are taller (66px), rounder
  and further apart; the picked row is a green border on a pale green fill
  rather than teal, so a pick reads as a choice rather than a status. The
  "Voted" tag went from teal to grey for the same reason. Title up to 30px,
  host's footer trimmed to just the count since the button is right there.
  `playerMemo` now carries `av` as well as name and ink, so a player who left
  still has a face on the ballot.
- **Party popper for the winner only.** The verdict headline is shared, but
  the impostor wins exactly when the room loses, so the emoji is decided per
  player: `caught ? !amImpostor : amImpostor`. All four combinations checked.
- **Turn clock, synthesised.** A tick a second for the whole of your turn,
  alternating 1180 Hz and 880 Hz because a single repeated pitch sounds like a
  fault rather than a countdown. WebAudio oscillator with a 45ms decay, no
  asset to fetch and nothing to fail offline. The AudioContext is built on the
  first `pointerdown` anywhere, since browsers will not start audio without a
  gesture. A mute toggle sits opposite the Leave button on the play screen and
  persists in `localStorage` under `draw:muted`; four phones in one room is
  four clocks, and one of them will want out.

Ballot logic is unchanged: your own name is still off the list, as decided in
#45. The mockup showing four rows was read as a five-player room.

Verified in room `ZQBV` (deleted after): 5 ticks in 5 seconds on my turn with
alternating pitch, silence on everyone else's turn, silence while muted, sound
back on unmute. Verdict emoji correct for room-wins / impostor-escapes /
impostor-caught / room-wrong. No console errors.

---

## 2026-07-27: Impostor Draw — layout tightening, no more discuss phase

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.6. Three changes
off the back of playtest feedback.

- **Lobby settings share one card.** Word Category and Drawing Rounds were two
  cards; they are set once, together, before anyone plays, and splitting them
  only pushed the player list off the fold. New `.setting-split` hairline
  between them, bled to the card edges with `margin: 18px -22px` so it reads as
  a divider rather than a stripe.
- **Turn chips and canvas are one block.** New `.play-stage` wrapper holds the
  strip and the canvas 8px apart. `.canvas-wrap` also switched from
  `align-items: center` to `flex-start`: on a phone the canvas is limited by
  width, so centring left ~50px of dead cream between the chips and the drawing
  they label. The slack now falls below the canvas, above Done.
- **The discuss phase is gone.** Phase order is now
  `lobby → countdown → card → playing → vote → over`. When the last turn is
  taken, `fbAdvanceTurn` writes `phase: 'vote'` and clears `votes` in one
  room-level update instead of parking everyone on the play screen behind a
  host-only Start Voting button. A 2s full-screen card, "Time to find the
  Impostor.", covers the handover; the vote screen is built and live underneath
  it the whole time, so the ballot is ready the instant it lifts.

**This reverses the #45 decision that the host paces the way into the vote.**
The play screen had nothing left to offer once drawing was over, and the button
only stalled the conversation. `fbStartVote()` and `#btn-start-vote` are
deleted; the host still controls the reveal, which is the decision that
actually matters.

Verified in room `64F4` (deleted after): merged card renders with a full-width
divider, chips sit exactly 8px above a 327px canvas, expiring the final turn
auto-opened the vote with the overlay up at ~3s and down at ~5s, thumbnail
carried the stroke, "Caught!" verdict and tally correct, replay cleared votes,
strokes, order and turn. No console errors.

---

## 2026-07-27: Impostor Draw — in-app vote, tally and verdict — #45

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.5. Closes the
loop: a round can now be finished inside the app. Phase order is
`lobby → countdown → card → playing → discuss → vote → over`.

- **The host opens the vote.** Once every turn is spent the play screen swaps
  Done for a host-only **Start Voting**, which moves the whole room to its own
  vote screen. Nobody drifts into voting while others are still arguing.
- **The drawing comes with it.** The vote screen carries a thumbnail of the
  finished canvas, because the drawing is the entire argument. `redraw()` was
  split into `paintStrokes(ctx, size)` so the same normalised strokes render
  into any square context; `paintThumb()` is the one-off version.
- **Votes** live at `votes/<voterId> = <targetId>`. Everyone votes, impostor
  included. Your own name is not in the list, so a self-vote is impossible
  rather than merely discouraged. Picks are changeable until the reveal.
- **"Voted", never "voted for".** Each row shows whether that player has cast
  something, plus an "N of M voted" line. It tells the host whether the reveal
  is fair yet without leaking a single choice.
- **Players who have left stay on the ballot**, dimmed and labelled "(left)".
  If the impostor rage-quits, the room still has to be able to pin it on them.
- **Reveal is available at any time**, as decided: waiting on someone who has
  wandered off would strand the room. It shows a verdict, then the tally, then
  the unmask and the word. **The room only wins by pinning it on the impostor
  outright** — a tie at the top means the room never agreed, so the impostor
  walks. Copy: "Caught!" / "They got away", with the sub-line saying which of
  wrong-player, split-vote or nobody-voted it was.
- **Tally shows only players who drew a vote.** A column of zeroes tells
  nobody anything and pushes the buttons off a phone screen.
- **`.pdot` promoted out of `.pchip`.** Caught in review: the vote and tally
  rows asked for a colour dot and silently got a 0px element, because the rule
  was scoped to the turn strip.
- **Known, and consistent with the rest of the codebase:** votes are readable
  in the raw room JSON while voting is open, exactly as `secretWord` already
  is. Hiding them properly needs per-child rules, which is a bigger change
  than this game currently justifies.
- **Verified** against live RTDB (rooms 5R7L and 6NC2, both deleted after):
  Start Voting appears only for the host and only at `discuss`; the thumbnail
  paints; own name absent from the ballot; changing a pick moves the ring and
  keeps one vote in the DB; "Voted" tags and the counter track other players
  live; a player removed mid-vote stays votable as "(left)"; caught, split and
  nobody-voted all produce the right verdict and tally; replay clears votes,
  strokes, order and turn; and with `hostId` temporarily handed to another
  player, this client correctly loses Reveal, gets "Waiting for the host to
  reveal…", and can still vote. Zero console errors.

---

## 2026-07-27: Impostor Draw — word screen, redesigned canvas screen, quit guard

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.4. Reshapes the
round around the revised flow and the supplied mockups.

- **New `card` phase between the countdown and the canvas.** Everyone lands on
  the same big word card the word game uses, and stays there until the host
  presses **Start Drawing**. `fbStartGame` no longer flips straight to
  `playing`; it flips to `card` and writes `turnAt: null`, so the first
  drawer's 45 seconds start when the host says go rather than while the room is
  still reading. Phase order is now
  `lobby → countdown → card → playing → discuss → over`.
- **Canvas screen rebuilt to the mockups.** Round number, then a single pill
  carrying the drawer's name and the countdown; the pill turns green and reads
  "Your turn" when the pen is yours. It is the only green on the screen, so it
  reads without anyone reading the words. Below it, a sideways-scrolling strip
  of the whole turn order in each player's ink, the live one ringed in teal.
  Undo moved onto the canvas as a corner button. Done is now full-width and
  always present, greyed when it isn't your turn, so the footer never changes
  height mid-round.
- **The word lives under the Done button now**, quietly, instead of in a chip at
  the top: the word for everyone, the vague hint for the impostor. It has to
  stay to hand all game without competing with the drawing.
- **Host loses the mid-game escape hatch.** "End Round Early" and the
  host-triggered "Reveal Impostor" are both gone; the only way out of a round is
  to quit. **The consequence, chosen deliberately: the `discuss` phase is
  currently a dead end** until the vote lands in #45, which is now the next
  piece of work rather than an option.
- **Leaving mid-game asks first.** The host's back button closes the room for
  everyone and a player's leaves a hole in the turn order. Both were one stray
  thumb away, so both now go through a confirm whose copy says which one it is.
- **`playerMemo`** keeps the last known name and ink for every player id. A
  disconnected player is removed from `players/` immediately, so without it a
  departed player's turn chip had nothing to label itself with. Also fixes the
  reveal showing "—" when the impostor left before the reveal (noted on #45).
- **Verified** against live RTDB (rooms YASG and UP85, both deleted after):
  countdown holds Start Drawing disabled and releases it on the phase flip;
  `turnAt` absent while the room reads its card; pen handoff turns the pill
  green and moves the ring; a stroke drawn on your own turn persists with all 9
  points; Done rolls Round 1 → Round 2; a player removed mid-game keeps their
  slot as a faded chip; the last slot lands on `discuss` with the timer cleared
  and the pill collapsed; the strip auto-centres the live chip at 7 players;
  timer goes red at ≤10s (`rgb(208, 74, 47)`); the quit confirm cancels clean
  and, on confirm, deletes the room; zero console errors.
- **Known gap, not new:** if the host's tab dies without leaving, the room now
  sits on the card screen with nobody able to press Start Drawing. Previously it
  would at least have auto-started. The 15-minute idle watchdog still closes it.
  Worth a host-handover ticket at some point.

---

## 2026-07-27: Impostor Draw — turn engine — #43

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.3. The canvas
stops being a free-for-all: one pen at a time, in a published order.

- **Data model:** `meta/order` is the public turn order (array of player ids),
  `meta/turn` is a slot counter that only ever goes up, `meta/turnAt` is the
  deadline for the current slot. The drawer is `order[turn % order.length]`
  and the round is `turn / order.length`. **Counting slots rather than
  tracking a pointer** is what makes skipping a departed player trivial: their
  slot is simply spent, and no bookkeeping has to agree about who is left.
- **Turn order gets its own shuffle.** The first draft reused the shuffle the
  impostor was sliced off the front of, which would have put the impostor
  first in the order every single game. The order is public, so that hands the
  room the answer. Two independent shuffles now; a 60k-deal simulation of the
  fixed code puts the impostor at 20.2/20.1/20.1/19.7/20.0% across the five
  slots of a 5-player game.
- **Three things can pass the pen** and they race deliberately: the drawer's
  Done button, the drawer's own 45s expiry, and a host-only watchdog that
  fires `TURN_GRACE_MS` (4s) after a dead deadline or after the drawer
  disappears. `fbAdvanceTurn(fromTurn)` no-ops if the room has already moved
  past `fromTurn`, and an `advanceGuard` stops the 250ms ticker re-firing the
  same write while the echo is in flight. Only the host runs the watchdog, so
  a stalled turn can never be passed twice by two different spectators.
- **The grace period is not cosmetic.** Without it a two-second tunnel would
  cost a player their whole turn. During it the bar reads "Passing…" rather
  than a stale name.
- **Undo is scoped to the current turn.** `myStrokeIds` resets on every turn
  change, so a player coming round again in round 2 cannot rub out their round
  1 work. A stroke still under the finger when the turn is taken away is
  finished properly (`forceEndStroke`) rather than abandoned half-written.
- New `discuss` phase: rounds done, canvas locked for everyone, chat open,
  host-only button. #45 puts the vote in front of that button.

**Verified in preview** (room NQ47, live RTDB, deleted after): a non-drawer's
pointer writes nothing; host watchdog passed a dead turn and stamped a fresh
45s; Done advanced and rolled Round 1/2 to 2/2; a drawer removed mid-turn was
skipped after the grace with "Passing…" shown meanwhile; the last slot moved
the room to `discuss` with `turnAt` cleared; replay wiped order/turn/turnAt
and the strokes; a second game dealt an independent order. Drawer-side expiry
advanced 5ms after the deadline (not 4s, so it was the drawer's own path, not
the watchdog) and the in-flight 7-point stroke persisted complete. Timer turns
red at 10s. Turn bar fits one line at 375px. Zero console errors.

Testing note: a first attempt at the expiry test looked like a lost stroke.
It wasn't — the real 45s clock had run out during the gap between two tool
calls, so the pointerdown landed when it was no longer my turn. Any test that
straddles a live deadline has to run inside a single eval.

## 2026-07-27: Impostor Draw — flow decisions revised (no code yet)

Design revision agreed before starting #43. No code changed; #43 and #45 were
rewritten to match. Recorded here because it supersedes decisions locked the
day before.

- **Drawing is strictly turn by turn.** Only the active player's pointer does
  anything; everyone else watches the strokes arrive live. The play screen
  names who is drawing now and who is next. This is what #43 puts behind
  `canDraw()`, which today returns true for everyone during `playing`.
- **45s turn timer stays**, as an auto-pass safety net behind the Done button.
  A remote game has no one in the room to nudge an AFK player, so the round has
  to be able to move on by itself.
- **Vote and reveal are host-driven** (supersedes the earlier "everyone votes
  as soon as the rounds end"). When the rounds finish the canvas locks and the
  room sits in discussion with chat open; only the host sees **Vote**, which
  opens voting for everyone including the impostor. Only the host sees
  **Reveal**, and it is available **at any time**, deliberately not gated on
  all votes being in, so one disconnected player can never freeze the room.
  Ties still get no revote: show the tally, reveal, done.
- Unchanged: 1 impostor, the hint is the word's own vague hint and never the
  category (the category is already on screen in the lobby), rounds set in the
  lobby and defaulting to 2, minimum 3 players, undo, one shared square canvas.

## 2026-07-27: Impostor Draw — shared canvas, live strokes, colours, undo — #42

Branch `feat/impostor-draw`. **Not deployed.** Turn order is still #43, so for
this phase the canvas is open to every player while the round is live — that
keeps the phase testable on its own, and `canDraw()` is the single hook #43
replaces.

- **Data model:** `rooms-draw/<code>/strokes/<pushId> = { by, c, p:[x0,y0,…] }`,
  coordinates normalised to integers 0..1000. Normalised points **plus a square
  canvas** are what make a phone and a laptop render the same picture; raw
  pixels would not survive the aspect-ratio difference. The canvas is sized to
  the largest square that fits, so the drawing area is as big as the screen
  allows without ever distorting.
- **Sync uses `onChildAdded/Changed/Removed`, deliberately NOT `onValue`** on
  the strokes node: onValue re-sends every stroke in the room on every point
  flush, which is exactly the wrong shape for live drawing. In-progress strokes
  flush every 90ms; points closer than 4 units are dropped and a stroke is
  capped at 400 points.
- **Ink colours** (`INK_COLORS`, 8) are assigned at join like the avatar
  (first unused wins) and stored on the player record as `c`, so a colour never
  changes when someone else leaves. `refreshPresence` had to be updated to
  re-write `c`, otherwise a reconnect would silently drop it.
- **Undo** removes only my own strokes, one at a time, only while I may draw
  and never mid-stroke. Verified it leaves other players' strokes untouched.
- Round start and replay both write `strokes: null`, so every round begins on a
  blank canvas (verified by pixel-scanning the canvas: 0 painted pixels).

**Two real bugs found and fixed while testing:**
1. The `ResizeObserver` was created without keeping a reference. An
   unreferenced RO can be garbage-collected, which silently stops the canvas
   following the window. Now held in `canvasRO`.
2. Relying on RO/`resize` at all is fragile — mobile browsers skip `resize`
   when the URL bar slides away, and **neither RO nor resize fires at all in
   the headless preview browser** (verified: a freshly created RO received zero
   callbacks, not even its initial one). Added `startCanvasFitWatch()`, a 500ms
   poll that runs only while a round is on screen and re-fits the canvas if the
   container has changed. Cheap, and it makes correct sizing independent of any
   event firing.

**Verified in preview** (rooms S96M / 3TKW / YBUX, live RTDB, all deleted
after): strokes persist to RTDB with the right author, colour and point count;
a remote player's stroke renders live in their own colour; undo removes only
mine and disables itself when empty; canvas is square and fits at 375px and at
desktop width, and follows its container down to 212px and back; replay wipes
the canvas. Zero console errors. Draw v2026.07.27.2.

Note on the test harness: long `setTimeout` chains inside a single preview eval
time out at 30s, which once left a stroke mid-flight and blocked the next
pointerdown (`live` was still set). Keep verification evals short.

## 2026-07-27: Impostor Draw — third game, scaffold + rooms + lobby — #39/#40/#41

Start of the third game: turn-based drawing on one shared canvas, remote-first.
Branch `feat/impostor-draw`. Design decisions are locked in the epic (#39) and
were agreed 2026-07-26. **Hosting not deployed yet; database rules ARE deployed.**

- **#40 `www/shared/words.js`:** the word game's 6 categories / 300 entries
  hoisted out of `word/app.js` into a shared ES module. Draw imports the same
  file, so words and hints have one home.
- **#41 `www/draw/`** (`index.html` + `draw.css` + `app.js`) built on the shared
  modules from #26/#27. Room create/join with code + QR, presence,
  onDisconnect cleanup, 15-min idle watchdog, lobby with animal avatars,
  ready-up, FLIP/confetti roster animations. Draw-specific lobby: **rounds
  stepper** (default 2, clamped 1-5, host-only, synced via `meta/rounds`) and a
  **fixed single impostor** (static pill, no stepper). Categories limited to
  the three drawable ones (Food, Animals, Everyday Objects) — Places, Movies &
  TV and Football are sayable but not sketchable in one turn.
- **Impostor clue = the word's own vague hint** (Popcorn → "Buttery"), exactly
  like the word game. I first built this as the CATEGORY and was corrected: the
  host's category pick is displayed to every player in the lobby, so handing the
  impostor the category tells them nothing they don't already know.
  `meta/imposterHint` holds `entry.h`.
- **Room namespace `rooms-draw/`**, so all three games can hand out the same
  4-char code without colliding. Required a matching node in
  `database.rules.json` (same per-room open shape as `rooms`/`rooms-word`) —
  **without it every room create fails with "Permission denied"**. Deployed
  with `firebase deploy --only database` after the user approved.
- **`www/shared/qrcode.js` (new):** qrcode-generator v1.4.4 was a 20KB
  byte-identical inline `<script>` in BOTH games' HTML. Hoisted to one vendored
  classic script (not a module — it sets `window.qrcode`, and it must stay a
  plain `<script src>` so it's defined before the deferred module runs). Draw
  uses it instead of adding a third copy.
- Hub gained a third game card (+ nth-child(3) animation delay), sitemap entry
  added. Orphaned comments left behind in `word.css`/`dance.css` by the #26
  split were stripped (word.css 163 → 47 lines).
- **Placeholder art**: draw reuses the word game's logo/hub/OG images. Real
  artwork is an open item before launch.

**Verified in preview** (room KX6B, live RTDB, torn down after): create → QR →
lobby; rounds stepper clamps at 1 and 5 with singular/plural label; category
sheet lists exactly 3, single-pick and multi-select both commit; start gating
correct at 1 and 3 players; round deals `secretWord` from the chosen union with
the played-ledger entry; exactly one impostor; crewmate card shows the word,
impostor card shows only the word's hint (Popcorn → "Buttery", verified against
the catalog and confirmed it is not a category name; red tint + banner); reveal shows the
impostor and the word; replay returns to lobby with rounds intact; quit deletes
the room. Zero console errors. Word game re-verified after the QR extraction
(room EFBZ, QR rendered from the shared file). Versions: draw v2026.07.27.1.

Still to come per the epic: canvas + live strokes (#42), roles/turn engine with
the 45s timer (#43), chat (#44), vote (#45), analytics + stats (#46).

---

## 2026-07-27: Shared base.css — 262 identical rules de-duped — #26

Phase 4 of the modularize epic (#22), second prerequisite for Impostor Draw
(#39). Same branch as #27 (`refactor/shared-firebase-analytics`); **no deploy
yet**.

- **`www/shared/base.css` (new, 1,697 lines):** every top-level rule and
  at-block (keyframes, media queries) that was byte-for-byte identical
  (whitespace-normalized) in `dance.css` and `word.css`, extracted in
  dance.css order. 262 blocks. Both games link it BEFORE their own file, so
  game-specific rules keep overriding. Drifted near-duplicates were NOT
  folded in this pass (kept the change purely mechanical + provable).
- **Result:** `dance.css` 2,168 → 890 lines; `word.css` 1,584 → 163 lines.
  A design change is now a one-file edit, and Impostor Draw starts from
  `base.css` + a small `draw.css`.
- **Verification method (worth reusing):** computed-style fingerprint. Before
  the split, hash `getComputedStyle` (element + ::before/::after, all
  properties) for every DOM node on each game's page; re-hash after and diff.
  Word: 358 nodes, 0 real diffs. Dance: 514 nodes, 0 real diffs. The single
  differing node on each page was the `anchorBob` bobbing arrow in the
  How-to-play button, whose computed transform is time-varying (it hashed
  differently on every sample, including two "before" samples). Zero console
  errors; screenshot spot-check clean. Versions: dance/word v2026.07.27.1.

---

## 2026-07-26: Shared firebase.js + analytics.js (de-dupe, no-build) — #27

Phase 5 of the modularize epic (#22), done first as the foundation for the third
game, Impostor Draw (#39). Branch `refactor/shared-firebase-analytics`. All
verified in preview (see below); **no deploy yet**.

- **`www/shared/firebase.js` (new):** single source for `FIREBASE_CONFIG`,
  `FB_CONFIGURED`, and the `app` + `db` singletons (getApps guard, try/catch:
  `db` stays null on failure and every caller already guards `!db`). Pinned SDK
  10.12.0 everywhere; stats.html previously floated on 10.12.2 and was aligned,
  because mixing SDK versions creates parallel module instances whose handles
  reject each other.
- **`www/shared/analytics.js` (new):** `analyticsEnabled()` production gate,
  `safeKey`, `todayKey`, shared coarse-geo cache (`peekGeo`/`rememberGeo`/
  `fetchGeo`, localStorage `imp_geo`), and `createAnalytics(game)` returning
  `{ bumpAnalytics, trackError, installGlobalErrorTracking, trackSession,
  bumpFbPrompt }` bound to `analytics/<game>`. Paths and throttles are
  byte-identical to the old copies; no schema change.
- **Consumers cut over:** `dance/app.js` and `word/app.js` (config + init +
  analytics blocks deleted; game-specific `trackRound`, `trackSongMiss`,
  `trackSongFetch` stay local and now read country via `peekGeo()`);
  `www/index.html` hub visit tracking is now `createAnalytics('hub')
  .trackSession('imp_hub_sess')` (hub keeps its own session key = separate
  funnel entry, and gains the geo fallback provider + cache the games had);
  `stats.html` imports `db` from the shared module; `shared/auth.js` drops its
  config copy and imports `app`.
- **Behaviour preserved on purpose:** games still share the `imp_sess` session
  key (dance→word in one tab counts one visit, historical behaviour); global
  error listeners are opt-in per page (`installGlobalErrorTracking()`), hub
  stays listener-free as before.
- **Verified in preview:** all 5 JS files + both inline HTML modules pass
  `node --check`; hub, dance, word, stats load with zero console errors; live
  room created + lobby synced + quit in BOTH games against prod RTDB (rooms
  ephemeral); stats renders live prod KPIs on SDK 10.12.0;
  `analyticsEnabled()` confirmed false on localhost. Versions: dance/word/hub
  v2026.07.26.1 (stats has no stamp, internal page).

---

## 2026-07-24: Stats page — Total games played + Accounts created (BUILT, not yet deployed) — #37/#38

Two additions to `www/stats.html` Overview, plus sign-in instrumentation. Verified in
preview MCP against live prod analytics (public `.read`); no console errors. **Not
committed or deployed** — awaiting go-ahead. #38 shows 0 until `auth.js` ships (the
counter only writes from production).

- **#37 Total games played (KPI):** re-added the combined games KPI the Overview had
  dropped. Teal `.kpi.games` card, ids `all-g-total/today/avg`, range-aware (already
  filled by `renderSection`'s combined path). Verified 30d = 7,804 = Dance 5,266 +
  Word 2,538; 7d = 2,192.
- **#38 Accounts created (KPI + instrumentation):** new purple `.kpi.accounts` card
  (`--accent-purple #7c6bd0`, ids `all-acct-total/today/range`), all-time cumulative,
  reads `analytics/hub/accounts`. **Instrumentation** in `www/shared/auth.js`:
  module-level `onAuthStateChanged` → `recordAccountOnce()` stamps
  `users/<uid>/createdAt` on first sight (own node, allowed by rules) then bumps
  `analytics/hub/accounts/{total, daily/<day>/count}`. Counts each account ONCE
  (unique accounts, not logins); skips anonymous users; **production-only** gate
  (`acctAnalyticsEnabled()` mirrors the games' localhost/preview exclusion) so dev
  never inflates it. No PII — just a count. `analytics` node is already
  `.read/.write: true`, so no rule change needed.
- **Overview KPI layout** is now 3 + 2 + 2: row1 = Total visits / Total games /
  Total ratings; row2 = Dance games / Word games; row3 = Hub visits / Accounts
  created. Stacks single-column below 640px (existing media query).
- stats.html has no version stamp (internal `noindex` page); none added.

---

## 2026-07-24: Song Groups launch-readiness batch (SHIPPED) — #30/#33

Final pass before taking Song Groups + host sign-in live. Shipped together with the
Phase A/B commits on `feat/song-groups`. **Final versions: dance v2026.07.24.13,
hub v2026.07.24.3.** Database `users/<uid>` rules were already live. Everything below
was verified in the preview MCP with real Anonymous-auth sessions + iTunes search;
all test rooms/groups/anon accounts cleaned up; no console errors.

**Quick reference — Song Groups final shape:**
- Group = `{ id, name, createdAt, songs: [{title, artist, trackId}] }` at RTDB
  `users/<uid>/danceGroups/<id>`. Selected group rides in room `meta` as
  `sourceType:'group'`, `groupId`, `groupName`, `groupSongs`; re-resolved by
  `trackId` at play time. Analytics logged under `userGroup` (never song titles).
- Constants (`www/dance/app.js`): `GROUP_MIN_SONGS = 4`, `GROUP_MAX_SONGS = 50`,
  `GROUP_MAX_GROUPS = 2`. Name optional → auto `nextGroupName()` = lowest free
  "Song Group N". Sign-in gates ONLY group create/load; hosting/joining/playing
  stay login-free. Sign-in methods: Google popup (+redirect fallback) + email link.
- Terminology (locked): built-in curated sets = "Music category"; user-created
  sets = "Song group". Avoid "song category".

Launch-readiness pass on the auth surface (dance v2026.07.24.5):

- **Delete account** (client-only, no Cloud Functions — works on Spark). New
  `deleteAccount()` in `shared/auth.js`: removes everything the user owns under
  `users/<uid>` (RTDB `remove()`, allowed by the owner rules) **first**, then
  deletes the Firebase Auth user. Handles `auth/requires-recent-login` by
  re-authing Google inline via popup and retrying; email-link users who need
  re-auth get a `needs-resignin` message ("sign out and sign in again, then
  delete") — `remove()` is idempotent so the retry just finishes the account
  delete. Wired into the account menu as a red "Delete account" item that opens a
  simple confirm dialog (Cancel / red Delete) in `shared/auth-ui.js`. Required
  for Google/Apple platform policy + GDPR/CCPA erasure before launch.
- **Sign-in button restyled to a ghost/text button** matching the "← All games"
  back link. Made the shared `.imp-auth-account` style ghost (transparent, no
  border, ink-soft, 15px/500) so the hub and dance landing pages show an
  identical Sign in affordance (was a pill on the hub).
- **Account dropdown overflow fixed:** `.imp-auth-menu` now anchors
  `top:calc(100% + 6px); right:0` with `max-width:calc(100vw - 32px)` so it opens
  down-left from the button and never crops off-screen (was overflowing the right
  edge at every width). Fixes the hub menu too since it's shared.
- **Google "G" logo** added to the "Continue with Google" button, left-aligned.
- **Default music category** changed from "80s Hits" to "TikTok and Reels"
  (`DEFAULT_CATEGORY` + the hardcoded initial trigger label in index.html).

(Interim: briefly hid the dance Sign in button via a `hideWhenSignedOut` option,
then reverted per Irfan — the dance and hub landing pages should look the same,
both showing the ghost Sign in button. Option removed; final state is dance
v2026.07.24.7 / hub v2026.07.24.1.)

- **Cap of 2 song groups per host** (dance v2026.07.24.8): `GROUP_MAX_GROUPS = 2`.
  At the cap the "+ Create a song group" row is replaced by a subtle note
  ("You can keep up to 2 song groups. Edit or delete one to add another.");
  `openGroupBuilder`/`saveBuilderGroup` guard new-group creation as a safety net
  (toast). Editing/deleting existing groups is unaffected.
- **One-time "create song groups" lobby tooltip** (dance v2026.07.24.8): dark
  pill anchored under the Music Category trigger — "✨ Now you can create your own
  song groups." Host-only, shown once per device (`imp_dance_grouphint`
  localStorage flag) until a 2026-12-01 cutoff, mirroring the existing mode-hint
  pattern; dismissed when the category picker opens. Added `position:relative` to
  `.music-section` so the absolute tooltip anchors correctly (like `.mode-section`).
- **Never show both lobby hints at once** (dance v2026.07.24.11): the two "what's
  new" nudges (Find Your Squad mode vs. song groups) no longer overlap. Lobby entry
  runs `if (!maybeShowGroupHint()) maybeShowModeHint()` — the song-group hint takes
  priority; `maybeShowGroupHint()` now returns whether it displayed, and the mode
  hint only shows on a later visit once the group hint has been seen. Verified:
  first lobby visit → group hint only; second visit → mode hint only.

Verified in preview: tooltip shows on first lobby arrival (flag then set);
create row hides at 2 groups + note shows; create row returns after deleting one.
Test groups + anon account cleaned up; no console errors.

- **Group name is now optional** (dance v2026.07.24.9): Save enables on ≥4 songs
  alone; a blank name is auto-filled on save with the lowest free "Song Group N"
  (`nextGroupName()` scans existing names, skips the one being edited). Placeholder
  changed "Add group name" → "Group name (optional)". Verified: blank save →
  "Song Group 1", second → "Song Group 2", and after deleting #1 a new blank group
  reclaims "Song Group 1" (not 3).
- **Cap of 50 songs per group** (dance v2026.07.24.10): `GROUP_MAX_SONGS = 50`,
  enforced in `addBuilderSong` (toast "Up to 50 songs per group", add ignored).
  Keeps the room `meta` payload (all group songs ride in meta at play time) sane.
  Verified: accumulating ~90 search results caps the selected list at exactly 50;
  over-cap add toasts and no-ops; a full 50-song group saves fine.

**Verified end-to-end** with an Anonymous session: wrote a test group under
`users/<uid>/danceGroups`, ran `deleteAccount()` → data removed, auth user
deleted (`currentUser` null), account button reverted to "Sign in", no console
errors. Confirm dialog + menu item + menu positioning checked in preview
(desktop + mobile). Still uncommitted on `feat/song-groups`.

- **Subtle privacy notice at sign-in** (dance v2026.07.24.12 / hub v2026.07.24.2):
  one muted line in the shared sign-in modal — "We only store your email and the
  song groups you create. You can delete your account anytime." Transparency at
  the point of collection before launch, without waiting on the full privacy page.
  Interim until #35 ships, at which point it becomes a link to the policy.

**Follow-up (separate ticket):** privacy-policy page update covering stored
identity (email/name) + song groups and how to delete them. Deferred per Irfan.
An interim plain-language notice now lives in the sign-in modal (see above).

---

## 2026-07-23: Song-load failure tracking + stats panel (dance) — #29

Added telemetry so we can see which pool songs the iTunes preview API fails on
and replace them, instead of finding out mid-game. Two parts, dance-only (the
word game has no songs):

**Counter (`dance/app.js`).** In `fetchPreview`, a genuine miss (Apple returned
no playable preview for a pool query) now calls `trackSongMiss(query)`, logging
the song plus the player's country under
`analytics/music/errors/songMiss/<song>/{count, countries/<cc>}`. Reading it:
one country = region-locked, many = the song is gone from the store. This catches
what the offline pool validator can't — songs that rot after shipping or fail
only in certain storefronts. Network/timeout/bad-response failures aren't a
song's fault, so they go to a plain `errors/songFetch/net` tally (+ daily) via
`trackSongFetch('net')` rather than blaming a title. Throttled ≤1 bump / 10s /
song; prod-only through the existing `bumpAnalytics` gate; never throws into
gameplay. Country comes from the already-cached `lastGeo.cc` (no extra lookup);
`ZZ` when not yet resolved. Free-text host searches are deliberately not tracked
— arbitrary terms aren't a fixable pool entry.

**Stats panel (`stats.html`).** New "Songs failing to load" panel in the Dance
section (`hasSongFails` flag): each row shows the song, a bar for the miss count,
and the country flags where it failed, so region-locked vs dead reads at a glance.
The panel header shows the network-failure tally. All-time by design (no per-day
node kept for song misses), so it ignores the range selector; a caption notes
this. New `renderSongFails()` helper; reuses the existing `.row`/`flag()`
machinery plus a small `.hint`/`.flags` style.

**RTDB schema written (all under `analytics/music/`):**
- `errors/songMiss/<safeKey(query)>/count` — total misses for that pool query.
- `errors/songMiss/<safeKey(query)>/countries/<ISO cc>` — per-country breakdown
  (`ZZ` = country not yet resolved). One cc = region-locked; many = song is gone.
- `errors/songFetch/net` and `errors/songFetch/daily/<YYYY-MM-DD>/net` — Apple
  unreachable / timeout / bad-response tally, not attributed to any song.

The stats page reads these straight off the existing full-`analytics` snapshot
(`DATA.music.errors.*`); no new DB read and no rules change (`analytics` is
already `.read:true`). Write↔read key contract checked by hand — they match.

**Testing note for future refs:** analytics is production-gated on purpose
(`analyticsEnabled()` = true only on impostorgames.com / native app; false on
localhost AND `*.web.app` preview channels), so the actual RTDB write CANNOT be
exercised anywhere but live prod. Local verification therefore covered only the
non-write surface: dance page loads with no console errors, stats panel wires up
and renders correctly (empty state + injected sample rows with flags/bars via
DOM inspection), word game untouched (`git diff`). The write path reuses the
same proven `bumpAnalytics` plumbing as every other counter — only the paths and
two call sites are new. **First-deploy check:** trigger one known-failing song on
the live site (or wait for organic misses) and confirm a `songMiss` node appears
in the RTDB console / stats panel; a stray test entry can be deleted from the
console. Until that check runs, treat the end-to-end write as unconfirmed.

Decisions (from discussion): ship the counter now for real data before deciding
on any provider swap; keep a Deezer fallback in reserve, not built yet; skip the
"middleman" fetch refactor until the data shows it's warranted. Version stamp
v2026.07.23.3 → .4. Not deployed — pending review.

---

## 2026-07-23: Song Groups — design pass on the builder + picker (Phase B)

Reworked the Song Groups UI to a supplied design (dance v2026.07.23.7):
- **Signed-out uses the same "+ Create a song group" row** as signed-in (dropped
  the separate CTA); tapping it while signed out opens the sign-in popup.
- **Saved-group rows show an edit pencil**, not a delete ✕. The pencil opens the
  group in the builder. Tapping the row still selects it. **Delete moved into the
  builder** as a trash button (deletes when editing, discards the draft when new).
- **Rebuilt the builder popup**: search on top (magnifier + clear), one middle area
  that shows search results ("N songs") while typing and the picked-songs list when
  the box is empty, group name near the bottom, then Save + trash. 4-song minimum
  kept with a subtle "Add at least 4 songs" hint (Save disabled until name + 4).

Verified in preview with a real (anonymous) session: signed-out Create row opens
sign-in; builder search/add/remove + results↔selected toggle + count + clear all
work; Save gating + hint correct; save → group shows with pencil and auto-selects;
pencil → edit mode (name + songs prefilled); trash → deletes from RTDB and falls
back to the default category. No console errors. Test data cleaned up.

---

## 2026-07-23: Song Groups — create / save / reuse (epic #30, Phase B)

The payoff that makes signing in worthwhile: a host can build their own named set
of songs and reuse it in every mode except DJ. Sign-in is the *only* gate — it sits
at "create a song group" (and at loading saved groups); hosting, joining, and
playing with built-in categories stay fully login-free.

- **Storage:** RTDB `users/<uid>/danceGroups/<id>` with per-user rules added to
  `database.rules.json` (`auth.uid === $uid` for read + write). A group is
  `{ name, createdAt, songs:[{title, artist, trackId}] }`.
- **Builder** (new modal): reuses the DJ-mode iTunes search (`searchItunes`) — pick
  real previewable tracks, name the group, save. Enforces a 4-song minimum.
- **Picker:** a "My Groups" section at the top of the category modal (every mode
  except DJ). Signed out → "Sign in to create your own song group" CTA. Signed in →
  the host's groups + "Create". Selecting one sets the room's song source.
- **Play-time:** the chosen group's songs ride in the room `meta`
  (`sourceType:'group'`, `groupSongs`, `groupId/Name`) so all clients sync;
  re-resolved by **trackId** at play (iTunes preview URLs rot). New group-aware
  pickers mirror `pickPair`/`pickDistinctSongs` with a synthetic `__group__`
  category, so the played-ledger and round-start flow are otherwise untouched.
- **Analytics:** group rounds count under a single `userGroup` label; never logs
  user-entered song titles (`trackRound` now skips a null song).
- Firebase init already made idempotent in Phase A, so importing auth is safe.

Verified in preview (everything not behind real auth): no console errors, no
regressions — the category picker still lists all built-in categories and the
signed-out CTA opens the sign-in modal; the game stays ungated (create + join with
no prompt). Builder mechanics fully exercised: iTunes search returns results, tap
to add/remove, live count + 4-song-minimum gating on Save, `+`/`✓` indicators.
Dance v2026.07.23.6.

**Verified end-to-end (2026-07-23)** with a real signed-in session (Anonymous auth
enabled temporarily for testing): account state recognised → "My Groups" shows
Create; built + **saved** a group to `users/<uid>/danceGroups` (RTDB write allowed
by the new rules); loaded it back into My Groups; **selected** it → room meta
`sourceType:'group'` + trigger shows the group name in the lobby; switching to a
built-in category cleanly clears the group; play-time **re-resolution by trackId**
works (iTunes lookup returns a fresh preview); and **rules isolation confirmed** —
reading/writing another uid's groups is PERMISSION_DENIED. Test room + group cleaned
up afterward. Database rules already deployed. Remaining: disable Anonymous auth,
then merge + deploy hosting to go live.

---

## 2026-07-23: Auth foundation — hub-level sign-in (Song Groups epic, Phase A)

First slice of the sign-in + Song Groups epic (#30). Goal framing: build a base of
logged-in users whose reason to have an account is creating song groups and reusing
them across gatherings. **The game stays fully login-free** — this phase only adds
the ability to sign in; it gates nothing (the account wall arrives in Phase B, only
at "create a song group").

- New shared, DOM-free auth module **`www/shared/auth.js`**: Google popup (redirect
  fallback for WebViews) + passwordless email magic-link, `browserLocalPersistence`,
  `onAuthChange`/`currentUser`/`signOut`, and load-time completion of
  magic-link/redirect sign-ins. Reuses the existing public `FIREBASE_CONFIG`.
- New **`www/shared/auth-ui.js`**: injects a drop-in sign-in modal (styled with the
  site's CSS tokens) + a managed account button (`mountAccountButton`) — no markup
  duplicated across pages.
- Wired into **dance** (account button in a new home top bar) and the **hub**
  (top-right). Firebase init made idempotent in both (`getApps()?getApp():init`) so
  importing auth never double-inits — this also protects the hub's production
  analytics init.
- Providers (Google + Email link) still need enabling in the Firebase Console
  (owner action) before real sign-in works end to end.

Verified in preview: `auth.js`/`auth-ui.js`/`firebase-auth.js` load 200, no console
errors, no double-init. Account button shows "Sign in"; modal opens (Google +
email) and closes; **Create still advances to setup with no auth prompt** (game
ungated); guests unaffected. Hub analytics gate still holds on localhost
(`imp_hub_sess` stays null). Versions: dance v2026.07.23.4 → .5, hub .1 → .2.

---

## 2026-07-23: Refactor — split word into index.html + word.css + app.js (Phase 3)

Applied the same no-build split to the word game (#25). Moved the ~1,580-line
`<style>` block into `word/word.css` and the ~2,000-line app
`<script type="module">` into `word/app.js`; the vendored qrcode-generator
classic script stays inline. `word/index.html` is now **560 lines of pure
markup**, down from 4,143. Pure move, no rule/logic changes.

Verified in preview: renders identical (`.btn-primary` navy + Inter), `word.css`
and `app.js` load 200, Create advances home→setup (event wiring intact), no
console errors, analytics gate still holds on localhost (no RTDB writes).
Version stamp v2026.07.23.1 → .2. Pure code reorg, no IndexNow ping.

Both games are now structurally clean and split the same way. Nothing shared
yet (deliberate) — de-dupe comes next: Phase 4 shared `base.css` for the 268
identical CSS rules (#26), Phase 5 shared `firebase.js` + `analytics.js` (#27).

---

## 2026-07-23: Refactor — split dance into index.html + dance.css + app.js (Phases 1-2)

Kicked off the no-build modularization epic (#22) so the growing games stay
maintainable as new modes and features land. Native browser features only:
external stylesheet + `<script type="module" src>`. No bundler, no framework;
relative paths keep web + Capacitor working.

**Phase 1 (#23).** Moved the ~2,080-line `<style>` block out of
`dance/index.html` into `dance/dance.css`. Pure move, no rule changes.

**Phase 2 (#24).** Moved the ~3,140-line app `<script type="module">` out into
`dance/app.js`. The vendored qrcode-generator classic script stays inline (runs
before the module, so its global is still reachable). `index.html` is now
**717 lines of pure markup**, down from 5,942.

Verified each phase in the local preview: renders pixel-identical, `dance.css`
and `app.js` load 200, Create advances home→setup (event wiring intact), no
console errors, and the analytics production gate still holds on localhost (no
RTDB analytics writes). Version stamp v2026.07.23.1 → .2 (Phase 1) → .3
(Phase 2). Pure code reorg, no content change, so no IndexNow ping.

Remaining phases (still open under #22): Phase 3 word split (#25), Phase 4
shared `base.css` de-duping the 268 identical CSS rules (#26), Phase 5 shared
`firebase.js` + `analytics.js` (#27), Phase 6 dance `app.js` → `modes/*.js`
(#28). Not yet merged to main / deployed — awaiting go-ahead.

---

## 2026-07-23: Analytics — production-only gate + scrubbed Find Your Squad test rounds (dance)

Two related things, both about keeping the live counters honest.

**Cleanup.** The Find Your Squad launch-day testing (all on the preview channel,
2026-07-22) had inflated the live analytics. Backed the 74 test rounds out of
every counter they touched, by direct RTDB edit (no code/deploy):
`games/modes/findSquad` 75→1, `games/daily/2026-07-22/modes/findSquad` 74→0,
`games/total` 5195→5121, `games/daily/2026-07-22/count` 173→99,
`games/countries/IN` 4275→4201, `games/daily/2026-07-22/countries/IN` 145→71.
Country rows assume all 74 were IN (host location) — an inference, not stored
data, since analytics keep no IP or per-round record. Find Your Squad now reads
1 real round (2026-07-23). Partner Hunt interest counter (3) left as-is.

**Root cause + fix.** Preview-channel links share the same Firebase config /
`analytics` bucket as production and the code had no origin gate, so every test
run polluted live numbers. Added `analyticsEnabled()`: writes only when
`location.hostname` is impostorgames.com / www, OR `window.Capacitor` is present
(native app). Preview channels (*.web.app), localhost, 127.0.0.1, file:// now
write nothing. Applied across ALL three surfaces that write analytics:
- Dance (`www/dance/index.html`): `bumpAnalytics`, `bumpFbPrompt`, early-return
  in `trackSession` / `trackRound` (also skips the geo fetch off-prod).
- Word (`www/word/index.html`): same four paths. → v2026.07.23.1.
- Home hub (`www/index.html`): gated the inline `trackHubVisit` (writes
  `analytics/hub`). → v2026.07.23.1.
Dance version → v2026.07.23.1. Verified each on localhost: loads made zero RTDB
analytics writes (dance findSquad counter held at 1; hub `imp_hub_sess` guard
never set, proving early-return). No indexable content changed, so no IndexNow
ping.

## 2026-07-22: "New game mode" lobby nudge (dance)

One-time tooltip pointing at the lobby mode picker: "✨ New game mode is here.
Give it a try!". Same pattern as the multi-select `.cat-hint` — host-only,
shown once per device (localStorage `imp_dance_modehint`), with a cutoff
(`MODE_HINT_UNTIL` = 2026-10-01) so it stops nudging newcomers later. Dismisses
on tap or when the picker opens. Version → v2026.07.22.2. No indexable content
changed, so no IndexNow ping.

## 2026-07-22: Dance mode-picker redesign + Find Your Squad mode + Partner Hunt teaser

Reworked the dance game's mode system from two modes to a four-card picker, and
shipped one new playable mode. Version stamp → v2026.07.22.1. Dance page only;
word game untouched. Tickets: #17, #18, #19 (Partner Hunt full build deferred to
#20).

Design / rename (#18):
- Renamed the UI label of the original `category` mode "Shuffle Party" →
  **Imposter Challenge**. Internal mode id stays `category`, so existing rooms
  and all `games/modes/category` analytics keep working untouched. Copy sweep of
  the old name across the dance page meta description, VideoGame + FAQ JSON-LD,
  visible how-to/FAQ text, `llms.txt`, and the stats page mode labels.
- Mode picker modal now renders four cards (Imposter Challenge, DJ Mode, Find
  Your Squad, Partner Hunt) with per-mode line-art icons.

Find Your Squad (#17):
- New selectable mode `findSquad`. No impostor and no game master — the **host
  dances too** (confirmed with user). Players split into **two teams**, each
  team gets its **own clearly-distinct song** (user chose distinct over
  similar-sounding); everyone dances and tries to find the others on their
  track.
- Shared group-mode data model: `meta/groupTracks` (array of {title,artist,url},
  one per group) + `meta/groups` ({playerId: groupIndex}). `isGroupMode()`
  gate; `numGroups()` → 2 for Find Your Squad. New `pickDistinctSongs()` helper
  mirrors `pickPair`. No `imposterIds`, no played-ledger bookkeeping in group
  modes.
- Results are **host-reveal only** (user chose this over per-player guessing):
  the reveal screen lists each team's members + song. Discussion phase copy
  adjusted; host hits reveal.
- Lobby: group modes reuse the category picker (songs come from categories),
  impostor stepper hidden, host tag shows "Host", **minimum 4 players** (so
  there are always two teams of ≥2). Analytics `trackRound` gains
  `findSquad`/`partnerHunt` under `games/modes/*`.

Partner Hunt — coming-soon teaser (#19), full build deferred (#20):
- Partner Hunt appears in the picker as a **non-selectable "Coming soon"** card
  with a **🙋 I want this sooner** button. The round logic is pre-scaffolded
  (dormant) but the card can never be selected, so the mode is not playable yet.
  The card content dims to 0.5 opacity while the interest button stays full.
- The button is a **cookie-free demand counter** (user confirmed counter over a
  feedback record): first tap per device flips a localStorage flag and bumps
  `analytics/music/interest/partnerHunt` (+ `interest/daily/<day>/partnerHunt`),
  then the button locks to "🎉 You're on the list". Read the total in the
  Firebase console to gauge demand before building the full mode (#20).

Design iterations (post-build, with user):
- Mode icons are now **mascot illustrations** (imposter/dj/squad/partner),
  converted to WebP (~9–15 KB each, `www/icons/modes/`; 465px source PNGs kept in
  `design/`, outside `www/` so they don't deploy). Picker spacing reworked: 24px
  list padding (scoped to `#mode-modal-list`, not the shared `.cat-modal-list`),
  80px card icons.
- `.cat-row` vs `.mode-row` padding separated: `.cat-row` stays app-consistent
  (18/56/18/24, shared with word), `.mode-row` owns `16/16/16/12 !important`
  (dance-only; needed because `.cat-row` is declared later and would otherwise win).
- Players now see the game mode (read-only) in the lobby via a **compact,
  label-less card** (no "GAME MODE"/"MUSIC CATEGORY" titles, 34px icon, note +
  category). DJ Mode shows "host's choice" instead of the exact song.
- Reveal redesigned into squad cards: "🎉 The Reveal!" + subtitle, viewer's squad
  first as teal "YOUR SQUAD", the other as red "THE OTHER SQUAD", avatar member
  chips with a "YOU" tag, and the song at the **bottom** (neutral text,
  squad-coloured note icon).
- Mode descriptions reworded to the original mockup copy; word game
  `.cat-row-title` margin-bottom 4→8px (kept in sync with dance).

Status: field-tested by the user across 4+ phones (real Find Your Squad round +
grouped reveal worked), version v2026.07.22.1, **deployed to production**
(firebase hosting) and IndexNow-pinged for /dance/.

## 2026-07-21: In-app How-to-play popup + "Ready up" step (both games)

Added a "How to play" button in the lobby, right-aligned on the same row as the
Leave Room / Quit Game back button (wrapped both in a new `.lobby-topbar` flex
row, space-between). Ghost styling reuses the existing `.back-btn`. Tapping it
opens a popup built on the shared `.cat-modal` shell (same as the QR / category
modals). The popup shows the how-to steps only; its open handler clones the
landing page's `.howto-steps` list into the modal body, so there is a single
source of truth per file (no duplicated step markup) and the popup can never
drift from the landing page.

Also added a new dedicated "Ready up" step to the how-to steps (landing +
popup): "Each player taps the I'm Ready button in the lobby. Once everyone has
tapped it, the host can start the round." Copy names the actual button. Dance:
new step 4 (Pick a vibe -> 5, Dance -> 6, Catch -> 7); Word: new step 3 (Draw
-> 4 ... Reveal -> 7).

- Scope: lobby only. Reuse discussion (shared components across the two games)
  deferred - staying with two self-contained files for now.
- Verified in local preview (both games): topbar space-between, popup opens with
  all 7 cloned steps incl. "Ready up", Esc / backdrop / × close, no console errors.
- Version stamp -> v2026.07.21.5 (both games).

---

## 2026-07-21: How-to-play step 2 copy - mention QR join (both games)

Reworded the "Create or join a room" step to call out the QR path on both
sides: "One person creates a room and shares the 4-character code or QR code.
Everyone else joins by entering the code or scanning the QR." Accurate today
(the shared QR is a join deep-link, scannable with any phone camera); does not
depend on the in-app scanner still parked in #15. Copy-only, no logic.

- Version stamp -> v2026.07.21.4 (both games).

---

## 2026-07-21: Fix Room Code screen jitter while typing (both games)

Owner reported the join Room Code screen "blinking" / shifting while typing the
4-character code. Root cause: the code boxes are vertically centered by flex
spacers (flex:1 above, flex:2 below) inside a height:100% scroll container, and
every keystroke auto-advances focus to the next box. On mobile each programmatic
.focus() makes the browser scroll the newly-focused box into view above the
keyboard, nudging the un-anchored centered layout on every keystroke -> the
jitter. Not a regression from the lobby-animation work (different screen).

- Fix: pass `{ preventScroll: true }` to all five code-box .focus() calls
  (auto-advance, backspace, ArrowLeft, ArrowRight, paste). Focus still moves
  between boxes as before; the browser just stops scrolling on each move.
- Cleanup found in the same spot: there were two global `.code-box` /
  `.code-boxes` rule sets. The second (intended for the host share screen,
  56x70) was overriding the join inputs, and the "intended" join size (72x72)
  would actually overflow small phones. Scoped the share rules to
  `#share-code-boxes` and set the join rules explicitly to the size that was
  already rendering (56x70, gap 10, font 32). Net: identical pixels, but the
  join inputs no longer inherit the share screen's display:flex + cursor:pointer
  (they're now correctly display:block / cursor:text).
- Verified in mobile preview: join boxes 56x70, no horizontal overflow; share
  boxes still 56x70 flex-centered; no console errors.
- Version stamp -> v2026.07.21.3 (both games).

---

## 2026-07-21: Smooth lobby join/leave animation (both games)

Joins already animated (pop-in + confetti), but leaves jumped: the player list
rebuilds with `list.innerHTML = ''` on every RTDB snapshot, so a departing
player's row was simply gone from the next rebuild and everyone below snapped
up. Same jolt when someone auto-locked their phone and presence dropped them.
Fixed with two CSS-only techniques, no framework (Framer Motion is React-only;
the app is vanilla single-file). Decision confirmed with owner: no dependency.

- Rows now carry `data-pid` so renders can be diffed by player id.
- Leave: before the rebuild wipes the list, any row whose player is no longer
  present is cloned into a fixed-position `.player-ghost` on `<body>` (the same
  escape-the-rebuild trick the confetti uses) that fades + slides out via a new
  `row-out` keyframe. The real row still gets rebuilt away underneath it.
- FLIP: rows that survive the rebuild are snapped back to their pre-rebuild
  position (First rect captured before wipe) then released to glide to the new
  layout, so the gap closes smoothly. Rows that didn't move (dy < 1px) and
  freshly-joined rows (which own the pop-in) are skipped.
- Rejoin symmetry: when a player ghosts out, their id is dropped from
  `lobbySeen` so a return (e.g. screen back on after presence dropped them)
  replays the pop-in entrance instead of blinking in. `burstFired` is kept, so
  a reconnect gets the gentle pop-in but not a fresh confetti salvo (confetti
  stays reserved for genuine first joins, and won't spam on flaky networks).
- All new motion is gated behind `prefers-reduced-motion: reduce` (ghost +
  FLIP both skipped), matching the existing join-animation guard.
- Verified on local preview: both pages load with zero console errors; ghost
  spawns and runs `row-out` (opacity ~0.33 at 120ms), survivor below the
  leaver inverts to translateY(76px) then glides to identity, row above the
  leaver correctly untouched.
- Version stamp -> v2026.07.21.2 (both games).

---

## 2026-07-20: SEO title/description tune from first Search Console data

First GSC keyword data (55 queries) showed the dance page earning nearly all
clicks while word-game queries got impressions but zero clicks, and searchers
overwhelmingly typing "imposter" (e) while our titles led with "Impostor" (o).
Tuned titles to match real query language. Head-only changes, no UI or logic.

- Word title: "Impostor Word Game — free online imposter word party game" ->
  "Imposter Word Game | Find the Impostor | Free Online Party Game" (searcher
  spelling first, mirrors "find the imposter word game" queries, both
  spellings still covered).
- Dance title: "Impostor Dance Game — free headphones party game" ->
  "Imposter Dance Game | Free Headphones Party Game". Kept "headphones"
  over "online"/"who is the imposter" since headphones queries had the most
  impressions after "dance". 
- Dance meta description now opens with "Who is the imposter?" (e spelling)
  per owner, so app-alternative searchers see the exact phrase bolded in the
  snippet; category list + DJ Mode keyword coverage kept.
- Home page, canonicals, structured data, OG/Twitter tags untouched (already
  in place from earlier SEO work). Decision: change once, then hold 2-3 weeks
  and read GSC (avg position + CTR) before iterating.
- Version stamp -> v2026.07.20.1 (both games).

---

## 2026-07-19: Compact lobby header (both games)

The lobby header was a tall centered stack: back button, a big 36px "Game
Lobby" heading, then the room code chip + QR button on a separate row below.
It pushed the game-mode/category card too far down. Reworked into one compact
row so the lobby content starts higher.

- New `.lobby-head` flex row replaces the lobby's centered `.logo` block: game
  icon + "Lobby" on the left, room code chip + QR button pushed right
  (`justify-content: space-between`), `16px 0` margins.
- Icon reuses each game's landing-screen logo at 56px: `/logo-dance.webp` for
  dance, `/logo-word.webp` for word. Both intrinsics are square (448x448).
- Heading shortened "Game Lobby" -> "Lobby", 36px -> 26px, left-aligned.
- Code chip + QR button backgrounds made transparent (`#fff` -> `none`) so they
  read as outlined pills on the cream page. Both classes are lobby-only, so no
  other screen is affected.
- Back button label kept as "Leave Room" (unchanged) per owner.
- Scoped to a lobby-only class; the home screen's `.logo` styles are untouched,
  so no other screen shifts. Verified both games in the mobile preview; header
  renders on one row with each game's own icon, no console errors.
- Version stamp -> v2026.07.19.3 (both games).

---

## 2026-07-19: Keep players in-game with Screen Wake Lock + rotating hint (SHIPPED)

Ticket #14. When a phone auto-locks in the lobby (player taps Ready, then waits
while the host gathers everyone) the socket drops and presence can bump them.
The lobby wait is the risk window; during the round the screen is active. Both
games.

- Screen Wake Lock API keeps the phone awake for the whole room session, so for
  most players the screen simply never sleeps. Acquired in `setupPresence()`
  (covers host-create and join), re-acquired on `visibilitychange` -> visible
  (the lock auto-releases when hidden/locked), released in `leaveRoom()`. Fails
  silently where unsupported. Supported on Chrome/Android and iOS Safari 16.4+.
- Fallback for the minority without a working lock: the single `#start-hint`
  line time-shares between the live status and the tip "Keep your screen on to
  stay in the game" on a 6s status / 4s tip cadence with a 250ms fade. No second
  line, so the sticky footer never grows. Rotation runs only when the lock is
  unavailable or denied, and only while the lobby is on screen.
- Kept as one line (not a permanent second line) at the user's request, so the
  message costs zero space for the majority whose wake lock works.
- Tip copy has no emoji: a leading 📱 rendered a taller line box (17px vs
  15.5px) than the status text, which grew the sticky button component's height
  each time the tip rotated in. Dropping it equalizes the line height so the
  container stays fixed. Measured before/after in preview.
- Verified in preview, both games: granted lock (stubbed resolve) -> static
  hint, no rotation; denied/unsupported (stubbed reject) -> rotates as designed,
  status stays live as players join. Confirmed the automation Chrome denies the
  real `wakeLock.request` (NotAllowedError), which is why the fallback engaged
  there. No console errors. Stamps bumped to v2026.07.19.2.
- Post-deploy check (owner, live on HTTPS): confirm the screen actually stays
  awake in the lobby on a Pixel 9 / Chrome and re-acquires after a lock/unlock.
  (Wake Lock needs a secure origin, so this can only be verified on the live
  site, not over LAN http.)

## 2026-07-18: One-time "multi-select" discovery hint (READY, NOT PUSHED)

Ticket #16. Existing hosts keep single-tapping a category out of habit and
would never notice the new Select pill, so a small one-time nudge points it
out. Both games.

- A tooltip bubble ("✨ Now you can select multiple categories") points up at
  the Select pill the first time the picker opens in default mode. Non-blocking;
  dismisses on any interaction (Select tap, row tap, close/backdrop/Escape).
- Shows once per device via localStorage (`imp_dance_mshint` / `imp_word_mshint`,
  distinct keys so a player of only one game still sees it). The flag is set the
  moment it is shown, guaranteeing exactly one appearance.
- Auto-expires: `MS_HINT_UNTIL = Date.UTC(2026, 7, 1)` (2026-08-01, ~2 weeks
  out). After that it never shows, since the tip is useless to users who arrive
  after multi-select is old news. Also suppressed when the sheet opens straight
  into Select mode (a multi-category room, host already knows).
- Verified in preview for both games: shows on first open with the right copy,
  sets the flag, hides on Select tap, and does not reappear on reopen. Stamps
  bumped to v2026.07.18.5.

## 2026-07-18: Name all song groups in dance-game SEO (READY, NOT PUSHED)

Ticket #15. The dance game's SEO copy still listed only the original four
groups (today's pop, 80s/90s, TikTok, Bollywood). Updated every category
mention to name the full supported set so the newer international and Indian
audiences can find us. Serves the same international-growth goal as the new
categories.

- Updated five spots in `www/dance/index.html`: the `<meta name="description">`,
  the SoftwareApplication schema description, the "What kind of music does it
  use?" FAQ answer (JSON-LD), and the two visible copies (how-to step and the
  on-page FAQ). All now list today's pop, 80s and 90s, TikTok and Reels, K-pop,
  Latin, Bollywood, Tamil, Telugu, Kannada, and Malayalam, and mention that
  categories can be combined (ties in the new multi-select).
- Rewrote the two visible lines to drop the em dashes while I was in there.
- Left og:/twitter: descriptions as-is (short social blurbs; genre stuffing
  would hurt them).
- Verified: all JSON-LD still parses; every group name renders in the page
  body; meta description carries the full list; no console errors. Stamp
  bumped to v2026.07.18.3.

## 2026-07-18: Multi-select categories in both games (READY, NOT PUSHED)

Ticket #14. The host can now pick several categories at once; a round draws
from their union. Requested by Irfan to serve mixed international groups (a
party with K-pop and Bollywood fans no longer has to choose one). Built in
both the dance game and the word game with identical UX.

- **Picker UX (iPhone Photos pattern, Irfan's design):** the picker keeps the
  production single-tap behaviour by default — tap a row, it applies that one
  category and closes, no rings, no Done bar. A "Select" pill in the header
  turns each row into a checkbox (tick rings + a sticky "Done" bar) for choosing
  several at once; the pill becomes "Cancel" while selecting and drops back to
  default without applying. A room that already spans 2+ categories opens
  straight into Select mode so the host sees the full set. At least one category
  must stay selected (tapping the last one off is ignored). Done commits;
  Cancel / X / backdrop / Escape discard. (Considered and rejected an always-on
  multi-select with no mode; Irfan preferred preserving the zero-friction single
  tap as the default.)
- **Data model:** new `meta.categories` array. `activeCategories()` falls back
  to the legacy single `meta.category`, then `DEFAULT_CATEGORY`, and filters out
  names no longer in the catalog so a stale pick can't empty the pool. On commit
  we write both `categories` and `category` (= first pick) for back-compat with
  any reader mid-deploy. A default-mode single tap writes a one-element array,
  collapsing any prior multi-selection.
- **Pool + dedupe:** `pickPair` (dance) and `pickWord` (word) now build the
  union of selected categories, each candidate tagged with its source category.
  The played ledger stays keyed per category, so anti-repeat works across the
  mix; on exhaustion we wipe the played buckets for the selected categories and
  reseed. Lazy iTunes fetch is unchanged, so pool size has no runtime cost (no
  cap needed).
- **Display:** lobby trigger and player-side view show a compact summary
  ("K-Pop, Bollywood +1") for host and players alike.
- Only `www/dance/index.html` and `www/word/index.html` touched. Stamps both
  bumped to v2026.07.18.2.
- Verified in preview as a live host in both games: default single-tap applies +
  closes; Select enters multi mode (rings + Done, pill -> Cancel); Done commits
  and persists to Firebase; reopening a multi room auto-enters Select with the
  set restored; Cancel discards edits; min-one guard holds; no console errors.

## 2026-07-17: Four new song categories for international reach (SHIPPED, commit 6938318)

Ticket #13. Grow the international audience by adding four dance-game song
categories, all validated against the iTunes Search API. Under **International**:
**K-Pop** and **Latin Hits**. Under **Indian**: **Telugu** and **Kannada**
(Irfan's explicit asks). 30 songs each, dance/party-leaning, mixing current
trending hits with evergreen crowd-pleasers.

- Only `www/dance/index.html` touched (the word game has no song pools). Added
  the four arrays to `CATEGORIES` and the four picker rows to `CATEGORY_GROUPS`.
  Version stamp v2026.07.17.3 -> v2026.07.17.4.
- Validation: every query run through the exact call the app makes
  (`itunes.apple.com/search?entity=song&limit=5`, first result with a
  previewUrl). Critically, PASS was not trusted blindly — each resolved
  trackName was checked against the intended song to catch silent
  wrong-master hits. Dropped traps like "Me Porto Bonito" -> Smooth Jazz
  All Stars instrumental, "Money Lisa" -> wrong artist, "Next Level aespa"
  -> unrelated track, "My Life Is Going On" -> Marvin Gaye, plus assorted
  covers/remixes by other artists. Also de-duped against existing pools.
- iTunes rate-limits hard (HTTP 429/403) under burst; validator uses backoff
  + slow pacing so throttled queries aren't mistaken for genuine misses.
- Kannada is the thinnest on Apple Music (Pogaru, Roberrt, Kotigobba,
  Yajamana, Googly soundtracks not indexed with accessible previews). Took
  four batches to reach 30 clean matches, filling with well-digitized KGF /
  Kantara / Mungaru Male / classic (Rajkumar, SPB, S. Janaki) catalog.
- Verified: JS parses; all four categories = exactly 30 entries, 0 dupes;
  every CATEGORY_GROUPS reference resolves; page loads with no console errors.
- Per Irfan's plan: start at 30 each, grow a category if analytics show
  players using it.

## 2026-07-17: IndexNow push-notify on deploy (IN REVIEW)

Ticket #12, branch `feat/indexnow`. Broaden reach beyond Google by pinging
IndexNow whenever we deploy, so Bing (and the engines on its index:
DuckDuckGo, Yahoo, Ecosia, ChatGPT Search), plus Yandex, Seznam, and Naver
get told about changes instantly instead of waiting for a crawl. Prompted
by Irfan wanting visibility on other search engines and AI search; pairs
with the Bing Webmaster Tools signup he just completed (imported from GSC).

- Key file `www/bdb6e922c549db6b9fb7aee008298985.txt` (content is the key)
  hosted at the site root. Firebase hosting public dir is `www` and there
  are no rewrites, so it resolves at `https://impostorgames.com/<key>.txt`,
  which is the keyLocation IndexNow fetches to prove ownership.
- `scripts/indexnow-ping.mjs`: zero-dependency Node 18+ script. With no
  args it reads every `<loc>` from `www/sitemap.xml` and submits them; pass
  paths or full URLs to submit a subset. POSTs the batch to
  api.indexnow.org and reports HTTP 200/202 as success, with readable hints
  for 403/422 (usually "key file not live yet, deploy first").
- The `scripts/` dir sits outside `www/`, so it is committed to the repo
  but never served by hosting.

Deploy step: run `node scripts/indexnow-ping.mjs` right AFTER
`firebase deploy` so the live pages match what we submit. Verified offline:
script syntax checks, sitemap parsing returns the three public URLs, arg
forms resolve correctly, and the key file is served at the root by the
local preview. Not pinged live yet (the key file must be on prod first).

---

## 2026-07-17 — Stats: Games by mode panel (Shuffle Party vs DJ Mode) (IN REVIEW)

Ticket #11, branch `feat/stats-games-by-mode`. Display-only: the dance app
already writes games/modes/{category,hostPicks} (total + per-day), so this
just surfaces it.

- New "Games by mode" ranked panel in the Dance section only (gated on a
  new `hasModes` flag; Word has no modes), placed between "Games by
  country" and "Top categories". Reuses renderRanked, so it respects the
  7/14/30/90/all/custom range via sumMap like the other panels.
- MODE_LABELS maps the stored ids to display names (category -> Shuffle
  Party, hostPicks -> DJ Mode). Both rows are seeded so the split always
  shows two rows when there's data in range; zero tagged rounds in range
  shows the empty state.
- Caption "since DJ Mode launch" flags that mode tracking began at launch,
  so the split won't sum to all-time total games for earlier periods.
- Hardened renderRanked's max to Math.max(1, …) so an all-zero object can't
  produce NaN bar widths.

Verified live against prod analytics: last 30 days Shuffle Party 75 / DJ
Mode 24; range switching and the pre-launch empty state both work; no
modes panel leaks into the Word section.

---

## 2026-07-17 — How-to-play: impostor tactic + discussion beat (IN REVIEW)

Two dance how-to-play copy tweaks (ticket #9, branch
`feat/howto-impostor-strategy`), prompted by comparing our flow to the
competitor's:
- Step 5 now includes the impostor's point of view — they get a different
  track and must fake it by following the crowd so their moves don't give
  them away.
- Step 6 rewritten to surface the group discussion/accusation moment (the
  real "Find the Impostor — who danced off the vibe?" screen) before the
  host reveals. Deliberately no "voting" or "points" language — the app has
  neither (the reveal is discussion + host tap; the .vote-row CSS is
  unused legacy).

Dance version → v2026.07.17.3.

---

## 2026-07-17 — SEO fix: "Who is the Impostor" is a dance app, retargeted (IN REVIEW)

Correction to the entry below. Irfan flagged that "Who Is The Imposter?"
(by TikTok creator The Famileigh) is a **dance/music** party app — everyone
dances to the same song except one impostor hearing a different tune in
their headphones — not a word/social-deduction game. Verified via web
search. The earlier pass wrongly targeted it from the word page + hub with
word-game framing, which would have drawn the wrong intent.

Fix on branch `fix/seo-competitor-is-dance-app` (ticket #8):
- Word page fully reverted to its pre-SEO baseline (v2026.07.16.5) — the
  competitor keywords and FAQ are gone; those searchers want the dance game.
- Competitor capture added to the **dance page**: keywords plus an "Is this
  a free alternative to the Who is the Impostor app?" FAQ (JSON-LD +
  visible) describing the dance concept and positioning the browser game as
  a free, no-download alternative — also cross-promotes DJ Mode.
- Hub FAQ (JSON-LD + visible) reframed from word to dance, pointing to
  /dance.
- llms.txt: competitor-alternative note moved to the dance section; the
  common-questions entry now points to /dance.
- Framing unchanged in spirit: competitor brand, "free browser version /
  alternative" — never "also known as." Dance + hub bumped to v2026.07.17.2.

---

## 2026-07-17 — SEO: DJ Mode surfacing + "Who is the Impostor" capture (IN REVIEW)

Two tightly-scoped SEO passes on branch `feat/seo-dj-mode-and-competitor`.
No deploy until Irfan reviews.

**DJ Mode (ticket #6, www/dance/index.html + www/llms.txt).** The dance
copy only described the category/random-song flow, so we didn't surface for
"pick the song" / "song imposter" / "DJ party game" intent. Added: DJ Mode
to the meta description + keywords, a two-mode clause on the VideoGame
schema description, a new FAQPage entry and matching visible FAQ ("Can the
host pick the exact song? (DJ Mode)"), a "Two ways to play" how-to note
(Shuffle Party vs DJ Mode), and the mode names in the llms.txt dance
section. Dance version → v2026.07.17.1.

**"Who is the Impostor" (ticket #7, www/word/index.html + www/index.html +
www/llms.txt).** That competitor is a word/social-deduction app, so the
Impostor Word Game (and the hub) are the natural match — not the dance
game. Framing rule kept strict: it's a competitor brand, not an alias, so
all copy uses "free browser alternative to" and honest "same kind of game"
language — never "also known as." Added competitor keywords to the word and
hub pages, an "Is this like the Who is the Impostor app?" FAQ (JSON-LD +
visible) on both, and alternative positioning in llms.txt. Word version →
v2026.07.17.1, hub version → v2026.07.17.1.

Verified: all JSON-LD blocks parse; new FAQ/how-to copy renders on all
three pages via the local preview; version stamps updated.

---

## 2026-07-16 — Host Picks (DJ) game mode on /dance (DONE)

New second game mode alongside the original category flow. Host becomes a
game master: searches iTunes for the exact song the group hears, optionally
picks the impostor's song too (auto-picked to match if skipped), sits the
round out, can never be the impostor, and watches knowing who it is.
Decisions confirmed with Irfan: mode selector lives in the lobby
(category-picker pattern), impostor song optional with auto-pick-similar,
minimum host + 3 dancers (4 total), host gets a full GM view.

- Data model: `meta.mode` ('category' | 'hostPicks'), `roomMode()` defaults
  legacy rooms to 'category'. Host's picks stay host-local in
  `state.hostPick` until start — the room JSON is world-readable, so any
  pre-start write would let players peek. At start they're written as the
  existing crewmateTrack/imposterTrack, so playback/reveal needed no shape
  changes.
- Lobby: Game Mode card (host trigger + modal, players see label + hint);
  in DJ mode the category card becomes a Songs card with group/impostor
  pick buttons; host row tag reads DJ; start gated on 3 ready dancers +
  crew song picked; impostor stepper thresholds count dancers, not room
  size (host excluded).
- Song search modal: debounced iTunes search (350 ms, stale-response
  guard), artwork rows, tap-to-preview on a dedicated Audio element,
  identical-song-for-both-slots rejected, touchRoom() on open/select so
  browsing doesn't trip the idle watchdog.
- Auto-pick impostor song (revised per Irfan): CONTRAST, not similarity —
  a slow song against a banger is what makes the impostor visibly off.
  Candidates still come from related sources (same artist, then genre) so
  language/culture fits, but the pick maximizes measured vibe contrast:
  previews are fetched (iTunes CDN sends open CORS) and analyzed with the
  Web Audio API. Metric: zero-crossing rate (bangers ~4000+/s, ballads
  ~1300–2000/s — clean gap, loudness-invariant). Tried tempo via onset
  autocorrelation + onset density first: octave errors scored Beat It
  below My Heart Will Go On; ZCR separated every test pair correctly.
  Picks the max |Δscore| vs the crew song. Analysis failure → random
  related song; no related results → DEFAULT_CATEGORY pool → throw into
  fbStartGame's recovery.
- Round: impostor pool excludes the host in DJ mode; GM banner (teal twin
  of the impostor banner) names the impostor(s); GM hears the crew song.
  Replay clears the picks so the lobby re-prompts each round.
- Analytics: games/modes/<mode> counters (+ daily); category counters only
  bump in category mode; DJ rounds still bump games/songs with the crew
  title.
- GitHub: issues #1–#5 on irfanrafeek/imposter map the chunks; branch
  feat/host-picks-mode merged to main. v2026.07.16.11 deployed to prod
  (impostorgames.com/dance/); preview channel host-picks retired after
  merge.

Design pass (Irfan): merge Mode + Music/Songs into one card (was two,
took too much vertical space). Modes renamed for punch: Category →
Shuffle Party (dice icon), Host Picks (DJ) → DJ Mode (headphones);
internal ids stay 'category' / 'hostPicks' so existing rooms and
analytics keep working. Trigger and modal rows both show the icon.
Section divider between mode and music/songs. Under-trigger hints
dropped — the start-hint below Start Game already handles blockers.
Player view drastically simplified to a single MUSIC line with the
mode name. In Shuffle mode the line shows the raw category name
("80s Hits", "Bollywood", etc. — Irfan wanted the originals preserved).
In DJ mode it shows "DJ Mode".

Mode-change propagation test (Irfan flagged as broken): verified end-
to-end in the preview channel that a Shuffle → DJ (and DJ → Shuffle)
switch on the host updates the player's MUSIC line within one snapshot.
Suspected cause of Irfan's report: cached HTML — hard refresh needed.

---

## 2026-07-16 — Lobby sticky action bar + keyboard-friendly name screens (both apps) (DONE)

Irfan: with many players the lobby's Ready/Start buttons scroll below the fold,
and on the name screens the mobile keyboard covers the bottom-pinned button
(user had to dismiss the keyboard to continue). Options discussed (sticky bar /
capped scrolling list / avatar-chip grid / reorder); Irfan picked the sticky bar.

First pass put the name-screen button directly under the input; Irfan then
asked for sticky-at-bottom everywhere, lifted above the keyboard (both apps):

- `.sticky-actions` bar (one shared class): `position: sticky` with
  `bottom: -48px` and `margin: 0 -24px -48px` to cancel #app's padding so the
  bar hugs the viewport edge stuck AND at rest. Solid `--bg` background + soft
  top shadow; content scrolls underneath; safe-area padding for iPhone. Note:
  sticky offset is measured from the scrollport (shrunk by classic
  scrollbars), so desktop preview shows an 8px overshoot clipping only empty
  padding; overlay-scrollbar phones are exactly flush.
- Wrapped in it: lobby Ready/Start + hint, join-name "Enter room", setup
  "Create Room", host-share "Go to Lobby" (the last for visual consistency —
  no keyboard there). Name screens keep their bottom-pinning `flex:1` spacer.
- Keyboard handling: `interactive-widget=resizes-content` added to the
  viewport meta (Android Chrome resizes the layout, so bottom-anchored flex
  reflows above the keyboard natively) + a visualViewport resize/scroll
  listener that translates `.sticky-actions` up by the keyboard overlap (iOS,
  where the keyboard overlays instead of resizing; gap computes to 0 on
  Android so no double-lift).
- Enter/Go key on the name inputs now submits (clicks btn-join/btn-go-lobby).
- Verified in preview (mobile viewport): all four bars flush at the viewport
  edge on both apps, rows slide under the lobby bar (15 fake players),
  Enter-key flow works, lift transform positions correctly with a simulated
  336px keyboard, no console errors. Real-device keyboard behavior (iOS lift
  smoothness) worth a phone check before deploy.
- Irfan's phone test caught a gap: with few players the lobby content is
  short and sticky alone doesn't push the bar down (sticky only stops it
  scrolling out of view). Fix: `#screen-lobby .stack-lg` becomes a
  `flex:1` column and `.sticky-actions` gets `margin-top: auto`, so the bar
  is pinned to the screen bottom at any player count. Both apps
  v2026.07.16.3.

---

## 2026-07-15 — Fix poor CLS on /dance: visualizer animated height → scaleY (DONE)

Clarity showed /dance CLS 1.5 (poor) while /word sat at 0.04 and the hub at 0
(LCP/INP good everywhere). Culprit: the round-screen music visualizer — 24
bottom-aligned bars whose `height` was randomized every 110 ms via JS. Height
is a layout property, so every tick moved each bar's top edge with no recent
user input → hundreds of counted layout shifts per song. All other animations
(dancer, confetti, join pop) were already transform/opacity-based and CLS-safe.

Fix (dance only, v2026.07.15.3): bars get a fixed 150px layout height and
bounce via `transform: scaleY()` with `transform-origin: bottom`; JS writes
`scaleY(h/150)` instead of `height`. Transforms don't participate in layout,
so the animation can no longer produce shifts — and it skips layout/reflow
9×/sec (cheaper on phones). Screenshot-verified the equalizer looks identical;
no console errors. Note: CLS can't be measured in the local preview (tab is
`visibilityState: hidden` → no paints → no layout-shift entries); proof will
be Clarity field data over the days after deploy.

Also clarified for Irfan: screen-off → disconnect → rejoin does NOT drive CLS
(hidden pages don't paint); at most the re-render on wake adds one small shift.

---

## 2026-07-15 — SEO images: OG cards + max-image-preview + image sitemap (DONE)

Irfan noticed Google results for /dance and /word show no thumbnail (the hub
does). Diagnosis: Google picks result thumbnails from visible content images on
the page, and the game pages' only visible image is the 200×160 logo — too
small/logo-like. Also the shared og:image (logo.png) was 448×448, below
Google's recommended ≥1200px width. Shipped (Irfan chose the illustrated
mascot style over human photos — brand consistency, no bait-and-switch):

- `<meta name="robots" content="max-image-preview:large">` on hub, /dance, /word.
- New 1200×630 OG cards from Irfan's artwork (`~/Documents/Impostor images/`):
  `www/og-dance.jpg` (dancing group, 240 KB) and `www/og-word.jpg` (card table,
  199 KB). Wired into og:image (+width/height/alt), twitter:image, and JSON-LD
  `image` on each game page. Hub keeps logo.png. Note: og:image is only fetched
  by crawlers/link-preview bots — zero page-load cost for players.
- sitemap.xml: added Google image-sitemap namespace and `<image:image>` entries
  per URL (og cards + game logos); lastmod → 2026-07-15. xmllint-validated.
- Straggler fix caught in diff review: word JSON-LD description still said
  "3–8 players" (dash stored as `–` so earlier cap sweep's grep missed
  it) → now 3–20.
- Verified in preview: JSON-LD parses on both pages, meta tags correct, og
  images serve 200, no console errors. Versions: dance/word v2026.07.15.2,
  hub v2026.07.15.1.

Expectation set with Irfan: thumbnails are Google's per-query choice and take
days–weeks of recrawls; favicon (regenerated 07-14) also pending Google's
separate favicon crawl.

---

## 2026-07-15 — Tighten home-screen bottom space (both apps) (DONE)

Irfan flagged that the space below the "How to play" ghost button on the dance
landing was a bit too generous and asked to trim ~16px on both apps.

- Reduced `.home-fold { min-height: calc(100dvh - 160px) }` → `calc(100dvh - 120px)`
  in both `www/dance/index.html` and `www/word/index.html`. The fold takes 40px
  more of the viewport, so the "How to play" button (bottom of the fold) drops
  by the same amount and the empty space below it shrinks correspondingly.
  (Initial pass used 144px / 16px; Irfan hand-tuned it tighter to 120px / 40px.)
- Verified in the preview at mobile viewport (375×812): cards, spacer, title
  block, and scroll-to-how-to-play behaviour unchanged.
- Version stamps bumped: dance/word both v2026.07.15.1.

---

## 2026-07-14 — Animal avatars for players (both apps) (DONE)

Irfan supplied a 5×4 sheet of 20 kawaii animal faces to replace the initials
player avatars. Shipped in both apps:
- **Assets**: first pass cropped the sheet in-browser (canvas) but the crops
  read poorly; Irfan then supplied 20 individually pre-cropped PNGs (247px,
  transparent corners) which were converted to `www/avatars/av01–av20.webp`,
  192px with alpha, ~8–10 KB each (~180 KB total). Full-bleed circles, much
  cleaner. Order: fox, panda, koala, dog, rabbit, bear, lion, tiger, raccoon,
  penguin, deer, giraffe, elephant, cow, hedgehog, owl, otter, shiba, frog,
  chick. 7-day cache header added for `/avatars/**` in firebase.json.
  (Canvas note: `Image.decode()` hung in the preview pipeline; use
  `createImageBitmap(blob)` instead.)
- **Assignment** (Irfan picked): random, no repeats within a room — `pickAvatar()`
  chooses a random unused index 1..20 at create/join time, stored as `av` on the
  player's RTDB record so every phone shows the same animal and it survives
  leaves/joins. 20 animals = MAX_PLAYERS, so never exhausted.
- **Render**: lobby `renderLobby()` swaps the initials div for
  `<img class="player-avatar">` (same 40px circle). Fallback: players without
  `av` (rooms created pre-deploy, or mid-rollout clients) keep initials circle.
- **Gotcha handled**: `refreshPresence()` rewrites the whole player record on
  reconnect — `av: state.myAv` included there or avatars would vanish on
  network blips.
- Verified in preview against live DB: dance host got elephant, simulated
  friend rendered tiger; word host got owl; no-`av` player fell back to "OL"
  initials. Test rooms removed. Zero console errors.
- Version stamps → v2026.07.14.4 (dance, word). Hub untouched.
- **Join animation + lobby order** (follow-up, same day): Irfan picked
  "pop-in bounce" from three options. New player's row fades in
  (`row-in`, 0.3s) while the avatar scales 0→1 with soft overshoot
  (`avatar-pop`, 0.42s, cubic-bezier(0.34,1.56,0.64,1)). A module-level
  `lobbySeen` Set tags only never-seen player ids as `.just-joined` so ready
  toggles / phase re-renders don't re-animate (verified); cleared in
  `leaveRoom`. **Bug found by Irfan testing locally**: a real join fires 2-3
  RTDB snapshots back-to-back (player write + lastActivity stamp), and the
  second re-render stripped the class ~50ms in — animation invisible. Fixed:
  `lobbySeen` is a Map(id → first-render time) and `isNewInLobby()` keeps the
  class for 700ms (JOIN_ANIM_MS), so rapid re-renders retain it. Verified with
  in-page REST-simulated join: class + `avatar-pop` animation live on the row
  after the double write. Follow-up (Irfan asked about a blink): each rebuild
  restarted the animation from opacity 0 — fixed by setting a negative
  `animation-delay` equal to elapsed-since-first-render on row + avatar, so
  rebuilds RESUME the animation mid-flight. Measured with MutationObserver:
  2nd rebuild at +92ms resumed at opacity 0.458 instead of snapping to 0.
  Also dropped `loading="lazy"` from avatar imgs (useless at 40px, could add
  a decode flash on rebuild).
- **Confetti micro-burst on join** (Irfan picked option 1 of 4): 10 tiny
  pastel strips/dots (brand palette) fly out from the new player's avatar and
  fade over 0.65s (`confetti-fly`). Particles are appended to `<body>`
  (position: fixed) so list rebuilds can't kill them; each self-removes at
  700ms — verified 10 added / 10 removed, none leaked. Fired once per player
  (`burstFired` Set, cleared in leaveRoom) and skipped on the initial lobby
  paint so late joiners don't see a burst salvo. Two gotchas hit and fixed:
  (1) rAF-deferred firing never ran in throttled/background tabs — fire
  synchronously instead; (2) measuring the avatar for the burst origin
  returned 0x0 because `avatar-pop` starts at scale(0) and gBCR returns the
  transformed box — measure the row and offset (+36px, padding + half
  avatar) instead. Respects prefers-reduced-motion. Both apps.
  v2026.07.14.6. Lobby display order changed: host pinned on top, then newest
  join first (presentation-only sort copy — `state.players` stays
  joinedAt-asc for game logic). Respects `prefers-reduced-motion`. Both apps.
  Verified in preview: order host→newest→older, class only on new row, no
  console errors. v2026.07.14.5. Also: Irfan hand-tweaked ready-row green
  (#c8eecd → #c8e8d9) in dance — kept.

---

## 2026-07-14 — Hub tagline + multiplayer SEO terms (DONE)

Irfan wanted the hub tagline changed from "Free imposter online multiplayer
games" to "Trust no one. ;)" — a punchier, on-brand line. Since the old tagline
was the ONLY place "multiplayer" appeared in Google-indexed text (it existed
elsewhere only in JSON-LD `playMode` and body FAQs), added multiplayer keywords
to the high-value SEO surfaces so we don't lose that signal:
- **Hub / Dance / Word**: `meta description`, `meta keywords`, `og:description`,
  `twitter:description` all now include "multiplayer" once (natural placement)
  plus per-app multiplayer phrases in keywords (`multiplayer party game`,
  `multiplayer impostor game`, `multiplayer dance/word game`,
  `online multiplayer party game`).
- Titles left alone — already keyword-dense, adding more risks reading spammy.
- Version stamps bumped to v2026.07.14.3 on all three public pages.
- Verified in preview: multiplayer present in all four meta surfaces per page,
  hero renders the new tagline cleanly, Clarity snippet still in place.

---

## 2026-07-14 — Microsoft Clarity (heatmaps + session recording) (DONE)

Irfan wanted to see how audiences arrive and how they use the site. Added
Microsoft Clarity (free, unlimited) — project "Impostor Games", ID `xm6tsps1dc`.
- Snippet added high in `<head>` of the **three public pages**: hub, `/dance/`,
  `/word/`. **Skipped `stats.html`** deliberately — it's the owner-only `noindex`
  admin dashboard; tracking our own visits there would pollute audience data.
- Chose **no consent banner** (Irfan's call) — Clarity's standard snippet tracks
  immediately via first-party cookies. Departs from our cookie-free stance; noted
  that EU/GDPR traffic may later warrant switching to consent-gated mode
  (`clarity('consent')`, one-line change).
- Version stamps bumped to v2026.07.14.2 on all three pages.
- Verified in preview: tag `clarity.ms/tag/xm6tsps1dc → 200`, real tracker
  `scripts.clarity.ms/.../clarity.js → 200`, telemetry `POST j.clarity.ms/collect
  → 204`. Data confirmed flowing.
- Our own cookie-free aggregate analytics (sessions/rounds/categories/ratings/
  errors) stay in place; Clarity is additive, not a replacement.

---

## 2026-07-14 — Stats page: view selector + ratings/feedback (DONE)

Irfan wanted ratings/feedback exposed in stats + a per-app split. Shipped:
- **Both apps**: on emoji click in the feedback popup, additionally bump
  `analytics/${GAME}/fbprompt/ratings/${1..4}` (via existing bumpAnalytics). Same
  privacy model — just per-rating aggregate counters, no comments/text/PII. Full
  feedback records with text stay in `feedback/${GAME}` (`.read: false`) and are
  read from Firebase Console when Irfan wants them. Discussed both options —
  Irfan picked counters-only, leaving comments private.
- **stats.html restructured**:
  - Dropdown selector at top: Overview / Impostor Dance Game / Impostor Word
    Game. Only the picked section renders (`section.game.active` toggle). URL
    param `?view=music|word` preserved so refresh + share keep the choice.
    Default overview (no param).
  - Overview KPI split per Irfan: total app visits + **Dance games** +
    **Word games** as three separate cards (was one combined "Games" card).
    Second KPI row adds **Total ratings** (with avg score 0–4 and popup response
    rate %) + hub visits.
  - Per-app views get a third KPI card: Ratings (with same avg + response).
  - New Ratings panel (both overview and per-app): distribution rows 🤩/😄/😐/😕
    with counts + percent-of-total bars, plus header showing "N ratings · N
    dismissed". Empty state "No ratings yet." for pools with no data.
  - Footer note updated to explain what's included/excluded.
- Verified in preview end-to-end: seeded test ratings 3/5/18/22 into Firebase,
  confirmed overview and dance views both render distribution + avg (3.23/4) +
  response rate (48/51%), URL param + dropdown state persist across
  refresh, then removed the test node.
- Bug caught: my initial buildSections removed the combined `all-g-total` KPI
  but renderSection still tried to write to it → null textContent throw. Fixed
  by guarding those three assignments with element-exists check while keeping
  the combined games chart (which does still render for overview).
Dance v2026.07.14.1, word v2026.07.14.1.

## 2026-07-13 — Favicons + WebSite JSON-LD + PWA manifests (SERP polish) (DONE)

Google results for the site showed the generic globe icon — root cause: the site had NO favicon
at all (no link tags, no /favicon.ico — it 404'd). Also no WebSite JSON-LD, so results show the
bare domain instead of a branded "Impostor Games" site name. Shipped:
- **Icon family** in `www/icons/` (canvas compositing in the preview browser — no ImageMagick/PIL
  on this machine): brand set 16/32/48/96/180/192/512 + 512-maskable from a front-facing
  headphones-character artwork Irfan supplied in chat (1892² webp, recovered from the session
  transcript base64; small sizes crop to the central ~78–88% so the character reads, maskable
  uses the full frame as safe zone). Word-game set 180/192/512 + maskable from logo-word on cream
  `#FBF8F3`. All opaque so they never go invisible in dark UIs. Plus `/favicon.ico` (16+32+48
  PNG-in-ICO, built with a small Python struct script).
- **Link tags** on all three pages: favicon.ico + 48/96/192 PNGs (Google wants multiples of 48px),
  apple-touch-icon (word page gets its own), manifest link.
- **WebSite JSON-LD** added to the hub @graph (name "Impostor Games", alternateName imposter
  spelling) → lets Google show a branded site name in results. Organization logo now points at the
  square opaque icon-512 (better for logo rich results than the transparent logo.png, which stays
  as og:image).
- **PWA step 1 (manifest-only, NO service worker** — deliberately: a caching SW would fight the
  multiple-deploys-a-day flow): three manifests — hub (`/`), dance (`/dance/` scope), word
  (`/word/` scope, own icons). "Add to Home Screen" now yields a real app icon + splash +
  standalone full-screen instead of a glorified bookmark. Zero UI change, zero install push;
  Chrome may quietly offer "Install app" in its menu.
- **firebase.json**: `/icons/**` + `/favicon.ico` get `Cache-Control: public, max-age=604800`
  (immutable-ish assets shouldn't inherit the site-wide no-store).
- sitemap lastmod 2026-07-07 → 2026-07-13.
Verified in preview: all icon/manifest URLs 200 on all three pages, JSON-LD + manifests parse,
no console errors. NOTE: Google picks up the favicon on its own recrawl (days–2 weeks); Search
Console verification (Irfan's action) would let us request reindexing + see search queries.
All three pages → v2026.07.13.1.

## 2026-07-13 — Error telemetry (aggregate, cookie-free) (DONE)

Growth means bugs need to surface on their own — the "Could not load song" bug was only caught
because Irfan personally hit it in a live game; everything else fails silently. Added lightweight
aggregate error telemetry to **both apps**, reusing the existing analytics machinery
(`bumpAnalytics` + `safeKey`), so no new dependency, no cookies, no consent banner:
- **`trackError(label)`** helper → bumps `analytics/<GAME>/errors/<label>/count` plus a
  `errors/daily/<YYYY-MM-DD>/<label>` breakdown (mirrors the games/daily pattern for spotting
  spikes). Stores a bucketed LABEL + count only — **never** a stack trace, URL, room code or user
  id (same privacy bar as the country/song counters). Throttled to ≤1 bump per label per 10s so a
  hot error loop can't spam Firebase or inflate counts.
- **Global handlers**: `window` `error` + `unhandledrejection` → any uncaught script/async failure
  gets bucketed. Resource 404s (message-less `error` events, e.g. a failed `<img>`) are skipped as
  noise.
- **Deliberate labels** at the known-fragile spots: dance `fbStartGame` catch →
  `song_load_failed` (the exact bug that started this); word `fbStartGame` catch →
  `round_start_failed`. Hand-labeled counters beat cryptic auto-messages.
- DB rules unchanged — `analytics/` is already `.read/.write: true`, so the new `errors/` subtree
  needs nothing.
E2E-verified in preview: dispatched synthetic `error` + `unhandledrejection` events → confirmed
`js: …/count:1`, `promise: …/count:1` and the `daily` breakdown landed in Firebase, then removed
the test node (`/analytics/music/errors` back to null). Both apps load with zero console errors;
module syntax checked. Dance v2026.07.12.6, word v2026.07.12.5.
NOTE: this is a pull, not a push — glance at `analytics/<GAME>/errors` occasionally. Natural
follow-up: a scheduled threshold alert if any error label spikes.

## 2026-07-12 — All pools validated + song-loading hardened (DONE)

Irfan hit "Could not load song previews" in a real game. Root causes: dead pool entries clog the
no-repeat unplayed list (they're never marked played) until <2 resolvable songs remain; iTunes
rate-limiting on burst lookups; plain network blips. Fixes:
- **Validated the 5 remaining categories** (sweep script): 80s 36/36, TikTok 39/39, 90s 39/39,
  Bollywood 40/40 clean. **Tamil had 7 dead + 1 wrong-match** ('Roja Janeman' → instrumental
  cover — served to real players 3× today per analytics). Fixed/corrected: Vaseegara,
  Singappenney, Naan Pizhai (movie was wrong), Manasilaayo (→Vettaiyan); added Katchi Sera,
  Aasa Kooda, Jalabulajangu, Chikitu, Monica, Golden Sparrow; dropped Roja/Mukkala/Bachelor-Don/
  Aaha Kalyanam (iTunes has covers only). Tamil now 42 validated. Bollywood: 'Kesariya' query
  fixed (was matching a random 'Druidess' track).
- **Preview cache**: successful lookups cached in localStorage 24h (short TTL on purpose — a
  rotted cached URL would silently break a round). Cuts iTunes traffic + rate-limit risk.
- **Auto-retry**: round start silently retries pickPair once before surfacing an error.
- **Friendlier failure**: "Couldn't load songs — check your connection and tap Start again".
- Also caught leftover "Three to eight friends" copy in both apps' How to Play (→ twenty).
E2E-verified in preview with a real room (bots injected): round started, both tracks resolved,
cache populated with exactly the picked pair. Test room + game noise cleaned/negligible (330 real
games today!). Dance v2026.07.12.5, word v2026.07.12.4.

## 2026-07-12 — Malayalam pool rebuilt: 60 validated songs, dance-heavy mix (DONE)

Expanded Malayalam from 40 → 60 entries — but the real fix: validating the old pool against the
iTunes Search API (the app's exact lookup: `entity=song&limit=5`, first result with a previewUrl
wins) showed **18 of 40 entries never resolved** (silently skipped by pickPair every round) and
one ('Vaathil Hridayam') matched a wrong song. Effective pool was ~21 songs. All 60 new entries
are script-validated end-to-end; several queries deliberately drop/change the movie name because
that's what surfaces the right master (e.g. Aluva Puzha is from Premam, Mukkathe Penne from Ennu
Ninte Moideen, Kattu Mooliyo from Ohm Shanthi Oshaana). Mix per Irfan: reels-trending + hits,
rebalanced to ~2:1 danceable-to-melodic (added Pistah, Avial ×3, Thaikkudam Bridge ×2,
Chingamaasam; cut the 7 slowest classics). Notable: 'Manavalan Thug' has NO iTunes preview in any
form — it was always dead and stays out. Covers/karaoke-only matches rejected on principle.
Validation scripts in session scratchpad; re-runnable pattern documented here. Dance v2026.07.12.4.

## 2026-07-12 — Player cap 8 → 20, now actually enforced (DONE)

`MAX_PLAYERS` was defined as 8 but **never referenced** — the cap was purely marketing copy; a
9th player could already join any room. Raised to 20 in both apps AND wired it into the join
flow: `joinRoom` and the code-box precheck now read the whole room, count players, and reject
with a "Room is full" toast (double-check guards the simultaneous-join race at 19/20). Both
prechecks order the guards consistently: not-found → in-progress → full. Updated every player-count
mention to 3–20 (28 spots: meta/og/twitter descriptions, JSON-LD maxValue, FAQs, on-page
definitions across hub/dance/word, plus llms.txt). The imposter stepper's existing scaling
(2 at 6+, 3 at 10+) now applies to big rooms. Live-tested: seeded a 20-player room, join as #21
→ "Room is full". Hub v2026.07.12.2, dance/word v2026.07.12.3.

## 2026-07-12 — PNG → WebP for in-app images (DONE)

Converted the three PNGs actually loaded in-app to WebP (cwebp -q 85 -alpha_q 100 -m 6, alpha
preserved) for faster loads: game-dance (127K→27K), game-word (124K→24K), logo-word (144K→26K)
— ~80% smaller each, no visible clarity loss (verified in preview). Updated `<img>` src in
www/index.html (both hub cards) and www/word/index.html (word logo); deleted the old PNGs.
**Kept logo.png as PNG** — it's used only as the og:image/twitter:image/JSON-LD share image,
never loaded in-app (no speed gain), and WebP og:images render unreliably across social/chat
platforms. Hub v2026.07.12.1, word v2026.07.12.2.

## 2026-07-12 — Round-milestone feedback popup (DONE, deployed)

Both apps now ask engaged players for feedback. Each device counts completed rounds in
localStorage (shared across dance + word — same origin). From the 20th round on, the Round Over
screen auto-opens a small popup (2s after the reveal so it never covers the payoff moment):
"Enjoying the game? 🎉" + one-tap emoji rating (😕😐😄🤩) + "Tell us what you think" link into the
existing feedback modal. It returns on later Round Overs until the player interacts once (rate /
open form / dismiss via ✕, backdrop, or Esc) — then never again on that device. Auto-closes
without burning the chance if the host starts the next round. Emoji ratings + form submissions
land in `feedback/<game>` with a `source` field (`landing` vs `rounds-milestone`); impressions
tracked at `analytics/<game>/fbprompt/{shown,rated,dismissed}`. Considered and rejected: gating
the host's Start on popup interaction (holds the group hostage to a feedback form). Test data
cleaned from live DB after verification. Dance v2026.07.12.1, word v2026.07.12.1.

## 2026-07-11 — Dance: persistent unmute overlay (DONE, deployed)

Browser autoplay policy can reject `play()` at round start; the old fallback was a 2.2s toast
("Tap anywhere to start audio") that was easy to miss — players sat in silence while the decorative
visualizer kept dancing. Replaced with a full-screen **audio-blocked overlay** (dark card, same
style as the reveal card, blurred backdrop): "🔇 Tap to start the music". It stays up until the
audio element's `playing` event fires; the tap re-seeks to the shared `startAt` offset, so a late
unmute still lands in sync. Safety-hidden in beginVoting / revealImposter / leaveRoom so it can't
linger past the round. Pre-unlock on Create/Join/Ready untouched. Dance v2026.07.11.1.

Discussed but parked: honest visualizer (animate only while actually playing), live 🔊/🔇 status
chip, audible "sound check" chime on I'm Ready.

---

## 2026-07-07 — Imposter Word Game + hub restructure (IN PROGRESS)

**Goal:** Add game #2 — the **Impostor Word Game** — and restructure the site into a hub.

### Decisions (confirmed with Irfan)
- **Structure (Option A):** hub landing at `/`, dance game moves to `/dance/`, word game at `/word/`.
  - SEO must not be compromised: the hub at `/` **keeps** the dance game's ranking content
    (title keywords, quotable definition, How to Play, FAQ, JSON-LD) and adds two game cards.
- **Word game rules:** each player gets a card — everyone sees the same secret word except the
  imposter, who sees "You're the Imposter" + a vague hint. Clue-giving/guessing is **all verbal**:
  no timer, no in-app voting, no in-app guessing. Host taps **"Reveal Imposter"** → every screen
  shows the imposter's name + the secret word → Play again (new word, new imposter).
- **Categories (6 × ~50 words, each word has an imposter hint):**
  Food · Animals · Places · Everyday Objects · Movies & TV · Football (soccer — players/clubs/terms).
- **Brand:** "Impostor Word Game" (o-spelling on screen, "imposter" e-variants kept in SEO keywords) —
  same convention as the dance game.
- **Tech:** self-contained `www/word/index.html` reusing the dance engine (lobby/QR/presence/idle
  cleanup, same visual style) minus all music/iTunes code. Rooms at `rooms-word/$code` (no
  collision with dance rooms). Analytics namespace `analytics/word`, feedback at `feedback/word`.
- **Process (standing):** create tickets per task and close them when done; keep this WORKLOG
  updated; best coding practices always.

### Plan / ticket list
1. ✅ WORKLOG.md set up (this entry)
2. ✅ Word content: 300 word+hint pairs (6 × 50, validated: no dups, all hints present)
3. ✅ Build `www/word/index.html` — dance engine reused; music/voting stripped; card screen +
   host Reveal; `rooms-word/$code`; `analytics/word` (games/words instead of games/songs)
4. ✅ Dance game moved to `www/dance/` (git mv) — SHARE_BASE → /dance, canonical/og → /dance/,
   absolute image paths, v2026.07.07.5
5. ✅ Hub at `www/index.html` — keeps dance SEO (title kw, definition, FAQ, JSON-LD with
   Organization + 2 VideoGames + FAQPage), two game cards, legacy `?join=` → /dance/ forward,
   `analytics/hub` visits
6. ✅ DB rules: `rooms-word` added (deployed to Firebase during testing)
7. ✅ SEO artifacts: sitemap (3 URLs), llms.txt rewritten for hub + both games; robots unchanged
8. ✅ Local test passed: full word round (create SFAB → 2 injected test players → start →
   imposter card w/ hint → Reveal shows name+word → Play Again → lobby); category modal bug
   found & fixed (CATEGORY_GROUPS key `items` → `categories`); hub render + join-forward OK;
   dance page OK at /dance/. Test rooms + test analytics (word/hub) deleted after.
9. ⏳ Deploy (firebase deploy --only hosting) + live verification — AWAITING IRFAN'S GO
   (DB rules already live; hosting deploy flips the site to hub structure)

### Post-batch polish (2026-07-08, all local, part of the same pending deploy)
- Hub redesigned to Irfan's mockup: big game illustrations (game-dance.png / game-word.png),
  dark Play pills, About divider before SEO content, version stamp tiny in footer.
  Cream `.art-frame` backdrop behind each illustration for visual weight.
- Both apps: "← All games" back-link on home, version stamp hidden (kept in DOM for feedback),
  home-fold bottom gap fixed (100dvh − 160px).
- Per-game logos: logo.webp → logo-dance.webp (git mv); new logo-word.png on /word/.
- Hub load-in stagger animation (pure CSS, prefers-reduced-motion safe).
- Word-game hints rewritten twice per Irfan: final style = 1–2 word attributes ("Pizza→Cheesy",
  "Messi→Magical"), hard mode — each fits several pool words, unique per category, no leaks.
- **Round Over reveal redesigned** (both apps): dark card with inline coral "IMPOSTER" pill +
  big serif name; track section (dance) / secret word (word) moved outside the card; "drumroll
  please…" subtitle removed. Play Again + Exit Room buttons kept.
- **Per-room no-repeat pool** (both apps): every round's picked song(s)/word written to
  `meta/played/<category>/<sanitizedKey>: true`. Next round filters the pool; when <2 unplayed
  remain (dance) or 0 (word), the category's played subtree is silently replaced with the fresh
  picks. Play Again preserves the played list; category swaps keep each pool's own history.
- **Ready state persists across rounds** (both apps): `fbReplay()` no longer clears
  `players/*/ready`. Players opt in once per session, toggle off manually if they need to step
  away. Fresh joins still default unready.
- **Stats dashboard extended**: stacked Impostor Dance / Impostor Word / Hub landing sections
  under one shared day-range selector; single `analytics/` read hydrates all three. Word section
  swaps "Top songs" for "Top words"; hub section is visits-only.
- End-to-end tested live (rooms H5D9 dance, 85TM word): 2 rounds each, played history + ready
  persistence verified via direct Firebase reads. Test rooms cleaned up.
- Versions after this batch: dance v2026.07.08.3, word v2026.07.08.3, hub v2026.07.07.3.

### Notes / watch-outs
- **Native app (Capacitor):** `www/` is the webDir, so the Android app will now open the hub.
  Fine (app = hub with both games), but revisit SHARE_BASE handling when the app is next built.
- Old QR codes / shared links point at `impostorgames.com/?join=CODE` → hub must forward these to
  `/dance/?join=CODE` (dance rooms are the only rooms that existed before the split).
- Two rounds of test analytics from the e2e verification are in the live DB (word ~2 games,
  dance ~2 games). Trivial; not worth clearing.

---

## Earlier context (pre-worklog summary)

- **2026-07-07:** Analytics split into clean `visits/` + `games/` subtrees under `analytics/music`
  (legacy keys cleared, fresh start). Cookie-free stats dashboard at `/stats.html` with a global
  day-range selector (7/14/30/90/All, default 30). AI-search visibility pack shipped: `llms.txt`,
  explicit AI-crawler robots.txt, quotable on-page definition, conversational FAQs.
- **2026-06-24 → 07-06:** Domain `impostorgames.com` connected (GoDaddy DNS), DB security rules
  version-controlled (`database.rules.json`), cookie-free analytics added, 15-min idle room
  cleanup, feedback form, share-code screen with QR join, SEO/rebrand to "Impostor Dance Game",
  Capacitor native-app groundwork (see NATIVE_APP_NOTES.md / ANDROID.md).
