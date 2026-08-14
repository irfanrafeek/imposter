import {
  ref, set, get, update, onValue, onDisconnect, serverTimestamp, remove, increment, push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { FB_CONFIGURED, db } from "../shared/firebase.js";
import { analyticsEnabled, safeKey, todayKey, peekGeo, fetchGeo, createAnalytics } from "../shared/analytics.js";
import { WORD_CATEGORIES, pickHint } from "../shared/words.js";
import { createPlayedStore } from "../shared/played.js";
import { mountChat } from "../shared/chat.js";
import { createSupportTransport } from "../shared/chat-support.js";
import { findRoomInOtherGames, goToGame } from "../shared/roomlookup.js";

(() => {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const COUNTDOWN_MS = 4000;
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 20;
  const DEFAULT_CATEGORY = 'Food';
  // Identifies this game inside shared infrastructure (analytics, and the
  // multi-game hub). Each game gets its own namespace, e.g.
  // analytics/word/... so games never collide.
  const GAME = 'word';
  // Canonical public URL of THIS game for shareable links (QR codes, deep
  // links). Hardcoded — NOT location.origin — so that when this same code
  // runs inside the native app (Capacitor WebView, origin https://localhost)
  // the QR a host generates still points friends at the real website.
  const SHARE_BASE = 'https://impostorgames.com/word';
  // A room with no deliberate activity for this long is considered dead:
  // the idle watchdog closes it, and createRoom will recycle its code.
  const IDLE_MS = 15 * 60 * 1000; // 15 minutes

  // How this player got the room code, for the joins counter. Typing it in
  // is the default; the deep-link handler overwrites this when the code
  // arrived in the URL instead. Set before joinRoom runs, read inside it.
  let joinSource = 'code';

  // Shared counter kit bound to this game's namespace (analytics/word).
  // Game-specific trackers (trackRound) build on these.
  const { bumpAnalytics, trackError, installGlobalErrorTracking, trackSession, bumpFbPrompt, trackRun, resetRun,
          trackRoomCreated, trackRoomStage, trackRoomStartFailed, resetRoomFunnel,
          trackJoin, trackJoinFail } = createAnalytics(GAME);
  installGlobalErrorTracking();

  // Word lists live in shared/words.js now (also used by Impostor
  // Draw). `w` is the secret word every crewmate sees; `h` is the
  // vague hint shown only to the imposter.

  // Grouped metadata for the category picker. Order here drives the
  // modal sheet layout; add a new entry under the right group to surface
  // a new category. Each `name` must match a key in WORD_CATEGORIES above.
  const CATEGORY_GROUPS = [
    {
      label: 'Categories',
      categories: [
        { name: 'Food',             description: 'Dishes, snacks, fruits and drinks' },
        { name: 'Animals',          description: 'Pets, wildlife, birds and sea creatures' },
        { name: 'Places',           description: 'Everywhere from the beach to a space station' },
        { name: 'Everyday Objects', description: 'Things lying around every home' },
        { name: 'Movies & TV',      description: 'Blockbusters, series and cartoon icons' },
        { name: 'Football',         description: 'Stars, clubs and moments from the pitch' },
        { name: 'Super Heroes',     description: 'Capes, masks and the villains chasing them' },
      ],
    },
  ];

  // Game modes. 'online' is the original game and stays the default: a room,
  // a code to share, everyone on their own phone. 'passphone' is the alternate
  // for a group with one device between them.
  //
  // The picker sits in the lobby and reuses the dance game's components, but
  // unlike dance the mode is NOT stored in meta.mode. Switching to Pass the
  // Phone deletes the room, so there is no meta left to hold it. state.mode is
  // the source of truth and resets to the room game whenever a sitting ends.
  //
  // Mode illustrations match the dance game's: square art under /icons/modes.
  const MODES = [
    {
      id: 'online',
      name: 'Everyone has a Phone',
      icon: '<img src="/icons/modes/rooms.webp" alt="" width="256" height="256" loading="lazy">',
      description: 'Everyone uses their own phone to play the game.',
    },
    {
      id: 'passphone',
      name: 'Pass the Phone',
      icon: '<img src="/icons/modes/passphone.webp" alt="" width="256" height="256" loading="lazy">',
      description: 'Everyone uses one screen to play the game.',
    },
  ];

  // Firebase keys can't contain . # $ [ ] /. Words and category names are
  // ASCII-safe today, but sanitize anyway to future-proof.
  function sanitizeKey(s) { return String(s).replace(/[.#$\[\]/]/g, '_'); }

  // Words this device has already dealt, carried across rooms so a fresh
  // room doesn't reopen with a word the group just had. See shared/played.js.
  const playedStore = createPlayedStore(GAME);

  // The host can pick several categories at once; a round draws from their
  // union. `meta.categories` is the array; older rooms (or a client mid-
  // deploy) may still carry only the single `meta.category`, so fall back to
  // that, then to the default. Names that no longer exist in the catalog are
  // dropped so a stale pick can never empty the pool.
  function activeCategories() {
    const m = state.meta;
    if (m && Array.isArray(m.categories) && m.categories.length) {
      const valid = m.categories.filter(c => WORD_CATEGORIES[c]);
      if (valid.length) return valid;
    }
    if (m && m.category && WORD_CATEGORIES[m.category]) return [m.category];
    return [DEFAULT_CATEGORY];
  }

  // Compact label for the lobby trigger/display: one name, two names, or the
  // first two plus a "+N" count so the card stays lean.
  function categoriesSummary(cats) {
    if (!cats || !cats.length) return DEFAULT_CATEGORY;
    if (cats.length === 1) return cats[0];
    if (cats.length === 2) return cats[0] + ', ' + cats[1];
    return cats[0] + ', ' + cats[1] + ' +' + (cats.length - 2);
  }

  // Pick a word from the union of the selected categories, skipping ones
  // already played in this room. The chosen entry carries its source category
  // so the caller records it under the right played bucket. When every word
  // across the union has been used, `reset` signals the caller to wipe the
  // played buckets and start the selection fresh.
  function pickWord(categoryNames, playedMap, deviceMap) {
    const cats = (categoryNames && categoryNames.length) ? categoryNames : [DEFAULT_CATEGORY];
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
    myName: '',
    numImposters: 1,
    players: [],
    meta: null,
    roomUnsub: null,
    presenceUnsub: null,
    myJoinedAt: 0,
    myReady: false,
    imposterIds: [],
    pendingJoinCode: null,
    countdownTimer: null,
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
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function go(screenId) {
    if (screenId !== 'lobby') stopHintRotation();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + screenId).classList.add('active');
    state.screen = screenId;
    document.getElementById('app').scrollTop = 0;
  }

  // ============================================================
  // ROOM OPERATIONS (Firebase)
  // ============================================================
  async function createRoom(name, numImposters) {
    if (!db) throw new Error('Firebase not configured');
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
    const joinedAt = nowSync();
    const av = pickAvatar(null);
    await set(ref(db, `rooms-word/${code}`), {
      meta: {
        hostId: myId,
        numImposters,
        category: DEFAULT_CATEGORY,
        phase: 'lobby',
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      },
      players: {
        [myId]: { name, ready: false, joinedAt, av }
      }
    });
    state.roomCode = code;
    state.myId = myId;
    state.myName = name;
    state.myAv = av;
    state.myJoinedAt = joinedAt;
    state.myReady = false;
    state.isHost = true;
    state.numImposters = numImposters;

    trackRoomCreated(); // top of the room funnel; also clears the stage dedupe

    setupPresence();
    // NOTE: the room listener is attached later, when the host taps
    // "Go to Lobby" (see btn-share-continue). Attaching it here would let
    // the lobby-phase auto-router skip the share-code screen.
  }

  async function joinRoom(code, name) {
    if (!db) throw new Error('Firebase not configured');
    const roomSnap = await get(ref(db, `rooms-word/${code}`));
    if (!roomSnap.exists() || !roomSnap.val().meta) { trackJoinFail('notFound'); throw new Error('Room not found'); }
    const room = roomSnap.val();
    const meta = room.meta;
    if (meta.phase !== 'lobby') { trackJoinFail('inProgress'); throw new Error('Game already in progress'); }
    if (Object.keys(room.players || {}).length >= MAX_PLAYERS) { trackJoinFail('full'); throw new Error('Room is full'); }

    const myId = genId();
    const joinedAt = nowSync();
    const av = pickAvatar(room.players);
    await set(ref(db, `rooms-word/${code}/players/${myId}`), {
      name, ready: false, joinedAt, av
    });
    update(ref(db, `rooms-word/${code}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
    state.roomCode = code;
    state.myId = myId;
    state.myName = name;
    state.myAv = av;
    state.myJoinedAt = joinedAt;
    state.myReady = false;
    state.isHost = false;

    trackJoin(joinSource);

    setupPresence();
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
      await set(myRef, {
        name: state.myName,
        ready: !!state.myReady,
        joinedAt: state.myJoinedAt || nowSync(),
        av: state.myAv || 0,
      });
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
  const WAKE_TIP = 'Keep your screen on to stay in the game.';
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
      try { await remove(ref(db, `rooms-word/${state.roomCode}`)); } catch (e) {}
    }, 60000);
  }
  function stopIdleWatch() {
    if (state.idleTimer) { clearInterval(state.idleTimer); state.idleTimer = null; }
  }

  function attachRoomListener() {
    startIdleWatch();
    const roomRef = ref(db, `rooms-word/${state.roomCode}`);
    state.roomUnsub = onValue(roomRef, snap => {
      const data = snap.val();
      if (!data) {
        showToast('Room closed');
        leaveRoom(true);
        return;
      }
      const meta = data.meta || {};
      const playersObj = data.players || {};
      const players = Object.entries(playersObj).map(([id, p]) => ({
        id,
        name: p.name,
        ready: !!p.ready,
        joinedAt: p.joinedAt || 0,
        av: p.av || 0,
        isHost: id === meta.hostId,
        isImposter: meta.imposterIds ? !!meta.imposterIds[id] : false,
        isMe: id === state.myId,
        isBot: false,
      })).sort((a, b) => a.joinedAt - b.joinedAt);

      const prevPhase = state.meta ? state.meta.phase : null;
      state.meta = meta;
      state.players = players;
      state.numImposters = meta.numImposters || 1;
      state.isHost = meta.hostId === state.myId;
      const meNow = players.find(p => p.isMe);
      if (meNow) state.myReady = meNow.ready;

      if (state.screen === 'lobby') renderLobby();
      const phase = meta.phase;
      if (phase !== prevPhase) {
        if (phase === 'lobby' && state.screen !== 'lobby') enterLobby();
        else if ((phase === 'countdown' || phase === 'playing') && state.screen !== 'game') beginGame();
        else if (phase === 'over' && state.screen !== 'over') revealImposter();
      }
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

    return { cats, cat: picked.cat, entry, imposterIds, hint: pickHint(entry), reset: picked.reset };
  }

  async function fbStartGame() {
    if (!db || !state.isHost || state.local) return;
    const startBtn = $('btn-start');
    const startHint = $('start-hint');
    startBtn.disabled = true;
    const prevHint = startHint.textContent;
    startHint.textContent = 'Dealing cards…';
    try {
      const deal = dealRound();
      const entry = deal.entry;
      const chosenCat = sanitizeKey(deal.cat);

      const startAt = nowSync() + COUNTDOWN_MS;

      const wKey = sanitizeKey(entry.w);
      const updates = {
        'meta/phase': 'countdown',
        'meta/startAt': startAt,
        'meta/imposterIds': deal.imposterIds,
        'meta/secretWord': entry.w,
        'meta/imposterHint': deal.hint,
        'meta/lastActivity': serverTimestamp(),
      };
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
    } catch (e) {
      trackError('round_start_failed');
      trackRoomStartFailed(); // the host pressed Start and got nothing
      showToast(e.message || 'Could not start the round');
      startBtn.disabled = false;
      startHint.textContent = prevHint;
    }
  }

  // Host ends the round: everyone's screen flips to the reveal. All the
  // clue-giving and accusations happen out loud — the app only referees
  // the cards and the reveal.
  async function fbForceReveal() {
    if (!db || !state.isHost || state.local) return;
    await update(ref(db, `rooms-word/${state.roomCode}/meta`), { phase: 'over', lastActivity: serverTimestamp() });
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
    updates['meta/lastActivity'] = serverTimestamp();
    await update(ref(db, `rooms-word/${state.roomCode}`), updates);
  }

  async function leaveRoom(skipDelete) {
    stopHintRotation();
    releaseWakeLock();
    stopAllTimers();
    closeFbPopup(false);

    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    // Cancel the pending auto-removal so it can't fire after we've left.
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`)).cancel(); } catch(e){}
    }

    if (db && state.roomCode && state.myId && !skipDelete) {
      try {
        if (state.isHost) {
          await remove(ref(db, `rooms-word/${state.roomCode}`));
        } else {
          await remove(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`));
        }
      } catch (e) { console.warn('leaveRoom cleanup failed', e); }
    }
    state.roomCode = null;
    state.myId = null;
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
    lobbySeen.clear();
    burstFired.clear();
    go('home');
  }

  function stopAllTimers() {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
    stopIdleWatch();
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
  // showCard() in particular reads meta.imposterIds[state.myId], which is why
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
    for (let i = 0; i < n; i++) out.push(`Player ${i + 2}`);
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
      if (!used.has(`Player ${i}`)) return `Player ${i}`;
    }
    return 'Player';
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
      else removeLocalPlayer(id);
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
    $('host-name').value = state.myName || '';
    go('setup');
  });

  const codeBoxes = Array.from(document.querySelectorAll('.code-box'));

  function clearCodeBoxes() {
    codeBoxes.forEach(b => { b.value = ''; b.disabled = false; });
    codeBoxes[0].focus();
  }

  function readCode() {
    return codeBoxes.map(b => b.value).join('').toUpperCase();
  }

  async function attemptCodeValidation(code) {
    if (!db) return;
    codeBoxes.forEach(b => b.disabled = true);
    try {
      const roomSnap = await get(ref(db, `rooms-word/${code}`));
      if (!roomSnap.exists() || !roomSnap.val().meta) {
        // Not our code. The player may just be standing on the wrong
        // game's page, so check the other games before giving up. Leave
        // the boxes disabled on a hit: we are navigating away.
        const hit = await findRoomInOtherGames(code, GAME);
        if (hit) {
          showToast(`That code is a ${hit.label} room. Taking you there…`);
          setTimeout(() => goToGame(hit, code, GAME), 1000);
          return;
        }
        // Counted here rather than only in joinRoom: this check is the real
        // gate, and it returns before joinRoom is ever reached. A cross-game
        // hit above is a successful redirect, not a failed join, so it is
        // deliberately not counted.
        trackJoinFail('notFound');
        showToast('No room found with that code');
        clearCodeBoxes();
        return;
      }
      const room = roomSnap.val();
      const meta = room.meta;
      if (meta.phase !== 'lobby') {
        trackJoinFail('inProgress');
        showToast('Game already in progress');
        clearCodeBoxes();
        return;
      }
      if (Object.keys(room.players || {}).length >= MAX_PLAYERS) {
        trackJoinFail('full');
        showToast('Room is full');
        clearCodeBoxes();
        return;
      }
      state.pendingJoinCode = code;
      $('join-name').value = state.myName || '';
      go('join-name');
      setTimeout(() => $('join-name').focus(), 60);
    } catch (e) {
      showToast('Could not check room: ' + (e.message || ''));
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
    if (!name) { showToast('Choose a nickname'); return; }
    $('btn-join').disabled = true;
    try {
      state.myName = name;
      await joinRoom(code, name);
      enterLobby();
    } catch (e) {
      showToast(e.message || 'Could not join');
    } finally {
      $('btn-join').disabled = false;
    }
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
    if (n >= 10) return 3;
    if (n >= 6)  return 2;
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
  async function setMode(id) {
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
      showToast('Could not create a room: ' + e.message);
      state.mode = 'passphone';
      enterLocalMode(name);
    }
    renderLobby();
  }

  // Drop this client out of its room and delete it, without the exit routing
  // leaveRoom() does. Used only by the mode switch, which stays on the lobby.
  async function teardownRoom() {
    stopIdleWatch();
    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `rooms-word/${state.roomCode}/players/${state.myId}`)).cancel(); } catch (e) {}
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
    const name = $('host-name').value.trim() || 'Host';
    $('btn-go-lobby').disabled = true;
    try {
      await createRoom(name, 1);
      showHostShare();
    } catch (e) {
      showToast('Failed to create room: ' + e.message);
    } finally {
      $('btn-go-lobby').disabled = false;
    }
  });

  // Show the share-the-code screen after a room is created, before the lobby.
  function showHostShare() {
    const code = state.roomCode || '----';
    const boxes = $('share-code-boxes');
    boxes.innerHTML = '';
    code.split('').forEach(ch => {
      const box = document.createElement('span');
      box.className = 'code-box';
      box.textContent = ch;
      boxes.appendChild(box);
    });
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

  // Lobby How-to-play popup — clones the landing-page steps (single source)
  function openHowTo() {
    const src = document.querySelector('#how-to-play .howto-steps');
    const body = $('howto-modal-body');
    if (src && body.childElementCount === 0) body.appendChild(src.cloneNode(true));
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
        const t = document.createElement('textarea');
        t.value = code; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } finally { document.body.removeChild(t); }
      }
      showToast('Room code copied');
    } catch (e) {
      showToast('Could not copy');
    }
  }

  $('share-code-boxes').addEventListener('click', copyRoomCode);
  $('share-copy-btn').addEventListener('click', copyRoomCode);
  $('btn-share-continue').addEventListener('click', () => {
    attachRoomListener(); // now safe — host is leaving the share screen for the lobby
    enterLobby();
  });

  // ============================================================
  // LOBBY
  // ============================================================
  function enterLobby() {
    stopAllTimers();
    closeFbPopup(false);
    $('lobby-code-text').textContent = state.roomCode || '----';
    renderLobby();
    go('lobby');
  }

  function renderLobby() {
    // Pass the Phone: one device, so there is no joining, no readying up and
    // nothing to share. Everyone on the roster is a player and the only gate
    // on starting is having enough of them.
    const pass = state.local;
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
      row.className = 'player-row' + (!pass && !p.isHost && p.ready ? ' ready' : '')
        + (isNew ? ' just-joined' : '') + (editing ? ' editing' : '');
      const status = (pass || p.isHost) ? '' : (p.ready ? '✓ Ready' : 'Waiting');
      const nameCell = editing
        ? `<input class="roster-input" type="text" maxlength="14" value="${escapeHtml(p.name)}"
                  autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Player name">`
        : `<div class="player-name">
             ${escapeHtml(p.name)}
             ${p.isHost ? '<span class="player-tag tag-host">Host</span>' : ''}
             ${p.isMe ? '<span class="you-pill">YOU</span>' : ''}
           </div>`;
      const trailing = editable
        ? `<div class="roster-actions">
             ${editing ? '' : `<button type="button" class="roster-btn roster-edit" aria-label="Rename ${escapeHtml(p.name)}">${PENCIL_SVG}</button>`}
             <button type="button" class="roster-btn roster-del" aria-label="Remove ${escapeHtml(p.name)}">${TRASH_SVG}</button>
           </div>`
        : `<div class="player-status">${status}</div>`;
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
      add.innerHTML = `${PLUS_SVG}<span>Add player</span>`;
      add.disabled = state.players.length >= MAX_PLAYERS;
      list.appendChild(add);
    }

    if (!reduceMotion) flipRows(list, firstRects);

    const me = state.players.find(p => p.isMe);
    const isHost = pass ? true : (me && me.isHost);
    const nonHosts = state.players.filter(p => !p.isHost);
    const readyCount = nonHosts.filter(p => p.ready).length;
    const total = state.players.length;
    const allReady = pass
      ? total >= MIN_PLAYERS
      : (total >= MIN_PLAYERS && nonHosts.length > 0 && nonHosts.every(p => p.ready));

    const mode = MODES.find(m => m.id === state.mode) || MODES[0];
    $('mode-trigger-text').textContent = mode.name;
    $('mode-trigger-icon').innerHTML = mode.icon;
    $('mode-trigger').classList.toggle('readonly', !isHost);
    // Rendered here rather than only on entering the lobby, because switching
    // back from Pass the Phone mints a NEW room without re-entering. Leaving
    // it to enterLobby left the header advertising a code that had just been
    // deleted, so sharing it silently failed with "Room not found".
    $('lobby-code-text').textContent = state.roomCode || '----';
    $('lobby-code-row').style.display = pass ? 'none' : '';
    $('lobby-code-row').parentElement.classList.toggle('solo', pass);
    $('lobby-ready-line').style.display = pass ? 'none' : '';
    $('lobby-count-line').style.display = pass ? '' : 'none';
    if (pass) $('local-player-count').textContent = total;

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

    // Imposter count stepper — controls show for host only, only when the
    // current player count unlocks a higher max (6+ → 2, 10+ → 3).
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
    $('imposter-count-label').textContent = shown === 1 ? 'Impostor' : 'Impostors';
    const showSteppers = isHost && max > 1;
    $('lobby-imp-minus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-plus').style.display = showSteppers ? '' : 'none';
    $('lobby-imp-minus').disabled = shown <= 1;
    $('lobby-imp-plus').disabled = shown >= max;

    // Back button: host dissolves the room, players only remove themselves
    $('lobby-back-btn').textContent = isHost ? '← Quit Game' : '← Leave Room';

    // Ready button: hidden for the host, and for everyone on a shared phone.
    // Hide the nudge wrapper, not the button, or its slot still eats a gap.
    $('ready-nudge').style.display = (pass || isHost) ? 'none' : '';

    // Start button: host only, all non-hosts ready, >= MIN_PLAYERS total
    $('btn-start').disabled = !(isHost && allReady);

    if (!isHost) {
      $('btn-start').style.display = 'none';
      if (total < MIN_PLAYERS) {
        setLobbyStatus(`Need ${MIN_PLAYERS - total} more player${MIN_PLAYERS - total === 1 ? '' : 's'} to start.`);
      } else if (!allReady) {
        setLobbyStatus('Waiting for everyone to ready up…');
      } else {
        setLobbyStatus('Waiting for host to start…');
      }
    } else {
      $('btn-start').style.display = '';
      if (pass) {
        setLobbyStatus(total < MIN_PLAYERS
          ? `Add ${MIN_PLAYERS - total} more player${MIN_PLAYERS - total === 1 ? '' : 's'} to start.`
          : 'Everyone gets the phone in turn. Hit start!');
      } else if (total < MIN_PLAYERS) {
        setLobbyStatus(`Need ${MIN_PLAYERS - total} more player${MIN_PLAYERS - total === 1 ? '' : 's'}. Share the code!`);
      } else if (!allReady) {
        const remaining = nonHosts.length - readyCount;
        setLobbyStatus(`Waiting for ${remaining} more to ready up…`);
      } else {
        setLobbyStatus('Everyone is ready. Hit start!');
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
      $('btn-ready').textContent = me.ready ? "I'm Not Ready" : "I'm Ready";
      $('btn-ready').classList.toggle('btn-secondary', me.ready);
      $('btn-ready').classList.toggle('btn-primary', !me.ready);
    }

    // Nudge the button only while it is both visible and unready. toggle()
    // with an explicit flag is a no-op when the state has not changed, so
    // the animation is not restarted by every room update.
    $('ready-nudge').classList.toggle('is-nudging', !!(me && !isHost && !pass && !me.ready));

    // Category: host sees tappable trigger that opens the modal sheet,
    // player sees the chosen category as static serif text.
    const trigger = $('category-trigger');
    const triggerText = $('category-trigger-text');
    const display = $('category-display');
    const hint = $('category-hint');
    const categorySummary = categoriesSummary(activeCategories());
    triggerText.textContent = categorySummary;
    display.textContent = categorySummary;
    if (isHost) {
      trigger.style.display = '';
      display.style.display = 'none';
      hint.style.display = '';
      hint.textContent = 'A random word from your categories each round.';
    } else {
      trigger.style.display = 'none';
      display.style.display = '';
      hint.style.display = 'none';
    }
    // If the modal is currently open, re-render so the selected row reflects
    // changes that came in via Firebase (e.g. another tab/admin pick).
    if ($('cat-modal-backdrop').classList.contains('open')) renderCategoryModal();
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

  // One-time nudge so existing hosts discover the new Select pill. Shows once
  // per device (localStorage) and only until the cutoff below — a "what's new"
  // tip is pointless for people who arrive after multi-select is old news.
  const MS_HINT_KEY = 'imp_word_mshint';
  const MS_HINT_UNTIL = Date.UTC(2026, 7, 1); // stop showing after 2026-08-01
  function maybeShowMultiHint() {
    const el = $('cat-multi-hint');
    if (!el) return;
    let seen = true;
    try { seen = localStorage.getItem(MS_HINT_KEY) === '1'; } catch (e) { seen = true; }
    // Skip if already seen, past the cutoff, or the sheet opened in Select
    // mode (a multi-category room — the host already knows about it).
    if (seen || Date.now() > MS_HINT_UNTIL || catMultiMode) { el.hidden = true; return; }
    el.hidden = false;
    try { localStorage.setItem(MS_HINT_KEY, '1'); } catch (e) {}
  }
  function hideMultiHint() {
    const el = $('cat-multi-hint');
    if (el) el.hidden = true;
  }

  function renderCategoryModal() {
    const list = $('cat-modal-list');
    list.innerHTML = '';
    const committed = activeCategories();
    CATEGORY_GROUPS.forEach(group => {
      const lbl = document.createElement('div');
      lbl.className = 'cat-group-label';
      lbl.textContent = group.label;
      list.appendChild(lbl);
      group.categories.forEach(cat => {
        const on = catMultiMode ? modalSelection.has(cat.name) : committed.includes(cat.name);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'cat-row' + (on ? ' selected' : '');
        row.dataset.cat = cat.name;
        row.setAttribute('aria-pressed', on ? 'true' : 'false');
        row.innerHTML =
          `<div class="cat-row-title">${escapeHtml(cat.name)}</div>` +
          `<div class="cat-row-desc">${escapeHtml(cat.description)}</div>` +
          (catMultiMode ? `<span class="cat-check" aria-hidden="true">${CHECK_SVG}</span>` : '');
        row.addEventListener('click', () => {
          if (catMultiMode) {
            if (modalSelection.has(cat.name)) {
              if (modalSelection.size === 1) return; // keep at least one
              modalSelection.delete(cat.name);
            } else {
              modalSelection.add(cat.name);
            }
            renderCategoryModal();
          } else {
            // Default mode: single pick applies immediately and closes.
            commitCategories([cat.name]);
          }
        });
        list.appendChild(row);
      });
    });
    $('cat-select-btn').textContent = catMultiMode ? 'Cancel' : 'Select';
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
    maybeShowMultiHint();
  }

  function closeCategoryModal() {
    hideMultiHint();
    $('cat-modal-backdrop').classList.remove('open');
  }

  function toggleSelectMode() {
    hideMultiHint();
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
      showToast('Could not change category');
    }
  }

  $('category-trigger').addEventListener('click', openCategoryModal);
  $('cat-select-btn').addEventListener('click', toggleSelectMode);
  $('cat-modal-done').addEventListener('click', () => commitCategories([...modalSelection]));
  $('cat-modal-close').addEventListener('click', closeCategoryModal);
  $('cat-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCategoryModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('cat-modal-backdrop').classList.contains('open')) closeCategoryModal();
  });

  // ---- Chat with the developer ----
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
    title: 'Chat with the developer',
    opener: 'Spot a bug, have a suggestion, or want more words and categories? Tell me, I read everything.',
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

  // ---- Round-milestone feedback popup ----
  // Counts completed rounds per device (localStorage, shared across both
  // games — same origin). From FB_PROMPT_AT rounds on, the Round Over screen
  // auto-opens a small feedback popup — 2s after the reveal so it never
  // covers the payoff moment. It returns on later Round Overs until the
  // player interacts once (rate, open the form, or dismiss), then never
  // shows again on that device.
  const FB_PROMPT_AT = 20;
  let fbpTimer = null;

  function countRoundAndMaybePrompt() {
    try {
      const n = (parseInt(localStorage.getItem('imp_fb_rounds'), 10) || 0) + 1;
      localStorage.setItem('imp_fb_rounds', String(n));
      if (localStorage.getItem('imp_fb_prompt_done')) return;
      if (n < FB_PROMPT_AT) return;
    } catch (e) { return; }
    clearTimeout(fbpTimer);
    fbpTimer = setTimeout(() => {
      if (state.screen !== 'over') return; // next round already started
      $('fbp-backdrop').classList.add('open');
      bumpFbPrompt('shown');
    }, 2000);
  }

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
    $('fbp-title').textContent = 'Thanks! 🙏';
    $('fb-emojis').style.display = 'none';
    $('fb-prompt-link').textContent = 'Tell us more';
  });

  $('fb-prompt-link').addEventListener('click', () => {
    closeFbPopup(true);
    openChat('milestone');
  });

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
      showToast(e.message || 'Could not start the round');
      return;
    }
    // Same tracker the online host calls, and for the same reason: this is
    // the one point every successful start passes through. It reads the mode
    // off state.local and skips the room funnel accordingly.
    trackRound(deal.cat, deal.entry.w);
    startPassSequence();
  });

  // ============================================================
  // GAMEPLAY — driven by meta.startAt (synced across clients)
  // ============================================================
  function beginGame() {
    closeFbPopup(false);
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
  function showCard() {
    const meta = state.meta;
    const isImposter = meta.imposterIds && meta.imposterIds[state.myId];
    if (!meta.secretWord) { showToast('No word loaded'); return; }
    const card = cardContent(meta, isImposter);

    $('imposter-banner').style.display = card.isImposter ? 'inline-flex' : 'none';
    $('imposter-subhint').style.display = card.isImposter ? 'block' : 'none';
    $('game-role').textContent = card.role;
    $('game-word').textContent = card.text;
    $('word-card').classList.toggle('is-imposter', card.isImposter);

    $('btn-reveal').style.display = state.isHost ? '' : 'none';
    $('game-hint').textContent = state.isHost
      ? 'Take turns saying one clue word each. Tap Reveal when the round is decided.'
      : isImposter
        ? 'Blend in! Give a clue that fits without knowing the word.'
        : 'Take turns saying one clue word each — don\'t make it easy for the imposter.';
  }

  // What belongs on a card, for either mode. Two renderers read this, the
  // gameplay screen above and the back face of the passed card below, so the
  // shared phone and the online game cannot drift apart on what a card says.
  function cardContent(meta, isImposter) {
    return {
      isImposter: !!isImposter,
      role: isImposter ? 'YOUR HINT' : 'THE SECRET WORD',
      text: isImposter ? meta.imposterHint : meta.secretWord,
    };
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
    $('pass-banner-slot').classList.remove('shown');
  }

  function fillBackFace() {
    const meta = state.meta || {};
    const seq = state.passSeq;
    const id = seq ? seq.ids[seq.idx] : state.myId;
    // "You are player N now": the same lookup the online card does, against
    // the same meta, so the two modes deal one player the same hand.
    const card = cardContent(meta, meta.imposterIds && meta.imposterIds[id]);
    $('pass-role').textContent = card.role;
    $('pass-word').textContent = card.text || '';
    $('flip-back').classList.toggle('is-imposter', card.isImposter);
    $('pass-banner-slot').classList.toggle('shown', card.isImposter);
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

    $('pass-step').textContent = `Player ${seq.idx + 1} of ${seq.ids.length}`;
    $('pass-avatar').innerHTML = avatarHtml(p);
    $('pass-name').textContent = p.name;
    $('flip-front').setAttribute('aria-label', `${p.name}: swipe to reveal your card`);
    // The last player has nobody to hand the phone to, so their card leads
    // into the round instead of round-tripping through an extra screen.
    $('btn-pass-next').textContent = isLastPassCard() ? 'Start Playing' : 'Pass to Next Player';
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
  (function wirePassNext() {
    const btn = $('btn-pass-next');
    let tap = null;

    btn.addEventListener('pointerdown', (e) => {
      tap = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // Capture, so the release comes back here even if the card's flip
      // projects over the button on a short screen mid-animation.
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    });

    btn.addEventListener('pointerup', (e) => {
      const t = tap;
      tap = null;
      try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!t || e.pointerId !== t.id) return;
      if (Math.abs(e.clientX - t.x) > TAP_SLOP ||
          Math.abs(e.clientY - t.y) > TAP_SLOP) return;
      advancePass();
    });

    btn.addEventListener('pointercancel', () => { tap = null; });
    btn.addEventListener('click', advancePass);
  })();

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
    go('pass-round');
  }

  $('btn-pass-reveal').addEventListener('click', () => {
    if (state.local) revealImposter();
  });

  // Play Again returns to the lobby rather than dealing on the spot, the same
  // as the room game does. Between rounds is when a group swaps a category,
  // adds someone who has just turned up or changes the impostor count, and
  // the lobby is the only place those controls exist.
  function replayLocalRound() {
    closeFbPopup(false);
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

  function disarmPassBackTrap() { passTrapArmed = false; }

  window.addEventListener('popstate', () => {
    if (!passTrapArmed) return;
    history.pushState({ passCard: true }, '', location.href);
    showToast(state.passSeq ? 'Finish passing the phone first' : 'Tap Quit Game to leave');
  });

  // ============================================================
  // REVEAL — host-only button on the card screen
  // ============================================================
  $('btn-reveal').addEventListener('click', () => {
    fbForceReveal();
  });

  function revealImposter() {
    stopAllTimers();
    const meta = state.meta || {};
    const imposters = state.players.filter(p => p.isImposter);
    // No "(YOU)" in Pass the Phone: local players carry isMe false, because
    // on a shared phone there is no you.
    const names = imposters.map(p => p.name + (p.isMe ? ' (YOU)' : '')).join(' & ');
    $('reveal-name').textContent = names || '—';
    $('reveal-word').textContent = meta.secretWord || '—';
    $('btn-replay').style.display = state.isHost ? '' : 'none';
    // "Exit Room" would be wrong in Pass the Phone, where there is no room to
    // exit. state.isHost is true for the whole of that mode, so it already
    // lands on the right label.
    $('btn-home').textContent = state.isHost ? 'Quit Game' : 'Exit Room';
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
  //     games/modes/{online,passphone}      (which way the group played)
  //     games/players/<n>                   (group size, lifetime only)
  //     games/daily/<YYYY-MM-DD>/{count, countries/<ISO code>, categories/<name>, words/<word>, modes/<mode>}
  //
  // The room funnel (rooms/*, joins/*) is DELIBERATELY SILENT in Pass the
  // Phone, and that is not a gap to be fixed later. There is no room and
  // nobody joins, so firing those stages would count rooms that were never
  // created and joins that never happened, which is exactly what would
  // corrupt the funnel gaps. games/modes/* is what tells the two apart, and
  // it is why every games/* number should be read against a mode split
  // rather than assumed to be online play.
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
    const mode = state.local ? 'passphone' : 'online';
    // Run length works in both modes: it only needs the group size, which a
    // passed phone knows as well as a room does.
    trackRun(players);
    // Last stage of the room funnel. Hooked here rather than in fbStartGame
    // because every successful start path already funnels through this one
    // call, so the two can never drift apart.
    //
    // Online only, on purpose. See the funnel note in the header above: a
    // Pass the Phone round never created a room, so counting it as one would
    // put a started stage under a room that does not exist.
    if (mode === 'online') trackRoomStage('started');
    const day = todayKey();
    const cat = safeKey(category);
    const wrd = safeKey(word);
    const u = {
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
    }
    bumpAnalytics(u);
  }

  // ============================================================
  // INIT
  // ============================================================
  if (!FB_CONFIGURED) {
    setTimeout(() => showToast('Firebase not configured — see README', 4500), 800);
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
    if (code.length === 4 && FB_CONFIGURED && db) attemptCodeValidation(code);
  }

  // Which sharing method produced this URL. The QR image encodes s=qr, and
  // shared/roomlookup.js adds via=<game> when it forwards a code that turned
  // out to belong to a different game. Anything else is a shared link.
  function linkSource(params) {
    if (params.get('s') === 'qr') return 'qr';
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
