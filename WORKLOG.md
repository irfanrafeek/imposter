# WORKLOG — Impostor Games

Project journal: what's being worked on, decisions made, and status. Newest entries first.
(Tickets are tracked in-session; this file is the durable record.)

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
