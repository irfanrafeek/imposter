# WORKLOG — Impostor Games

Project journal: what's being worked on, decisions made, and status. Newest entries first.
(Tickets are tracked in-session; this file is the durable record.)

---

## 2026-07-16 — Host Picks (DJ) game mode on /dance (IN TEST — branch feat/host-picks-mode)

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
- Auto-pick similar: artist lookup by id → artist-name search → genre
  search → random DEFAULT_CATEGORY song → throw into fbStartGame's
  existing recovery path.
- Round: impostor pool excludes the host in DJ mode; GM banner (teal twin
  of the impostor banner) names the impostor(s); GM hears the crew song.
  Replay clears the picks so the lobby re-prompts each round.
- Analytics: games/modes/<mode> counters (+ daily); category counters only
  bump in category mode; DJ rounds still bump games/songs with the crew
  title.
- GitHub: issues #1–#5 on irfanrafeek/imposter map the chunks; branch
  feat/host-picks-mode. v2026.07.16.6. NOT deployed — testing first.

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
