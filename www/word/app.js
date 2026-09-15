import {
  ref, set, get, update, onValue, onDisconnect, serverTimestamp, remove, increment, push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { FB_CONFIGURED, db } from "../shared/firebase.js";
import { analyticsEnabled, safeKey, todayKey, peekGeo, fetchGeo, createAnalytics } from "../shared/analytics.js";
import { loadCatalog, pickHint } from "../shared/words/index.js";
import { createPlayedStore } from "../shared/played.js";
import { mountChat } from "../shared/chat.js";
import { createSupportTransport } from "../shared/chat-support.js";
import { createRoomTransport } from "../shared/chat-room.js";
import { findRoomInOtherGames, goToGame } from "../shared/roomlookup.js";
import { t, plural, list, has, lang } from "../shared/i18n.js";
import { fold } from "../shared/fold.js";
import { createTurnClock } from "../shared/clock.js";
import { ONLINE_TREE, HEARTBEAT_MS, listingFor, listingSig, facesOf } from "../shared/online-games.js";
import { gameCard } from "../shared/game-card.js";
// clockText is renamed on the way in: this file already has a clockText of
// its own, for the round clock, and a function declaration quietly wins.
import { clocksFor, clockAction, hostOverdue, roundWasPlayed, clockText as phaseClockText } from "../shared/online-clock.js";
import { pageLang, pagePaths, redirectFor, joinUrl } from "../shared/lang.js";
// The session a room write happens under (#265). Not the account button:
// this page has none, and an anonymous session is not an account.
import { ensureSession } from "../shared/auth.js";

// The catalogue is fetched, not bundled, so that a Spanish player downloads
// the Spanish words and not both. One await here, before anything below runs,
// is what keeps every function in this file synchronous: by the time the IIFE
// starts, CATALOG is ordinary data.
//
// `lang` is the PAGE's language, and that stays correct now that rooms carry
// their own meta.lang, because #138 made them the same thing: a player whose
// room is in another language is redirected to that language's page before
// they ever join. So there is never a page showing one language's catalogue
// for a room played in another, and this needs no await on the room.
const CATALOG = await loadCatalog(lang);
const WORD_CATEGORIES = CATALOG.categories;

(() => {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const COUNTDOWN_MS = 4000;
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 20;
  // An ID, not a label. See CATEGORY_GROUPS below.
  const DEFAULT_CATEGORY = 'Food';
  // Identifies this game inside shared infrastructure (analytics, and the
  // multi-game hub). Each game gets its own namespace, e.g.
  // analytics/word/... so games never collide.
  const GAME = 'word';
  // Canonical public URL of THIS game for shareable links (QR codes, deep
  // links). Hardcoded — NOT location.origin — so that when this same code
  // runs inside the native app (Capacitor WebView, origin https://localhost)
  // the QR a host generates still points friends at the real website.
  // The PATH comes from the page (so a Spanish room shares /es/word/), the
  // HOST is hardcoded. Both halves matter: without the path, a Spanish
  // host's QR would land friends on English and bounce them straight back
  // through the language dialog for no reason (#138). Without the hardcoded
  // host, the same code running inside the native app (Capacitor WebView,
  // origin https://localhost) would generate a QR pointing at localhost.
  const SHARE_ORIGIN = 'https://impostorgames.com';
  const SHARE_BASE = SHARE_ORIGIN + (pagePaths()[pageLang()] || '/word/').replace(/\/$/, '');
  // A room with no deliberate activity for this long is considered dead:
  // the idle watchdog closes it, and createRoom will recycle its code.
  const IDLE_MS = 15 * 60 * 1000; // 15 minutes

  // ---- Clue Board (#244) ----
  // Thirty seconds a turn. Draw allows forty-five because a drawing takes
  // longer to make than a phrase takes to type.
  const TURN_MS = 30000;
  // The beat between the last clue and the ballot, and the three seconds the
  // reveal holds before it answers. Both are the drawing game's numbers: the
  // two games are the same game at this point in a round (#245).
  const VOTE_INTRO_MS = 2000;
  const REVEAL_MS = 3000;
  // How far past a deadline the host waits before spending the slot itself.
  // It covers the round trip of the player's own write, so the ordinary case
  // is still a client ending its own turn rather than the watchdog.
  const TURN_GRACE_MS = 4000;
  // A clue is a short phrase, not a sentence. Also the input's maxlength, so
  // a thirty-first character cannot be typed or pasted in the first place.
  const CLUE_MAX = 30;

  // ---- The online game runs itself (#275) ----
  // Four minutes in the lobby, twenty seconds to vote, ten on the result, and
  // thirty for a host who has dropped. See shared/online-clock.js. On
  // localhost, ?clocks=fast shortens all four so a round can be tested
  // without the wait.
  const CLOCKS = clocksFor(location);

  // How many times the order goes round. The same three numbers the drawing
  // game uses, and for the same reason: one round is the quick game, five is
  // the long one, and there is no sensible sixth (#258).
  //
  // The default opens on two rather than five on purpose. Five players at
  // five rounds is twenty-five turns, about twelve minutes of sitting, and a
  // room should choose that rather than land in it.
  const MIN_ROUNDS = 1;
  const MAX_ROUNDS = 5;
  const DEFAULT_ROUNDS = 2;
  function clampRounds(v) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return DEFAULT_ROUNDS;
    return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, n));
  }

  // How this player got the room code, for the joins counter. Typing it in
  // is the default; the deep-link handler overwrites this when the code
  // arrived in the URL instead. Set before joinRoom runs, read inside it.
  let joinSource = 'code';
  // This join came from a card on the /online list, so the room has to agree
  // it is an online game before anyone is let in (#269).
  let listJoin = false;

  // Shared counter kit bound to this game's namespace (analytics/word).
  // Game-specific trackers (trackRound) build on these.
  const { bumpAnalytics, trackError, installGlobalErrorTracking, trackSession, bumpFbPrompt, gameLangPaths, langCrossPaths, trackRun, resetRun,
          trackRoomCreated, trackRoomStage, trackRoomStartFailed, trackRoomClosed, resetRoomFunnel,
          trackJoin, trackJoinFail } = createAnalytics(GAME);
  installGlobalErrorTracking();

  // Word lists live in shared/words/ now, one file per locale, fetched at the
  // top of this module (also used by Impostor Artist). `w` is the secret word
  // every crewmate sees; `h` is the vague hint shown only to the imposter.

  // The category picker, as IDS. Order here drives the modal sheet layout.
  //
  // An id is not a label, even though English makes them look identical.
  // 'Food' is simultaneously the key into WORD_CATEGORIES, the value written
  // to meta.categories and read by every other player in the room, the key of
  // the played-word ledger both on the room and in localStorage, and the key
  // of the lifetime counter at analytics/word/games/categories. So it stays
  // English and ASCII in every language, and only the two strings below it
  // ever change (#135).
  //
  // Adding a category means: a bucket in WORD_CATEGORIES, an id here, and
  // category.<id>.name / .desc in every locale's runtime table. The build
  // fails if the last of those is missed.
  const CATEGORY_GROUPS = [
    {
      labelKey: 'cat.group.main',
      ids: ['Food', 'Animals', 'Places', 'Everyday Objects', 'Movies & TV', 'Football', 'Super Heroes'],
    },
  ];

  // What to SHOW for a category id. An id with no string is not a bug: a
  // room opened in another language carries ids this build has no names
  // for, and #138 lets players join it. Showing the raw id is honest and
  // still recognisable; showing nothing, or quietly substituting Food,
  // is not.
  function catName(id) {
    const key = `category.${id}.name`;
    return has(key) ? t(key) : String(id);
  }
  function catDesc(id) {
    const key = `category.${id}.desc`;
    return has(key) ? t(key) : '';
  }

  // Game modes. 'online' is the original game and stays the default: a room,
  // a code to share, everyone on their own phone, all of them sitting in the
  // same place. 'passphone' is the alternate for a group with one device
  // between them. 'clue' is the one that does not need the group to be in a
  // room together: each player writes a clue onto a shared board in turn,
  // then the room votes (#242).
  //
  // The picker sits in the lobby and reuses the dance game's components, and
  // the mode IS stored in meta.mode, the same as dance. It did not used to be,
  // because the only switch that existed tore the room down and left no meta
  // to hold it. Every client in a room has to render the same screens, so
  // meta is the only place the answer can live.
  // state.mode stays the picker's own state and is kept in step with the room
  // by the snapshot listener; Pass the Phone has no room, so there it is the
  // whole truth (#243).
  //
  // The clue board is not in the picker (#262). It is the online game, and a
  // host picks Private or Online on the create screen before the room exists,
  // because a listed room must not change game under a stranger who is
  // halfway through joining it. So MODES is the picker's two rows and
  // MODE_IDS is every id the app understands.
  //
  // The wire ids do not match the names on screen. 'online' stays 'online'
  // because games/modes/online has months of history behind it and renaming it
  // would fork the series to buy nothing.
  //
  // Mode illustrations match the dance game's: square art under /icons/modes.
  const MODES = [
    {
      id: 'online',
      name: t('mode.online.name'),
      icon: '<img src="/icons/modes/rooms.webp" alt="" width="256" height="256" loading="lazy">',
      description: t('mode.online.desc'),
    },
    {
      id: 'passphone',
      name: t('mode.passphone.name'),
      icon: '<img src="/icons/modes/passphone.webp" alt="" width="256" height="256" loading="lazy">',
      description: t('mode.passphone.desc'),
    },
  ];

  // A room created before meta.mode existed is the original game, so that is
  // what absent means. Same shape dance uses (www/dance/app.js).
  function modeOf(meta) { return (meta && meta.mode) || 'online'; }
  function roomMode() { return modeOf(state.meta); }
  // Nothing can fail this today: every id this build writes is an id this
  // build knows. It exists for the FOURTH mode, so that a tab left open across
  // that deploy says "reload" instead of silently rendering the wrong screens
  // at someone. Costs a line now; costs a bad round later.
  const MODE_IDS = ['online', 'clue', 'passphone'];
  function knownMode(id) { return MODE_IDS.indexOf(id) !== -1; }

  // Firebase keys can't contain . # $ [ ] /. Words and category names are
  // ASCII-safe today, but sanitize anyway to future-proof.
  function sanitizeKey(s) { return String(s).replace(/[.#$\[\]/]/g, '_'); }

  // Words this device has already dealt, carried across rooms so a fresh
  // room doesn't reopen with a word the group just had. See shared/played.js.
  const playedStore = createPlayedStore(GAME, CATALOG);

  // The host can pick several categories at once; a round draws from their
  // union. `meta.categories` is the array; older rooms (or a client mid-
  // deploy) may still carry only the single `meta.category`, so fall back to
  // that, then to the default.
  //
  // This used to drop any id the local catalogue did not have. That was a
  // silent reset to Food, which was tolerable when every client shipped the
  // same seven categories and stops being tolerable the moment a room can be
  // opened in another language (#138). So what the room says is what the
  // lobby shows, whether or not this build can deal words for it. The
  // dealing side guards itself; see pickWord.
  function activeCategories() {
    const m = state.meta;
    if (m && Array.isArray(m.categories) && m.categories.length) {
      const valid = m.categories.filter(c => typeof c === 'string' && c);
      if (valid.length) return valid;
    }
    if (m && typeof m.category === 'string' && m.category) return [m.category];
    return [DEFAULT_CATEGORY];
  }

  // Compact label for the lobby trigger/display: one name, two names, or the
  // first two plus a "+N" count so the card stays lean. Takes ids and returns
  // what to show.
  function categoriesSummary(ids) {
    if (!ids || !ids.length) return catName(DEFAULT_CATEGORY);
    const shown = ids.map(catName);
    if (shown.length === 1) return shown[0];
    if (shown.length === 2) return shown[0] + ', ' + shown[1];
    return shown[0] + ', ' + shown[1] + ' +' + (shown.length - 2);
  }

  // Pick a word from the union of the selected categories, skipping ones
  // already played in this room. The chosen entry carries its source category
  // so the caller records it under the right played bucket. When every word
  // across the union has been used, `reset` signals the caller to wipe the
  // played buckets and start the selection fresh.
  function pickWord(categoryIds, playedMap, deviceMap) {
    // activeCategories() passes through whatever the room says, so this is
    // where an id with no words in THIS build gets filtered out. Falling all
    // the way back to the default is the last resort: an empty union would
    // deal `undefined` as the secret word.
    const known = (categoryIds || []).filter(c => WORD_CATEGORIES[c]);
    const cats = known.length ? known : [DEFAULT_CATEGORY];
    const played = playedMap || {};
    const device = deviceMap || {};
    const union = [];
    cats.forEach(c => (WORD_CATEGORIES[c] || []).forEach(e => union.push({ e, cat: c })));

    const unplayed = union.filter(({ e, cat }) => !(played[sanitizeKey(cat)] || {})[sanitizeKey(e.w)]);
    // Words this room hasn't dealt AND this device hasn't dealt in an earlier
    // room. Preferred when there are any.
    const fresh = unplayed.filter(({ e, cat }) => !(device[cat] && device[cat].has(e.w)));

    // `reset` still means only one thing: the room itself is out of words.
    // Running dry on device history alone just drops that preference, so a
    // long night can never wipe a ledger that still had words left in it.
    const reset = unplayed.length === 0;
    const usePool = fresh.length ? fresh : (reset ? union : unplayed);
    const chosen = usePool[Math.floor(Math.random() * usePool.length)];
    return { entry: chosen.e, cat: chosen.cat, reset };
  }

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    screen: 'home',
    roomCode: null,
    // Chosen by the host in the lobby. Resets with the sitting, so every new
    // game starts on the room mode, which is the better experience and the
    // one most groups want.
    mode: 'online',
    // Which Pass the Phone roster row is being renamed, if any.
    editingId: null,
    // True once a Pass the Phone sitting is set up: the whole game runs in
    // this tab with no room, no network and no other device. See the
    // local-room section below.
    local: false,
    // The Pass the Phone handover in progress: { ids, idx }. Non-null only
    // while the phone is going round, which is also exactly when back is
    // trapped. See the pass-sequence section.
    passSeq: null,
    isHost: false,
    myId: null,
    // The session that owns my player row (#265). Separate from myId, which
    // stays a per-join key so one browser can hold more than one player.
    myUid: null,
    myName: '',
    numImposters: 1,
    // Clue board only. Kept in step with meta.rounds by the snapshot
    // listener, exactly as numImposters is.
    rounds: DEFAULT_ROUNDS,
    players: [],
    meta: null,
    roomUnsub: null,
    presenceUnsub: null,
    myJoinedAt: 0,
    myReady: false,
    // This player's hand for the round, `{ imp, text }`, delivered to them
    // alone at rooms-word/<code>/cards/<uid>/<myId> (#266). Null between
    // rounds, and null for anyone the deal did not reach.
    myCard: null,
    imposterIds: [],
    pendingJoinCode: null,
    countdownTimer: null,
    cardTimer: null,     // the 5s the card stays face up
    clockTimer: null,    // the round clock, counting up
    turnTimer: null,     // the clue board's 250ms turn ticker
    phaseTimer: null,    // the reveal countdown's 250ms ticker
    votes: {},           // voterId -> { targetId: true }, the clue board's ballot
    cluesUnsub: null,    // the listener on rooms-word/<code>/clues
    idleTimer: null,
    serverTimeOffset: 0,
  };

  // ============================================================
  // FIREBASE INIT — shared/firebase.js owns the app + db singletons.
  // ============================================================
  if (db) {
    onValue(ref(db, '.info/serverTimeOffset'), snap => {
      state.serverTimeOffset = snap.val() || 0;
    });
  }

  function nowSync() { return Date.now() + state.serverTimeOffset; }

  // ============================================================
  // HELPERS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];

  function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[rand(chars.length)];
    return s;
  }

  // A player's id in a room, still random and still per-join. See the note
  // above session() for why this is NOT the uid.
  function genId() { return 'p_' + Math.random().toString(36).slice(2, 9); }

  function avatarClass(name) {
    const colors = ['avatar-c1','avatar-c2','avatar-c3','avatar-c4','avatar-c5','avatar-c6','avatar-c7','avatar-c8'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return colors[h % colors.length];
  }

  // Animal avatars: each player gets a random unused animal (1..20) at
  // join time, stored on their player record so every phone shows the same
  // animal. Players from rooms created before this shipped have no `av`
  // and fall back to the old initials circle.
  const AVATAR_COUNT = 20;
  const AVATAR_NAMES = ['fox','panda','koala','dog','rabbit','bear','lion','tiger','raccoon','penguin','deer','giraffe','elephant','cow','hedgehog','owl','otter','shiba','frog','chick'];
  function pickAvatar(playersObj) {
    const used = new Set(Object.values(playersObj || {}).map(p => p && p.av).filter(Boolean));
    const free = [];
    for (let i = 1; i <= AVATAR_COUNT; i++) if (!used.has(i)) free.push(i);
    const pool = free.length ? free : Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function avatarHtml(p) {
    if (p.av >= 1 && p.av <= AVATAR_COUNT) {
      const animal = AVATAR_NAMES[p.av - 1];
      return `<img class="player-avatar" src="/avatars/av${String(p.av).padStart(2, '0')}.webp" alt="${animal}">`;
    }
    return `<div class="player-avatar ${avatarClass(p.name)}">${escapeHtml(p.name.slice(0, 2).toUpperCase())}</div>`;
  }

  // Player id → timestamp of its first lobby render. A join triggers several
  // RTDB snapshots back-to-back (player write + lastActivity stamp), each
  // re-building the list — so the just-joined class must survive re-renders
  // for the animation's duration, not just the very first paint.
  const lobbySeen = new Map();
  const JOIN_ANIM_MS = 700;
  function isNewInLobby(id) {
    const now = Date.now();
    if (!lobbySeen.has(id)) lobbySeen.set(id, now);
    return now - lobbySeen.get(id) < JOIN_ANIM_MS;
  }

  // Confetti micro-burst: fired once per player (guarded by burstFired) and
  // skipped on the initial lobby paint so a late joiner doesn't see a salvo
  // of bursts for everyone already in the room.
  const burstFired = new Set();
  function confettiBurst(rowEl) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Measure the row, not the avatar — the avatar's pop animation starts at
    // scale(0), so its rect is 0x0 at this moment. The avatar sits 16px
    // (row padding) + 20px (half its 40px width) from the row's left edge.
    const r = rowEl.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + 36, cy = r.top + r.height / 2;
    const colors = ['#f2a65e', '#e8875f', '#2f9e94', '#e9c46a', '#9b8ec4', '#e58ba2'];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('span');
      s.className = 'confetti-bit';
      const ang = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.6;
      const dist = 26 + Math.random() * 22;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.background = colors[i % colors.length];
      if (i % 3 === 0) { s.style.width = '6px'; s.style.height = '6px'; s.style.borderRadius = '50%'; }
      s.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * dist + 14) + 'px');
      s.style.setProperty('--rot', (Math.random() * 240 - 120) + 'deg');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }

  // Smooth departures: clone the leaving row as a fixed ghost on <body> (the
  // same trick the confetti uses) so it can fade out after the rebuild has
  // already dropped the real row, instead of just blinking away.
  function spawnLeaveGhost(rowEl, rect) {
    const ghost = rowEl.cloneNode(true);
    ghost.classList.remove('just-joined');
    ghost.classList.add('player-ghost');
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    setTimeout(() => ghost.remove(), 500);
  }

  // FLIP: rows that survived the rebuild (matched by data-pid) are snapped
  // back to their old position, then released so they glide to the new one.
  function flipRows(list, firstRects) {
    [...list.children].forEach(row => {
      const first = firstRects.get(row.dataset.pid);
      if (!first || row.classList.contains('just-joined')) return;
      const dy = first.top - row.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      row.style.transition = 'none';
      row.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        row.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
        row.style.transform = '';
      });
      row.addEventListener('transitionend', function clear() {
        row.style.transition = '';
        row.style.transform = '';
        row.removeEventListener('transitionend', clear);
      });
    });
  }

  function showToast(msg, ms = 2200) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function go(screenId) {
    if (screenId !== 'lobby') stopHintRotation();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + screenId).classList.add('active');
    state.screen = screenId;
    document.getElementById('app').scrollTop = 0;
    syncChatLauncher();
  }

  // ============================================================
  // ROOM OPERATIONS (Firebase)
  // ============================================================

  // Every player row carries the uid of the session that owns it (#265).
  // The row's KEY stays a random per-join id: the uid is a second field on
  // it, not a replacement for the key.
  //
  // Using the uid as the key was tried first and is wrong. Firebase auth
  // persists per ORIGIN, so every tab of the same browser restores the same
  // anonymous user. Three tabs joining one room all wrote the same key and
  // overwrote each other, leaving a three-handed game with one player in it.
  // That would have broken two real things: multi-tab local rounds, which
  // are the only honest test of anything multiplayer here, and two people
  // sharing one tablet.
  //
  // What the uid is for is authority. It lets a rule say "you may write this
  // row only if it is already yours", which is the whole point of #267, and
  // it gives a report in #268 something durable to name. A rule reaches it
  // as players/$pid/uid rather than as $pid itself, which costs a lookup and
  // buys back everything above.
  //
  // Pass the Phone does not come through here. Its players are rows on one
  // device with ids like `local_3`, it makes no room and touches no database.
  // Do not "tidy" it into this path.
  //
  // Warming the session at boot is worth the line: the round trip overlaps
  // with the host typing their name, so creating a room is no slower.
  function session() {
    return ensureSession().catch(() => {
      // `plain` says the message is already a whole sentence, so the callers
      // below show it as-is instead of wrapping it in "Failed to create
      // room: ...", which reads as two errors stacked on one another.
      const e = new Error(t('error.no-session'));
      e.plain = true;
      throw e;
    });
  }
  if (db) session().catch(() => {});

  async function createRoom(name, numImposters) {
    if (!db) throw new Error(t('error.no-firebase'));
    let code;
    for (let i = 0; i < 5; i++) {
      code = genRoomCode();
      const snap = await get(ref(db, `rooms-word/${code}/meta`));
      if (!snap.exists()) break;
      // Code is taken — but if that room has gone idle past the cutoff it's
      // abandoned (e.g. everyone closed their tab, so the watchdog never
      // fired). Reclaim the code and overwrite the dead room.
      const m = snap.val();
      const last = (m && (m.lastActivity || m.createdAt)) || 0;
      if (typeof last === 'number' && nowSync() - last > IDLE_MS) break;
    }
    const myId = genId();
    const uid = await session();
    const joinedAt = nowSync();
    const av = pickAvatar(null);
    await set(ref(db, `rooms-word/${code}`), {
      meta: {
        hostId: myId,
        // The host's SESSION, alongside the host's player id. The rule on
        // `answer` reads this one, because a player id is only a key anyone
        // could claim and a uid is the one thing a rule can check (#266).
        hostUid: uid,
        numImposters,
        // How many times the clue board's order goes round. Written on every
        // room, so a room that reaches the board never falls back to the
        // default silently for want of the field (#258).
        rounds: DEFAULT_ROUNDS,
        category: DEFAULT_CATEGORY,
        phase: 'lobby',
        // Which game this room is playing, and every client in the room
        // renders from it (#243). Written once, here: the create screen's
        // Private or Online decides it and nothing rewrites it (#262).
        mode: state.mode,
        // The room's language, fixed at creation and never updated. It
        // decides the words AND the interface for everyone who joins, so a
        // player on another language's page is sent here rather than given
        // a translated shell around words they cannot read (#138).
        lang: pageLang(),
        // An online game's lobby clock starts with its room (#275).
        ...(state.mode === 'clue' ? { lobbyAt: joinedAt + CLOCKS.lobby } : {}),
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      },
      players: {
        [myId]: { name, ready: false, joinedAt, av, uid }
      }
    });
    state.roomCode = code;
    state.myId = myId;
    state.myUid = uid;
    state.myName = name;
    state.myAv = av;
    state.myJoinedAt = joinedAt;
    state.myReady = false;
    state.isHost = true;
    state.numImposters = numImposters;
    state.rounds = DEFAULT_ROUNDS;

    trackRoomCreated(); // top of the room funnel; also clears the stage dedupe

    setupPresence();
    mountRoomChat();
    // NOTE: the room listener is attached later, when the host taps
    // "Go to Lobby" (see btn-share-continue). Attaching it here would let
    // the lobby-phase auto-router skip the share-code screen.
  }

  // The room's two public halves, read together. Since #266 the room node
  // itself is not readable: `cards` and `answer` live under it and a read
  // granted at the room would be granted over them too. So the two callers
  // that used to pull the whole room name the halves they actually wanted,
  // which is all either of them ever used. Both reads go out at once, so
  // this still costs one round trip.
  // The host removed this browser from the room (#268). Keyed by uid, so it
  // covers every tab of one browser and nothing more: a private window is a
  // new session and gets back in. Accepted for now.
  function isBlocked(meta, uid) {
    return !!(uid && meta && meta.blocked && meta.blocked[uid]);
  }

  // ---- The public index (#269) ----
  // The host keeps this room's card in online-games/<code> in step with the
  // room: written when the room turns online and whenever something a card
  // shows changes, rewritten every HEARTBEAT_MS so the list can tell a live
  // host from a frozen tab, and removed on the way out. Only the host, and
  // only for a clue room: the rules refuse anyone else. See
  // shared/online-games.js for the shape and why it is an allow-list.
  let listedSig = '';
  let listingTimer = null;

  function syncListing(opts = {}) {
    if (!db || !state.roomCode || state.local || !state.isHost || !state.meta) return;
    const card = listingFor({ meta: state.meta, players: state.players, host: state.myName, now: nowSync() });
    if (!card) { if (listedSig) unlistRoom(); return; }
    const sig = listingSig(card);
    if (sig === listedSig && !opts.beat && !opts.reconnect) return;
    const r = ref(db, `${ONLINE_TREE}/${state.roomCode}`);
    // A dropped socket takes the card down with it, the same way it takes
    // the player's row. Registered again after a reconnect, because the
    // server forgets it once it has fired.
    if (!listedSig || opts.reconnect) onDisconnect(r).remove().catch(() => {});
    listedSig = sig;
    set(r, { ...card, heartbeat: serverTimestamp() }).catch(() => { listedSig = ''; });
    if (!listingTimer) listingTimer = setInterval(() => syncListing({ beat: true }), HEARTBEAT_MS);
  }

  async function unlistRoom() {
    if (listingTimer) { clearInterval(listingTimer); listingTimer = null; }
    if (!listedSig || !db || !state.roomCode) { listedSig = ''; return; }
    listedSig = '';
    const r = ref(db, `${ONLINE_TREE}/${state.roomCode}`);
    try { onDisconnect(r).cancel(); } catch (e) {}
    try { await remove(r); } catch (e) {}
  }

  // ---- Waiting for the next round (#271) ----
  // Somebody who picked an online game in the middle of a round. They are not
  // in the room and hold no seat, so nothing in the round, the vote or the
  // rules has to know about them. This watches the room's meta from outside,
  // which anyone with the code can read, and joins the normal way as soon as
  // the room is back in its lobby. joinRoom checks everything again then, so
  // a room that filled up during the round says so in the usual words.
  let waitUnsub = null;

  function startWaiting(code, name, room) {
    stopWaiting();
    const players = room.players || {};
    const host = players[room.meta.hostId];
    const row = {
      lang: room.meta.lang,
      host: host ? host.name : '',
      players: Object.keys(players).length,
      avs: facesOf(players),
      phase: 'playing',
    };
    $('wait-card').replaceChildren(gameCard(row, { code }));
    $('wait-name').textContent = name;
    $('wait-ended-text').textContent = t('wait.ended-text', { name: row.host || code });
    showWaitEnded(false);
    go('wait');
    acquireWakeLock();

    const ended = () => { stopWaiting(); showWaitEnded(true); };
    let joining = false;
    waitUnsub = onValue(ref(db, `rooms-word/${code}/meta`), async (snap) => {
      const meta = snap.val();
      // meta/closed is written just before a room is deleted (#275).
      if (!meta || meta.closed) { ended(); return; }
      if (meta.phase !== 'lobby' || joining) return;
      joining = true;
      stopWaiting();
      try {
        await joinRoom(code, name);
        enterLobby();
      } catch (e) {
        // The next round started before the join landed: wait again.
        if (e.waitFor) { startWaiting(code, name, e.waitFor); return; }
        releaseWakeLock();
        showToast(e.message || t('error.join'));
        go('home');
      }
    }, ended);
  }

  function stopWaiting() {
    if (waitUnsub) { waitUnsub(); waitUnsub = null; }
  }

  function showWaitEnded(isEnded) {
    $('wait-live').hidden = isEnded;
    $('wait-ended').hidden = !isEnded;
    $('btn-wait-cancel').hidden = isEnded;
    $('btn-wait-all').hidden = !isEnded;
    if (isEnded) releaseWakeLock();
  }

  async function getRoomPublic(code) {
    const [metaSnap, playersSnap] = await Promise.all([
      get(ref(db, `rooms-word/${code}/meta`)),
      get(ref(db, `rooms-word/${code}/players`)),
    ]);
    return { meta: metaSnap.val(), players: playersSnap.val() || {} };
  }

  async function joinRoom(code, name) {
    if (!db) throw new Error(t('error.no-firebase'));
    const room = await getRoomPublic(code);
    if (!room.meta) { trackJoinFail('notFound'); throw new Error(t('error.room-not-found')); }
    const meta = room.meta;
    if (listJoin && modeOf(meta) !== 'clue') { trackJoinFail('notOnline'); throw new Error(t('error.not-online')); }
    if (meta.phase !== 'lobby') {
      // An online game in a round is waited for, not refused (#271). Nothing
      // has been written; the caller shows the waiting screen.
      if (modeOf(meta) === 'clue') throw Object.assign(new Error('in a round'), { waitFor: room });
      trackJoinFail('inProgress');
      throw new Error(t('error.in-progress'));
    }
    if (!knownMode(modeOf(meta))) { trackJoinFail('needsUpdate'); throw new Error(t('error.needs-update')); }
    if (Object.keys(room.players || {}).length >= MAX_PLAYERS) { trackJoinFail('full'); throw new Error(t('error.room-full')); }

    const uid = await session();
    if (isBlocked(meta, uid)) throw new Error(t('error.removed'));
    const myId = genId();
    const joinedAt = nowSync();
    const av = pickAvatar(room.players);
    await set(ref(db, `rooms-word/${code}/players/${myId}`), {
      name, ready: false, joinedAt, av, uid
    });
    update(ref(db, `rooms-word/${code}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
    state.roomCode = code;
    state.myId = myId;
    state.myUid = uid;
    state.myName = name;
    state.myAv = av;
    state.myJoinedAt = joinedAt;
    state.myReady = false;
    state.isHost = false;

    trackJoin(joinSource);

    setupPresence();
    mountRoomChat();
    attachRoomListener();
  }

  // Firebase presence: re-add the player whenever the connection
  // (re)establishes — screen-off, tab-switch, and network blips all drop
  // the socket and fire onDisconnect, which would otherwise remove us
  // permanently. Watching .info/connected lets us recover automatically.
  function setupPresence() {
    acquireWakeLock();
    if (!db || !state.roomCode || !state.myId) return;
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    const connectedRef = ref(db, '.info/connected');
    state.presenceUnsub = onValue(connectedRef, (snap) => {
      if (snap.val() === true) refreshPresence();
    });
  }

  async function refreshPresence() {
    if (!db || !state.roomCode || !state.myId) return;
    const code = state.roomCode, id = state.myId;
    try {
      // Don't resurrect a room the host has already closed.
      const metaSnap = await get(ref(db, `rooms-word/${code}/meta`));
      if (!metaSnap.exists()) return;
      if (state.roomCode !== code || state.myId !== id) return;
      const myRef = ref(db, `rooms-word/${code}/players/${id}`);
      await onDisconnect(myRef).remove();
      // set() replaces the row, so `uid` has to be repeated here. Leaving it
      // out means the first reconnect quietly strips the one field that says
      // whose row this is (#265).
      await set(myRef, {
        name: state.myName,
        ready: !!state.myReady,
        joinedAt: state.myJoinedAt || nowSync(),
        av: state.myAv || 0,
        uid: state.myUid,
      });
      if (state.isHost) syncListing({ reconnect: true });
    } catch (e) { /* transient — will retry on next reconnect */ }
  }

  // Screen Wake Lock: keep the phone awake while in a room so it doesn't
  // lock, drop the socket, and bump the player. Supported on Chrome/Android
  // and iOS Safari 16.4+. Where it's unavailable or denied, a rotating hint
  // in the lobby asks the player to keep their screen on instead.
  const WAKE_SUPPORTED = ('wakeLock' in navigator);
  let wakeLock = null;
  let wakeDenied = false;
  async function acquireWakeLock() {
    if (!WAKE_SUPPORTED || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeDenied = false;
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) {
      wakeLock = null;
      wakeDenied = true; // fall back to the rotating lobby hint
    }
    if (state.screen === 'lobby') updateLobbyHint();
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }

  // Lobby "keep screen on" hint. Only shown where wake lock can't do the job.
  // It time-shares the single start-hint line so the footer never grows.
  const WAKE_TIP = t('lobby.wake-tip');
  let lobbyHintStatus = '';   // the live status text ("Waiting for host…")
  let hintTipVisible = false; // is the tip currently on screen?
  let hintTimer = null;
  function setLobbyStatus(text) {
    lobbyHintStatus = text;
    if (!hintTipVisible) $('start-hint').textContent = text;
  }
  function hintShouldRotate() {
    return (!WAKE_SUPPORTED || wakeDenied) && state.screen === 'lobby';
  }
  function fadeHintTo(text) {
    const el = $('start-hint');
    el.style.transition = 'opacity 0.25s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = text; el.style.opacity = '1'; }, 250);
  }
  function scheduleHintFlip() {
    const delay = hintTipVisible ? 4000 : 6000; // status 6s, tip 4s
    hintTimer = setTimeout(() => {
      hintTipVisible = !hintTipVisible;
      fadeHintTo(hintTipVisible ? WAKE_TIP : lobbyHintStatus);
      scheduleHintFlip();
    }, delay);
  }
  function updateLobbyHint() {
    if (hintShouldRotate()) {
      if (!hintTimer) scheduleHintFlip();
    } else {
      stopHintRotation();
    }
  }
  function stopHintRotation() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (hintTipVisible) {
      hintTipVisible = false;
      const el = $('start-hint');
      el.style.opacity = '1';
      el.textContent = lobbyHintStatus;
    }
  }

  // Stamp the room as active so the idle watchdog leaves it alone.
  function touchRoom() {
    if (!db || !state.roomCode) return;
    update(ref(db, `rooms-word/${state.roomCode}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
  }

  // While we're in a room, poll for inactivity. If nothing has happened for
  // IDLE_MS, close the room for everyone — the onValue null-handler below
  // then routes each client home. Any client may do the delete (idempotent).
  function startIdleWatch() {
    stopIdleWatch();
    state.idleTimer = setInterval(async () => {
      if (!db || !state.roomCode || !state.meta) return;
      const last = state.meta.lastActivity;
      if (typeof last !== 'number') return;       // serverTimestamp not resolved yet
      if (nowSync() - last < IDLE_MS) return;
      const code = state.roomCode;
      try { await remove(ref(db, `rooms-word/${code}`)); } catch (e) {}
      // Any client may clear the card once its room is gone, so a guest who
      // closed the room does not leave the host's card behind (#269).
      remove(ref(db, `${ONLINE_TREE}/${code}`)).catch(() => {});
    }, 60000);
  }
  function stopIdleWatch() {
    if (state.idleTimer) { clearInterval(state.idleTimer); state.idleTimer = null; }
  }

  // Three listeners where there used to be one (#266). The room node is no
  // longer readable, because `cards` hangs off it and a read granted at the
  // room would be granted over the cards too, so each public child is
  // listened to by name.
  //
  // The three are kept in this one object and every one of them runs the
  // same applyRoom() against it, so the body below is unchanged: it still
  // sees a whole room every time, just assembled here rather than by the
  // server. What IS new is that a write spanning two of them arrives as two
  // snapshots. Only one such write exists, the end of the clue board, which
  // sets meta/phase and clears votes together, and the votes it clears are
  // already empty by then.
  //
  // `meta` decides whether the room still exists. It is written at creation
  // and never deleted while the room lives, so losing it means the room is
  // gone, which is the same test the single listener made against the room
  // node itself.
  let roomData = { meta: null, players: null, votes: null };

  function attachRoomListener() {
    startIdleWatch();
    startOnlineClock();
    const base = `rooms-word/${state.roomCode}`;
    roomData = { meta: null, players: null, votes: null };
    const unsubs = ['meta', 'players', 'votes'].map(part =>
      onValue(ref(db, `${base}/${part}`), snap => {
        roomData[part] = snap.val();
        applyRoom();
      })
    );
    unsubs.push(attachCardListener());
    state.roomUnsub = () => unsubs.forEach(fn => { try { fn(); } catch (e) {} });
  }

  // This player's hand, which nobody else in the room can read (#266). Keyed
  // by session and then by player id: see the note on session() for why one
  // browser's tabs all share a uid, and the rules file for why that means the
  // player id has to be in the path as well.
  //
  // A player with no uid gets no listener and no card. That is a room made
  // before the session work landed, and it degrades to the same place a join
  // race does: no card this round, play the next one.
  function attachCardListener() {
    if (!state.myUid) return () => {};
    const path = `rooms-word/${state.roomCode}/cards/${state.myUid}/${state.myId}`;
    return onValue(ref(db, path), snap => {
      state.myCard = snap.val();
      // The card can land after the screen that shows it, because the deal
      // and the phase flip are one write but two listeners. Repaint rather
      // than assume the order.
      if (state.screen === 'game') paintCard();
      else if (state.screen === 'clues') renderClueCard();
    });
  }

  function applyRoom() {
    const data = roomData;
    if (!data.meta) {
      // Still waiting for the first snapshot, rather than gone: the room
      // cannot be declared closed before anything has arrived.
      if (!state.meta) return;
      showToast(t('error.room-closed'));
      leaveRoom(true);
      return;
    }
    const meta = data.meta || {};
    // Removed by the host. The rules already refuse this browser a row, so
    // there is nothing to clean up, only somewhere to go. Never the host:
    // their other tabs share the uid, and the lobby never offers to remove a
    // row from the host's own browser anyway (#268).
    if (meta.hostId !== state.myId && isBlocked(meta, state.myUid)) {
      showToast(t('error.removed'));
      leaveRoom(true);
      return;
    }
    // The host closed this online room and said why (#275). Written just
    // before the room is deleted, so it arrives ahead of the delete and the
    // players read the reason rather than a bare "Room closed". Never the
    // host's own tab: that one is doing the closing.
    if (meta.closed && meta.hostId !== state.myId) {
      showToast(t(CLOSE_KEYS[meta.closed] || 'error.room-closed'), CLOSE_TOAST_MS);
      leaveRoom(true);
      return;
    }
    const playersObj = data.players || {};
    const players = Object.entries(playersObj).map(([id, p]) => ({
      id,
      name: p.name,
      ready: !!p.ready,
      joinedAt: p.joinedAt || 0,
      av: p.av || 0,
      // Carried through so the host can address a card to the session that
      // owns this row (#266). Absent on a row written before #265.
      uid: p.uid || null,
      isHost: id === meta.hostId,
      // Empty for the whole round now: the ids arrive in meta at the reveal
      // and not before (#266). Only the Pass the Phone reveal still reads
      // this, and that mode fills it in itself.
      isImposter: meta.imposterIds ? !!meta.imposterIds[id] : false,
      isMe: id === state.myId,
      isBot: false,
    })).sort((a, b) => a.joinedAt - b.joinedAt);

    const prevPhase = state.meta ? state.meta.phase : null;
    state.meta = meta;
    state.players = players;
    state.votes = data.votes || {};
    // The room decides the mode, not this client. The host sets it by
    // writing meta and everyone, host included, reads it back from here, so
    // there is one answer and a joiner's picker names the game they actually
    // joined instead of the default (#243).
    state.mode = roomMode();
    state.numImposters = meta.numImposters || 1;
    state.rounds = clampRounds(meta.rounds);
    state.isHost = meta.hostId === state.myId;
    const meNow = players.find(p => p.isMe);
    if (meNow) state.myReady = meNow.ready;
    // Remembered before anyone can leave, because the strip and the board
    // both have to keep naming a player after their tab is gone (#244).
    players.forEach(p => playerMemo.set(p.id, { name: p.name, av: p.av }));
    if (state.isHost) syncListing();

    if (state.screen === 'lobby') renderLobby();
    // Every snapshot, not only a phase change: a ballot filling up is what
    // this screen is showing, and the rows have to follow it.
    if (state.screen === 'vote') renderVote();
    // The strip is rebuilt on room changes only, never on the turn ticker,
    // so a thumb scrolling it sideways is not fought every 250ms.
    if (state.screen === 'clues') { renderTurnStrip(); renderClueBoard(); }
    const phase = meta.phase;
    if (phase !== prevPhase) {
      if (phase === 'lobby' && state.screen !== 'lobby') enterLobby();
      else if ((phase === 'countdown' || phase === 'playing')
               && state.screen !== 'game' && state.screen !== 'clues') beginGame();
      else if (phase === 'vote' && state.screen !== 'vote') enterVoteScreen();
      else if (phase === 'reveal' && state.screen !== 'reveal') enterRevealCountdown();
      else if (phase === 'over' && state.screen !== 'over') revealImposter();
    }
    // Outside the phase branch on purpose: the last ballot to fill up is
    // usually somebody else's, which reaches this client as a votes write
    // and not as a phase change at all.
    if (phase === 'vote' && state.isHost && everyonePresentVoted()) fbCloseVote();
  }

  // One write, so the row and the block land together. A row deleted on its
  // own would be put straight back by the removed tab's presence handler the
  // next time its socket reconnects (#268). Lobby only: mid-round, the
  // player's clue turns and the ballot size would have to change with them.
  async function fbRemovePlayer(p) {
    if (!db || !state.roomCode || state.local || !state.isHost || !p.uid) return;
    if (!state.meta || state.meta.phase !== 'lobby') return;
    try {
      await update(ref(db, `rooms-word/${state.roomCode}`), {
        [`players/${p.id}`]: null,
        [`meta/blocked/${p.uid}`]: true,
        'meta/lastActivity': serverTimestamp(),
      });
    } catch (e) {
      showToast(t('error.remove-player'));
    }
  }

  function confirmRemovePlayer(p) {
    openConfirm({
      title: t('remove.title', { name: p.name }),
      body: t('remove.body'),
      go: t('remove.go'),
      onGo: () => fbRemovePlayer(p),
    });
  }

  async function fbToggleReady() {
    if (!db || !state.roomCode || state.local) return;
    const me = state.players.find(p => p.isMe);
    if (!me) return;
    await update(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`), {
      ready: !me.ready
    });
    touchRoom();
  }

  // Everything a round needs, decided but not yet written anywhere: the word,
  // who the impostors are, and the hint. Split out of fbStartGame so the
  // online host and a single passed-around phone deal identically instead of
  // drifting into two rules for the same game.
  //
  // Not pure: the device-level played ledger is updated here, because it is
  // the same bookkeeping in both modes and forgetting it in one of them is
  // exactly the kind of bug this split exists to prevent. Only the *room*
  // ledger differs, so that is left to the caller as a `reset` flag.
  function dealRound() {
    const cats = activeCategories();
    const playedMap = (state.meta && state.meta.played) || {};
    const picked = pickWord(cats, playedMap, playedStore.recent());
    const entry = picked.entry;

    const shuffled = [...state.players].sort(() => Math.random() - 0.5);
    const imposterIds = {};
    shuffled.slice(0, state.numImposters).forEach(p => { imposterIds[p.id] = true; });

    // Order matters: clear then record, or this word is wiped by its own reset.
    if (picked.reset) playedStore.clear(cats);
    playedStore.record(picked.cat, entry.w);

    // The clue board's turn order gets its OWN shuffle. Reusing the one the
    // impostors were sliced off the front of would put an impostor first
    // every single round, and the order is public, so that hands the room
    // the answer (#244). Costs nothing in the modes that ignore it.
    const order = [...state.players].sort(() => Math.random() - 0.5).map(p => p.id);

    return { cats, cat: picked.cat, entry, imposterIds, order, hint: pickHint(entry), reset: picked.reset };
  }

  // The turn order unrolled, one player per slot, for the whole board. The
  // client never reads this back; see the note where it is written.
  function seatsFor(order, rounds) {
    const out = [];
    for (let r = 0; r < rounds; r++) order.forEach(id => out.push(id));
    return out;
  }

  // Says whether the round started, so the online lobby's clock knows to try
  // again (#275).
  async function fbStartGame() {
    if (!db || !state.isHost || state.local) return false;
    const startBtn = $('btn-start');
    const startHint = $('start-hint');
    startBtn.disabled = true;
    const prevHint = startHint.textContent;
    startHint.textContent = t('lobby.dealing');
    try {
      const deal = dealRound();
      const entry = deal.entry;
      const chosenCat = sanitizeKey(deal.cat);

      const startAt = nowSync() + COUNTDOWN_MS;

      const wKey = sanitizeKey(entry.w);
      const updates = {
        'meta/phase': 'countdown',
        'meta/startAt': startAt,
        // The count, not the names. The ballot has to ask for as many names
        // as this round dealt, and it has to know that before the reveal,
        // which is the only part of the deal that stays public (#266).
        'meta/dealtImposters': Object.keys(deal.imposterIds).length,
        'meta/lastActivity': serverTimestamp(),
      };

      // One hand per player, each readable only by the session that owns the
      // row it belongs to. Written in the same update as the phase flip, so
      // no client can reach the countdown before its card exists.
      //
      // An impostor's card carries the hint and NOT the word. Putting both on
      // every card and letting the screen pick would have moved the leak
      // rather than closed it: the whole point is that what a player can read
      // is what they are allowed to know.
      //
      // A player with no uid is skipped. Their row predates #265, so there is
      // no session to address, and they land on the same no-card screen a
      // late arrival gets.
      state.players.forEach(p => {
        if (!p.uid) return;
        const imp = !!deal.imposterIds[p.id];
        updates[`cards/${p.uid}/${p.id}`] = { imp, text: imp ? deal.hint : entry.w };
      });

      // The host's copy, and the only place the whole deal is written down.
      // Readable by the host's session alone; see database.rules.json.
      //
      // The reveal is read back out of this rather than out of a closure, so
      // the deal outlives whatever is holding the host's client state: the
      // handover #267 needs, and a reload, if this page ever learns to rejoin
      // a room it is in the middle of. Today it does not, and a host who
      // reloads mid-round strands the room exactly as it did before.
      //
      // The host's client dealt this round, so the host can cheat and nobody
      // else can. That is not fixable without a server and a server is not in
      // this epic. It is the reason an open game should think twice before
      // letting whoever pressed Create keep the role for every round (#264).
      updates['answer'] = {
        word: entry.w,
        imps: deal.imposterIds,
      };
      // Last round's hands are cleared by fbReplay on the way back to the
      // lobby, which is the only route to this function, so there is nothing
      // to wipe here. It could not be wiped here in any case: one update
      // cannot carry both `cards` and a path underneath it.
      if (state.mode === 'clue') {
        updates['meta/order'] = deal.order;
        updates['meta/turn'] = 0;
        // The same order again, unrolled one entry per turn, and it exists
        // for the rules rather than for this file (#267). A rule has to
        // answer "whose slot is clue 4?" before it lets anyone write it, and
        // the only thing it has to work with is the slot's key, which is the
        // string "4". Rules have no way to turn that into a number, so
        // order[turn % order.length] cannot be expressed there. Unrolled, it
        // is one path lookup: meta/seats/4.
        //
        // It cannot drift from `order`: both are written here, in one update,
        // out of the same array and the same round count, and neither is
        // touched again for the life of the round.
        updates['meta/seats'] = seatsFor(deal.order, clampRounds(state.rounds));
        // Written again here rather than trusted from the lobby, so the
        // length of the board is fixed at the moment the round is dealt and
        // a room that predates the setting still gets a number (#258).
        updates['meta/rounds'] = clampRounds(state.rounds);
        // The first slot's deadline is known here, so it is written once and
        // never raced for. The card sits face up for CARD_FACE_UP_S after the
        // countdown lands, and the board takes over from there: nobody's turn
        // burns down while the room is still reading its word.
        updates['meta/turnAt'] = startAt + CARD_FACE_UP_S * 1000 + TURN_MS;
        updates['clues'] = null;   // a fresh board for the new round
      }
      if (deal.reset) {
        // Union exhausted, so wipe the played buckets for every selected
        // category, then seed just this word under its own bucket. The
        // device forgets them too (dealRound does that), or the next room
        // would seed the same exhausted state and reset all over again.
        deal.cats.forEach(c => { updates[`meta/played/${sanitizeKey(c)}`] = null; });
        updates[`meta/played/${chosenCat}`] = { [wKey]: true };
      } else {
        updates[`meta/played/${chosenCat}/${wKey}`] = true;
      }
      await update(ref(db, `rooms-word/${state.roomCode}`), updates);

      trackRound(deal.cat, entry.w);

      setTimeout(() => {
        update(ref(db, `rooms-word/${state.roomCode}/meta`), { phase: 'playing' }).catch(()=>{});
      }, Math.max(0, startAt - nowSync()) + 200);
      return true;
    } catch (e) {
      trackError('round_start_failed');
      trackRoomStartFailed(); // the host pressed Start and got nothing
      showToast(e.message || t('error.round-start'));
      startBtn.disabled = false;
      startHint.textContent = prevHint;
      return false;
    }
  }

  // Host ends the round: everyone's screen flips to the reveal. All the
  // clue-giving and accusations happen out loud — the app only referees
  // the cards and the reveal.
  async function fbForceReveal() {
    if (!db || !state.isHost || state.local) return;
    await update(ref(db, `rooms-word/${state.roomCode}/meta`), await revealUpdate());
  }

  // The reveal is the moment the answer becomes public (#266). It is read
  // back out of `answer` rather than held in memory, and written in the SAME
  // update as the phase, so the snapshot that puts a client on the reveal
  // screen is the one that carries what the screen has to say.
  //
  // The hint is deliberately not published: nothing reads it after the round,
  // and a field nobody reads is a field to keep out of a public node.
  //
  // A host whose read fails still ends the round. A reveal with a dash where
  // the word should be is a bad round; a room stuck on the vote screen with
  // no way out is a worse one.
  async function revealUpdate() {
    const out = { phase: 'over', lastActivity: serverTimestamp() };
    try {
      const snap = await get(ref(db, `rooms-word/${state.roomCode}/answer`));
      const a = snap.val();
      if (a) {
        out.secretWord = a.word;
        out.imposterIds = a.imps || {};
      }
    } catch (e) { trackError('reveal_answer_failed'); }
    // The result screen's clock, and whether anybody played at all, decided
    // once here by the host so every screen shows the same thing (#275).
    if (roomMode() === 'clue') {
      out.overAt = nowSync() + CLOCKS.over;
      out.emptyRound = !roundWasPlayed(clues, state.votes);
    }
    return out;
  }

  async function fbReplay() {
    if (!db || !state.isHost || state.local) return;
    // Ready state persists across rounds — players opt in once at the
    // start of the session and manually toggle off if they need to step
    // away. Only fresh joins default to unready.
    const updates = {};
    updates['meta/phase'] = 'lobby';
    updates['meta/startAt'] = null;
    updates['meta/imposterIds'] = null;
    updates['meta/secretWord'] = null;
    updates['meta/imposterHint'] = null;
    updates['meta/dealtImposters'] = null;
    // The hands and the deal, gone with the round they belonged to (#266).
    // Clearing them here rather than at the next deal is what lets that write
    // address each card by path: one update cannot carry both.
    updates['cards'] = null;
    updates['answer'] = null;
    updates['meta/order'] = null;
    updates['meta/seats'] = null;
    updates['meta/turn'] = null;
    updates['meta/turnAt'] = null;
    updates['clues'] = null;
    updates['meta/revealAt'] = null;
    updates['votes'] = null;
    // Back in the lobby, an online game's clock starts again from the top,
    // and the round's own two clocks go with the round (#275).
    updates['meta/lobbyAt'] = roomMode() === 'clue' ? nowSync() + CLOCKS.lobby : null;
    updates['meta/voteAt'] = null;
    updates['meta/overAt'] = null;
    updates['meta/emptyRound'] = null;
    updates['meta/lastActivity'] = serverTimestamp();
    await update(ref(db, `rooms-word/${state.roomCode}`), updates);
  }

  async function leaveRoom(skipDelete) {
    // Read before anything below clears the room out of state.
    const online = isOnlineRoom();
    stopOnlineClock();
    closeConfirm();
    destroyRoomChat();
    stopHintRotation();
    releaseWakeLock();
    stopAllTimers();
    closeRoundPopups();

    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    detachClueListener();
    clues = {};
    cluesSeen = new Set();
    rowsSeen = new Set();
    boardSig = null;
    stopTyping();
    playerMemo.clear();
    advanceGuard = -1;
    wroteSlot = -1;
    writerGoneAt = 0;
    composerFor = -1;
    phaseGuard = '';
    state.votes = {};
    hideVoteIntro();
    // Cancel the pending auto-removal so it can't fire after we've left.
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`)).cancel(); } catch(e){}
    }
    await unlistRoom();

    if (db && state.roomCode && state.myId && !skipDelete) {
      try {
        if (state.isHost) {
          // Say why before the room goes, so an online room's players read
          // that the host left rather than a bare "Room closed" (#275). Not
          // when closeRoom has already written a reason of its own.
          if (online && !closingRoom) {
            trackRoomClosed('hostQuit');
            await update(ref(db, `rooms-word/${state.roomCode}/meta`), { closed: 'hostQuit' }).catch(() => {});
          }
          await remove(ref(db, `rooms-word/${state.roomCode}`));
        } else {
          await remove(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`));
        }
      } catch (e) { console.warn('leaveRoom cleanup failed', e); }
    }
    state.roomCode = null;
    state.myId = null;
    state.myUid = null;
    state.myCard = null;
    state.isHost = false;
    state.local = false;
    state.mode = 'online'; // next sitting starts on the default mode again
    state.passSeq = null;
    disarmPassBackTrap();
    state.players = [];
    state.meta = null;
    resetRun(); // this sitting is over; the next room starts a fresh run
    resetRoomFunnel();
    joinSource = 'code'; // a later manual join shouldn't inherit this room's source
    listJoin = false;
    lobbySeen.clear();
    burstFired.clear();
    go('home');
  }

  function stopAllTimers() {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
    stopCardCountdown();
    stopClock();
    stopTurnTicker();
    stopPhaseClock();
    stopIdleWatch();
  }

  // ============================================================
  // THE ONLINE GAME RUNS ITSELF  (#275)
  // ------------------------------------------------------------
  // Strangers wander off, so in an online game every wait has a clock and the
  // room moves on when it runs out. The deadlines are stamps in meta, written
  // by the host where each wait begins: lobbyAt by setMode and fbReplay,
  // voteAt by fbAdvanceTurn, overAt by revealUpdate. Every client counts down
  // to them on the ticker below, and only the host acts on them.
  //
  // That is the catch, and it cannot be fixed without a server (#277): the
  // host's tab is what runs the room. A host who never clicks anything is
  // fine, the room still moves. A host whose tab is gone runs nothing, so the
  // players give them CLOCKS.hostGrace and then leave on their own.
  //
  // Online means the clue mode, which is the online game (#262). A private
  // room has no stamps, and nothing here touches it. Kept apart from
  // stopAllTimers on purpose: that runs on every trip back to the lobby, and
  // this clock has to keep running through the lobby.
  // ============================================================
  const CLOSE_KEYS = {
    hostQuit: 'closed.host-left',
    hostGone: 'closed.host-left',
    notEnough: 'closed.not-enough',
    nobodyPlayed: 'closed.nobody-played',
  };
  // Longer than a toast usually stays: it lands on the home screen of
  // somebody who did not choose to be there, and they need to read why.
  const CLOSE_TOAST_MS = 4500;

  let onlineTimer = null;
  // '<action>:<deadline>' already acted on, so the 250ms ticker does each
  // thing once per clock rather than once a tick until the echo lands.
  let clockGuard = '';
  // When this client first saw the host's row missing.
  let hostGoneAt = 0;
  // The host is closing the room with a reason of its own, so leaveRoom must
  // not write hostQuit over it on the way out.
  let closingRoom = false;

  function isOnlineRoom() {
    return !state.local && !!state.roomCode && !!state.meta && roomMode() === 'clue';
  }

  function startOnlineClock() {
    stopOnlineClock();
    onlineTimer = setInterval(onlineTick, 250);
  }

  function stopOnlineClock() {
    if (onlineTimer) { clearInterval(onlineTimer); onlineTimer = null; }
    clockGuard = '';
    hostGoneAt = 0;
  }

  function onlineTick() {
    if (!isOnlineRoom()) { hostGoneAt = 0; return; }
    const m = state.meta;
    const now = nowSync();
    renderPhaseClock(now);
    if (!state.isHost) { watchHost(now); return; }

    const action = clockAction({
      phase: m.phase, now,
      lobbyAt: m.lobbyAt, voteAt: m.voteAt, overAt: m.overAt,
      players: state.players.length, minPlayers: MIN_PLAYERS,
      emptyRound: !!m.emptyRound,
    });
    if (!action) return;
    const deadline = m.phase === 'lobby' ? m.lobbyAt : m.phase === 'vote' ? m.voteAt : m.overAt;
    const key = `${action}:${deadline}`;
    if (clockGuard === key) return;
    clockGuard = key;
    if (action === 'start') autoStart();
    else if (action === 'closeVote') fbCloseVote();
    else if (action === 'replay') fbReplay().catch(() => { clockGuard = ''; });
    else closeRoom(action);
  }

  // The same Start the host could have pressed. A sheet left open over the
  // lobby is closed first, or it would sit on top of the dealt card.
  async function autoStart() {
    closeCategoryModal();
    closeModeModal();
    const started = await fbStartGame();
    // A failed deal gets another go a few seconds later rather than on every
    // tick, or a lost connection would stack a toast four times a second.
    if (!started) setTimeout(() => { clockGuard = ''; }, 5000);
  }

  // The host ends the room with a reason the players are told. meta/closed
  // goes first and the delete second, so the reason reaches them ahead of
  // the room disappearing.
  async function closeRoom(reason) {
    if (closingRoom || !db || !state.isHost || !state.roomCode) return;
    closingRoom = true;
    trackRoomClosed(reason);
    try {
      await update(ref(db, `rooms-word/${state.roomCode}/meta`), { closed: reason });
    } catch (e) { /* the delete still closes it, with the plain toast */ }
    showToast(t(CLOSE_KEYS[reason]), CLOSE_TOAST_MS);
    await leaveRoom();
    closingRoom = false;
  }

  // A player's side of a host who has gone. The host's row goes the moment
  // their socket drops (onDisconnect) and comes back when it reconnects, so a
  // row missing for longer than the grace is a host who is not coming back.
  // A tab the browser has paused keeps its row, though, so a room that has
  // sat on a run-out clock for the grace counts as the same thing (#284).
  function watchHost(now) {
    // The roster has to have arrived first, or a room still loading would
    // read as a room with no host in it.
    if (!roomData.players) return;
    const m = state.meta;
    if (hostOverdue({
      phase: m.phase, now,
      lobbyAt: m.lobbyAt, startAt: m.startAt, turnAt: m.turnAt, voteAt: m.voteAt, revealAt: m.revealAt, overAt: m.overAt,
      turnGrace: TURN_GRACE_MS, grace: CLOCKS.hostGrace,
    })) { hostLeft(); return; }
    if (roomData.players[m.hostId]) { hostGoneAt = 0; return; }
    if (!hostGoneAt) { hostGoneAt = now; return; }
    if (now - hostGoneAt < CLOCKS.hostGrace) return;
    hostLeft();
  }

  function hostLeft() {
    // Counted by one player, the one who joined first, or a room of five
    // would be counted four times.
    const first = state.players.find(p => !p.isHost);
    if (first && first.isMe) trackRoomClosed('hostGone');
    showToast(t('closed.host-left'), CLOSE_TOAST_MS);
    leaveRoom();
  }

  // The clock on whichever screen is showing.
  function renderPhaseClock(now) {
    const m = state.meta;
    if (state.screen === 'lobby') renderLobbyClock(now);
    else if (state.screen === 'vote') renderVoteClock(now);
    else if (state.screen === 'over') {
      setClock('over-clock', m.overAt, now, m.emptyRound ? 'clock.closes-in' : 'clock.next-round-in');
    }
  }

  // The host's clock sits over Start Game in the sticky bar. A player has no
  // button there, so theirs sits in the page, between the settings and the
  // roster, and scrolls with it.
  function renderLobbyClock(now) {
    const enough = state.players.length >= MIN_PLAYERS;
    const [mine, other] = state.isHost
      ? ['lobby-clock', 'lobby-clock-player']
      : ['lobby-clock-player', 'lobby-clock'];
    hideClock(other);
    setClock(mine, state.meta && state.meta.lobbyAt, now,
      enough ? 'clock.starts-in' : 'clock.waiting-in');
  }

  function renderVoteClock(now) {
    setClock('vote-clock', state.meta && state.meta.voteAt, now, 'clock.vote-ends-in');
  }

  // The sentence around the time comes from the copy, so each language puts
  // the time where it belongs; the time is its own element so it can sit in
  // a pill. Rewritten only when the text changes, so four ticks a second
  // touch the page once a second.
  const CLOCK_SLOT = '\u0001';
  function setClock(id, at, now, key) {
    const el = $(id);
    if (!el) return;
    if (typeof at !== 'number') { hideClock(id); return; }
    const left = at - now;
    const text = phaseClockText(left);
    const sig = `${key}|${text}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    const [before, after = ''] = t(key, { time: CLOCK_SLOT }).split(CLOCK_SLOT);
    const time = document.createElement('span');
    time.className = 'phase-clock-time';
    time.textContent = text;
    el.replaceChildren(...[before.trim(), time, after.trim()].filter(Boolean));
    el.classList.toggle('urgent', left <= 10000);
    el.hidden = false;
  }

  function hideClock(id) {
    const el = $(id);
    if (!el) return;
    el.hidden = true;
    delete el.dataset.sig;
  }

  // ============================================================
  // PASS THE PHONE — a room that never leaves this tab
  // ============================================================
  // One phone goes round the group instead of everyone opening a link. There
  // is no room, no network and no second device, so none of the Firebase
  // machinery above runs: no listener, no presence, no idle watchdog.
  //
  // The trick that keeps this cheap is building `state.players` and
  // `state.meta` in exactly the shape attachRoomListener() produces. Every
  // screen downstream reads those two and nothing else, so the card, the
  // impostor banner, the category modal and the reveal all work unchanged.
  // localCard() in particular reads meta.imposterIds[id], which is why
  // passing the phone is literally "you are player N now".
  //
  // `state.roomCode` deliberately stays null for the whole mode. Every
  // Firebase call site in this file already guards on it, so a guard missed
  // here degrades into doing nothing rather than writing to rooms-word/null.

  // Distinct animals for a list of names, in order. pickAvatar takes the
  // players-so-far in its room shape, so building the roster incrementally
  // reuses the same collision avoidance the online game gets at join time.
  function rosterFromNames(names) {
    const soFar = {};
    return names.map((name, i) => {
      const av = pickAvatar(soFar);
      soFar[i] = { av };
      return { name, av };
    });
  }

  // Player 2..N+1, filling the rows under whoever typed a name on the way in.
  function defaultNames(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(t('player.numbered', { n: i + 2 }));
    return out;
  }

  // The roster survives between sittings, so a group that plays regularly
  // doesn't retype eight names every time. Every row is kept, row one
  // included: there is no host here, just a list of players.
  const ROSTER_KEY = 'imp_roster_' + GAME;

  function loadRoster() {
    try {
      const raw = JSON.parse(localStorage.getItem(ROSTER_KEY));
      if (!Array.isArray(raw)) return null;
      const names = raw.filter(n => typeof n === 'string' && n.trim()).slice(0, MAX_PLAYERS);
      return names.length >= MIN_PLAYERS ? names : null;
    } catch (e) { return null; }
  }

  function saveRoster() {
    try {
      localStorage.setItem(ROSTER_KEY, JSON.stringify(state.players.map(p => p.name)));
    } catch (e) {}
  }

  // Row ids must never be reused: a removed row's id lingering in lobbySeen
  // or burstFired would make a later row inherit its animation state.
  let localIdSeq = 0;

  function buildLocalRoom(roster) {
    state.players = roster.map((r, i) => ({
      id: 'local_' + (localIdSeq++),
      name: r.name,
      ready: true,          // nobody readies up on a shared phone
      joinedAt: i,          // keeps the roster in the order it was entered
      av: r.av,
      // Nobody is special on a shared phone. One person sets the game up,
      // but during the round they are just another name on the list, so no
      // row carries a Host tag, a YOU pill or a "(YOU)" at the reveal. The
      // device still drives the round; that lives on state.isHost.
      isHost: false,
      isImposter: false,    // filled in by the deal
      isMe: false,
      isBot: false,
    }));
    state.meta = {
      phase: 'lobby',
      categories: (state.meta && state.meta.categories) || [DEFAULT_CATEGORY],
      category: (state.meta && state.meta.category) || DEFAULT_CATEGORY,
      numImposters: state.numImposters,
      imposterIds: null,
      secretWord: null,
      imposterHint: null,
      played: (state.meta && state.meta.played) || {},
    };
  }

  // The room-level played ledger, which is the one thing dealRound leaves to
  // the caller. Same rule as the online branch in fbStartGame: an exhausted
  // union wipes every selected bucket and re-seeds with just this word.
  function applyLocalPlayed(deal) {
    const played = state.meta.played || (state.meta.played = {});
    const catKey = sanitizeKey(deal.cat);
    const wKey = sanitizeKey(deal.entry.w);
    if (deal.reset) {
      deal.cats.forEach(c => { delete played[sanitizeKey(c)]; });
      played[catKey] = { [wKey]: true };
    } else {
      (played[catKey] || (played[catKey] = {}))[wKey] = true;
    }
  }

  // Deal a local round. No countdown: the 3-2-1 exists to line up separate
  // devices, and there is nothing here to line up.
  function startLocalRound() {
    const deal = dealRound();
    state.meta.imposterIds = deal.imposterIds;
    state.meta.secretWord = deal.entry.w;
    state.meta.imposterHint = deal.hint;
    state.meta.phase = 'playing';
    state.players.forEach(p => { p.isImposter = !!deal.imposterIds[p.id]; });
    applyLocalPlayed(deal);
    return deal;
  }

  // Set up a sitting. Called when the host switches the lobby to Pass the
  // Phone, after the room it arrived in has been torn down.
  function enterLocalMode(hostName) {
    state.local = true;
    state.roomCode = null;
    state.isHost = true;      // this device drives the round
    state.numImposters = 1;
    state.rounds = DEFAULT_ROUNDS;
    state.meta = null;        // a fresh sitting, not a continuation
    state.editingId = null;
    // A returning group gets their whole roster back, but row one always
    // takes the nickname just typed on the Create screen. It is the freshest
    // thing the person setting up has told us, so seeing anything else there
    // would read as the app ignoring them.
    const saved = loadRoster();
    const names = saved ? saved.slice() : [''].concat(defaultNames(MIN_PLAYERS - 1));
    names[0] = hostName || 'Host';
    buildLocalRoom(rosterFromNames(names.slice(0, MAX_PLAYERS)));
    state.myId = state.players[0].id;
  }

  function clearLocalMode() {
    state.local = false;
    state.players = [];
    state.meta = null;
    state.myId = null;
    state.myUid = null;
    state.isHost = false;
    state.editingId = null;
    state.passSeq = null;
    disarmPassBackTrap();
  }

  // Row controls. Same 2px round-cap stroke as the rest of the app's icons.
  const PENCIL_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 6.5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const TRASH_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 7V5.5A1.5 1.5 0 0111.5 4h1A1.5 1.5 0 0114 5.5V7M6.5 7l.8 12.1A1.5 1.5 0 008.8 20.5h6.4a1.5 1.5 0 001.5-1.4L17.5 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PLUS_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  // ---- Roster editing ----
  // Everything here mutates state.players and re-renders. There is no room and
  // no listener, so the lobby only redraws when we ask it to.

  // A fresh row takes the lowest unused "Player N" rather than one based on
  // the count, or deleting Player 2 from three rows and adding one back would
  // mint a second Player 3.
  function nextPlayerName() {
    const used = new Set(state.players.map(p => p.name));
    for (let i = 2; i <= MAX_PLAYERS + 1; i++) {
      const candidate = t('player.numbered', { n: i });
      if (!used.has(candidate)) return candidate;
    }
    return t('player.generic');
  }

  function addLocalPlayer() {
    commitOpenEdit();
    if (state.players.length >= MAX_PLAYERS) return;
    const soFar = {};
    state.players.forEach((p, i) => { soFar[i] = { av: p.av }; });
    state.players.push({
      id: 'local_' + (localIdSeq++),
      name: nextPlayerName(),
      ready: true,
      // Past the end, not at the count: deleting a row from the middle would
      // otherwise let the next one added tie with an existing row, and the
      // lobby sorts on this.
      joinedAt: Math.max(-1, ...state.players.map(p => p.joinedAt)) + 1,
      av: pickAvatar(soFar),
      isHost: false,
      isImposter: false,
      isMe: false,
      isBot: false,
    });
    saveRoster();
    renderLobby();
  }

  function removeLocalPlayer(id) {
    commitOpenEdit();
    const p = state.players.find(x => x.id === id);
    if (!p || state.players.length <= MIN_PLAYERS) return;
    state.players = state.players.filter(x => x.id !== id);
    // Any row can go, row one included, so this device's default identity can
    // be the one that just left. Repoint it: the pass sequence overwrites
    // state.myId per player anyway, but nothing should read a dead id first.
    if (state.myId === id) state.myId = state.players[0].id;
    saveRoster();
    renderLobby();
  }

  function startEditing(id) {
    commitOpenEdit();
    state.editingId = id;
    renderLobby();
  }

  // Roster controls, recognised as taps rather than presses.
  //
  // These used to fire on pointerdown, which on a touch screen is the instant
  // a finger lands: starting a scroll with a fingertip over the pencil opened
  // a rename before the page had moved. A tap now needs the finger to go down
  // and come up on the same control without wandering, and the browser's
  // pointercancel (fired the moment it claims the gesture for panning) drops
  // it outright.
  //
  // Delegated to the list, which survives the re-renders these actions cause.
  // Bound per row, a commit-driven rebuild could replace the button between
  // the finger going down and coming up, and the action would be lost with it.
  const TAP_SLOP = 10;   // px of drift still counted as a tap, not a drag
  let rosterTap = null;

  (function wireRosterTaps() {
    const list = $('players-list');
    const control = (e) => {
      const el = e.target.closest && e.target.closest('.roster-edit, .roster-del, .add-player-row');
      return el && !el.disabled ? el : null;
    };

    list.addEventListener('pointerdown', (e) => {
      const el = control(e);
      if (!el) { rosterTap = null; return; }
      // Keeps focus where it is, so an open field does not blur and rebuild
      // the list out from under this gesture. Scrolling is governed by
      // touch-action, so this does not block a pan.
      e.preventDefault();
      rosterTap = { el, id: e.pointerId, x: e.clientX, y: e.clientY };
    });

    list.addEventListener('pointermove', (e) => {
      if (!rosterTap || e.pointerId !== rosterTap.id) return;
      if (Math.abs(e.clientX - rosterTap.x) > TAP_SLOP ||
          Math.abs(e.clientY - rosterTap.y) > TAP_SLOP) rosterTap = null;
    });

    list.addEventListener('pointerup', (e) => {
      const tap = rosterTap;
      rosterTap = null;
      if (!tap || e.pointerId !== tap.id || control(e) !== tap.el) return;
      if (tap.el.classList.contains('add-player-row')) { addLocalPlayer(); return; }
      const row = tap.el.closest('.player-row');
      const id = row && row.dataset.pid;
      if (!id) return;
      if (tap.el.classList.contains('roster-edit')) startEditing(id);
      else if (state.local) removeLocalPlayer(id);
      else {
        // The same trash, on a real lobby: the host removing a player (#268).
        // It asks first, because unlike a typed-in roster name this person
        // cannot be put back.
        const p = state.players.find(x => x.id === id);
        if (p) confirmRemovePlayer(p);
      }
    });

    list.addEventListener('pointercancel', () => { rosterTap = null; });
  })();

  // Read whatever is in the open field and keep it. Called before any other
  // roster action, because those use pointerdown to beat the field's blur and
  // would otherwise discard a half-typed name.
  function commitOpenEdit() {
    if (!state.editingId) return;
    const input = $('players-list').querySelector('.roster-input');
    const id = state.editingId;
    state.editingId = null;
    if (input) applyRosterName(id, input.value);
  }

  function applyRosterName(id, value) {
    const p = state.players.find(x => x.id === id);
    if (!p) return;
    const clean = String(value == null ? '' : value).trim().slice(0, 14);
    // An empty field falls back to a default rather than rendering a nameless
    // player. Naming it after the row's position would collide with whatever
    // already sits at that number, and two identical names make the reveal
    // ambiguous, so take the lowest unused one instead.
    if (clean) {
      p.name = clean;
    } else {
      p.name = '';                  // freed first, or it blocks its own reuse
      p.name = nextPlayerName();
    }
    saveRoster();
  }

  // ============================================================
  // HOME SCREEN
  // ============================================================

  // Hero character. It juggles for 4.2s, holds all three cards for 7.8s, and
  // repeats. Tapping it restarts the run. The choreography and the .wj-run /
  // .wj-once gates live in word.css; this only decides which gate is on and
  // when to rewind.
  const heroJuggler = $('hero-juggler');
  const calmMotion = window.matchMedia
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  const wantsCalm = () => !!(calmMotion && calmMotion.matches);

  function restartHeroJuggle() {
    if (!heroJuggler) return;
    heroJuggler.classList.remove('wj-run', 'wj-once');
    // Force the style flush between removing the class and adding it back.
    // Without it the two changes coalesce into one recalc, the animations are
    // never torn down, and the tap does nothing. The usual `void
    // el.offsetWidth` trick does NOT work here: offsetWidth is an HTMLElement
    // property and reads undefined on an SVGElement, so no layout is forced
    // and it fails silently, with nothing in the console.
    heroJuggler.getBoundingClientRect();
    heroJuggler.classList.add(wantsCalm() ? 'wj-once' : 'wj-run');
  }

  function armHeroJuggle() {
    if (!heroJuggler) return;
    heroJuggler.classList.remove('wj-run', 'wj-once');
    // Reduced motion means nothing moves on its own. A tap is different: that
    // is the visitor asking for it, so restartHeroJuggle still runs, just once
    // instead of forever. The resting pose is a plain transform rather than an
    // animation, so with both gates off the character still holds its cards.
    if (!wantsCalm()) heroJuggler.classList.add('wj-run');
  }

  if (heroJuggler) {
    heroJuggler.addEventListener('pointerdown', restartHeroJuggle);
    if (calmMotion && calmMotion.addEventListener) {
      calmMotion.addEventListener('change', armHeroJuggle);
    }
    armHeroJuggle();
  }

  $('howto-scroll').addEventListener('click', () => {
    const target = $('how-to-play');
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('btn-create').addEventListener('click', () => {
    if (!FB_CONFIGURED) { go('needs-setup'); return; }
    state.numImposters = 1;
    state.rounds = DEFAULT_ROUNDS;
    $('host-name').value = state.myName || '';
    setCreateOnline(false);
    go('setup');
  });

  // Private or Online, picked on the create screen (#262). Private every time
  // the screen opens, so a host who never looks gets the game they always
  // got. It becomes the room's mode when the room is made: Online is the clue
  // board, Private the room game, whose lobby still offers Pass the Phone.
  let createOnline = false;
  const visibilityButtons = Array.from(document.querySelectorAll('#setup-visibility [data-visibility]'));

  function setCreateOnline(on) {
    createOnline = !!on;
    visibilityButtons.forEach(b => {
      const picked = (b.dataset.visibility === 'online') === createOnline;
      b.setAttribute('aria-checked', String(picked));
      b.tabIndex = picked ? 0 : -1;
    });
    $('setup-beta').hidden = !createOnline;
    $('setup-visibility-hint').textContent = t(createOnline ? 'setup.online-hint' : 'setup.private-hint');
  }

  visibilityButtons.forEach(b => {
    b.addEventListener('click', () => setCreateOnline(b.dataset.visibility === 'online'));
    // A radio group moves with the arrow keys, and there are only two.
    b.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) === -1) return;
      e.preventDefault();
      setCreateOnline(!createOnline);
      visibilityButtons.find(x => x.getAttribute('aria-checked') === 'true').focus();
    });
  });

  const codeBoxes = Array.from(document.querySelectorAll('.code-box'));

  function clearCodeBoxes() {
    codeBoxes.forEach(b => { b.value = ''; b.disabled = false; });
    codeBoxes[0].focus();
  }

  function readCode() {
    return codeBoxes.map(b => b.value).join('').toUpperCase();
  }

  async function attemptCodeValidation(code, fromList) {
    if (!db) return;
    listJoin = !!fromList;
    codeBoxes.forEach(b => b.disabled = true);
    try {
      const room = await getRoomPublic(code);
      if (!room.meta) {
        // Not our code. The player may just be standing on the wrong
        // game's page, so check the other games before giving up. Leave
        // the boxes disabled on a hit: we are navigating away.
        const hit = await findRoomInOtherGames(code, GAME);
        if (hit) {
          showToast(t('join.other-game', { game: hit.label }));
          setTimeout(() => goToGame(hit, code, GAME), 1000);
          return;
        }
        // Counted here rather than only in joinRoom: this check is the real
        // gate, and it returns before joinRoom is ever reached. A cross-game
        // hit above is a successful redirect, not a failed join, so it is
        // deliberately not counted.
        trackJoinFail('notFound');
        showToast(t('error.no-room-with-code'));
        clearCodeBoxes();
        return;
      }
      const meta = room.meta;

      // The room is in another language, and this build has a page for it.
      // Ask before moving them: the cross-game forward above is silent
      // because it CORRECTS their input, while this CHANGES their
      // experience, and somebody who cannot read the other language needs
      // to be able to say no and ask for a room in theirs instead.
      //
      // Nothing has been written yet, so cancelling leaves no trace and
      // confirming carries the code to the other page.
      const move = redirectFor(meta);
      if (move) {
        // A language with no name string is not a bug worth blocking on:
        // the code itself is recognisable enough, and refusing to move the
        // player would be worse than showing them "ES". Same call as an
        // unknown category id in #135.
        const key = `lang.name.${move.lang}`;
        const named = has(key) ? t(key) : move.lang.toUpperCase();
        codeBoxes.forEach(b => b.disabled = false);
        openConfirm({
          title: t('lang.switch-title', { lang: named }),
          body: t('lang.switch-body', { lang: named }),
          go: t('lang.switch-go', { lang: named }),
          onGo: () => { location.href = joinUrl(move.path, code); },
          onCancel: clearCodeBoxes,
        });
        return;
      }

      // A card on the list is only a hint: anyone could have written a
      // private room's code there. The room itself has to say it is online,
      // and a friends game never does (#269).
      if (listJoin && modeOf(meta) !== 'clue') {
        trackJoinFail('notOnline');
        showToast(t('error.not-online'));
        clearCodeBoxes();
        return;
      }
      // An online game in a round goes on to the name step all the same, and
      // the player waits there for its next round (#271). A friends game in a
      // round is still refused.
      if (meta.phase !== 'lobby' && modeOf(meta) !== 'clue') {
        trackJoinFail('inProgress');
        showToast(t('error.in-progress'));
        clearCodeBoxes();
        return;
      }
      // Checked here as well as in joinRoom, like the two either side of it:
      // this screen is the real gate and returns before joinRoom is reached.
      if (!knownMode(modeOf(meta))) {
        trackJoinFail('needsUpdate');
        showToast(t('error.needs-update'));
        clearCodeBoxes();
        return;
      }
      if (Object.keys(room.players || {}).length >= MAX_PLAYERS) {
        trackJoinFail('full');
        showToast(t('error.room-full'));
        clearCodeBoxes();
        return;
      }
      // Told here, before typing a name, rather than after (#268). A session
      // that will not start is left for joinRoom to report.
      if (isBlocked(meta, await session().catch(() => null))) {
        showToast(t('error.removed'));
        clearCodeBoxes();
        return;
      }
      state.pendingJoinCode = code;
      $('join-name').value = state.myName || '';
      go('join-name');
      setTimeout(() => $('join-name').focus(), 60);
    } catch (e) {
      showToast(t('error.check-room', { detail: e.message || '' }));
      clearCodeBoxes();
    }
  }

  codeBoxes.forEach((box, idx) => {
    box.addEventListener('input', () => {
      let v = box.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      box.value = v;
      // preventScroll: on mobile, auto-advancing focus otherwise makes the
      // browser scroll the newly-focused box into view above the keyboard,
      // which jitters the vertically-centered layout on every keystroke.
      if (v && idx < codeBoxes.length - 1) codeBoxes[idx + 1].focus({ preventScroll: true });
      if (codeBoxes.every(b => b.value)) attemptCodeValidation(readCode());
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        e.preventDefault();
        codeBoxes[idx - 1].focus({ preventScroll: true });
        codeBoxes[idx - 1].value = '';
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        codeBoxes[idx - 1].focus({ preventScroll: true });
      } else if (e.key === 'ArrowRight' && idx < codeBoxes.length - 1) {
        codeBoxes[idx + 1].focus({ preventScroll: true });
      }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = ((e.clipboardData || window.clipboardData).getData('text') || '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      codeBoxes.forEach((b, i) => { b.value = text[i] || ''; });
      if (text.length === 4) attemptCodeValidation(text);
      else codeBoxes[Math.min(text.length, codeBoxes.length - 1)].focus({ preventScroll: true });
    });
  });

  $('btn-join-home').addEventListener('click', () => {
    if (!FB_CONFIGURED) { go('needs-setup'); return; }
    clearCodeBoxes();
    state.pendingJoinCode = null;
    go('join-code');
    setTimeout(() => codeBoxes[0].focus(), 60);
  });

  $('btn-join').addEventListener('click', async () => {
    if (!FB_CONFIGURED) { go('needs-setup'); return; }
    const code = state.pendingJoinCode;
    const name = $('join-name').value.trim();
    if (!code) { go('join-code'); return; }
    if (!name) { showToast(t('error.choose-nickname')); return; }
    $('btn-join').disabled = true;
    try {
      state.myName = name;
      await joinRoom(code, name);
      enterLobby();
    } catch (e) {
      if (e.waitFor) startWaiting(code, name, e.waitFor);
      else showToast(e.message || t('error.join'));
    } finally {
      $('btn-join').disabled = false;
    }
  });

  $('btn-wait-cancel').addEventListener('click', () => {
    stopWaiting();
    releaseWakeLock();
    go('home');
  });

  // Mobile keyboards: the Enter/Go key submits the name screens directly,
  // no need to dismiss the keyboard and hunt for the button.
  $('join-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-join').click(); }
  });
  $('host-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-go-lobby').click(); }
  });

  // iOS keyboards overlay the page instead of resizing it, so the
  // bottom-anchored action bars would hide behind the keyboard. Track the
  // visual viewport and lift the bars to sit on top of it. (Android resizes
  // the layout itself via interactive-widget=resizes-content → gap stays 0.)
  if (window.visualViewport) {
    const liftBars = () => {
      const vv = window.visualViewport;
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.querySelectorAll('.sticky-actions').forEach(el => {
        el.style.transform = gap > 0 ? `translateY(-${gap}px)` : '';
      });
    };
    window.visualViewport.addEventListener('resize', liftBars);
    window.visualViewport.addEventListener('scroll', liftBars);
  }

  // ============================================================
  // SETUP SCREEN (host)
  // ============================================================
  // Imposter count thresholds — tied to the number of players in the lobby.
  // Host can pick from 1 up to maxForCount(players); selector unlocks
  // automatically as more players join.
  function currentMaxImposters() {
    const n = state.players.length;
    // Tiers widen as the room grows, so the impostor share stays roughly a
    // third rather than thinning out at the top: 5 of 15 is the same game as
    // 2 of 5, whereas the old cap of 3 made a 20-player room half as dense.
    if (n >= 15) return 5;
    if (n >= 12) return 4;
    if (n >= 8)  return 3;
    if (n >= 5)  return 2;
    return 1;
  }

  // Lobby stepper — host adjusts impostor count from the players card.
  $('lobby-imp-plus').addEventListener('click', () => {
    const max = currentMaxImposters();
    if (state.numImposters >= max) return;
    // No room to round-trip through in Pass the Phone; set it and redraw.
    if (state.local) { state.numImposters++; renderLobby(); return; }
    if (!db || !state.isHost || !state.roomCode) return;
    update(ref(db, `rooms-word/${state.roomCode}/meta`), { numImposters: state.numImposters + 1 }).catch(()=>{});
  });
  $('lobby-imp-minus').addEventListener('click', () => {
    if (state.numImposters <= 1) return;
    if (state.local) { state.numImposters--; renderLobby(); return; }
    if (!db || !state.isHost || !state.roomCode) return;
    update(ref(db, `rooms-word/${state.roomCode}/meta`), { numImposters: state.numImposters - 1 }).catch(()=>{});
  });

  // Lobby stepper — host adjusts how many times the order goes round. Clue
  // mode only, and there is no Pass the Phone branch because clue mode has no
  // shared-phone variant: the board is the point and one phone cannot hold a
  // secret board (#258).
  function fbSetRounds(v) {
    const next = clampRounds(v);
    if (next === state.rounds) return;
    if (!db || !state.isHost || !state.roomCode) return;
    update(ref(db, `rooms-word/${state.roomCode}/meta`), {
      rounds: next, lastActivity: serverTimestamp(),
    }).catch(() => {});
  }
  $('lobby-rounds-plus').addEventListener('click', () => fbSetRounds(state.rounds + 1));
  $('lobby-rounds-minus').addEventListener('click', () => fbSetRounds(state.rounds - 1));

  // ---- Game mode picker (lobby, host only) ----
  // Reaching the lobby always creates a real room, because that is the only
  // path in. Switching to Pass the Phone therefore has to dispose of a room
  // that already exists: the listener comes down FIRST, otherwise deleting it
  // fires the onValue null-handler and sends the host home with a "Room
  // closed" toast. Nothing is left behind in the database, and the code and QR
  // vanish from the header because there is no longer a room to share.
  //
  // Switching back mints a fresh room, so the code changes. That is the
  // honest trade: the old room is genuinely gone.
  //
  // There used to be a switch between two ROOM modes here as well, one meta
  // write that turned a lobby into the clue board. It went with #262: a room
  // is online or not from the moment it is made, so the picker is the private
  // room game and Pass the Phone, and nothing else.
  async function setMode(id) {
    // Only what the picker offers. The clue board is chosen on the create
    // screen, so this can never turn a room online (#262).
    const next = MODES.some(m => m.id === id) ? id : 'online';
    if (next === state.mode) return;

    if (next === 'passphone') {
      const name = state.myName || 'Host';
      await teardownRoom();
      state.mode = next;
      enterLocalMode(name);
      renderLobby();
      return;
    }

    // The picker holds one room mode, so the only other switch is from Pass
    // the Phone back to it.
    if (!state.local) return;

    // Back to the room game: the local sitting is discarded and a new room
    // takes its place, so the host stays on the lobby with a working code.
    const name = state.myName || 'Host';
    clearLocalMode();
    state.mode = next;
    try {
      await createRoom(name, 1);
      attachRoomListener();
      acquireWakeLock();
    } catch (e) {
      showToast(e.plain ? e.message : t('error.create-room', { detail: e.message }));
      state.mode = 'passphone';
      enterLocalMode(name);
    }
    renderLobby();
  }

  // Drop this client out of its room and delete it, without the exit routing
  // leaveRoom() does. Used only by the mode switch, which stays on the lobby.
  async function teardownRoom() {
    stopIdleWatch();
    stopOnlineClock();
    destroyRoomChat();
    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`)).cancel(); } catch (e) {}
      await unlistRoom();
      try { await remove(ref(db, `rooms-word/${state.roomCode}`)); } catch (e) {}
    }
    state.roomCode = null;
    resetRoomFunnel();
    lobbySeen.clear();
    burstFired.clear();
  }

  function renderModeModal() {
    const list = $('mode-modal-list');
    list.innerHTML = '';
    MODES.forEach(mode => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cat-row mode-row' + (mode.id === state.mode ? ' selected' : '');
      row.innerHTML =
        `<div class="mode-row-icon">${mode.icon}</div>` +
        `<div class="mode-row-body">` +
          `<div class="cat-row-title">${escapeHtml(mode.name)}</div>` +
          `<div class="cat-row-desc">${escapeHtml(mode.description)}</div>` +
        `</div>`;
      row.addEventListener('click', () => { closeModeModal(); setMode(mode.id); });
      list.appendChild(row);
    });
  }

  function openModeModal() {
    renderModeModal();
    $('mode-modal-backdrop').classList.add('open');
  }
  function closeModeModal() { $('mode-modal-backdrop').classList.remove('open'); }

  // Host only. A joined player sees the mode but can't change it, same as
  // the dance lobby.
  $('mode-trigger').addEventListener('click', () => { if (state.isHost) openModeModal(); });
  $('mode-modal-close').addEventListener('click', closeModeModal);
  $('mode-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('mode-modal-backdrop').classList.contains('open')) closeModeModal();
  });

  $('btn-go-lobby').addEventListener('click', async () => {
    const name = $('host-name').value.trim() || t('player.host-default');
    $('btn-go-lobby').disabled = true;
    state.mode = createOnline ? 'clue' : 'online';
    try {
      await createRoom(name, 1);
      showHostShare();
    } catch (e) {
      showToast(e.plain ? e.message : t('error.create-room-failed', { detail: e.message }));
    } finally {
      $('btn-go-lobby').disabled = false;
    }
  });

  // Show the share-the-code screen after a room is created, before the lobby.
  function showHostShare() {
    const code = state.roomCode || '----';
    $('share-code').textContent = code;
    renderQRInto($('share-qr'), code);
    go('host-share');
  }

  // Build a QR for a deep link that drops the scanner on the join-name step.
  // Uses the inlined qrcode-generator global; fails quietly to the code-only
  // view if anything goes wrong. Always uses SHARE_BASE (the public website),
  // never location.origin, so QR works when generated from inside the app too.
  function renderQRInto(el, code) {
    el.innerHTML = '';
    el.style.display = '';
    try {
      // s=qr marks this as a scan rather than a tapped link. Without it a
      // QR and a pasted link are the same URL and the joins counter can't
      // tell which sharing method people actually use.
      const url = `${SHARE_BASE}/?join=${encodeURIComponent(code)}&s=qr`;
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      el.style.display = 'none'; // no QR — the code still works
    }
  }

  // Lobby QR popup
  function openLobbyQR() {
    if (!state.roomCode) return;
    $('lobby-qr-code').textContent = state.roomCode;
    renderQRInto($('lobby-qr-card'), state.roomCode);
    $('qr-modal-backdrop').classList.add('open');
  }
  function closeLobbyQR() { $('qr-modal-backdrop').classList.remove('open'); }
  $('lobby-qr-btn').addEventListener('click', openLobbyQR);
  $('qr-modal-close').addEventListener('click', closeLobbyQR);
  $('qr-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLobbyQR();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('qr-modal-backdrop').classList.contains('open')) closeLobbyQR();
  });

  // Lobby How-to-play popup — clones the landing-page section (single source)
  function openHowTo() {
    const lead = document.querySelector('#how-to-play .howto-lead');
    const steps = document.querySelector('#how-to-play .howto-steps');
    const body = $('howto-modal-body');
    if (body.childElementCount === 0) {
      // The illustration states the rule faster than the steps do, so it leads
      // here exactly as it does on the page. Cloning it is safe: the marks over
      // it are positioned against .howto-lead itself, which is its own query
      // container, so they re-scale to the modal without any extra rules.
      // Guarded rather than assumed, because not every game has lead art yet.
      if (lead) body.appendChild(lead.cloneNode(true));
      if (steps) body.appendChild(steps.cloneNode(true));
    }
    $('howto-modal-backdrop').classList.add('open');
  }
  function closeHowTo() { $('howto-modal-backdrop').classList.remove('open'); }
  $('lobby-howto-btn').addEventListener('click', openHowTo);
  $('howto-modal-close').addEventListener('click', closeHowTo);
  $('howto-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeHowTo();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('howto-modal-backdrop').classList.contains('open')) closeHowTo();
  });

  // Copy the current room code to the clipboard (with a graceful fallback).
  async function copyRoomCode() {
    const code = state.roomCode;
    if (!code) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
      }
      showToast(t('toast.code-copied'));
    } catch (e) {
      showToast(t('error.copy'));
    }
  }

  $('share-code').addEventListener('click', copyRoomCode);
  $('share-copy-btn').addEventListener('click', copyRoomCode);
  // Tap-driven, not click-driven: see wireTap. The share screen scrolls, so
  // this button is routinely tapped straight after a drag, and on Android the
  // click for that tap never arrives. press.js still lights the tile up, so
  // the host sees feedback and no screen change. Reported from production.
  wireTap($('btn-share-continue'), () => {
    attachRoomListener(); // now safe — host is leaving the share screen for the lobby
    enterLobby();
  });

  // ============================================================
  // LOBBY
  // ============================================================
  function enterLobby() {
    stopAllTimers();
    disarmPassBackTrap();   // the lobby has its own way out
    closeRoundPopups();
    $('lobby-code-text').textContent = state.roomCode || '----';
    renderLobby();
    go('lobby');
  }

  function renderLobby() {
    // Pass the Phone: one device, so there is no joining, no readying up and
    // nothing to share. Everyone on the roster is a player and the only gate
    // on starting is having enough of them.
    const pass = state.local;
    // The online game: no ready step, and a clock instead (#275).
    const online = !pass && state.mode === 'clue';
    const list = $('players-list');
    // Display order: host pinned on top, then newest join first so a new
    // player is immediately visible. state.players keeps its joinedAt-asc
    // order, and this copy is presentation-only.
    //
    // Pass the Phone keeps entry order instead. The roster is typed in rather
    // than joined into, so Player 2 above Player 3 is what the host expects,
    // and it is the order the phone will travel in.
    const ordered = [...state.players].sort((a, b) =>
      pass ? (a.joinedAt - b.joinedAt) : ((b.isHost - a.isHost) || (b.joinedAt - a.joinedAt)));
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Before wiping the list, snapshot each current row's position keyed by
    // player id. Rows whose player just left become a fading ghost; survivors
    // get FLIP-slid to their new spot after the rebuild, so joins and drops
    // glide instead of snapping the roster.
    const firstRects = new Map();
    if (!reduceMotion) {
      const liveIds = new Set(ordered.map(p => p.id));
      [...list.children].forEach(c => {
        const pid = c.dataset.pid;
        if (!pid) return;
        const rect = c.getBoundingClientRect();
        firstRects.set(pid, rect);
        if (!liveIds.has(pid)) {
          // Player left (or their screen dropped presence). Forget them from
          // lobbySeen so a rejoin replays the pop-in entrance, symmetric with
          // the ghost exit. burstFired is left intact on purpose: a reconnect
          // gets the gentle pop-in but not a fresh confetti salvo.
          spawnLeaveGhost(c, rect);
          lobbySeen.delete(pid);
        }
      });
    }

    const initialPaint = lobbySeen.size === 0;
    list.innerHTML = '';
    ordered.forEach(p => {
      const row = document.createElement('div');
      row.dataset.pid = p.id;
      const isNew = isNewInLobby(p.id);
      // No ready state on a shared phone, so no green row and no status text.
      // Every row is editable instead: tap to rename, trash to remove. No row
      // is exempt, because no row is the host (see buildLocalRoom).
      const editable = pass;
      const editing = editable && state.editingId === p.id;
      // Nor in an online game, where strangers are not asked to confirm they
      // are here: the lobby clock starts the round whatever they press.
      row.className = 'player-row' + (!pass && !online && !p.isHost && p.ready ? ' ready' : '')
        + (isNew ? ' just-joined' : '') + (editing ? ' editing' : '');
      const status = (pass || online || p.isHost) ? '' : (p.ready ? t('lobby.ready') : t('lobby.waiting'));
      // The host's one moderation tool (#268), and the same trash Pass the
      // Phone uses. Never on the host's own row, and never on a row from the
      // host's own browser: blocking that uid would block the host too.
      const removable = !pass && state.isHost && !p.isHost && !!p.uid && p.uid !== state.myUid;
      const nameCell = editing
        ? `<input class="roster-input" type="text" maxlength="14" value="${escapeHtml(p.name)}"
                  autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="${t('a11y.player-name')}">`
        : `<div class="player-name">
             ${escapeHtml(p.name)}
             ${p.isHost ? `<span class="player-tag tag-host">${escapeHtml(t('lobby.host-tag'))}</span>` : ''}
             ${p.isMe ? `<span class="you-pill">${escapeHtml(t('lobby.you-pill'))}</span>` : ''}
           </div>`;
      const trailing = editable
        ? `<div class="roster-actions">
             ${editing ? '' : `<button type="button" class="roster-btn roster-edit" aria-label="${escapeHtml(t('a11y.rename', { name: p.name }))}">${PENCIL_SVG}</button>`}
             <button type="button" class="roster-btn roster-del" aria-label="${escapeHtml(t('a11y.remove', { name: p.name }))}">${TRASH_SVG}</button>
           </div>`
        : `<div class="player-status">${status}</div>` + (removable
          ? `<div class="roster-actions">
               <button type="button" class="roster-btn roster-del" aria-label="${escapeHtml(t('a11y.remove', { name: p.name }))}">${TRASH_SVG}</button>
             </div>`
          : '');
      row.innerHTML = avatarHtml(p) + nameCell + trailing;

      if (editable) {
        const input = row.querySelector('.roster-input');
        if (input) {
          // Enter commits directly rather than via input.blur(). Whether blur
          // fires at all depends on the document having focus, so routing the
          // commit through it left names uncommitted in some contexts.
          const commit = () => {
            if (state.editingId !== p.id) return; // an action already took it
            state.editingId = null;
            applyRosterName(p.id, input.value);
            renderLobby();
          };
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); state.editingId = null; renderLobby(); }
          });
          input.addEventListener('blur', commit);
        }
        // The pencil is the only way into a rename. Tapping the row itself
        // used to do it, which meant a finger landing anywhere on the list to
        // scroll could open a field.
        const del = row.querySelector('.roster-del');
        if (del) del.disabled = state.players.length <= MIN_PLAYERS;
      }
      if (isNew) {
        // Rapid RTDB snapshots rebuild this row mid-animation; a negative
        // delay resumes the animation where it left off instead of
        // restarting it from opacity 0 (which reads as a blink).
        const elapsed = Date.now() - lobbySeen.get(p.id);
        row.style.animationDelay = `-${elapsed}ms`;
        const avEl = row.querySelector('.player-avatar');
        if (avEl) avEl.style.animationDelay = `-${elapsed}ms`;
      }
      list.appendChild(row);
      if (initialPaint) {
        burstFired.add(p.id);
      } else if (isNew && !burstFired.has(p.id) && !pass) {
        // Not in Pass the Phone: these rows are typed in, not people arriving,
        // and a confetti burst per keystroke-added row reads as noise.
        burstFired.add(p.id);
        // Fire synchronously — rAF can be throttled (backgrounded tab) until
        // after the next rebuild replaces this row, losing the burst.
        confettiBurst(row);
      }
    });

    if (pass) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'add-player-row';
      add.innerHTML = `${PLUS_SVG}<span>${escapeHtml(t('lobby.add-player'))}</span>`;
      add.disabled = state.players.length >= MAX_PLAYERS;
      list.appendChild(add);
    }

    if (!reduceMotion) flipRows(list, firstRects);

    const me = state.players.find(p => p.isMe);
    // `me` comes from the room snapshot, and the host reaches the lobby before
    // the first one lands: enterLobby() renders synchronously right after
    // attachRoomListener(), so state.players is still empty for that paint.
    // Deriving isHost from it alone rendered the host a player for ~100ms on
    // localhost and far longer on mobile data, flashing "I'm Ready" and
    // "← Leave Room" before they swapped to "Start Game" and "← Quit Game".
    // state.isHost is set synchronously in createRoom/joinRoom, so it carries
    // the first paint; the snapshot stays authoritative from then on.
    const isHost = pass ? true : (me ? me.isHost : state.isHost);
    const nonHosts = state.players.filter(p => !p.isHost);
    const readyCount = nonHosts.filter(p => p.ready).length;
    const total = state.players.length;
    const allReady = (pass || online)
      ? total >= MIN_PLAYERS
      : (total >= MIN_PLAYERS && nonHosts.length > 0 && nonHosts.every(p => p.ready));

    const mode = MODES.find(m => m.id === state.mode) || MODES[0];
    $('mode-trigger-text').textContent = mode.name;
    $('mode-trigger-icon').innerHTML = mode.icon;
    $('mode-trigger').classList.toggle('readonly', !isHost);
    // An online room has no mode to choose: it is the clue board, picked on
    // the create screen (#262). The field leaves, and its divider with it.
    $('lobby-mode-section').style.display = online ? 'none' : '';
    $('lobby-mode-divider').style.display = online ? 'none' : '';
    // Rendered here rather than only on entering the lobby, because switching
    // back from Pass the Phone mints a NEW room without re-entering. Leaving
    // it to enterLobby left the header advertising a code that had just been
    // deleted, so sharing it silently failed with "Room not found".
    $('lobby-code-text').textContent = state.roomCode || '----';
    $('lobby-code-row').style.display = pass ? 'none' : '';
    $('lobby-code-row').parentElement.classList.toggle('solo', pass);
    $('lobby-ready-line').style.display = (pass || online) ? 'none' : '';
    $('lobby-count-line').style.display = pass ? '' : 'none';
    if (pass) $('local-player-count').textContent = total;
    $('lobby-online-line').style.display = online ? '' : 'none';
    if (online) $('lobby-online-line').textContent = plural('lobby.player-count', total);
    // The room's ticker keeps the clock moving. This paints it the moment the
    // lobby opens, and takes it away from a room switched back to private.
    if (online) {
      renderLobbyClock(nowSync());
    } else {
      hideClock('lobby-clock');
      hideClock('lobby-clock-player');
    }

    // Room funnel high-water marks. Host side only, because every player
    // renders this same lobby and counting them all would multiply each
    // stage by the group size. This runs on every snapshot; trackRoomStage
    // dedupes, so each stage lands at most once per room.
    // Not in Pass the Phone: there is no room and nobody joins, so the funnel
    // stages have nothing to measure. #68 gives that mode its own counter.
    if (isHost && !pass) {
      if (total >= 2) trackRoomStage('joined2');
      if (total >= MIN_PLAYERS) trackRoomStage('reachedMin');
      if (allReady) trackRoomStage('allReady');
    }

    $('ready-count').textContent = readyCount;
    $('player-count').textContent = nonHosts.length;

    // Rounds stepper. The whole row leaves outside clue mode rather than
    // greying out: in the other two games it is not a setting that is
    // unavailable, it is a setting that does not exist.
    const clue = state.mode === 'clue';
    $('rounds-section').style.display = clue ? '' : 'none';
    $('rounds-divider').style.display = clue ? '' : 'none';
    $('rounds-count-num').textContent = state.rounds;
    $('rounds-count-label').textContent = plural('lobby.rounds-noun', state.rounds);
    $('lobby-rounds-minus').style.display = isHost ? '' : 'none';
    $('lobby-rounds-plus').style.display = isHost ? '' : 'none';
    $('lobby-rounds-minus').disabled = state.rounds <= MIN_ROUNDS;
    $('lobby-rounds-plus').disabled = state.rounds >= MAX_ROUNDS;
    $('rounds-pill').setAttribute('aria-label', plural('a11y.rounds', state.rounds));

    // Imposter count stepper — controls show for host only, only when the
    // current player count unlocks a higher max (5+ → 2, 8+ → 3, 12+ → 4,
    // 15+ → 5).
    const max = currentMaxImposters();
    // Pass the Phone has no room to clamp through, so correct it in place
    // when removing a player drops the cap.
    if (pass && state.numImposters > max) state.numImposters = max;
    if (isHost && state.numImposters > max && db && state.roomCode) {
      // Auto-clamp via Firebase when a player leaves and drops the cap;
      // the next snapshot will re-render with the corrected value.
      update(ref(db, `rooms-word/${state.roomCode}/meta`), { numImposters: max }).catch(()=>{});
    }
    const shown = Math.min(state.numImposters, max);
    $('imposter-count-num').textContent = shown;
    $('imposter-count-label').textContent = plural('impostor.noun', shown);
    const showSteppers = isHost && max > 1;
    $('lobby-imp-minus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-plus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-minus').disabled = shown <= 1;
    $('lobby-imp-plus').disabled = shown >= max;

    // Back button: host dissolves the room, players only remove themselves
    $('lobby-back-btn').textContent = isHost ? t('lobby.quit-game') : t('lobby.leave-room');

    // Ready button: hidden for the host, and for everyone on a shared phone.
    // Hide the nudge wrapper, not the button, or its slot still eats a gap.
    $('ready-nudge').style.display = (pass || online || isHost) ? 'none' : '';

    // Start button: host only, all non-hosts ready, >= MIN_PLAYERS total
    $('btn-start').disabled = !(isHost && allReady);

    if (!isHost) {
      $('btn-start').style.display = 'none';
      if (online) {
        // Nothing to say: the clock above the roster already tells a player
        // it is waiting for people or when the game starts, and there is
        // nothing for them to press (#285).
        setLobbyStatus('');
      } else if (total < MIN_PLAYERS) {
        setLobbyStatus(plural('lobby.need-players', MIN_PLAYERS - total));
      } else if (!allReady) {
        setLobbyStatus(t('lobby.waiting-ready-up'));
      } else {
        setLobbyStatus(t('lobby.waiting-host-start'));
      }
    } else {
      $('btn-start').style.display = '';
      if (pass) {
        setLobbyStatus(total < MIN_PLAYERS
          ? plural('lobby.add-players', MIN_PLAYERS - total)
          : t('lobby.pass-hit-start'));
      } else if (online && total < MIN_PLAYERS) {
        // The clock over Start Game says it is waiting; this says what
        // happens if nobody comes (#285).
        setLobbyStatus(t('lobby.online-closes-if-few', { count: MIN_PLAYERS }));
      } else if (total < MIN_PLAYERS) {
        setLobbyStatus(plural('lobby.need-players-share', MIN_PLAYERS - total));
      } else if (online) {
        setLobbyStatus(t('lobby.online-host-ready'));
      } else if (!allReady) {
        const remaining = nonHosts.length - readyCount;
        setLobbyStatus(plural('lobby.waiting-n-ready', remaining));
      } else {
        setLobbyStatus(t('lobby.all-ready'));
      }
    }
    // Wake lock covers most phones; where it can't, rotate in the screen-on tip.
    updateLobbyHint();

    // The list was just rebuilt, so the field is a new element. Focus and
    // select it here rather than at every call site that opens an edit.
    if (state.editingId) {
      const input = list.querySelector('.roster-input');
      if (input) { input.focus(); input.select(); }
    }

    if (me && !isHost) {
      $('btn-ready').textContent = me.ready ? t('lobby.im-not-ready') : t('lobby.im-ready');
      $('btn-ready').classList.toggle('btn-secondary', me.ready);
      $('btn-ready').classList.toggle('btn-primary', !me.ready);
    }

    // Nudge the button only while it is both visible and unready. toggle()
    // with an explicit flag is a no-op when the state has not changed, so
    // the animation is not restarted by every room update.
    $('ready-nudge').classList.toggle('is-nudging', !!(me && !isHost && !pass && !online && !me.ready));

    // Category and mode are one row each, and both read the same either way.
    // For a player the row simply stops being a control: the chevron goes and
    // the tap does nothing, which is what .readonly carries. It used to swap
    // the whole trigger out for a static copy of the same text.
    $('category-trigger-text').textContent = categoriesSummary(activeCategories());
    $('category-trigger').classList.toggle('readonly', !isHost);
    // If the modal is currently open, re-render so the selected row reflects
    // changes that came in via Firebase (e.g. another tab/admin pick).
    if ($('cat-modal-backdrop').classList.contains('open')) renderCategoryModal();

    // The host can switch the mode with the lobby already up, so whether the
    // chat pill belongs on this screen is not settled by go() alone.
    syncChatLauncher();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Category picker modal — host only. Two modes, like iPhone Photos:
  //  - Default: tapping a row picks that single category and closes (the
  //    original production behaviour). No tick rings, no Done bar.
  //  - Select: tapping the "Select" pill turns each row into a checkbox so
  //    several categories can be chosen at once; "Done" commits, and the pill
  //    (now "Cancel") drops back to default without applying. A room that
  //    already has more than one category open jumps straight into this mode.
  // In Select mode the in-progress choice lives in `modalSelection`; at least
  // one must stay selected, so tapping the last one off is ignored. Closing
  // via X / backdrop / Escape always discards and leaves the committed set.
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let modalSelection = new Set();
  let catMultiMode = false;


  function renderCategoryModal() {
    const list = $('cat-modal-list');
    list.innerHTML = '';
    const committed = activeCategories();
    CATEGORY_GROUPS.forEach(group => {
      const lbl = document.createElement('div');
      lbl.className = 'cat-group-label';
      lbl.textContent = t(group.labelKey);
      list.appendChild(lbl);
      group.ids.forEach(id => {
        const on = catMultiMode ? modalSelection.has(id) : committed.includes(id);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'cat-row' + (on ? ' selected' : '');
        // The id, not the label: this attribute is read back as a value.
        row.dataset.cat = id;
        row.setAttribute('aria-pressed', on ? 'true' : 'false');
        row.innerHTML =
          `<div class="cat-row-title">${escapeHtml(catName(id))}</div>` +
          `<div class="cat-row-desc">${escapeHtml(catDesc(id))}</div>` +
          (catMultiMode ? `<span class="cat-check" aria-hidden="true">${CHECK_SVG}</span>` : '');
        row.addEventListener('click', () => {
          if (catMultiMode) {
            if (modalSelection.has(id)) {
              if (modalSelection.size === 1) return; // keep at least one
              modalSelection.delete(id);
            } else {
              modalSelection.add(id);
            }
            renderCategoryModal();
          } else {
            // Default mode: single pick applies immediately and closes.
            commitCategories([id]);
          }
        });
        list.appendChild(row);
      });
    });
    $('cat-select-btn').textContent = catMultiMode ? t('cat.cancel') : t('cat.select');
    $('cat-select-btn').classList.toggle('active', catMultiMode);
    $('cat-modal-footer').style.display = catMultiMode ? '' : 'none';
  }

  function openCategoryModal() {
    if (!state.isHost) return;
    modalSelection = new Set(activeCategories());
    // Jump straight into Select mode when the room already spans several
    // categories, so the host sees and can edit the full set.
    catMultiMode = modalSelection.size > 1;
    renderCategoryModal();
    const back = $('cat-modal-backdrop');
    back.classList.add('open');
    back.scrollTop = 0;
  }

  function closeCategoryModal() {
    $('cat-modal-backdrop').classList.remove('open');
  }

  function toggleSelectMode() {
    if (catMultiMode) {
      // Cancel — leave Select mode without applying.
      catMultiMode = false;
    } else {
      catMultiMode = true;
      modalSelection = new Set(activeCategories());
    }
    renderCategoryModal();
  }

  async function commitCategories(cats) {
    closeCategoryModal();
    if (!cats.length) return;
    // Pass the Phone: no room to write to, so the pick lands straight on the
    // local meta. activeCategories() reads it from there either way.
    if (state.local) {
      state.meta.categories = cats;
      state.meta.category = cats[0];
      renderLobby();
      return;
    }
    if (!state.isHost || !db || !state.roomCode) return;
    try {
      // Keep `category` in sync (= first pick) for back-compat with any
      // reader that predates `categories`.
      await update(ref(db, `rooms-word/${state.roomCode}/meta`), { categories: cats, category: cats[0] });
    } catch (err) {
      showToast(t('error.change-category'));
    }
  }

  // Host only. The row is on screen for players too now, rather than being
  // swapped out for static text, so the guard has to live here.
  $('category-trigger').addEventListener('click', () => { if (state.isHost) openCategoryModal(); });
  $('cat-select-btn').addEventListener('click', toggleSelectMode);
  $('cat-modal-done').addEventListener('click', () => commitCategories([...modalSelection]));
  $('cat-modal-close').addEventListener('click', closeCategoryModal);
  $('cat-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCategoryModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('cat-modal-backdrop').classList.contains('open')) closeCategoryModal();
  });

  // ---- Talk to creator ----
  // Replaces the old one-way feedback form: same quiet link in the home
  // footer, but it now opens a thread that can be answered. The panel and its
  // storage live in shared/chat.js + shared/chat-support.js, so this game owns
  // nothing but the copy and the two places that open it.
  const chatTransport = createSupportTransport({
    db,
    role: 'user',
    source: GAME,
    meta: () => ({
      version: ($('app-version') && $('app-version').textContent) || null,
      country: (peekGeo() && peekGeo().country) || null,
      countryCode: (peekGeo() && peekGeo().cc) || null,
    }),
  });

  const chat = mountChat({
    transport: chatTransport,
    // No sticky button here. The games' home screens are already tuned, and a
    // floating control over them is a change to the game, not to feedback.
    launcher: null,
    title: t('chat.title'),
    opener: t('chat.opener'),
    me: 'user',
    onSend: () => bumpAnalytics({ 'chat/sent': 1 }),
  });

  // `from` records which of the two entry points was used, replacing the old
  // fbSource tag on the feedback record. It is a counter rather than a field
  // on the thread: useful in aggregate, not worth knowing per person.
  function openChat(from) {
    bumpAnalytics({ 'chat/opened': 1, ['chat/opened_from/' + from]: 1 });
    chat.open();
  }

  $('feedback-link').addEventListener('click', () => openChat('landing'));

  // ---- Room chat ----
  // The other half of the clue board. Players who are not in the same room
  // cannot argue about who is lying, and arguing is the game; the board only
  // ever says what was written, never what anyone thinks of it.
  //
  // Same panel as the thread above, wearing the docked dress: the round
  // underneath keeps running, so it is not a dialog, it traps no focus, and
  // the control that opens it is deliberately a different shape from the
  // round button that means "talk to the developer" (#246).
  let roomChat = null;
  let roomChatFor = null;

  function mountRoomChat() {
    if (!db || !state.roomCode || !state.myId) return;
    if (roomChat && roomChatFor === state.roomCode) return;
    destroyRoomChat();
    roomChatFor = state.roomCode;
    roomChat = mountChat({
      transport: createRoomTransport({
        db,
        code: state.roomCode,
        me: state.myId,
        // Read at send time rather than captured here: a player can still
        // rename themselves in the lobby after this panel exists.
        name: () => state.myName || '?',
        av: () => state.myAv || 0,
      }),
      // The same face the lobby and the board draw, from the same function,
      // rather than a second idea of what a player looks like. It is built
      // from the message and not from the player list on purpose: someone who
      // has quit still has to look like themselves in the thread above.
      avatar: (m) => {
        const slot = document.createElement('div');
        slot.innerHTML = avatarHtml({ av: m.av, name: m.name || '?' });
        return slot.firstElementChild;
      },
      dock: true,
      // A column on the right on a wide screen, open whenever chat is on (#279).
      side: '(min-width: 900px)',
      // No clock of any kind. A room is deleted minutes after the last player
      // leaves: the date can only ever read Today, once, and a time under
      // every bubble is a stamp on a conversation short enough to read in
      // one go. The turn clock at the top is the only time that matters here.
      days: false,
      times: false,
      // Listening from the moment the room exists, because the unread count
      // is the whole point of a control that is shut most of the time.
      eager: true,
      // Three seconds between messages is right for a bug report and wrong
      // for an argument with a clock running.
      cooldown: 1000,
      launcher: 'pill',
      launcherLabel: t('chat.room-label'),
      title: t('chat.room-title'),
      placeholder: t('chat.room-placeholder'),
      me: state.myId,
    });
    syncChatLauncher();
  }

  function destroyRoomChat() {
    if (roomChat) roomChat.destroy();
    roomChat = null;
    roomChatFor = null;
    document.body.classList.remove('chat-pill-on');
    trackPillLift(null);
  }

  // Where the pill belongs: every screen of a room round, from the lobby
  // through the countdown, the turns, the ballot and the reveal to the
  // result, so players can talk the whole way through (#286). Not Pass the
  // Phone, where everybody is already close enough to accuse each other out
  // loud. The reveal closes an open sheet once, in enterRevealCountdown().
  const CHAT_SCREENS = ['lobby', 'game', 'clues', 'vote', 'reveal', 'over'];

  function syncChatLauncher() {
    if (!roomChat) return;
    const on = CHAT_SCREENS.indexOf(state.screen) !== -1 && state.mode === 'clue';
    roomChat.showLauncher(on);
    // Leaving the round with the sheet up would carry it onto the home screen.
    if (!on) roomChat.close();
    document.body.classList.toggle('chat-pill-on', on);
    trackPillLift(on ? state.screen : null);
  }

  // The pill floats, which on the lobby and the ballot means floating over
  // the primary button. It rides above that bar instead.
  //
  // The measurement is the bar's TOP EDGE, not its height. Those are the same
  // number only while the bar is stuck to the bottom of the screen, which is
  // the lobby's case and not the ballot's: a short ballot leaves the bar in
  // the flow partway up, and a pill placed by height alone floats in the dead
  // space underneath it. Both the position and the height move while the
  // screen is up, the ready nudge and the hint line being the two that change
  // it, so this is measured again on scroll and on resize rather than once.
  let pillLiftObs = null;
  let pillLiftBar = null;
  let pillLiftRaf = 0;

  function setPillLift(px) {
    document.documentElement.style.setProperty('--chat-pill-lift', (px || 0) + 'px');
  }

  function measurePillLift() {
    pillLiftRaf = 0;
    if (!pillLiftBar) { setPillLift(0); return; }
    setPillLift(Math.max(0, window.innerHeight - pillLiftBar.getBoundingClientRect().top));
  }

  function queuePillLift() {
    if (pillLiftRaf) return;
    pillLiftRaf = requestAnimationFrame(measurePillLift);
  }

  function trackPillLift(screenId) {
    if (pillLiftObs) { pillLiftObs.disconnect(); pillLiftObs = null; }
    $('app').removeEventListener('scroll', queuePillLift);
    window.removeEventListener('resize', queuePillLift);
    document.removeEventListener('visibilitychange', queuePillLift);
    pillLiftBar = screenId ? $('screen-' + screenId).querySelector('.sticky-actions') : null;
    if (!pillLiftBar) { setPillLift(0); return; }
    measurePillLift();
    $('app').addEventListener('scroll', queuePillLift, { passive: true });
    window.addEventListener('resize', queuePillLift);
    // A hidden tab delivers neither resize observations nor animation frames,
    // so a bar that grew while the player was somewhere else is still the old
    // height as far as this is concerned. Measured again on the way back.
    document.addEventListener('visibilitychange', queuePillLift);
    if (typeof ResizeObserver === 'function') {
      // Every child of the screen, not just the bar. What moves the bar is
      // the height of everything above it, and on the ballot that is filled
      // in from Firebase well after this runs: the ballot itself grows as
      // players arrive and the evidence grows as clues do. Watching only the
      // bar catches it changing size and misses it changing place.
      pillLiftObs = new ResizeObserver(queuePillLift);
      for (const child of $('screen-' + screenId).children) pillLiftObs.observe(child);
    }
  }

  // ---- Round-milestone feedback popup ----
  // Counts completed rounds per device (localStorage, shared across both
  // games — same origin). From FB_PROMPT_AT rounds on, the Round Over screen
  // auto-opens a small feedback popup — 2s after the reveal so it never
  // covers the payoff moment. It returns on later Round Overs until the
  // player interacts once (rate or dismiss), then never shows again on
  // that device.
  const FB_PROMPT_AT = 6;
  let fbpTimer = null;

  function countRoundAndMaybePrompt() {
    let n;
    try {
      n = (parseInt(localStorage.getItem('imp_fb_rounds'), 10) || 0) + 1;
      localStorage.setItem('imp_fb_rounds', String(n));
    } catch (e) { return; }
    // One nudge per Round Over, and the rating is the one that goes first:
    // the coffee ask only gets the slot once the feedback popup is answered.
    // Two cards fighting over the same 2s timer would stack, and the second
    // would land on a player who has just been asked for something else.
    if (!showFbPromptIfDue(n)) maybeCoffeePrompt(n);
  }

  // Returns whether it claimed this Round Over.
  function showFbPromptIfDue(n) {
    try {
      if (localStorage.getItem('imp_fb_prompt_done')) return false;
    } catch (e) { return false; }
    if (n < FB_PROMPT_AT) return false;
    clearTimeout(fbpTimer);
    fbpTimer = setTimeout(() => {
      if (state.screen !== 'over') return; // next round already started
      $('fbp-backdrop').classList.add('open');
      bumpFbPrompt('shown');
    }, 2000);
    return true;
  }

  // ---- Round-milestone support popup (#203) ----
  // A second ask on the same device counter, far enough out that only a
  // regular ever reaches it: someone on their COFFEE_AT-th round across all
  // three games is the person for whom a coffee link is a fair thing to
  // show, and everyone else never sees it. Same 2s delay and same
  // return-until-answered rule as the feedback popup above.
  const COFFEE_AT = 12;
  let coffeeTimer = null;

  function maybeCoffeePrompt(n) {
    try {
      if (localStorage.getItem('imp_coffee_done')) return;
    } catch (e) { return; }
    if (n < COFFEE_AT) return;
    clearTimeout(coffeeTimer);
    coffeeTimer = setTimeout(() => {
      if (state.screen !== 'over') return; // next round already started
      $('coffee-backdrop').classList.add('open');
      bumpAnalytics({ 'coffee/shown': 1 });
    }, 2000);
  }

  // interacted=false -> auto-close (next round started, or they left the
  // room): no choice was made, so the ask may return on a later Round Over.
  function closeCoffee(interacted) {
    clearTimeout(coffeeTimer);
    coffeeTimer = null;
    $('coffee-backdrop').classList.remove('open');
    if (interacted) {
      try { localStorage.setItem('imp_coffee_done', '1'); } catch (e) {}
    }
  }

  // Both round-milestone cards close on the same transitions (the next round
  // started, the group went back to the lobby, someone left the room), and
  // only one of the two is ever open, so those callers say it once. The
  // interacted=true paths stay separate: each is an answer to one card.
  function closeRoundPopups() {
    closeFbPopup(false);
    closeCoffee(false);
  }

  function declineCoffee() {
    bumpAnalytics({ 'coffee/dismissed': 1 });
    closeCoffee(true);
  }

  $('coffee-close').addEventListener('click', declineCoffee);
  $('coffee-later').addEventListener('click', declineCoffee);

  // The anchor navigates on its own; this only records the tap and closes
  // the card behind it, so coming back does not land on the ask again.
  $('coffee-cta').addEventListener('click', () => {
    bumpAnalytics({ 'coffee/clicked': 1 });
    closeCoffee(true);
  });

  function markFbPromptDone() {
    try { localStorage.setItem('imp_fb_prompt_done', '1'); } catch (e) {}
  }

  // interacted=false → auto-close (next round started / left the room):
  // the player never made a choice, so the popup may return next Round Over.
  function closeFbPopup(interacted) {
    clearTimeout(fbpTimer);
    fbpTimer = null;
    $('fbp-backdrop').classList.remove('open');
    if (interacted) markFbPromptDone();
  }

  function dismissFbPopup() {
    try { if (!localStorage.getItem('imp_fb_prompt_done')) bumpFbPrompt('dismissed'); } catch (e) {}
    closeFbPopup(true);
  }

  $('fb-emojis').addEventListener('click', (e) => {
    const btn = e.target.closest('.fb-emoji');
    if (!btn) return;
    markFbPromptDone();
    if (db) {
      push(ref(db, `feedback/${GAME}`), {
        rating: parseInt(btn.dataset.rating, 10),
        emoji: btn.textContent,
        source: 'rounds-milestone',
        country: (peekGeo() && peekGeo().country) || null,
        countryCode: (peekGeo() && peekGeo().cc) || null,
        version: ($('app-version') && $('app-version').textContent) || null,
        ts: serverTimestamp(),
      }).catch(() => {});
      bumpFbPrompt('rated');
      bumpAnalytics({ [`fbprompt/ratings/${btn.dataset.rating}`]: 1 });
    }
    $('fbp-title').textContent = t('fb.thanks');
    $('fb-emojis').style.display = 'none';
    $('fbp-say').hidden = false;
  });

  // Typing costs a panel open today, so we get ratings and almost no words.
  // The box below the thanks removes that step (#197). What it sends goes
  // through the same transport as the chat panel, into the same thread, so it
  // is answerable, it shows up in the inbox, and it is under the same daily
  // cap. The rating is still its own record: a face with no words is a
  // finished answer, not an abandoned one.
  const fbField = $('fbp-field');
  const fbSend = $('fbp-send');
  let fbSending = false;
  let fbTyped = false;

  function fbSyncSend() {
    fbSend.disabled = fbSending || fbField.value.trim().length === 0;
  }

  // Same auto-grow as the chat composer, and for the same reason: a fixed
  // box clips the next line instead of scrolling cleanly, and at 320px is
  // where most of these get typed. The borders term is explained in
  // shared/chat.js.
  let fbBase = 0;

  function fbGrow() {
    // The floor is the height it opens at, captured before we touch it: the
    // placeholder wraps on a 320px screen, and a box that shrinks under its
    // own placeholder on the first keystroke looks broken.
    if (!fbBase) fbBase = fbField.offsetHeight;
    fbField.style.height = 'auto';
    const borders = fbField.offsetHeight - fbField.clientHeight;
    const want = Math.max(fbField.scrollHeight + borders, fbBase);
    // The cap is the field's own max-height, read back rather than repeated:
    // a height past it is silently clamped by CSS, and the two numbers would
    // drift the moment one of them moved.
    const cap = parseFloat(getComputedStyle(fbField).maxHeight) || want;
    fbField.style.height = Math.min(want, cap) + 'px';
  }

  fbField.addEventListener('input', () => {
    fbGrow();
    fbSyncSend();
    $('fbp-err').hidden = true;
    if (!fbTyped && fbField.value.trim()) {
      fbTyped = true;
      bumpFbPrompt('typed');
    }
  });

  async function sendFbNote() {
    const text = fbField.value.trim();
    if (!text || fbSending) return;
    fbSending = true;
    fbSyncSend();
    $('fbp-err').hidden = true;
    try {
      await chatTransport.send(text.slice(0, 1000));
    } catch (e) {
      const err = $('fbp-err');
      err.textContent = e && e.message === 'chat/too-many'
        ? t('chat.too-many')
        : t('chat.send-failed');
      err.hidden = false;
      fbSending = false;
      fbSyncSend();
      return;
    }
    fbSending = false;
    fbField.value = '';
    bumpFbPrompt('sent');
    // Straight into the chat panel rather than a third card saying we got it.
    // The message is already in the thread, so the panel opens showing it
    // above the creator's opener, which says the same thing and can be
    // answered.
    closeFbPopup(true);
    openChat('milestone');
  }

  fbSend.addEventListener('click', sendFbNote);

  $('fbp-close').addEventListener('click', dismissFbPopup);
  $('fbp-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) dismissFbPopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('fbp-backdrop').classList.contains('open')) dismissFbPopup();
  });

  $('lobby-code-chip').addEventListener('click', copyRoomCode);

  $('btn-ready').addEventListener('click', () => {
    fbToggleReady();
  });

  $('btn-start').addEventListener('click', () => {
    if (!state.local) { fbStartGame(); return; }
    let deal;
    try {
      deal = startLocalRound();
    } catch (e) {
      trackError('local_round_start_failed');
      showToast(e.message || t('error.round-start'));
      return;
    }
    // Same tracker the online host calls, and for the same reason: this is
    // the one point every successful start passes through. It reads the mode
    // off state.local and skips the room funnel accordingly.
    trackRound(deal.cat, deal.entry.w);
    startPassSequence();
  });

  // ============================================================
  // SOUND  (#254)
  // The same clock the drawing game runs, from the same file: a tick a second
  // while the turn is yours, and a button to silence it. Held here rather than
  // copied because two games ticking at two pitches would be two games telling
  // a player the same thing in two voices.
  // ============================================================
  const clock = createTurnClock({
    storageKey: 'word:muted',
    button: $('btn-sound'),
    label: (muted) => t(muted ? 'a11y.unmute-sound' : 'a11y.mute-sound'),
  });

  // ============================================================
  // TURN ENGINE  (#244)
  // ------------------------------------------------------------
  // Ported from the drawing game, which has run it in production since the
  // canvas shipped. meta/order is the public turn order, an array of player
  // ids shuffled once per round. meta/turn is a SLOT COUNTER that only ever
  // goes up: the player whose turn it is sits at order[turn % order.length].
  // meta/turnAt is that slot's wall-clock deadline.
  //
  // Counting slots rather than tracking a pointer into a live player list is
  // the whole design, and it is not obvious from the code. It means a player
  // who closes their tab costs nothing to skip: their slot is simply spent,
  // and nothing has to be recomputed or rewritten when the roster changes
  // underneath a round.
  //
  // One thing differs from draw: the vocabulary is the writer's rather than
  // the drawer's, because there is no canvas here. The rounds multiplier is
  // the same one, added in #258.
  // ============================================================
  function turnOrder() {
    const m = state.meta;
    return (m && Array.isArray(m.order)) ? m.order.filter(Boolean) : [];
  }
  function currentTurn() {
    const n = parseInt(state.meta && state.meta.turn, 10);
    return isNaN(n) ? 0 : n;
  }
  // One clue each per round. meta/turn only ever goes up and the writer is
  // order[turn % order.length], so a second round costs exactly this
  // multiplication and nothing else: the order repeats for free (#258).
  function totalTurns() { return turnOrder().length * clampRounds(state.meta && state.meta.rounds); }
  function writerAt(turn) {
    const o = turnOrder();
    return o.length ? o[turn % o.length] : null;
  }
  function currentWriterId() { return writerAt(currentTurn()); }
  function playerById(id) { return state.players.find(p => p.id === id) || null; }

  // The next slot still owned by somebody who is actually here.
  function nextPresentTurn(from) {
    const total = totalTurns();
    for (let n = from + 1; n < total; n++) if (playerById(writerAt(n))) return n;
    return -1;
  }

  // Every player this client has seen in this room, by id. The strip and the
  // board both have to name a player who has already closed their tab: their
  // slot still shows and their clue is still on the board, and a row reading
  // "Player" where a name was is worse than no row at all. Ported from draw
  // for the same reason; the ballot in #245 needs it too.
  const playerMemo = new Map();

  // The slot a pass has already been written for. The writer's own expiry,
  // their Send press and the host's watchdog all race to advance the same
  // turn, and without this the 250ms ticker re-fires the write every tick
  // until the echo comes back. Cleared on failure so a dropped write can
  // still be retried.
  let advanceGuard = -1;

  // Hand the turn on. `fromTurn` is the slot the caller believed was live; if
  // the room has already moved past it, this is a stale call and does nothing.
  //
  // The host and nobody else, since #267. It used to be whoever's turn was
  // ending, with the host as a watchdog behind them, and that cannot survive
  // rules: the turn, the phase and the ballot all move in this write, and a
  // rule that let a player push the phase on is a rule that lets a player end
  // the round. So the writer now only writes their own clue, and the host's
  // ticker hands the turn on when it sees that clue land. Non-hosts still
  // call this and it still returns here, because the call site is the same
  // one that ends the host's own turn.
  //
  // What this costs: a host whose tab has crashed stalls the board, where
  // before the remaining players could pass the turn between themselves. The
  // room is already unfinishable in that state, since only the host writes
  // the reveal, and the idle watchdog sweeps it up.
  function fbAdvanceTurn(fromTurn) {
    if (!db || !state.roomCode || !state.meta) return;
    if (!state.isHost) return;
    if (state.meta.phase !== 'playing') return;
    if (currentTurn() !== fromTurn || advanceGuard === fromTurn) return;
    advanceGuard = fromTurn;

    const next = nextPresentTurn(fromTurn);
    if (next === -1) {
      // Nobody left to write, either because everyone has had their turn or
      // because everyone still owed one has gone. The board is finished, so
      // the room votes on it (#245). The votes tree is cleared in the same
      // write: a second round in the same room must not open on the first
      // round's ballot.
      update(ref(db, `rooms-word/${state.roomCode}`), {
        'meta/phase': 'vote',
        'meta/turn': totalTurns(),
        'meta/turnAt': null,
        // The ballot's clock, counted from the end of its intro (#275).
        'meta/voteAt': nowSync() + VOTE_INTRO_MS + CLOCKS.vote,
        'meta/lastActivity': serverTimestamp(),
        'votes': null,
      }).catch(() => { advanceGuard = -1; });
      return;
    }
    update(ref(db, `rooms-word/${state.roomCode}/meta`), {
      turn: next, turnAt: nowSync() + TURN_MS, lastActivity: serverTimestamp(),
    }).catch(() => { advanceGuard = -1; });
  }

  // When this client first noticed the writer was gone, so the host can tell
  // a closed tab from a two-second walk through a tunnel.
  let writerGoneAt = 0;

  function startTurnTicker() {
    stopTurnTicker();
    state.turnTimer = setInterval(turnTick, 250);
    turnTick();
  }
  function stopTurnTicker() {
    if (state.turnTimer) { clearInterval(state.turnTimer); state.turnTimer = null; }
    clock.reset();
  }

  function turnTick() {
    const m = state.meta;
    if (!m || m.phase !== 'playing') { writerGoneAt = 0; clock.reset(); renderTurnBar(); return; }
    const turn = currentTurn();
    const writerId = currentWriterId();
    const present = !!playerById(writerId);
    if (present) writerGoneAt = 0;
    else if (!writerGoneAt) writerGoneAt = nowSync();

    renderTurnBar();

    const turnAt = typeof m.turnAt === 'number' ? m.turnAt : 0;
    if (!turnAt) { clock.reset(); return; }
    const now = nowSync();

    // Only the screen whose turn it is hears the clock. Everyone else's
    // resets, so the first tick of their own turn lands the moment it opens.
    if (writerId !== state.myId) clock.reset();
    else clock.tick(Math.max(0, Math.ceil((turnAt - now) / 1000)));

    if (writerId === state.myId) {
      // My own time is up. The half-typed clue is discarded rather than
      // posted: a fragment on the board reads as evidence and is not, and
      // posting it would reward a fast keyboard, which is not something this
      // game should have an opinion about.
      if (now > turnAt) { skipTurn(turn); fbAdvanceTurn(turn); }
      return;
    }
    // Host only, so a stalled turn cannot be passed twice by two spectators.
    if (!state.isHost) return;
    // Somebody else's clue has landed, so their turn is over. The host is the
    // only client that may write the turn since #267, so this is what makes
    // the board move at all: the writer posts, the host passes it on within a
    // tick. Before the rules work it was the writer who did both.
    if (clues[turn]) { fbAdvanceTurn(turn); return; }
    const clientDead = now > turnAt + TURN_GRACE_MS;
    const playerGone = !present && writerGoneAt && now - writerGoneAt > TURN_GRACE_MS;
    if (clientDead || playerGone) { skipTurn(turn); fbAdvanceTurn(turn); }
  }

  // The clock beat them to it. Two guards, because a clue sent in the last
  // moment of a turn races this: advanceGuard means this client has already
  // ended the slot (which is what pressing Send does), and a row already on
  // the board means somebody's clue got there. Without them a submit landing
  // on the deadline would be overwritten by its own skipped row.
  function skipTurn(turn) {
    if (advanceGuard === turn) return;
    if (wroteSlot === turn) return;
    if (clues[turn]) return;
    writeClue(turn, null);
  }

  // ============================================================
  // THE CLUE BOARD
  // ------------------------------------------------------------
  // rooms-word/<code>/clues/<slot> holds one row per turn, either
  // { by, text, ts } or { by, skipped: true, ts }.
  //
  // Keyed by TURN SLOT, not by a push id. Draw keys its strokes by push id
  // because they arrive in bursts and their order does not matter; here the
  // order is the entire point, and a slot key makes the write idempotent: a
  // double submit overwrites its own row instead of adding a second one. It
  // also means the board renders from a numeric sort with no timestamps to
  // break ties with.
  //
  // `by` is stored even though the slot already implies the author, because
  // clues can arrive before players does, and the row has to name somebody
  // either way.
  // ============================================================
  let clues = {};          // slot -> row
  let cluesSeen = new Set(); // slots already painted, so only new clues animate
  let rowsSeen = new Set();  // players already on the board, so only new rows open

  function attachClueListener() {
    detachClueListener();
    if (!db || !state.roomCode) return;
    // One listener on the whole tree is enough: a clue lands once and is
    // never appended to, unlike a stroke.
    state.cluesUnsub = onValue(ref(db, `rooms-word/${state.roomCode}/clues`), snap => {
      clues = snap.val() || {};
      renderClueBoard();
    });
  }

  function detachClueListener() {
    if (state.cluesUnsub) { try { state.cluesUnsub(); } catch (e) {} state.cluesUnsub = null; }
  }

  // The slot this client has already put a row in. Since #267 a clue row
  // cannot be overwritten, so the second write would be refused by the rules
  // rather than merely wasted, and a refusal in the console during a normal
  // round is noise that hides a real one.
  let wroteSlot = -1;

  // Write one row. `text` null means the clock beat them to it.
  function writeClue(slot, text) {
    if (!db || !state.roomCode) return;
    const by = writerAt(slot);
    if (!by) return;
    wroteSlot = slot;
    const row = text
      ? { by, text, ts: serverTimestamp() }
      : { by, skipped: true, ts: serverTimestamp() };
    set(ref(db, `rooms-word/${state.roomCode}/clues/${slot}`), row).catch(() => {});
  }

  // A clue that IS the secret word tells the room nothing and the impostor
  // everything. Compared folded, so a different case or a stripped accent
  // does not get round it. fold() is the catalogue checker's own rule, shared
  // rather than copied: see www/shared/fold.js.
  //
  // Only a crewmate is checked, because only a crewmate's card holds the word
  // (#266). That is the right answer and not merely the available one: this
  // check used to run against the impostor too, and telling them "that is the
  // secret word" turned the composer into a way to guess it outright.
  function isSecretWord(text) {
    const card = state.myCard;
    if (!card || card.imp || !card.text) return false;
    return fold(text).trim() === fold(card.text).trim();
  }

  function clueName(id) {
    const known = playerMemo.get(id) || {};
    return known.name || t('player.generic');
  }

  // The board, grouped. One row per player, holding that player's clues
  // newest first, and the row with the newest clue on top, in any round
  // (#258, #278).
  //
  // Grouping happens here rather than on the wire. clues/<slot> keeps the
  // shape it had when the board was one row per clue, so adding rounds
  // migrated nothing and a turn is still one idempotent write.
  function clueGroups() {
    const groups = new Map();
    Object.keys(clues)
      .map(k => parseInt(k, 10))
      // Firebase hands back an ARRAY, not an object, when every key is a
      // small integer, and a gap in that array comes through as a null. So
      // the holes are filtered out rather than rendered: a slot with no clue
      // is one nobody has reached yet, and a skipped turn is a real row.
      .filter(n => !isNaN(n) && clues[n])
      .sort((a, b) => b - a)
      .forEach(slot => {
        // `by` rather than writerAt(slot), because the row is named after
        // whoever actually wrote it and that answer is already on the row.
        const by = clues[slot].by || writerAt(slot);
        if (!by) return;
        if (!groups.has(by)) groups.set(by, { by, slots: [] });
        groups.get(by).slots.push(slot);
      });

    // The slots were walked newest first, so a row joins the map at its
    // newest clue, and the map's own order is already newest row first.
    return Array.from(groups.values());
  }

  // Rows change now, where they never used to: a clue lands beside the ones
  // already in its author's row. So the signature covers every slot in every
  // group, not just which rows exist. Without it every meta write redraws the
  // board, and the turn advance that follows a clue by a few milliseconds
  // would cut the arrival animation off at the knees.
  // null, not '': an empty board's signature IS '', so a reset to '' made a
  // new round's empty board look unchanged and left the last round's clues
  // on screen until the first new one landed. Seen once rounds began to
  // follow each other by themselves (#275).
  let boardSig = null;

  function renderClueBoard() {
    const board = $('clue-board');
    if (!board) return;
    const groups = clueGroups();

    const sig = groups.map(g =>
      g.by + '\u0001' + clueName(g.by) + '\u0001' + g.slots.map(n => {
        const row = clues[n] || {};
        return n + ':' + (row.skipped ? '!' : row.text || '');
      }).join('\u0003')
    ).join('\u0002');
    if (sig === boardSig) return;
    boardSig = sig;

    const freshRows = new Set();
    const arriving = [];
    groups.forEach(g => {
      if (!rowsSeen.has(g.by)) freshRows.add(g.by);
      g.slots.forEach(n => { if (!cluesSeen.has(n)) arriving.push(n); });
    });

    board.innerHTML = '';
    groups.forEach(g => {
      board.appendChild(clueRowNode(g, { fresh: freshRows.has(g.by), seen: cluesSeen }));
      rowsSeen.add(g.by);
      g.slots.forEach(n => cluesSeen.add(n));
    });
    $('clue-empty').style.display = groups.length ? 'none' : '';

    arriving.forEach(slot => {
      const chip = board.querySelector(`.clue-text[data-slot="${slot}"]`);
      const li = chip && chip.closest('.clue-row');
      if (!li) return;
      // A player's first clue opens a row. Every one after it arrives into a
      // row that is already standing, so the row moves to the top as it is
      // and only the chip grows.
      if (freshRows.has(li.dataset.by)) openClueRow(li);
      // The row that grew is the top row, so this brings the board back to
      // the top when somebody has scrolled down to read.
      scrollRowIntoView(board, li);
      if (!clues[slot].skipped) startTyping(slot, clues[slot].text || '');
    });
  }

  // The least movement that puts the row on screen. Not scrollIntoView():
  // that one scrolls every scrollable ancestor it can find, and the screen
  // around this board is a fixed column that must not shift under a thumb.
  function scrollRowIntoView(board, li) {
    const b = board.getBoundingClientRect();
    const r = li.getBoundingClientRect();
    if (r.top < b.top) board.scrollTop += r.top - b.top;
    else if (r.bottom > b.bottom) board.scrollTop += r.bottom - b.bottom;
  }

  // One row of the board: a player, and every clue they have given. The vote
  // screen builds its evidence from the same function, so what a player
  // judges is the board they have been reading and not a second rendering of
  // it (#245). `plain` skips the typing state, which belongs to the live
  // board alone. `seen` is the set of slots already painted, so a chip
  // landing in a row that is already standing can announce itself.
  function clueRowNode(group, opts) {
    const o = opts || {};
    const known = playerMemo.get(group.by) || {};
    const li = document.createElement('li');
    li.className = 'clue-row' + (o.fresh ? ' is-new' : '');
    li.dataset.by = group.by;
    // The lobby's own pill, not a second one: the roster and the board
    // have to agree about which row is yours.
    const you = group.by === state.myId
      ? `<span class="you-pill">${escapeHtml(t('lobby.you-pill'))}</span>`
      : '';
    // Newest first, left to right, wrapping onto a second line when the row
    // runs out of width. A skipped turn keeps its place rather than closing
    // up: at vote time a gap in somebody's evidence is itself evidence.
    const words = group.slots.map(slot => {
      const row = clues[slot] || {};
      const fresh = !o.fresh && o.seen && !o.seen.has(slot);
      const text = o.plain
        ? escapeHtml(row.skipped ? t('clue.skipped') : (row.text || ''))
        : clueTextHtml(slot, row);
      return '<span class="clue-text'
        + (row.skipped ? ' is-skipped' : '')
        + (fresh ? ' is-new' : '')
        + `" data-slot="${slot}">${text}</span>`;
    }).join('');
    li.innerHTML =
      avatarHtml({ av: known.av, name: known.name || '?' }) +
      '<div class="clue-body">' +
        `<div class="clue-who">${escapeHtml(clueName(group.by))}${you}</div>` +
        `<div class="clue-words">${words}</div>` +
      '</div>';
    return li;
  }

  // ---- The arrival ----
  // A clue is written into its chip rather than dropped into it: this is a
  // word game, and the chip is the word (#257). The partial text lives in
  // `typing` rather than in the node, so a rebuild mid-animation picks the
  // reveal back up instead of finishing it early.
  const TYPE_MS = 32;       // one character
  const TYPE_LEAD = 140;    // after the row has opened
  const TYPE_HOLD = 420;    // the caret stays this long after the last letter
  const typing = new Map(); // slot -> { text, n, timer }

  function clueTextHtml(slot, row) {
    if (row.skipped) return escapeHtml(t('clue.skipped'));
    const st = typing.get(slot);
    if (!st) return escapeHtml(row.text || '');
    return escapeHtml(st.text.slice(0, st.n)) + '<i class="clue-caret"></i>';
  }

  function paintTyped(slot) {
    const board = $('clue-board');
    const el = board && board.querySelector(`.clue-text[data-slot="${slot}"]`);
    if (!el) return;
    const st = typing.get(slot);
    el.innerHTML = st
      ? escapeHtml(st.text.slice(0, st.n)) + '<i class="clue-caret"></i>'
      : escapeHtml((clues[slot] || {}).text || '');
  }

  function startTyping(slot, text) {
    // The end state must never depend on this having run. A tab nobody is
    // looking at gets the finished clue and no animation, which is also what
    // a reader who has asked for less motion gets.
    if (!text || typing.has(slot) || document.hidden || reducedMotion()) return;
    const st = { text, n: 0, timer: null };
    typing.set(slot, st);
    paintTyped(slot);
    const step = () => {
      st.n += 1;
      paintTyped(slot);
      st.timer = st.n < text.length
        ? setTimeout(step, TYPE_MS)
        : setTimeout(() => { typing.delete(slot); paintTyped(slot); }, TYPE_HOLD);
    };
    st.timer = setTimeout(step, TYPE_LEAD);
  }

  function stopTyping() {
    typing.forEach(st => clearTimeout(st.timer));
    typing.clear();
  }

  // The board makes space rather than jumping. No fill, so a row whose
  // animation never runs simply stands at its natural height.
  function openClueRow(li) {
    if (reducedMotion() || document.hidden || !li.animate) return;
    const h = li.getBoundingClientRect().height;
    if (!h) return;
    const gap = parseFloat(getComputedStyle(li.parentElement).rowGap) || 0;
    li.classList.add('is-opening');
    li.animate(
      [
        { height: '0px', marginBottom: (-gap) + 'px' },
        { height: h + 'px', marginBottom: '0px' },
      ],
      { duration: 300, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
    ).onfinish = () => li.classList.remove('is-opening');
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // The header: whose turn, and how long they have. Called on every tick, so
  // it only ever writes text and classes.
  function renderTurnBar() {
    const pill = $('turn-pill');
    if (!pill) return;
    const m = state.meta || {};
    const writerId = currentWriterId();
    const writer = playerById(writerId);
    const mine = writerId === state.myId && m.phase === 'playing';
    pill.classList.toggle('is-mine', mine);

    let label;
    if (m.phase === 'playing') {
      if (mine) label = t('turn.yours');
      else if (writer) label = t('turn.theirs', { name: writer.name });
      else label = t('turn.passing');   // they left; the watchdog is about to skip them
    } else {
      label = t('turn.getting-ready');
    }
    $('turn-label').textContent = label;

    const timerEl = $('turn-timer');
    const turnAt = typeof m.turnAt === 'number' ? m.turnAt : 0;
    if (m.phase === 'playing' && turnAt) {
      const left = Math.max(0, Math.ceil((turnAt - nowSync()) / 1000));
      timerEl.textContent = String(left);
      timerEl.classList.toggle('urgent', left <= 10);
    } else {
      timerEl.textContent = '';
      timerEl.classList.remove('urgent');
    }
    pill.classList.toggle('no-timer', !timerEl.textContent);

    renderBoardMeta();
    renderComposer(mine);
  }

  // The line above the board: who is in the round, and how far through it the
  // room is. Called with renderTurnBar on every tick, so like it this only
  // ever writes text (#259).
  function renderBoardMeta() {
    const playersEl = $('board-players');
    if (!playersEl) return;
    const order = turnOrder();
    // Everyone DEALT IN, not everyone still here. A player who quits keeps
    // their row on the board and their name on the ballot, so a count that
    // fell when they left would stop matching the rows underneath it.
    playersEl.textContent = t('board.players', {
      count: order.length || state.players.length,
    });
    const total = clampRounds(state.meta && state.meta.rounds);
    // The turn that ends the board writes meta/turn PAST the end of it, so
    // this is clamped: the round after the last one is still the last one.
    const round = order.length
      ? Math.min(total, Math.floor(currentTurn() / order.length) + 1)
      : 1;
    $('board-round').textContent = t('board.round', { round, total });
  }

  // The play order, on top of the board. Rebuilt only when the room changes,
  // never on the 250ms tick, so the sideways scroll is not yanked about
  // under a thumb.
  function renderTurnStrip() {
    const strip = $('turn-strip');
    if (!strip) return;
    const order = turnOrder();
    const activeId = (state.meta && state.meta.phase === 'playing') ? currentWriterId() : null;
    strip.innerHTML = '';
    order.forEach(id => {
      // No ink dot: see the note on the strip in shared/base.css. A clue is
      // text with a person attached, and the row names them outright.
      const chip = document.createElement('span');
      const live = id === activeId;
      chip.className = 'pchip'
        + (live ? ' is-active' : '')
        + (live && id !== state.myId ? ' is-them' : '')
        + (playerById(id) ? '' : ' is-gone');
      chip.textContent = id === state.myId
        ? t('player.you-title', { name: clueName(id) })
        : clueName(id);
      // The dots ride on the live chip only. They say the turn is live, not
      // that anyone is actually typing: no keystroke is on the wire, and one
      // there would leak a half written clue to the room.
      if (live) {
        const dots = document.createElement('span');
        dots.className = 'clue-dots';
        dots.setAttribute('aria-hidden', 'true');
        dots.innerHTML = '<i></i><i></i><i></i>';
        chip.appendChild(dots);
      }
      strip.appendChild(chip);
    });
    // CSS pulls the live chip to the front, so the front is where to be.
    strip.scrollLeft = 0;
  }

  // ---- The field ----
  // On screen only while the turn is yours. It is not part of the board: it
  // arrives between the secret word and the board when the turn comes to you
  // and leaves when it goes, so on everyone else's turn the panel carries
  // clues and nothing else (#254).
  let composerFor = -1;   // the slot the box is currently open for
  let ringLen = 0;        // the field's perimeter, in user units
  let ringArmedAt = 0;    // when the ring last landed whole
  let arrivalTimer = null;

  // The ring is whole when the field lands and holds there before the clock
  // takes it over, so a player sees a full outline rather than one already
  // going. Long enough to register, short enough that the countdown it is
  // standing in for has barely moved.
  const RING_HOLD_MS = 350;

  function renderComposer(mine) {
    const dock = $('clue-dock');
    if (!dock) return;
    const turn = currentTurn();
    if (!mine) { closeComposer(); return; }
    if (composerFor !== turn) {
      composerFor = turn;
      openComposer();
    }
    renderClueRing();
  }

  function openComposer() {
    const dock = $('clue-dock');
    dock.hidden = false;
    $('clue-input').value = '';
    setClueNote('', false);
    syncClueSend();
    // A paused animation holds its FIRST frame, and this one's first frame is
    // a row of no height. A tab that is not on screen never advances it, so a
    // player who was away during the handover would come back to a field they
    // cannot see, let alone type in. Two guards: the arrival is skipped
    // outright when nothing is being looked at, and a timer takes the class
    // off whatever happens, so the end state never depends on the animation
    // having run at all.
    clearTimeout(arrivalTimer);
    dock.classList.remove('is-arriving');
    if (!document.hidden) {
      void dock.offsetWidth;
      dock.classList.add('is-arriving');
      arrivalTimer = setTimeout(() => dock.classList.remove('is-arriving'), 600);
    }
    ringArmedAt = nowSync();
    fitClueRing(true);
    // Not focused automatically: on a phone that throws the keyboard up over
    // the board the moment the turn arrives, before the player has read the
    // clue above theirs.
  }

  function closeComposer() {
    const dock = $('clue-dock');
    if (!dock || dock.hidden) { composerFor = -1; return; }
    dock.hidden = true;
    clearTimeout(arrivalTimer);
    dock.classList.remove('is-arriving');
    composerFor = -1;
    setClueNote('', false);
  }

  // The dash has to be the box's real perimeter or the countdown races the
  // corners, and the box is fluid, so it is measured rather than assumed.
  function fitClueRing(reset) {
    const form = $('clue-composer');
    const svg = $('clue-ring');
    const live = $('clue-ring-live');
    if (!form || !svg || !live) return;
    const w = form.clientWidth;
    const h = form.clientHeight;
    if (!w || !h) return;
    const inset = 1;
    // Read off the box rather than hard-coded, so the ring follows --radius.
    const rx = parseFloat(getComputedStyle(form).borderTopLeftRadius) || 18;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.querySelectorAll('rect').forEach(r => {
      r.setAttribute('x', inset);
      r.setAttribute('y', inset);
      r.setAttribute('width', Math.max(0, w - inset * 2));
      r.setAttribute('height', Math.max(0, h - inset * 2));
      r.setAttribute('rx', rx);
    });
    ringLen = live.getTotalLength();
    live.setAttribute('stroke-dasharray', ringLen);
    if (reset) {
      // Snapped to whole, not eased to it, or the ring would sweep round
      // once on arrival instead of simply being there.
      live.style.transition = 'none';
      live.style.strokeDashoffset = '0px';
      live.classList.remove('is-urgent');
      void live.getBoundingClientRect();
      live.style.transition = '';
    }
    renderClueRing();
  }

  // Called on every turn tick. The room clock drives the ring, not a CSS
  // loop of its own: a client that picked the turn up late, or whose tab was
  // asleep, still shows the time that is actually left.
  function renderClueRing() {
    const live = $('clue-ring-live');
    const dock = $('clue-dock');
    if (!live || !dock || dock.hidden || !ringLen) return;
    const m = state.meta || {};
    const turnAt = typeof m.turnAt === 'number' ? m.turnAt : 0;
    if (!turnAt) return;
    const left = Math.max(0, turnAt - nowSync());
    const held = nowSync() - ringArmedAt < RING_HOLD_MS;
    const frac = held ? 1 : Math.max(0, Math.min(1, left / TURN_MS));
    live.style.strokeDashoffset = (ringLen * (1 - frac)) + 'px';
    live.classList.toggle('is-urgent', !held && left <= 10000);
  }

  function setClueNote(text, isError) {
    const note = $('clue-note');
    note.textContent = text;
    note.classList.toggle('is-error', !!isError);
  }

  function syncClueSend() {
    const v = $('clue-input').value.trim();
    $('clue-send').disabled = v.length === 0;
    // The count sits inside the box. The note under it is now the refused
    // submit and nothing else, so it takes no height while you type and the
    // board does not travel down as the first character lands.
    $('clue-count').textContent = v.length ? `${v.length}/${CLUE_MAX}` : '';
    setClueNote('', false);
  }

  function submitClue() {
    const input = $('clue-input');
    const text = input.value.trim().slice(0, CLUE_MAX);
    // An empty box does nothing. Only the clock writes a skipped row, so a
    // mistaken tap cannot spend a turn that still has time on it.
    if (!text) return;
    if (isSecretWord(text)) { setClueNote(t('clue.is-secret-word'), true); return; }
    const turn = currentTurn();
    if (currentWriterId() !== state.myId) return;
    writeClue(turn, text);
    input.value = '';
    input.blur();
    closeComposer();
    fbAdvanceTurn(turn);
  }

  function enterClueBoard() {
    closeRoundPopups();
    armPassBackTrap();
    stopCardCountdown();
    stopClock();
    // A fresh board. cluesSeen in particular: carried over, the second round's
    // rows would arrive without the animation that says a clue just landed.
    clues = {};
    cluesSeen = new Set();
    rowsSeen = new Set();
    boardSig = null;
    stopTyping();
    advanceGuard = -1;
    wroteSlot = -1;
    writerGoneAt = 0;
    composerFor = -1;
    closeComposer();
    go('clues');
    renderClueCard();
    renderTurnStrip();
    renderClueBoard();
    attachClueListener();
    startTurnTicker();
    acquireWakeLock();
  }

  // The card, flat and permanent. Every other card in this game hides itself
  // because the people you are playing with can see your screen; on the clue
  // board they are somewhere else entirely, so there is nobody to hide it
  // from and a word you have to hold in your head for ten minutes is a worse
  // game rather than a fairer one.
  function renderClueCard() {
    const card = cardContent(state.myCard);
    $('clue-banner').classList.toggle('shown', card.isImposter);
    $('clue-card').classList.toggle('is-imposter', card.isImposter);
    $('clue-role').textContent = card.role;
    $('clue-secret').textContent = card.text || '—';
  }

  // ============================================================
  // GAMEPLAY — driven by meta.startAt (synced across clients)
  // ============================================================
  function beginGame() {
    // Reloaded or joined after the card window closed: the board is already
    // running, so there is no card to count down to. Straight to it.
    if (roomMode() === 'clue' && cardWindowPassed()) { enterClueBoard(); return; }
    closeRoundPopups();
    resetPlate();
    // The screen now has a way off it, so back can be answered with "use it"
    // rather than dropping someone out of a live round. Pass the Phone has
    // done this since it shipped; the toast it shows was simply untrue here
    // until the Quit button existed (#144).
    armPassBackTrap();
    go('game');
    runCountdown();
  }

  function runCountdown() {
    const overlay = $('countdown');
    const numEl = $('countdown-num');
    const startAt = state.meta && state.meta.startAt;
    if (!startAt) return;

    overlay.classList.add('active');

    let lastShown = -1;
    const tick = () => {
      const remaining = (startAt - nowSync()) / 1000;
      if (remaining <= 0) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        overlay.classList.remove('active');
        showCard();
        return;
      }
      const n = Math.min(3, Math.ceil(remaining));
      if (n !== lastShown) {
        lastShown = n;
        numEl.textContent = n;
        numEl.style.animation = 'none';
        void numEl.offsetWidth;
        numEl.style.animation = '';
      }
    };
    tick();
    clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(tick, 60);
  }

  // Show this player's card: crewmates get the secret word, the imposter
  // gets the hint. Everything after this — clues, accusations, guessing —
  // happens out loud around the room.
  //
  // Online only. Pass the Phone has its own sequence further down.
  function showCard() {
    paintCard();
    // Said once, on arrival. A hand that lands a moment later repaints the
    // card without saying it again.
    if (!state.myCard) showToast(t('error.no-card'));
    startCardCountdown();
    startGameClock();
  }

  // The face of the card, split out so the private node can repaint it when
  // the hand arrives (#266). The deal and the phase flip are one write but
  // two listeners, so the screen can be up a frame before the card is.
  function paintCard() {
    const card = cardContent(state.myCard);
    const isImposter = card.isImposter;

    $('imposter-banner').classList.toggle('shown', card.isImposter);
    $('game-role').textContent = card.role;
    // A dash, not an empty card. Nobody dealt in is the rare case: a room
    // made before sessions existed, or a join that landed in the same
    // instant as the deal. Either way this round is not theirs and the next
    // one will be, which is what the toast in showCard() says.
    $('game-word').textContent = card.text || (state.myCard ? '' : '—');
    $('word-card').classList.toggle('is-imposter', card.isImposter);

    // Host-only, and shown from the first paint rather than at the turn: the
    // button is up throughout, and a caption that arrives five seconds after
    // the control it explains is worse than one that was always there.
    //
    // The clue board has neither. It ends itself when the last clue lands, so
    // a button that cuts the round short before anyone has written one would
    // be a way to break the game rather than a way to finish it.
    const clue = roomMode() === 'clue';
    $('btn-reveal').style.display = (state.isHost && !clue) ? '' : 'none';
    $('game-reveal-note').style.display = (state.isHost && !clue) ? '' : 'none';
    $('game-quit-btn').textContent = state.isHost ? t('lobby.quit-game') : t('lobby.leave-room');

    // While the card is up it can say what you are, because it is the thing
    // saying it. Once it turns, the wording stops naming a role: see
    // showGameOn().
    // The clue is written rather than said on the board, and the host's line
    // is about a button the board does not have, so the host reads the
    // players' line there like everyone else.
    $('game-hint').textContent = clue
      ? (isImposter ? t('card.hint-clue-impostor') : t('card.hint-clue-crew'))
      : state.isHost
        ? t('card.hint-host')
        : isImposter
          ? t('card.hint-impostor')
          : t('card.hint-crew');
  }

  // ============================================================
  // THE CARD, THE COUNTDOWN AND THE CLOCK  (#144)
  // ============================================================
  // The card is dealt face up, counts down for five seconds and then turns
  // itself over, leaving the game-on state behind it. After that the only
  // way to see it again is a swipe, and the only way to put it back is
  // another one: nothing lowers it on a timer, because a card that turns
  // over while you are still reading it is worse than one that stays.
  const CARD_FACE_UP_S = 5;
  let plateCovered = false;
  let plateDrag = null;
  let gameOnShown = false;

  // Face up, unblanked, no animation. Runs on the way into the screen, where
  // a visible un-turn would replay the previous round's card.
  function resetPlate() {
    const plate = $('game-plate');
    plate.style.transition = 'none';
    plate.classList.remove('is-covered');
    plate.style.transform = '';
    void plate.offsetWidth;          // land the reset before transitions return
    plate.style.transition = '';
    plateDrag = null;
    setPlateCovered(false);
    gameOnShown = false;
    $('game-status').classList.remove('shown');
    $('game-countdown').style.display = '';
  }

  function setPlateCovered(covered) {
    plateCovered = covered;
    const plate = $('game-plate');
    plate.classList.toggle('is-covered', covered);
    plate.setAttribute('aria-pressed', String(!covered));
    plate.setAttribute('aria-label', covered ? t('a11y.check-card') : t('a11y.put-card-away'));
    setPlateBlank(covered);
  }

  function setPlateBlank(blank) { $('word-card').classList.toggle('blanked', blank); }

  function startCardCountdown() {
    const line = $('game-countdown');
    const startedAt = Date.now();
    let shown = -1;
    line.style.display = '';
    const tick = () => {
      const left = Math.ceil(CARD_FACE_UP_S - (Date.now() - startedAt) / 1000);
      if (left <= 0) { stopCardCountdown(); coverPlate(); return; }
      if (left !== shown) { shown = left; line.textContent = t('card.starting-in', { n: left }); }
    };
    tick();
    stopCardCountdown();
    state.cardTimer = setInterval(tick, 100);
  }

  function stopCardCountdown() {
    clearInterval(state.cardTimer);
    state.cardTimer = null;
  }

  // The card going down is what starts the game-on state, whether that was
  // the countdown finishing or somebody putting it away early.
  function coverPlate() {
    stopCardCountdown();
    $('game-countdown').style.display = 'none';
    // On the clue board the card going down is the round starting, not the
    // card going quiet: the board takes the screen and carries its own copy
    // of the card at the top of it.
    if (roomMode() === 'clue') { enterClueBoard(); return; }
    setPlateCovered(true);
    showGameOn();
  }

  // Has the card's window already closed for this round? Read off the shared
  // startAt rather than off this tab's own clock, so a player who reloads
  // lands where the room actually is.
  function cardWindowPassed() {
    const startAt = (state.meta && state.meta.startAt) || 0;
    return !!startAt && nowSync() > startAt + CARD_FACE_UP_S * 1000;
  }

  function showGameOn() {
    if (gameOnShown) return;
    gameOnShown = true;
    $('game-status').classList.add('shown');
    // Two lines, the same two for everybody. Nothing on this screen says what
    // you are once the card is down, and the wording must not undo that.
    const hint = $('game-hint');
    hint.textContent = '';
    [t('card.active-clues'), t('card.active-blend')].forEach(line => {
      const el = document.createElement('div');
      el.textContent = line;
      hint.appendChild(el);
    });
  }

  // Counts UP, from the timestamp every client in the room already shares, so
  // all the phones agree and a reload shows the true elapsed time instead of
  // starting again at zero. Deliberately not a countdown: no bar, no target,
  // nothing that makes a group feel played against a limit.
  function startGameClock() {
    const el = $('game-clock');
    const tick = () => {
      const startAt = (state.meta && state.meta.startAt) || 0;
      // Zero is the moment the reveal window ends, not the moment the cards
      // were dealt, so the clock reads 00:00 as it appears. Still derived from
      // the shared timestamp rather than from when THIS phone turned its card
      // over, because a player who puts theirs away early must not end up on a
      // different clock from everyone else. Their reading simply sits at zero
      // until the window they skipped is up.
      const secs = startAt
        ? Math.max(0, Math.floor((nowSync() - startAt) / 1000) - CARD_FACE_UP_S)
        : 0;
      el.textContent = clockText(secs);
    };
    tick();
    stopClock();
    state.clockTimer = setInterval(tick, 1000);
  }

  // Serves both clocks, which is why it is not named for either: only one can
  // be running, because a round is either in a room or on one phone.
  function stopClock() {
    clearInterval(state.clockTimer);
    state.clockTimer = null;
  }

  // The same clock for a group sharing one phone, and the reason it cannot
  // read startAt: a Pass the Phone round has no room and no meta.startAt,
  // because it only ever exists in this tab. Zero is the moment the last card
  // went away and this screen appeared, which is the only start such a round
  // has, and the honest one: nothing is being played before then (#252).
  function startPassRoundClock() {
    const el = $('pass-round-clock');
    const startedAt = nowSync();
    const tick = () => {
      el.textContent = clockText(Math.max(0, Math.floor((nowSync() - startedAt) / 1000)));
    };
    tick();
    stopClock();
    state.clockTimer = setInterval(tick, 1000);
  }

  // mm:ss, and minutes past 99 simply keep counting. A round that long is a
  // group that forgot to tap Reveal, not a case worth a different format.
  function clockText(secs) {
    const m = Math.floor(secs / 60);
    const r = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
  }

  // What belongs on a card, for either mode. Three renderers read this, the
  // gameplay screen above, the clue board's flat card and the back face of
  // the passed card below, so the shared phone and the online game cannot
  // drift apart on what a card says.
  //
  // It takes the hand itself now, `{ imp, text }`, rather than the room's
  // meta and a flag (#266). Online that hand arrives from the player's own
  // private node; on a shared phone localCard() builds it from the deal in
  // memory. Null is a real case: see the note on the no-card screen.
  function cardContent(card) {
    if (!card) return { isImposter: false, role: t('card.role-none'), text: '' };
    return {
      isImposter: !!card.imp,
      role: card.imp ? t('card.role-hint') : t('card.role-word'),
      text: card.text,
    };
  }

  // Pass the Phone deals into memory and has no room, no session and nothing
  // to keep from anyone but the person holding the phone, so it keeps the
  // deal on meta exactly as it always has and shapes a hand here on the way
  // to the card. Do not route this through the private node above: there is
  // no database in this mode at all.
  function localCard(id) {
    const meta = state.meta || {};
    if (!meta.secretWord) return null;
    const imp = !!(meta.imposterIds && meta.imposterIds[id]);
    return { imp, text: imp ? meta.imposterHint : meta.secretWord };
  }

  // ============================================================
  // PASS THE PHONE — the private card sequence
  // ============================================================
  // One card with two sides, turned over by hand. On separate devices privacy
  // is free: your card is on your own phone. On one phone it is entirely a UI
  // guarantee, and one way to see somebody else's side breaks the whole game.
  // So the rules here are strict.
  //
  //   * The back face is EMPTY until a swipe passes 45 degrees, and empties
  //     again if that swipe is abandoned. A face turned less than 90 degrees
  //     is pointing away and cannot be read, so the word only enters the DOM
  //     once someone has committed to the gesture that reveals it.
  //   * Tapping does nothing. A deliberate swipe is far harder to trigger by
  //     accident while the phone is changing hands. Keyboard and screen
  //     reader users still get through: the front face is a real button, and
  //     a click with no pointer behind it (detail 0) is one of them.
  //   * A turned card cannot be turned back. Swiping both ways would let
  //     whoever picks the phone up next replay the last card.
  //   * The card is emptied the instant Pass is tapped, and turned back only
  //     while it is faded out, so no frame of it survives to the next player.
  //   * Back is trapped for the whole sequence. A swipe or a hardware back
  //     that moved one screen would land straight on the card just passed.
  //
  // Nothing is persisted, so a reload mid-sequence drops to the home screen
  // rather than resuming into somebody else's card.

  const FLIP_FILL_DEG = 45;    // back face filled here, still facing away
  const FLIP_COMMIT_DEG = 50;  // released past here, the card turns over
  const PASS_SWAP_MS = 160;    // the fade the card is turned back inside

  let passRevealed = false;    // the card on screen is showing its back
  let passSwapping = false;    // mid-fade between two players
  let flipDrag = null;

  function reduceMotion() {
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function startPassSequence() {
    state.passSeq = { ids: state.players.map(p => p.id), idx: 0 };
    passSwapping = false;
    resetCard();          // clear whatever the previous round left behind
    armPassBackTrap();
    acquireWakeLock();    // the phone is about to spend a while in hands
    renderPassCard();
  }

  // Wipe every trace of the round from the back face. Called the moment Pass
  // is tapped and whenever a swipe is abandoned, so the only window in which
  // the word exists at all is the one where its owner is looking at it.
  function blankBackFace() {
    $('pass-role').textContent = '';
    $('pass-word').textContent = '';
    $('flip-back').classList.remove('is-imposter');
    $('pass-banner').classList.remove('shown');
  }

  function fillBackFace() {
    const seq = state.passSeq;
    const id = seq ? seq.ids[seq.idx] : state.myId;
    // "You are player N now": the deal is in memory and the card is built
    // for whoever the phone is in front of.
    const card = cardContent(localCard(id));
    $('pass-role').textContent = card.role;
    $('pass-word').textContent = card.text || '';
    $('flip-back').classList.toggle('is-imposter', card.isImposter);
    // On the card now, not above it. Above it, this line put "You're the
    // Impostor" on screen at 45 degrees of the swipe, before the face that
    // says the same thing was anywhere near visible (#144).
    $('pass-banner').classList.toggle('shown', card.isImposter);
  }

  // Front side up and empty, with no animation: this runs while the card is
  // either faded out or off screen, and a visible un-turn would replay the
  // card that was just handed back.
  function resetCard() {
    blankBackFace();
    const card = $('flip-card');
    card.style.transition = 'none';
    card.classList.remove('revealed');
    card.style.transform = '';
    void card.offsetWidth;      // land the reset before transitions return
    card.style.transition = '';
    passRevealed = false;
    flipDrag = null;
    $('btn-pass-next').classList.remove('shown');
  }

  function renderPassCard() {
    const seq = state.passSeq;
    if (!seq) return;
    const p = state.players.find(x => x.id === seq.ids[seq.idx]);
    if (!p) { seq.idx++; renderPassCard(); return; }

    $('pass-step').textContent = t('pass.step', { current: seq.idx + 1, total: seq.ids.length });
    $('pass-avatar').innerHTML = avatarHtml(p);
    $('pass-name').textContent = p.name;
    $('flip-front').setAttribute('aria-label', t('a11y.swipe-reveal', { name: p.name }));
    // The last player has nobody to hand the phone to, so their card leads
    // into the round instead of round-tripping through an extra screen.
    //
    // Everyone else's card names the person the phone goes to. Note this is
    // the NEXT player, not the one whose card is on screen: the card belongs
    // to whoever is holding the phone, and the button is what they do with it
    // when they are finished. Falls back to the generic wording if that player
    // has gone missing from the roster, which is the same case the skip above
    // already covers. Kept in step with the draw game's identical screen.
    const nextUp = state.players.find(x => x.id === seq.ids[seq.idx + 1]);
    $('btn-pass-next').textContent = isLastPassCard()
      ? t('pass.start-playing')
      : (nextUp ? t('pass.pass-to', { name: nextUp.name }) : t('pass.pass-to-next'));
    // Only on the way in. The sequence lives on this one screen now, and
    // re-entering it per player would replay the screen's entrance animation.
    if (state.screen !== 'pass-card') go('pass-card');
  }

  function isLastPassCard() {
    const seq = state.passSeq;
    return !!seq && seq.idx >= seq.ids.length - 1;
  }

  // ---- Turning the card ----

  function flipTo(deg) {
    const card = $('flip-card');
    card.style.transition = '';
    card.style.transform = `rotateY(${deg}deg)`;
  }

  function revealFace(dir) {
    if (passRevealed) return;
    fillBackFace();
    passRevealed = true;
    flipTo(dir < 0 ? -180 : 180);
    $('flip-card').classList.add('revealed');
    $('btn-pass-next').classList.add('shown');
  }

  (function wireFlipCard() {
    const card = $('flip-card');

    card.addEventListener('pointerdown', (e) => {
      if (passRevealed || passSwapping || !state.passSeq) return;
      flipDrag = { x: e.clientX, w: card.offsetWidth || 1, deg: 0 };
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
      card.style.transition = 'none';
    });

    card.addEventListener('pointermove', (e) => {
      if (!flipDrag) return;
      // A full card width of travel is a full turn, so the card tracks the
      // finger rather than jumping when some threshold is crossed.
      const deg = Math.max(-180, Math.min(180, ((e.clientX - flipDrag.x) / flipDrag.w) * 180));
      flipDrag.deg = deg;
      if (Math.abs(deg) >= FLIP_FILL_DEG) fillBackFace();
      if (!reduceMotion()) card.style.transform = `rotateY(${deg}deg)`;
    });

    const endDrag = (e) => {
      // Released unconditionally, before the early return. A capture left on
      // the card sends the next touch here instead of to Pass to Next Player,
      // which costs the player a tap that appears to do nothing.
      try { card.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!flipDrag) return;
      const deg = flipDrag.deg;
      flipDrag = null;
      if (Math.abs(deg) >= FLIP_COMMIT_DEG) { revealFace(deg); return; }
      // Abandoned. Spring back and take the word with it.
      card.style.transition = '';
      card.style.transform = '';
      blankBackFace();
    };
    card.addEventListener('pointerup', endDrag);
    card.addEventListener('pointercancel', endDrag);

    // Keyboard and assistive tech only. A pointer-driven click carries a
    // detail of 1 or more, so a tap falls through here and reveals nothing.
    $('flip-front').addEventListener('click', (e) => {
      if (e.detail === 0 && state.passSeq && !passSwapping) revealFace(1);
    });
  })();

  // The online card turns on the same gesture, which is why this sits here
  // rather than up with the rest of the game screen: it reads the same two
  // thresholds and inherits the same argument. A tap is inert on purpose. A
  // thumb resting on the card, or brushing it while the phone is passed
  // across a table, must not put someone's word on screen, and a card that
  // large is easy to catch by accident.
  //
  // The one difference is direction. The pass card turns once and stays
  // turned; this one goes both ways, so the drag is measured from whichever
  // face is currently up rather than always from zero.
  (function wireGamePlate() {
    const plate = $('game-plate');

    plate.addEventListener('pointerdown', (e) => {
      if (state.screen !== 'game') return;
      plateDrag = { x: e.clientX, w: plate.offsetWidth || 1, deg: 0 };
      try { plate.setPointerCapture(e.pointerId); } catch (err) {}
      plate.style.transition = 'none';
    });

    plate.addEventListener('pointermove', (e) => {
      if (!plateDrag) return;
      const deg = Math.max(-180, Math.min(180, ((e.clientX - plateDrag.x) / plateDrag.w) * 180));
      plateDrag.deg = deg;
      // Unblanked here rather than at the commit, so the word is already
      // there when the face swings past 90 degrees and becomes visible.
      if (Math.abs(deg) >= FLIP_FILL_DEG) setPlateBlank(false);
      if (!reduceMotion()) plate.style.transform = `rotateY(${(plateCovered ? 180 : 0) + deg}deg)`;
    });

    const endPlateDrag = (e) => {
      try { plate.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!plateDrag) return;
      const deg = plateDrag.deg;
      plateDrag = null;
      plate.style.transition = '';
      plate.style.transform = '';   // the class owns the resting angle again
      if (Math.abs(deg) >= FLIP_COMMIT_DEG) togglePlate();
      else setPlateBlank(plateCovered);   // abandoned: take the word back with it
    };
    plate.addEventListener('pointerup', endPlateDrag);
    plate.addEventListener('pointercancel', endPlateDrag);

    // Keyboard and assistive tech, as above: a real tap carries detail >= 1.
    // Enter and Space do not synthesise a click on a div with role=button, so
    // these two paths cannot both fire for one activation.
    plate.addEventListener('click', (e) => {
      if (e.detail === 0 && state.screen === 'game') togglePlate();
    });
    plate.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (state.screen === 'game') togglePlate();
    });
  })();

  // Putting the card away early is allowed, and counts as the five seconds
  // being over: the countdown stops and the round goes live.
  function togglePlate() {
    if (plateCovered) { setPlateCovered(false); return; }
    coverPlate();
  }

  function advancePass() {
    if (!state.passSeq || !passRevealed || passSwapping) return;
    if (isLastPassCard()) {
      // Everyone has seen their card. Empty and turn it back first, so the
      // round screen is never reached with a word still sitting behind it.
      resetCard();
      finishPassSequence();
      return;
    }
    passSwapping = true;
    blankBackFace();            // gone the instant they tap, before the fade
    const scene = $('pass-scene');
    scene.classList.add('swapping');
    setTimeout(() => {
      resetCard();              // turned back where nobody can see it happen
      state.passSeq.idx++;
      renderPassCard();
      scene.classList.remove('swapping');
      passSwapping = false;
    }, reduceMotion() ? 0 : PASS_SWAP_MS);
  }

  // This one button is the only place in either game where a tap follows
  // straight after a drag, and on Android that is enough to lose it. The
  // swipe ends in Chrome's gesture pipeline, and a tap arriving while that
  // is still settling gets swallowed there: the touch still produces
  // pointerdown and pointerup, so the button lights up under the thumb, but
  // no click is ever generated and the phone appears to ignore the press.
  // Waiting a beat and tapping again works, which is exactly what people
  // reported. iOS does not do this, which is why it only showed up on a
  // Pixel.
  //
  // So the tap is recognised from the pointer events themselves, the same
  // way the roster controls are, and click is left wired up for keyboard and
  // assistive tech. Whichever arrives first wins: advancePass() sets
  // passSwapping (or clears passSeq) before it returns, so a click landing
  // behind its own pointerup finds the guard shut and does nothing.
  // A tap acted on at pointerup still produces a click a moment later, and by
  // then the screen has changed under the finger, so that click lands on
  // whatever is now there. In the draw game this put Reveal Impostor's click
  // onto Play Again and bounced the group back to the lobby. Here the geometry
  // is only just in our favour: the Start Playing tap point clears the round
  // screen's Reveal button by 7px at 812 tall and 14px at 600, which is far
  // too thin to rely on across real phones, and the cost of it landing is the
  // whole round revealed the instant the last card is passed.
  //
  // So the click belonging to a tap we have already handled is swallowed
  // wherever it lands. Capture phase, one-shot, short window.
  const TAP_CLICK_WINDOW_MS = 500;

  function swallowTapClick() {
    const stop = () => {
      clearTimeout(timer);
      document.removeEventListener('click', onClick, true);
    };
    const onClick = (e) => { e.stopPropagation(); e.preventDefault(); stop(); };
    const timer = setTimeout(stop, TAP_CLICK_WINDOW_MS);
    document.addEventListener('click', onClick, true);
  }

  // Was inline on the Pass button alone. Promoted to a helper when the same
  // symptom was reported on "Go to Lobby", which is not part of Pass the Phone
  // at all: the share screen scrolls, so that button is also routinely tapped
  // straight after a drag. The bug was never about this mode, only first seen
  // in it.
  function wireTap(btn, fn) {
    if (!btn) return;
    let tap = null;

    btn.addEventListener('pointerdown', (e) => {
      tap = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // Capture, so the release comes back here even if the card's flip
      // projects over the button on a short screen mid-animation.
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    });

    btn.addEventListener('pointerup', (e) => {
      const start = tap;
      tap = null;
      try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!start || e.pointerId !== start.id) return;
      if (Math.abs(e.clientX - start.x) > TAP_SLOP ||
          Math.abs(e.clientY - start.y) > TAP_SLOP) return;
      if (btn.disabled) return;
      swallowTapClick();
      fn();
    });

    btn.addEventListener('pointercancel', () => { tap = null; });

    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      fn();
    });
  }

  wireTap($('btn-pass-next'), advancePass);

  function finishPassSequence() {
    state.passSeq = null;
    // Back to row one, so nothing downstream reads a state.myId left pointing
    // at whoever happened to be last in the roster.
    state.myId = state.players.length ? state.players[0].id : null;
    enterPassRound();
  }

  // ---- The round itself ----
  // Online, every player keeps their own card up for the whole round. On one
  // phone that is impossible: the phone goes on the table and whatever is on
  // it is visible to everyone, so it cannot be a card. This screen is names
  // and nothing else.
  function enterPassRound() {
    const list = $('pass-round-players');
    list.innerHTML = '';
    state.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = avatarHtml(p) + `<div class="player-name">${escapeHtml(p.name)}</div>`;
      list.appendChild(row);
    });
    // Always the host's wording: on one phone whoever is holding it speaks
    // for the whole group, and quitting ends the round for all of them.
    $('pass-round-quit-btn').textContent = t('lobby.quit-game');
    go('pass-round');
    startPassRoundClock();
  }

  $('btn-pass-reveal').addEventListener('click', () => {
    if (state.local) revealImposter();
  });

  // Play Again returns to the lobby rather than dealing on the spot, the same
  // as the room game does. Between rounds is when a group swaps a category,
  // adds someone who has just turned up or changes the impostor count, and
  // the lobby is the only place those controls exist.
  function replayLocalRound() {
    closeRoundPopups();
    disarmPassBackTrap();  // the lobby has its own way out again
    const meta = state.meta || (state.meta = {});
    meta.phase = 'lobby';
    meta.imposterIds = null;
    meta.secretWord = null;
    meta.imposterHint = null;
    state.players.forEach(p => { p.isImposter = false; });
    state.editingId = null;
    enterLobby();
  }

  // Back is the one gesture that would otherwise walk onto the card just
  // handed over, so for the length of the sitting it does nothing at all.
  // Every intercepted press re-pushes the entry it consumed, which keeps the
  // history length flat however many times it happens.
  //
  // It stays armed past the last card, through the round and the reveal,
  // because none of it is written down anywhere: a stray back swipe on a
  // phone lying on the table would take the whole round with it. Every screen
  // it covers has a button that moves forward, and leaving the sitting
  // disarms it.
  //
  // Disarming leaves the pushed entry behind rather than unwinding it:
  // history.back() is asynchronous, so a round started before it landed would
  // arm the trap over an entry that was about to vanish. Instead, arming
  // checks whether the marker is already the current entry and only pushes
  // when it is not. Rounds two and three of a sitting cost nothing, and the
  // one case that does push again is the one that needs it, where the player
  // used up the marker with a back press while the trap was down.
  let passTrapArmed = false;

  function markerOnTop() {
    return !!(history.state && history.state.passCard);
  }

  function armPassBackTrap() {
    passTrapArmed = true;
    if (!markerOnTop()) history.pushState({ passCard: true }, '', location.href);
  }

  function disarmPassBackTrap() {
    passTrapArmed = false;
    // And take the marker back off the stack. Left there, the first back press
    // after the round is spent popping it and appears to do nothing, which is
    // its own small betrayal of a button. Guarded on the marker being ours and
    // on top, so this can never walk off the page. The popstate this fires
    // finds the trap already disarmed and does nothing.
    if (markerOnTop()) history.back();
  }

  window.addEventListener('popstate', () => {
    if (!passTrapArmed) return;
    history.pushState({ passCard: true }, '', location.href);
    showToast(state.passSeq ? t('toast.finish-passing') : t('toast.tap-quit'));
  });

  // ============================================================
  // REVEAL — host-only button on the card screen
  // ============================================================
  $('btn-reveal').addEventListener('click', () => {
    fbForceReveal();
  });

  // ============================================================
  // THE BALLOT  (#245)
  // Only the clue board votes. A round on one phone, and a classic online
  // round, are argued out loud and settled by the host pressing Reveal: the
  // room is already talking, and a ballot would be a worse version of the
  // conversation it is having.
  //
  // Votes live at rooms-word/<code>/votes/<voterId>/<targetId> = true. A set,
  // not a name, because this game deals up to five impostors and a ballot
  // holds one pick each. Voting opens by itself when the board is full and
  // closes when every ballot is; in between anyone may change their mind, and
  // nothing is tallied on screen until the reveal.
  // ============================================================

  // '<phase>:<deadline>' already written, so two clients cannot race the same
  // transition and the host cannot write it twice.
  let phaseGuard = '';

  // How many names this round asks for. Read off the deal rather than off the
  // lobby stepper: a round dealt two impostors keeps asking for two even if
  // the number underneath it is edited while the round runs. Since #266 the
  // deal publishes the count and not the names, so this is the one part of it
  // the room may know before the reveal.
  function ballotSize() {
    const dealt = (state.meta && state.meta.dealtImposters) || 0;
    return dealt || state.numImposters || 1;
  }

  // Who this voter has accused. Self-votes are dropped here rather than
  // trusted not to exist: the write guards against one, and so does this.
  function picksOf(voterId) {
    const v = (state.votes || {})[voterId];
    if (!v) return [];
    return Object.keys(v).filter(id => v[id] && id !== voterId);
  }

  function fbCastVote(targetId) {
    if (!db || !state.roomCode || !state.myId) return;
    if (!state.meta || state.meta.phase !== 'vote') return;
    if (!targetId || targetId === state.myId) return;   // never vote for yourself
    const n = ballotSize();
    const mine = picksOf(state.myId);
    const base = `rooms-word/${state.roomCode}/votes/${state.myId}`;
    const fail = () => showToast(t('error.save-vote'));

    // One impostor is a radio button: tapping another name moves your vote
    // there. Making the round most rooms actually play ask you to untap
    // first, in order to serve the round they rarely play, would be the
    // wrong trade.
    if (n === 1) {
      if (mine[0] === targetId) return;
      set(ref(db, base), { [targetId]: true }).then(touchRoom).catch(fail);
      return;
    }

    // Several names is a set, so a tap toggles. A full ballot refuses the
    // next pick rather than dropping the oldest, because a silent swap is how
    // somebody ends up having voted for a person they never chose.
    if (mine.includes(targetId)) {
      set(ref(db, `${base}/${targetId}`), null).then(touchRoom).catch(fail);
      return;
    }
    if (mine.length >= n) { showToast(t('vote.max-picks', { count: n })); return; }
    set(ref(db, `${base}/${targetId}`), true).then(touchRoom).catch(fail);
  }

  // A half ballot is not a vote. With two names to give, one pick says the
  // player is still deciding, so the room waits. Only players still here are
  // waited on: somebody who closed their tab is owed nothing.
  function everyonePresentVoted() {
    if (state.players.length < 2) return false;
    const n = ballotSize();
    return state.players.every(p => picksOf(p.id).length >= n);
  }

  // Host only, so the write happens once.
  function fbCloseVote() {
    if (!db || !state.isHost || !state.roomCode) return;
    if (!state.meta || state.meta.phase !== 'vote') return;
    if (phaseGuard === 'vote-closed') return;
    phaseGuard = 'vote-closed';
    update(ref(db, `rooms-word/${state.roomCode}/meta`), {
      phase: 'reveal',
      revealAt: nowSync() + REVEAL_MS,
      lastActivity: serverTimestamp(),
    }).catch(() => { phaseGuard = ''; });
  }

  // The reveal's own clock. The deadline is a stamp in meta, so every client
  // counts down to the same instant, and only the host writes what happens at
  // the end of it.
  function startPhaseClock() {
    stopPhaseClock();
    state.phaseTimer = setInterval(phaseTick, 250);
    phaseTick();
  }

  function stopPhaseClock() {
    if (state.phaseTimer) { clearInterval(state.phaseTimer); state.phaseTimer = null; }
  }

  function secondsLeft(at) {
    if (typeof at !== 'number' || !at) return null;
    return Math.max(0, Math.ceil((at - nowSync()) / 1000));
  }

  function phaseTick() {
    const m = state.meta;
    if (!m || m.phase !== 'reveal') return;
    renderRevealCount(secondsLeft(m.revealAt));
    if (state.isHost && m.revealAt && nowSync() > m.revealAt) fbFinishReveal(m.revealAt);
  }

  function fbFinishReveal(deadline) {
    if (!db || !state.roomCode) return;
    const key = 'tally:' + deadline;
    if (phaseGuard === key) return;
    phaseGuard = key;
    // Two steps now, because the answer has to be fetched before it can be
    // published (#266). The guard above is set first and covers both, so the
    // 250ms ticker cannot start a second pair while this one is in the air.
    revealUpdate()
      .then(u => update(ref(db, `rooms-word/${state.roomCode}/meta`), u))
      .catch(() => { phaseGuard = ''; });
  }

  // Who got how many, across every pick on every ballot. A vote cast by
  // somebody who has since left still counts: it was cast.
  function tallyVotes() {
    const counts = new Map();
    Object.keys(state.votes || {}).forEach(voter => {
      picksOf(voter).forEach(target => {
        counts.set(target, (counts.get(target) || 0) + 1);
      });
    });
    return counts;
  }

  // The room accuses the N highest and only wins by pinning it on all of
  // them. Three ways to lose besides accusing the wrong people:
  //
  //   - a tie ON the cut line. More names level than there are slots left
  //     means the room never actually agreed who, so the impostors walk.
  //   - fewer than N names on the board at all.
  //   - nobody voted.
  //
  // `right` is how many of the accused were impostors. The win stays binary;
  // that number only feeds the screen, because getting one of two is a near
  // miss and worth being told about.
  function voteOutcome() {
    const counts = tallyVotes();
    const impIds = new Set(Object.keys((state.meta && state.meta.imposterIds) || {}));
    const n = ballotSize();
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { caught: false, tied: false, votes: 0, accused: [], right: 0, total: n };
    const short = ranked.length < n;
    const tied = !short && !!ranked[n] && ranked[n][1] === ranked[n - 1][1];
    const accused = ranked.slice(0, n).map(([id]) => id);
    const right = accused.filter(id => impIds.has(id)).length;
    return { caught: !short && !tied && right === n, tied, votes: ranked[0][1], accused, right, total: n };
  }

  // ============================================================
  // THE VOTE SCREEN
  // ============================================================

  // The handover overlay. The ballot is built and live underneath it the
  // whole two seconds, so they cost nothing and the rows are ready the
  // instant it lifts.
  let voteIntroTimer = null;

  function hideVoteIntro() {
    if (voteIntroTimer) { clearTimeout(voteIntroTimer); voteIntroTimer = null; }
    const el = $('vote-intro');
    if (el) el.classList.remove('active');
  }

  function enterVoteScreen() {
    stopTurnTicker();
    closeComposer();
    stopTyping();
    closeRoundPopups();
    go('vote');
    renderVote();
    renderVoteClock(nowSync());
    hideVoteIntro();
    // A paused animation holds its first frame, so an overlay put up on a tab
    // nobody is looking at would still be there when they came back. The
    // timer takes it down either way, and a tab that was away lands straight
    // on the ballot (#254).
    if (!document.hidden) $('vote-intro').classList.add('active');
    voteIntroTimer = setTimeout(hideVoteIntro, VOTE_INTRO_MS);
  }

  // The board, as evidence. Read-only and never animated: these rows have
  // been on screen for a whole round already.
  function renderVoteEvidence() {
    const board = $('vote-board');
    if (!board) return;
    board.innerHTML = '';
    // Grouped and in play order, the same as the live board. Nothing is
    // marked fresh here: every clue on this screen is equally old evidence
    // by the time anybody votes on it (#258).
    clueGroups().forEach(g => board.appendChild(clueRowNode(g, { plain: true })));
  }

  function renderVote() {
    const listEl = $('vote-list');
    if (!listEl) return;
    renderVoteEvidence();
    // One pick per impostor in the round. Everything on this screen counts
    // against that number: which rows are lit, who has finished, and what the
    // heading and the card's first line say.
    const n = ballotSize();
    const mine = picksOf(state.myId);
    const picked = new Set(mine);
    // Everyone who was dealt in, in play order. A player who has since left
    // stays on the list: if the impostor rage-quit, the room still has to be
    // able to pin it on them.
    const ids = (turnOrder().length ? turnOrder() : state.players.map(p => p.id))
      .filter(id => id !== state.myId);

    listEl.innerHTML = '';
    // The instruction is the card's first line, so it sits with the names it
    // is about (#279). Built with the rows, because clearing the card clears it.
    const cue = document.createElement('div');
    cue.className = 'vote-cue';
    cue.id = 'vote-cue';
    cue.textContent = plural('vote.choose', n);
    listEl.appendChild(cue);
    ids.forEach(id => {
      const known = playerMemo.get(id) || {};
      const here = !!playerById(id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'vote-row'
        + (picked.has(id) ? ' is-picked' : '')
        + (here ? '' : ' is-gone');
      row.setAttribute('aria-pressed', picked.has(id) ? 'true' : 'false');
      row.insertAdjacentHTML('beforeend',
        avatarHtml({ av: known.av, name: known.name || t('player.generic') }));
      const name = document.createElement('span');
      name.className = 'vote-name';
      name.textContent = known.name || t('player.generic');
      // Says they have finished their ballot. Never says who is on it, and
      // never that they are part way through it either: with two names to
      // give, a half-filled ballot on screen would be a tell.
      //
      // It rides beside the name rather than at the far end of the row,
      // because the far end is the box and the box is about you. Inline, so a
      // long name wraps and the tag follows it rather than squaring up to it
      // (#245).
      if (picksOf(id).length >= n) {
        name.insertAdjacentHTML('beforeend',
          '<span class="vote-tag">' + escapeHtml(t('vote.voted')) + '</span>');
      }
      row.appendChild(name);

      // The box is the whole of the picked state a thumb is aiming at. The
      // row still carries aria-pressed, so nothing here has to be read out.
      row.insertAdjacentHTML('beforeend',
        '<span class="tickbox" aria-hidden="true">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</span>');
      row.addEventListener('click', () => fbCastVote(id));
      listEl.appendChild(row);
    });

    const eligible = state.players.length;
    // A ballot counts once it is full, which is what the room is waiting on.
    const cast = state.players.filter(p => picksOf(p.id).length >= n).length;
    // The heading and the card's first line both carry the count: nothing
    // else says how many names the room owes.
    $('vote-title').textContent = plural('vote.heading', n);
    $('vote-back-btn').textContent = state.isHost ? t('lobby.quit-game') : t('lobby.leave-room');

    // The same line for the host as for everyone. The host used to get a
    // Reveal early button here, for a room waiting on somebody who had
    // stopped playing; the vote's own clock does that job now (#275).
    $('vote-hint').textContent = t('vote.hint-player', { cast, total: eligible });
  }

  // ============================================================
  // THE REVEAL COUNTDOWN
  // Three seconds holding one question and one numeral. Deliberately empty:
  // anything else to read here would be read instead of felt.
  // ============================================================
  function enterRevealCountdown() {
    stopTurnTicker();
    hideVoteIntro();
    closeRoundPopups();
    // The reveal is the one thing the whole round was for, so a sheet that is
    // up closes once here. The pill stays, and a tap brings the sheet back.
    // A side column on a wide screen covers nothing and stays open (#286).
    if (roomChat && roomChat.isOpen() && !document.body.classList.contains('chat-side')) roomChat.close();
    $('reveal-suspense').textContent = plural('reveal.impostor-is', ballotSize());
    go('reveal');
    renderRevealCount(secondsLeft(state.meta && state.meta.revealAt));
    startPhaseClock();
  }

  function renderRevealCount(left) {
    $('reveal-count').textContent = left == null ? '' : String(left);
  }

  // Who voted for whom, in play order so it reads the same on every screen.
  function renderBallot() {
    const listEl = $('ballot-list');
    if (!listEl) return;
    const votes = state.votes || {};
    // Anyone who voted and then left is appended rather than dropped: their
    // vote counted, so it has to be shown.
    const ids = turnOrder().length ? turnOrder().slice() : state.players.map(p => p.id);
    Object.keys(votes).forEach(id => { if (!ids.includes(id)) ids.push(id); });

    listEl.innerHTML = '';
    ids.forEach(id => {
      const voter = playerMemo.get(id) || {};
      const targets = picksOf(id);
      const row = document.createElement('div');
      row.className = 'ballot-row' + (targets.length ? '' : ' is-blank');
      row.insertAdjacentHTML('beforeend',
        avatarHtml({ av: voter.av, name: voter.name || t('player.generic') }));

      const who = document.createElement('span');
      who.className = 'ballot-voter';
      const whoName = document.createElement('span');
      whoName.className = 'ballot-name';
      const voterName = voter.name || t('player.generic');
      whoName.textContent = id === state.myId
        ? t('player.you-lower', { name: voterName }) : voterName;
      who.appendChild(whoName);
      row.appendChild(who);

      if (targets.length) {
        row.insertAdjacentHTML('beforeend',
          '<svg class="ballot-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
        // One line per pick, stacked. Wrapping them along the row instead
        // would let a second name land under the voter's own, which reads as
        // if they had voted for themselves.
        const picks = document.createElement('span');
        picks.className = 'ballot-picks';
        targets.forEach(targetId => {
          const target = playerMemo.get(targetId) || {};
          const pickRow = document.createElement('span');
          pickRow.className = 'ballot-pick';
          pickRow.insertAdjacentHTML('beforeend',
            avatarHtml({ av: target.av, name: target.name || t('player.generic') }));
          const pick = document.createElement('span');
          pick.className = 'ballot-target';
          pick.textContent = target.name || t('player.generic');
          pickRow.appendChild(pick);
          picks.appendChild(pickRow);
        });
        row.appendChild(picks);
      } else {
        const none = document.createElement('span');
        none.className = 'ballot-target is-none';
        none.textContent = t('ballot.did-not-vote');
        row.appendChild(none);
      }
      listEl.appendChild(row);
    });
  }

  // Only players who were actually named get a row. A column of zeroes tells
  // nobody anything and pushes the buttons off a phone screen.
  function renderTally() {
    const el = $('tally-list');
    if (!el) return;
    const counts = tallyVotes();
    const impIds = new Set(Object.keys((state.meta && state.meta.imposterIds) || {}));
    el.innerHTML = '';
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'tally-empty';
      empty.textContent = t('tally.empty');
      el.appendChild(empty);
      return;
    }
    rows.forEach(([id, n]) => {
      const known = playerMemo.get(id) || {};
      const row = document.createElement('div');
      row.className = 'tally-row' + (impIds.has(id) ? ' is-imposter' : '');
      row.insertAdjacentHTML('beforeend',
        avatarHtml({ av: known.av, name: known.name || t('player.generic') }));
      const name = document.createElement('span');
      name.className = 'tally-name';
      const tallyName = known.name || t('player.generic');
      name.textContent = id === state.myId
        ? t('player.you-lower', { name: tallyName }) : tallyName;
      const count = document.createElement('span');
      count.className = 'tally-count';
      count.textContent = plural('tally.votes', n);
      row.appendChild(name);
      row.appendChild(count);
      el.appendChild(row);
    });
  }

  $('vote-back-btn').addEventListener('click', openQuitConfirm);

  // "Ann", "Ann and Bob", "Ann, Bob and Cara". The old " & " join was written
  // when a round had one impostor and occasionally two; the wider tiers allow
  // five, and four ampersands on one big serif line read as a formula rather
  // than a sentence. Intl.ListFormat now owns the joining, which is what
  // gets Spanish its "y"/"e" alternation for free (#134).

  function revealImposter() {
    stopAllTimers();
    detachClueListener();
    hideVoteIntro();
    disarmPassBackTrap();   // this screen has btn-home; back can mean back again
    const meta = state.meta || {};
    // In a room, read the ids rather than the player list: an impostor who
    // closed their tab is already gone from players/, and the room still has
    // to be told who it was (#245). Pass the Phone reads the list, because
    // the memo is filled from room snapshots and a shared phone has none.
    const ids = Object.keys(meta.imposterIds || {});
    const imposters = state.players.filter(p => p.isImposter);
    // No "(YOU)" in Pass the Phone: local players carry isMe false, because
    // on a shared phone there is no you.
    const names = state.local
      ? imposters.map(p => p.name)
      : ids.map(id => {
        const known = playerMemo.get(id);
        const name = (known && known.name) || t('player.someone');
        if (id === state.myId) return t('over.you-suffix', { name });
        return playerById(id) ? name : t('player.left-room', { name });
      });
    const dealt = state.local ? imposters.length : ids.length;
    $('reveal-name').textContent = list(names) || '—';
    // The line above the names is one string per plural form, not a noun and
    // a verb slotted into fixed spans: Spanish has to agree the article too.
    $('reveal-line').innerHTML = plural('over.impostor-was', dealt);
    $('reveal-word').textContent = meta.secretWord || '—';

    // The verdict belongs to the clue board alone. A shared phone and a
    // classic online round settle it out loud, so this screen keeps its
    // plain heading and reports no vote it never held (#245).
    const ballot = state.mode === 'clue' && !state.local;
    if (ballot) {
      const outcome = voteOutcome();
      // The headline is the same for the room, but the party popper is not:
      // the impostor wins precisely when the room loses, so it goes to
      // whoever is on the winning side of this screen.
      const amImposter = ids.includes(state.myId);
      const iWon = outcome.caught ? !amImposter : amImposter;
      $('verdict-title').textContent =
        (outcome.caught ? t('over.caught') : plural('over.got-away', dealt))
        + (iWon ? ' 🎉' : '');
      // The win is binary: naming one of two impostors loses the round. The
      // near miss is still said out loud, because a room that got one is not
      // the same room as one that got neither.
      $('verdict-sub').textContent =
        outcome.caught ? plural('over.sub-caught', dealt)
        : !outcome.votes ? plural('over.sub-nobody', dealt)
        : outcome.tied ? plural('over.sub-tied', dealt)
        : outcome.right ? t('over.sub-partial', { right: outcome.right, total: outcome.total })
        : plural('over.sub-wrong', dealt);
      renderTally();
      renderBallot();
    } else {
      $('verdict-title').textContent = t('over.round-over');
      $('verdict-sub').textContent = '';
    }
    $('over-tally-section').style.display = ballot ? '' : 'none';
    $('over-ballot-section').style.display = ballot ? '' : 'none';
    $('btn-replay').style.display = state.isHost ? '' : 'none';
    // An online game's result screen counts down to the next round, or to
    // the room closing when nobody played (#275). The ticker keeps it going.
    if (ballot) {
      setClock('over-clock', meta.overAt, nowSync(),
        meta.emptyRound ? 'clock.closes-in' : 'clock.next-round-in');
    } else {
      hideClock('over-clock');
    }
    // "Exit Room" would be wrong in Pass the Phone, where there is no room to
    // exit. state.isHost is true for the whole of that mode, so it already
    // lands on the right label.
    $('btn-home').textContent = state.isHost ? t('over.quit-game') : t('over.exit-room');
    countRoundAndMaybePrompt();
    go('over');
  }

  // ============================================================
  // GAME OVER
  // ============================================================
  $('btn-replay').addEventListener('click', () => {
    if (state.local) { replayLocalRound(); return; }
    fbReplay();
  });

  $('btn-home').addEventListener('click', () => {
    leaveRoom();
  });

  // ============================================================
  // QUITTING MID-ROUND  (#144)
  // ============================================================
  // Until now the only way off a live round was the host revealing, or the
  // browser's back button, which dropped a player out with no warning. Both
  // playing screens now carry the lobby's own Quit control, in the lobby's
  // own corner, and it asks first — because what it costs depends entirely
  // on who is pressing it. leaveRoom() deletes the whole room for a host and
  // removes one player for anybody else, and neither is obvious from a
  // button that just says Quit.
  // The sheet itself is generic: title, body, one confirm button. Quitting
  // was the first thing to need it (#146) and the cross-language join is the
  // second (#138), so the action is a callback rather than being wired to
  // leaveRoom. A second sheet with the same markup would be the same
  // component twice, which is how two dialogs drift apart.
  let confirmAction = null;

  // Cancel can do something too: the language dialog offers a real choice,
  // where quitting only offers "never mind".
  let confirmCancelAction = null;

  function openConfirm({ title, body, go, onGo, onCancel }) {
    $('quit-modal-title').textContent = title;
    $('quit-modal-body').textContent = body;
    $('quit-modal-go').textContent = go;
    confirmAction = onGo;
    confirmCancelAction = onCancel || null;
    $('quit-modal-backdrop').classList.add('open');
  }

  function closeConfirm() {
    $('quit-modal-backdrop').classList.remove('open');
    const onCancel = confirmCancelAction;
    confirmAction = null;
    confirmCancelAction = null;
    if (onCancel) onCancel();
  }

  function openQuitConfirm() {
    const local = state.local;
    const host = state.isHost;
    openConfirm({
      title: (local || host) ? t('quit.title-host') : t('quit.title-player'),
      body: local ? t('quit.body-local') : host ? t('quit.body-host') : t('quit.body-player'),
      go: (local || host) ? t('quit.go-host') : t('quit.go-player'),
      onGo: leaveRoom,
    });
  }

  $('game-quit-btn').addEventListener('click', openQuitConfirm);
  $('clues-quit-btn').addEventListener('click', openQuitConfirm);
  $('pass-round-quit-btn').addEventListener('click', openQuitConfirm);

  // ---- The clue composer ----
  $('clue-input').addEventListener('input', () => {
    // maxlength already stops a 31st character being typed or pasted, but a
    // paste on some Android keyboards arrives past it, so the value is cut
    // here too rather than trusted to the attribute.
    const el = $('clue-input');
    if (el.value.length > CLUE_MAX) el.value = el.value.slice(0, CLUE_MAX);
    syncClueSend();
  });
  $('clue-composer').addEventListener('submit', (e) => {
    e.preventDefault();
    submitClue();
  });
  // Off once it has played, so a later reflow cannot replay the arrival.
  $('clue-dock').addEventListener('animationend', (e) => {
    if (e.target !== $('clue-dock')) return;
    clearTimeout(arrivalTimer);
    $('clue-dock').classList.remove('is-arriving');
  });
  // The box is fluid, so its perimeter changes with the viewport and the dash
  // has to be measured again or the countdown stops matching the outline. An
  // observer rather than a resize listener: it also catches a rotation, a
  // font swapping in late, and the keyboard reshaping the layout viewport,
  // and it says nothing at all while the field is away.
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (!$('clue-dock').hidden) fitClueRing(false);
    }).observe($('clue-composer'));
  }
  $('quit-modal-cancel').addEventListener('click', closeConfirm);
  $('quit-modal-go').addEventListener('click', () => {
    const run = confirmAction;
    confirmCancelAction = null;   // confirming is not cancelling
    confirmAction = null;
    $('quit-modal-backdrop').classList.remove('open');
    if (run) run();
  });
  $('quit-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirm();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('quit-modal-backdrop').classList.contains('open')) closeConfirm();
  });

  // ============================================================
  // BACK BUTTONS
  // ============================================================
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      leaveRoom();
    });
  });

  // ============================================================
  // ANALYTICS  (cookie-free, aggregate counters in our own DB)
  // ------------------------------------------------------------
  // We never store IPs or any per-user identifier — only incrementing
  // aggregate counts, which is why this needs no consent banner. Everything
  // lives under analytics/<GAME>/ so a second game gets its own bucket, and
  // is split into two clearly-separated subtrees:
  //
  //   visits/  — someone OPENED the app (one per browser tab)
  //     visits/total
  //     visits/countries/<ISO code>
  //     visits/daily/<YYYY-MM-DD>/{count, countries/<ISO code>}
  //
  //   games/   — a 3+ player game was PLAYED (every play/replay counts)
  //     games/total
  //     games/countries/<ISO code>          (the host's country)
  //     games/categories/<name>, games/words/<word>
  //     games/modes/{online,clue,passphone} (which way the group played)
  //     games/players/<n>                   (group size, lifetime only)
  //     games/langs/<lang>                  (the language it was played in)
  //     games/daily/<YYYY-MM-DD>/{count, countries/<ISO code>, categories/<name>, words/<word>, modes/<mode>, langs/<lang>}
  //     games/bylang/<lang>/{countries/<ISO code>, categories/<name>}
  //     games/daily/<YYYY-MM-DD>/bylang/<lang>/{...}   (#196: the same
  //       dimensions crossed with language, so the stats page can filter.
  //       Counts come from langs/<lang>, which goes back further.)
  //
  // The room funnel (rooms/*, joins/*) is DELIBERATELY SILENT in Pass the
  // Phone, and that is not a gap to be fixed later. There is no room and
  // nobody joins, so firing those stages would count rooms that were never
  // created and joins that never happened, which is exactly what would
  // corrupt the funnel gaps. games/modes/* is what tells the two apart, and
  // it is why every games/* number should be read against a mode split
  // rather than assumed to be online play.
  //
  // One exception worth knowing: rooms/created DOES fire for a Pass the Phone
  // sitting, because the mode picker lives in the lobby and reaching the lobby
  // genuinely creates a room, which is then deleted at the switch. Only the
  // later stages are skipped. Toggling the picker back to online mints another
  // room and fires created again, so an undecided host can bank several.
  // Net effect: created counts lobbies reached, not sittings played, and
  // created-to-started conversion sags as Pass the Phone grows without
  // anything having got worse. Read it against games/modes/*.
  //
  // None of this is on the dashboard; the room funnel is Firebase Console only.
  //
  // Player names never leave the device in either mode.
  // ============================================================

  // analyticsEnabled / safeKey / todayKey / geo / bumpAnalytics /
  // trackError / trackSession / bumpFbPrompt all live in
  // shared/analytics.js now (createAnalytics(GAME) near the top of this
  // file binds them to analytics/word). Only game-specific trackers
  // remain below.

  // Logged once per round by the host only (single source of truth).
  // A round only starts with MIN_PLAYERS (3+) in the room, so each call here
  // means "a real game was played" — and every play/replay counts. The host's
  // country is recorded under games/countries/* so you can see where games
  // actually happen, separate from visits/* which counts app opens.
  async function trackRound(category, word) {
    if (!analyticsEnabled()) return;
    const players = state.players.length;
    // A room's mode is the room's, so it is read from meta rather than from
    // the picker; Pass the Phone has no room and is known by state.local.
    const mode = state.local ? 'passphone' : roomMode();
    // Run length works in both modes: it only needs the group size, which a
    // passed phone knows as well as a room does.
    trackRun(players);
    // Last stage of the room funnel. Hooked here rather than in fbStartGame
    // because every successful start path already funnels through this one
    // call, so the two can never drift apart.
    //
    // Rooms only, on purpose. See the funnel note in the header above: a
    // Pass the Phone round never created a room, so counting it as one would
    // put a started stage under a room that does not exist. Asked as "is there
    // a room" rather than "is the mode online", so a second room mode counts
    // without having to be remembered here (#243).
    if (!state.local) trackRoomStage('started');
    const day = todayKey();
    const cat = safeKey(category);
    const wrd = safeKey(word);
    const u = {
      // Which language this round was played in (#140). See gameLangPaths
      // in shared/analytics.js for why it is a segment and not a namespace.
      ...gameLangPaths(day),
      'games/total': 1,
      [`games/categories/${cat}`]: 1,
      [`games/words/${wrd}`]: 1,
      [`games/modes/${mode}`]: 1,
      // Lifetime only. Group size shifts slowly and is read as a
      // distribution, so a daily copy would grow the daily node for nothing.
      [`games/players/${Math.min(players, 99)}`]: 1,
      [`games/daily/${day}/count`]: 1,
      [`games/daily/${day}/categories/${cat}`]: 1,
      [`games/daily/${day}/words/${wrd}`]: 1,
      [`games/daily/${day}/modes/${mode}`]: 1,
      // The same category, filtered to this round's language (#196).
      ...langCrossPaths('games', day, { categories: cat }),
    };
    // Fallback for a brand-new host who starts a round before the initial
    // geo lookup has resolved: fetch on demand so the game still gets a
    // country. Runs in the background — never blocks gameplay.
    let geo = peekGeo();
    if (!geo || !geo.cc) { try { geo = await fetchGeo(); } catch (e) {} }
    if (geo && geo.cc) {
      const cc = safeKey(geo.cc);
      u[`games/countries/${cc}`] = 1;
      u[`games/daily/${day}/countries/${cc}`] = 1;
      // The same country, filtered to this round's language (#196).
      Object.assign(u, langCrossPaths('games', day, { countries: cc }));
    }
    bumpAnalytics(u);
  }

  // ============================================================
  // INIT
  // ============================================================
  if (!FB_CONFIGURED) {
    setTimeout(() => showToast(t('error.firebase-setup'), 4500), 800);
  }
  // When the screen/tab comes back, re-assert presence immediately rather
  // than waiting for the .info/connected listener to catch up. (We do NOT
  // remove the player on hide — onDisconnect handles real disconnects
  // server-side, and removing on hide is what kicked players out.)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.roomCode && state.myId) {
      refreshPresence();
      acquireWakeLock(); // the lock auto-releases when hidden; re-grab on return
    }
  });
  trackSession();
  go('home');

  // Deep link: a QR/shared URL like ?join=QW7T drops the visitor straight
  // into the join flow. We validate + route via the same path as manual entry.
  function routeJoinCode(raw, source) {
    if (!raw) return;
    joinSource = source || 'link';
    const code = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length === 4 && FB_CONFIGURED && db) attemptCodeValidation(code, source === 'online');
  }

  // Which sharing method produced this URL. The QR image encodes s=qr, and
  // shared/roomlookup.js adds via=<game> when it forwards a code that turned
  // out to belong to a different game. Anything else is a shared link.
  function linkSource(params) {
    if (params.get('s') === 'qr') return 'qr';
    // A card on /online links here with s=online (#269, #271).
    if (params.get('s') === 'online') return 'online';
    if (params.get('via')) return 'crossgame';
    return 'link';
  }

  // Web path: the param is in the page URL (impostorgames.com/?join=...).
  // Strip it afterwards so a refresh/back doesn't re-trigger the join.
  (function handleWebJoinDeepLink() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('join');
    if (!raw) return;
    const source = linkSource(params);
    history.replaceState(null, '', location.pathname);
    routeJoinCode(raw, source);
  })();

  // The Start a new game button on /online links here with create=online
  // (#270): the create screen, with Online already picked.
  (function handleCreateDeepLink() {
    const params = new URLSearchParams(location.search);
    if (params.get('create') !== 'online') return;
    history.replaceState(null, '', location.pathname);
    $('btn-create').click();
    setCreateOnline(true);
  })();

  // Native-app path: inside the Capacitor WebView the page loads from
  // https://localhost, so the join code never appears in location.search.
  // Instead the OS hands the tapped/scanned App Link to the @capacitor/app
  // plugin. Handle both a cold start (getLaunchUrl) and the app already
  // running (appUrlOpen). Same routeJoinCode() as the web path.
  (function handleNativeJoinDeepLink() {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App) return; // not running inside the native app
    const fromUrl = (u) => {
      try { const p = new URL(u).searchParams; return { code: p.get('join'), source: linkSource(p) }; }
      catch (e) { return { code: null, source: 'link' }; }
    };
    const route = (u) => { const r = fromUrl(u); routeJoinCode(r.code, r.source); };
    App.getLaunchUrl().then((res) => { if (res && res.url) route(res.url); }).catch(() => {});
    App.addListener('appUrlOpen', (ev) => { if (ev && ev.url) route(ev.url); });
  })();
})();
