import {
  ref, set, get, update, onValue, onDisconnect, serverTimestamp, remove, push,
  onChildAdded, onChildChanged, onChildRemoved
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { FB_CONFIGURED, db } from "../shared/firebase.js";
import { analyticsEnabled, safeKey, todayKey, peekGeo, fetchGeo, createAnalytics } from "../shared/analytics.js";
import { WORD_CATEGORIES, pickHint } from "../shared/words.js";
import { createPlayedStore } from "../shared/played.js";
import { findRoomInOtherGames, goToGame } from "../shared/roomlookup.js";
import { mountChat } from "../shared/chat.js";
import { createSupportTransport } from "../shared/chat-support.js";

(() => {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const COUNTDOWN_MS = 4000;
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 20;
  const DEFAULT_CATEGORY = 'Food';
  // Exactly one impostor, always. The tabletop game this is based on is
  // balanced around a single faker, and two fakers sharing one canvas
  // muddies the evidence rather than doubling the fun.
  const NUM_IMPOSTERS = 1;
  // How many times each player draws. Host-adjustable in the lobby.
  const DEFAULT_ROUNDS = 2;
  const MIN_ROUNDS = 1;
  const MAX_ROUNDS = 5;
  // How long one player has the pen before the turn passes itself. This is a
  // safety net, not a target: the drawer normally presses Done. A remote game
  // has nobody in the room to nudge someone who has wandered off, so the
  // round has to be able to move on without them.
  const TURN_MS = 45000;
  // How long the host waits past a dead turn before forcing the pass. Long
  // enough that a brief network stall on the drawer's phone doesn't cost them
  // their turn, short enough that a closed tab doesn't stall the room.
  const TURN_GRACE_MS = 4000;
  const VOTE_INTRO_MS = 2000;
  // How long the room sits on its word card before the canvas opens, and how
  // long it hangs on "And the Impostor is…" before the answer. Both run off a
  // deadline in meta so every client counts down to the same instant.
  const CARD_MS = 5000;
  const REVEAL_MS = 3000;
  // Identifies this game inside shared infrastructure (analytics, and the
  // multi-game hub). Each game gets its own namespace, e.g.
  // analytics/draw/... so games never collide.
  const GAME = 'draw';
  // Canonical public URL of THIS game for shareable links (QR codes, deep
  // links). The native app runs from a Capacitor WebView on origin
  // https://localhost, which is useless to a friend, so it always points at
  // the real website. Anywhere else the QR follows whatever host is actually
  // serving this page: on production that IS impostorgames.com, and on a
  // preview channel or a laptop on the LAN it means the QR leads to the build
  // being tested rather than to a different one.
  const SHARE_CANONICAL = 'https://impostorgames.com/draw';
  const SHARE_BASE = (window.Capacitor || !/^https?:$/.test(location.protocol))
    ? SHARE_CANONICAL
    : `${location.origin}/draw`;
  // Room tree for this game. Kept separate from rooms-word/rooms so the
  // three games can hand out the same 4-char code without colliding.
  const ROOMS = 'rooms-draw';
  // A room with no deliberate activity for this long is considered dead:
  // the idle watchdog closes it, and createRoom will recycle its code.
  const IDLE_MS = 15 * 60 * 1000; // 15 minutes

  // How this player got the room code, for the joins counter. Typing it in
  // is the default; the deep-link handler overwrites this when the code
  // arrived in the URL instead. Set before joinRoom runs, read inside it.
  let joinSource = 'code';

  // Shared counter kit bound to this game's namespace (analytics/draw).
  const { bumpAnalytics, trackError, installGlobalErrorTracking, trackSession, bumpFbPrompt, trackRun, resetRun,
          trackRoomCreated, trackRoomStage, trackRoomStartFailed, resetRoomFunnel,
          trackJoin, trackJoinFail } = createAnalytics(GAME);
  installGlobalErrorTracking();

  // Words come from the shared catalog. Draw uses the categories that are
  // actually drawable — Places, Movies & TV and Football are fine to *say*
  // but not to sketch in one turn. Super Heroes qualifies because the
  // characters have iconic silhouettes: a cape, a mask, a hammer.
  const CATEGORY_GROUPS = [
    {
      label: 'Categories',
      categories: [
        { name: 'Food',             description: 'Dishes, snacks, fruits and drinks' },
        { name: 'Animals',          description: 'Pets, wildlife, birds and sea creatures' },
        { name: 'Everyday Objects', description: 'Things lying around every home' },
        { name: 'Super Heroes',     description: 'Capes, masks and the villains chasing them' },
      ],
    },
  ];
  const DRAWABLE = CATEGORY_GROUPS[0].categories.map(c => c.name);

  // Game modes. 'online' is the original game and stays the default: a room,
  // a code to share, everyone on their own phone. 'passphone' is the alternate
  // for a group with one device between them.
  //
  // Same picker, same wording and the same art as the word and dance games.
  // As in word, the mode is NOT stored in meta.mode: switching to Pass the
  // Phone deletes the room, so there is no meta left to hold it. state.mode is
  // the source of truth and resets to the room game whenever a sitting ends.
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

  // Rounds default lower on one phone than in a room. Online, two rounds is
  // five minutes of everyone drawing at once on their own screen. Here every
  // turn is also a handover, so the same setting is twice the sitting: five
  // players at two rounds is ten turns and ten passes. The lobby stepper still
  // goes to MAX_ROUNDS for a group that wants a longer game.
  const DEFAULT_LOCAL_ROUNDS = 1;

  // Firebase keys can't contain . # $ [ ] /. Words and category names are
  // ASCII-safe today, but sanitize anyway to future-proof.
  function sanitizeKey(s) { return String(s).replace(/[.#$\[\]/]/g, '_'); }

  // Words this device has already dealt, carried across rooms so a fresh
  // room doesn't reopen with a word the group just had. See shared/played.js.
  const playedStore = createPlayedStore(GAME);

  // The host can pick several categories at once; a round draws from their
  // union. Names outside the drawable set (or missing from the catalog) are
  // dropped so a stale pick can never empty the pool.
  function activeCategories() {
    const m = state.meta;
    if (m && Array.isArray(m.categories) && m.categories.length) {
      const valid = m.categories.filter(c => DRAWABLE.includes(c) && WORD_CATEGORIES[c]);
      if (valid.length) return valid;
    }
    if (m && m.category && DRAWABLE.includes(m.category)) return [m.category];
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
  // played buckets and start fresh.
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
    // game starts on the room mode, which is the one most groups want.
    mode: 'online',
    // True once a Pass the Phone sitting is set up: the whole game runs in
    // this tab with no room, no network and no other device. See the
    // local-room section below.
    local: false,
    // Which Pass the Phone roster row is being renamed, if any.
    editingId: null,
    // The card handover in progress: { ids, idx }. Non-null only while the
    // cards are going round. See the pass-sequence section.
    passSeq: null,
    isHost: false,
    myId: null,
    myName: '',
    players: [],
    meta: null,
    roomUnsub: null,
    presenceUnsub: null,
    myJoinedAt: 0,
    myReady: false,
    votes: {},
    myC: 0,
    rounds: DEFAULT_ROUNDS,
    pendingJoinCode: null,
    countdownTimer: null,
    idleTimer: null,
    turnTimer: null,
    phaseTimer: null,
    serverTimeOffset: 0,
  };

  // playerId -> { name, c }, last known. Players are removed from the room
  // the moment they disconnect, so anything that has to name someone after
  // the fact (a turn chip, the impostor reveal) reads from here.
  const playerMemo = new Map();

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
  // join time, stored on their player record so every device shows the same
  // animal for them.
  const AVATAR_COUNT = 20;
  const AVATAR_NAMES = ['fox','panda','koala','dog','rabbit','bear','lion','tiger','raccoon','penguin','deer','giraffe','elephant','cow','hedgehog','owl','otter','shiba','frog','chick'];
  function pickAvatar(playersObj) {
    const used = new Set(Object.values(playersObj || {}).map(p => p && p.av).filter(Boolean));
    const free = [];
    for (let i = 1; i <= AVATAR_COUNT; i++) if (!used.has(i)) free.push(i);
    const pool = free.length ? free : Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Ink colours: each player draws in their own, so the group can tell who
  // put down which line when they argue about it afterwards. Assigned at join
  // like the avatar (first unused wins) and stored on the player record, so
  // it stays put when someone else leaves. Chosen to stay distinguishable on
  // white and to survive the common red/green colour-blindness.
  const INK_COLORS = ['#d04a2f','#2f6fd0','#2f9e94','#e88a3a','#7d4fa8','#3f8f3f','#c2418f','#6b5334'];
  function pickColor(playersObj) {
    const used = new Set(Object.values(playersObj || {}).map(p => p && p.c).filter(c => c === 0 || c > 0));
    for (let i = 0; i < INK_COLORS.length; i++) if (!used.has(i)) return i;
    return Math.floor(Math.random() * INK_COLORS.length); // more players than colours
  }
  function inkOf(idx) { return INK_COLORS[idx] || INK_COLORS[0]; }

  function avatarHtml(p) {
    if (p.av >= 1 && p.av <= AVATAR_COUNT) {
      const animal = AVATAR_NAMES[p.av - 1];
      return `<img class="player-avatar" src="/avatars/av${String(p.av).padStart(2, '0')}.webp" alt="${animal}">`;
    }
    return `<div class="player-avatar ${avatarClass(p.name)}">${escapeHtml(p.name.slice(0, 2).toUpperCase())}</div>`;
  }

  // Player id → timestamp of its first lobby render. A join triggers several
  // RTDB snapshots back-to-back, each re-building the list — so the
  // just-joined class must survive re-renders for the animation's duration.
  const lobbySeen = new Map();
  const JOIN_ANIM_MS = 700;
  function isNewInLobby(id) {
    const now = Date.now();
    if (!lobbySeen.has(id)) lobbySeen.set(id, now);
    return now - lobbySeen.get(id) < JOIN_ANIM_MS;
  }

  // Confetti micro-burst: fired once per player (guarded by burstFired) and
  // skipped on the initial lobby paint so a late joiner doesn't see a salvo.
  const burstFired = new Set();
  function confettiBurst(rowEl) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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

  // Smooth departures: clone the leaving row as a fixed ghost on <body> so it
  // can fade out after the rebuild has already dropped the real row.
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ============================================================
  // ROOM OPERATIONS (Firebase)
  // ============================================================
  async function createRoom(name) {
    if (!db) throw new Error('Firebase not configured');
    let code;
    for (let i = 0; i < 5; i++) {
      code = genRoomCode();
      const snap = await get(ref(db, `${ROOMS}/${code}/meta`));
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
    const c = pickColor(null);
    await set(ref(db, `${ROOMS}/${code}`), {
      meta: {
        hostId: myId,
        numImposters: NUM_IMPOSTERS,
        category: DEFAULT_CATEGORY,
        rounds: DEFAULT_ROUNDS,
        phase: 'lobby',
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      },
      players: {
        [myId]: { name, ready: false, joinedAt, av, c }
      }
    });
    state.roomCode = code;
    state.myId = myId;
    state.myName = name;
    state.myAv = av;
    state.myC = c;
    state.myJoinedAt = joinedAt;
    state.myReady = false;
    state.isHost = true;
    state.rounds = DEFAULT_ROUNDS;

    trackRoomCreated(); // top of the room funnel; also clears the stage dedupe

    setupPresence();
    // NOTE: the room listener is attached later, when the host taps
    // "Go to Lobby" (see btn-share-continue). Attaching it here would let
    // the lobby-phase auto-router skip the share-code screen.
  }

  async function joinRoom(code, name) {
    if (!db) throw new Error('Firebase not configured');
    const roomSnap = await get(ref(db, `${ROOMS}/${code}`));
    if (!roomSnap.exists() || !roomSnap.val().meta) { trackJoinFail('notFound'); throw new Error('Room not found'); }
    const room = roomSnap.val();
    const meta = room.meta;
    if (meta.phase !== 'lobby') { trackJoinFail('inProgress'); throw new Error('Game already in progress'); }
    if (Object.keys(room.players || {}).length >= MAX_PLAYERS) { trackJoinFail('full'); throw new Error('Room is full'); }

    const myId = genId();
    const joinedAt = nowSync();
    const av = pickAvatar(room.players);
    const c = pickColor(room.players);
    await set(ref(db, `${ROOMS}/${code}/players/${myId}`), {
      name, ready: false, joinedAt, av, c
    });
    update(ref(db, `${ROOMS}/${code}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
    state.roomCode = code;
    state.myId = myId;
    state.myName = name;
    state.myAv = av;
    state.myC = c;
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
      const metaSnap = await get(ref(db, `${ROOMS}/${code}/meta`));
      if (!metaSnap.exists()) return;
      if (state.roomCode !== code || state.myId !== id) return;
      const myRef = ref(db, `${ROOMS}/${code}/players/${id}`);
      await onDisconnect(myRef).remove();
      await set(myRef, {
        name: state.myName,
        ready: !!state.myReady,
        joinedAt: state.myJoinedAt || nowSync(),
        av: state.myAv || 0,
        c: state.myC || 0,
      });
    } catch (e) { /* transient — will retry on next reconnect */ }
  }

  // Screen Wake Lock: keep the device awake while in a room so it doesn't
  // lock, drop the socket, and bump the player. Where it's unavailable or
  // denied, a rotating hint in the lobby asks the player to keep the screen on.
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
    update(ref(db, `${ROOMS}/${state.roomCode}/meta`), { lastActivity: serverTimestamp() }).catch(()=>{});
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
      try { await remove(ref(db, `${ROOMS}/${state.roomCode}`)); } catch (e) {}
    }, 60000);
  }
  function stopIdleWatch() {
    if (state.idleTimer) { clearInterval(state.idleTimer); state.idleTimer = null; }
  }

  function attachRoomListener() {
    startIdleWatch();
    const roomRef = ref(db, `${ROOMS}/${state.roomCode}`);
    state.roomUnsub = onValue(roomRef, snap => {
      const data = snap.val();
      if (!data) {
        showToast('Room closed');
        leaveRoom(true);
        return;
      }
      const meta = data.meta || {};
      const playersObj = data.players || {};
      // voterId -> the id they picked. Everyone can read this node, but the
      // UI only ever shows *that* someone voted until the host reveals.
      state.votes = data.votes || {};
      const players = Object.entries(playersObj).map(([id, p]) => ({
        id,
        name: p.name,
        ready: !!p.ready,
        joinedAt: p.joinedAt || 0,
        av: p.av || 0,
        c: p.c || 0,
        isHost: id === meta.hostId,
        isImposter: meta.imposterIds ? !!meta.imposterIds[id] : false,
        isMe: id === state.myId,
      })).sort((a, b) => a.joinedAt - b.joinedAt);

      const prevPhase = state.meta ? state.meta.phase : null;
      const prevTurn = state.meta ? state.meta.turn : null;
      state.meta = meta;
      state.players = players;
      // Remember who was who. A player who closes their tab vanishes from
      // players/, and without this their turn chip (and the reveal, if they
      // were the impostor) would have nothing to put a name to.
      players.forEach(p => playerMemo.set(p.id, { name: p.name, c: p.c, av: p.av }));
      state.rounds = clampRounds(meta.rounds);
      state.isHost = meta.hostId === state.myId;
      const meNow = players.find(p => p.isMe);
      if (meNow) state.myReady = meNow.ready;

      if (state.screen === 'lobby') renderLobby();
      // The pen changing hands arrives as a plain meta change, not a screen
      // switch. Undo is scoped to the current turn, so the id list resets here
      // — otherwise a player coming round again could rub out last round's work.
      if (meta.turn !== prevTurn) {
        forceEndStroke();
        myStrokeIds = [];
      }
      // countdown -> playing arrives while we're already on the game screen,
      // so the toolbar has to react here, not only on the screen switch.
      if (state.screen === 'game') { updateDrawUI(); updatePlayControls(); }
      if (state.screen === 'card') renderCard();
      if (state.screen === 'vote') renderVote();
      const phase = meta.phase;
      if (phase !== prevPhase) {
        phaseGuard = '';
        if (phase === 'lobby' && state.screen !== 'lobby') enterLobby();
        else if ((phase === 'countdown' || phase === 'card') && state.screen !== 'card') enterCardScreen();
        else if (phase === 'playing' && state.screen !== 'game') beginGame();
        else if (phase === 'vote' && state.screen !== 'vote') enterVoteScreen();
        else if (phase === 'reveal' && state.screen !== 'reveal') enterRevealCountdown();
        else if (phase === 'over' && state.screen !== 'over') revealImposter();
      }
      // The last vote landing is a plain data change, not a phase change, so
      // it has to be noticed here. Host only: one writer, no race.
      if (phase === 'vote' && state.isHost && everyonePresentVoted()) fbCloseVote();
    });
  }

  function clampRounds(n) {
    const v = parseInt(n, 10);
    if (!v || isNaN(v)) return DEFAULT_ROUNDS;
    return Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, v));
  }

  async function fbToggleReady() {
    if (!db || !state.roomCode) return;
    const me = state.players.find(p => p.isMe);
    if (!me) return;
    await update(ref(db, `${ROOMS}/${state.roomCode}/players/${state.myId}`), {
      ready: !me.ready
    });
    touchRoom();
  }

  async function fbSetRounds(n) {
    const v = clampRounds(n);
    if (v === state.rounds) return;
    // No room to round-trip through in Pass the Phone; set it and redraw.
    if (state.local) {
      state.rounds = v;
      if (state.meta) state.meta.rounds = v;
      renderLobby();
      return;
    }
    if (!db || !state.isHost || !state.roomCode) return;
    await update(ref(db, `${ROOMS}/${state.roomCode}/meta`), { rounds: v, lastActivity: serverTimestamp() }).catch(()=>{});
  }

  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Everything a round needs, decided but not yet written anywhere: the word,
  // who the impostor is, the hint, and the order the pen travels in. Split out
  // of fbStartGame so a room and a single passed-around phone deal identically
  // instead of drifting into two rules for the same game.
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

    const imposterIds = {};
    shuffled(state.players).slice(0, NUM_IMPOSTERS).forEach(p => { imposterIds[p.id] = true; });

    // Online, turn order gets its OWN shuffle. Reusing the one the impostor
    // was sliced off the front of would put the impostor first every single
    // game, and the order is public, so that hands the room the answer.
    //
    // On one phone the order is the roster instead, so the phone travels round
    // the circle rather than jumping across it every turn — the group is
    // sitting together, and a shuffled order means someone announcing who is
    // next before every pass. It leaks nothing: the impostor is drawn from an
    // independent shuffle above, so a player's seat says nothing about it.
    const order = state.local
      ? state.players.map(p => p.id)
      : shuffled(state.players).map(p => p.id);

    // Order matters: clear then record, or this word is wiped by its own reset.
    if (picked.reset) playedStore.clear(cats);
    playedStore.record(picked.cat, entry.w);

    // One of the word's two vague hints, picked fresh each round so a word
    // that comes round again still plays differently. NOT the category: the
    // host's pick is shown to everyone in the lobby, so it would tell the
    // impostor nothing they don't already know.
    return { cats, cat: picked.cat, entry, imposterIds, order, hint: pickHint(entry), reset: picked.reset };
  }

  // Deal the round: one secret word for everyone, one impostor who gets only
  // the word's vague hint, and a turn order everyone can see.
  async function fbStartGame() {
    if (state.local) { startLocalSitting(); return; }
    if (!db || !state.isHost) return;
    const startBtn = $('btn-start');
    const startHint = $('start-hint');
    startBtn.disabled = true;
    const prevHint = startHint.textContent;
    startHint.textContent = 'Dealing…';
    try {
      const deal = dealRound();
      const entry = deal.entry;
      const cats = deal.cats;
      const picked = { cat: deal.cat, reset: deal.reset };
      const chosenCat = sanitizeKey(deal.cat);
      const imposterIds = deal.imposterIds;
      const order = deal.order;

      const startAt = nowSync() + COUNTDOWN_MS;

      const wKey = sanitizeKey(entry.w);
      const updates = {
        'meta/phase': 'countdown',
        'meta/startAt': startAt,
        'meta/imposterIds': imposterIds,
        'meta/secretWord': entry.w,
        'meta/imposterHint': deal.hint,
        'meta/rounds': state.rounds,
        'meta/order': order,
        'meta/turn': 0,
        // No clock yet. The turn timer only starts when the card screen's own
        // countdown runs out, so nobody's turn burns down while the room is
        // still reading its word.
        'meta/turnAt': null,
        'meta/cardAt': null,
        'meta/revealAt': null,
        'meta/lastActivity': serverTimestamp(),
        // Fresh canvas for the new round.
        'strokes': null,
      };
      if (picked.reset) {
        // Union exhausted — wipe the played buckets for every selected
        // category, then seed just this word under its own bucket. The
        // device forgot them too (dealRound does that), or the next room
        // would seed the same exhausted state and reset all over again.
        cats.forEach(c => { updates[`meta/played/${sanitizeKey(c)}`] = null; });
        updates[`meta/played/${chosenCat}`] = { [wKey]: true };
      } else {
        updates[`meta/played/${chosenCat}/${wKey}`] = true;
      }
      await update(ref(db, `${ROOMS}/${state.roomCode}`), updates);

      trackRound(picked.cat, entry.w);

      // Countdown over: everyone lands on their word, and the card's own
      // five seconds start ticking from the same stamp on every screen.
      setTimeout(() => {
        update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
          phase: 'card',
          cardAt: nowSync() + CARD_MS,
        }).catch(()=>{});
      }, Math.max(0, startAt - nowSync()) + 200);
    } catch (e) {
      trackError('round_start_failed');
      trackRoomStartFailed(); // the host pressed Start and got nothing
      showToast(e.message || 'Could not start the round');
      startBtn.disabled = false;
      startHint.textContent = prevHint;
    }
  }

  // ============================================================
  // SOUND
  // One sound in the whole game: a clock tick, once a second, only while the
  // pen is yours. Synthesised rather than loaded, so there is no asset to
  // fetch, nothing to fail offline, and no licence to worry about.
  // ============================================================
  const MUTE_KEY = 'draw:muted';
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
  let audioCtx = null;

  // Browsers refuse to start audio without a gesture, so the context is built
  // on the first tap anywhere and kept for the session. Every player has
  // tapped something (Ready, Join, Start) long before a turn is theirs.
  function ensureAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  document.addEventListener('pointerdown', ensureAudio, { passive: true });

  // Tick and tock at two pitches, because a clock that only ticks sounds like
  // a fault rather than a countdown.
  function playTick(high) {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(high ? 1180 : 880, t);
    // Struck, not held: full level instantly, then a 40ms decay to nothing.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // The second the last tick was played for, so the 250ms ticker only sounds
  // once per second. -1 means "not my turn", which also makes the first tick
  // of a turn fire the instant the pen arrives.
  let lastTickSecond = -1;

  function tickClock(secondsLeft) {
    if (secondsLeft === lastTickSecond) return;
    lastTickSecond = secondsLeft;
    if (secondsLeft > 0) playTick(secondsLeft % 2 === 0);
  }

  function renderSoundBtn() {
    const btn = $('btn-sound');
    if (!btn) return;
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', muted ? 'Unmute turn sound' : 'Mute turn sound');
    btn.innerHTML = muted
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  $('btn-sound').addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    renderSoundBtn();
    if (!muted) playTick(true);   // so you hear what you just turned on
  });
  renderSoundBtn();

  // ============================================================
  // TURN ENGINE
  // meta/order is the public turn order (array of player ids, shuffled once
  // per game). meta/turn is a slot counter that only ever goes up: the player
  // with the pen is order[turn % order.length], and the round number is
  // turn / order.length. Counting slots rather than tracking a pointer is what
  // makes skipping a departed player trivial — their slot is simply spent.
  // meta/turnAt is the wall-clock deadline for the current slot.
  // ============================================================
  function turnOrder() {
    const m = state.meta;
    return (m && Array.isArray(m.order)) ? m.order.filter(Boolean) : [];
  }
  function currentTurn() {
    const t = parseInt(state.meta && state.meta.turn, 10);
    return isNaN(t) ? 0 : t;
  }
  function totalTurns() {
    return turnOrder().length * clampRounds(state.meta && state.meta.rounds);
  }
  function drawerAt(turn) {
    const o = turnOrder();
    return o.length ? o[turn % o.length] : null;
  }
  function currentDrawerId() { return drawerAt(currentTurn()); }
  function roundOfTurn(turn) {
    const o = turnOrder();
    return o.length ? Math.floor(turn / o.length) + 1 : 1;
  }
  function playerById(id) { return state.players.find(p => p.id === id) || null; }

  // The next slot still owned by somebody who is actually here. Also what the
  // "Next: …" label reads from, so the preview never names a player who left.
  function nextPresentTurn(from) {
    const total = totalTurns();
    for (let t = from + 1; t < total; t++) if (playerById(drawerAt(t))) return t;
    return -1;
  }

  // Set to the slot we have already written a pass for. Done, the drawer's own
  // expiry and the host's watchdog all race to advance the same turn; without
  // this the 250ms ticker would re-fire the write every tick until the echo
  // came back. Cleared on failure so a dropped write can still be retried.
  let advanceGuard = -1;

  // Pass the pen. `fromTurn` is the slot the caller believed was live — if the
  // room has moved on, this is a stale call and does nothing.
  function fbAdvanceTurn(fromTurn) {
    if (!db || !state.roomCode || !state.meta) return;
    if (state.meta.phase !== 'playing') return;
    if (currentTurn() !== fromTurn || advanceGuard === fromTurn) return;
    advanceGuard = fromTurn;

    const next = nextPresentTurn(fromTurn);
    if (next === -1) {
      // Nobody left to draw, either because the rounds ran out or because
      // everyone still owed a turn has gone. Drawing is over, so the room
      // goes straight to the ballot — there is nothing left for it to do on
      // the canvas, and waiting on a button only stalls the conversation.
      update(ref(db, `${ROOMS}/${state.roomCode}`), {
        'meta/phase': 'vote',
        'meta/turn': totalTurns(),
        'meta/turnAt': null,
        'meta/lastActivity': serverTimestamp(),
        'votes': null,
      }).catch(() => { advanceGuard = -1; });
      return;
    }
    update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
      turn: next, turnAt: nowSync() + TURN_MS, lastActivity: serverTimestamp(),
    }).catch(() => { advanceGuard = -1; });
  }

  // Drawer vanished mid-turn: when we first noticed, so the host can tell a
  // closed tab from a two-second tunnel.
  let drawerGoneAt = 0;

  function startTurnTicker() {
    stopTurnTicker();
    state.turnTimer = setInterval(turnTick, 250);
    turnTick();
  }
  function stopTurnTicker() {
    if (state.turnTimer) { clearInterval(state.turnTimer); state.turnTimer = null; }
    lastTickSecond = -1;
  }

  // Online only. Pass the Phone never starts this ticker: it has no turn clock
  // to count down, and no drawer who can stall the round by disconnecting,
  // which is the only thing the expiry below exists to rescue.
  function turnTick() {
    const m = state.meta;
    if (!m || m.phase !== 'playing') { drawerGoneAt = 0; lastTickSecond = -1; renderTurnBar(); return; }
    const turn = currentTurn();
    const drawerId = currentDrawerId();
    const present = !!playerById(drawerId);
    if (present) drawerGoneAt = 0;
    else if (!drawerGoneAt) drawerGoneAt = nowSync();

    renderTurnBar();

    const turnAt = typeof m.turnAt === 'number' ? m.turnAt : 0;
    if (!turnAt) { lastTickSecond = -1; return; }
    const now = nowSync();

    if (drawerId !== state.myId) lastTickSecond = -1;
    else tickClock(Math.max(0, Math.ceil((turnAt - now) / 1000)));

    if (drawerId === state.myId) {
      // My own turn ran out. Finish whatever is under my finger first so the
      // stroke lands complete rather than being abandoned half-written.
      if (now > turnAt) { forceEndStroke(); fbAdvanceTurn(turn); }
      return;
    }
    // Host only — one writer, so a stalled turn can't be passed twice by two
    // different spectators.
    if (!state.isHost) return;
    const clientDead = now > turnAt + TURN_GRACE_MS;
    const playerGone = !present && drawerGoneAt && now - drawerGoneAt > TURN_GRACE_MS;
    if (clientDead || playerGone) fbAdvanceTurn(turn);
  }

  // ============================================================
  // DEADLINE PHASES
  // Two screens sit for a fixed few seconds and then move on by themselves:
  // the word card before drawing, and the ballot before the impostor is
  // named. Both count down to a stamp in meta so every client shows the same
  // number, and only the host writes the phase change, so two clients can't
  // race each other to it.
  // ============================================================
  let phaseGuard = '';   // '<phase>:<deadline>' already written for

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
    if (!m) return;
    if (m.phase === 'card') {
      renderCardCount(secondsLeft(m.cardAt));
      if (state.isHost && m.cardAt && nowSync() > m.cardAt) fbBeginDrawing(m.cardAt);
    } else if (m.phase === 'reveal') {
      renderBallotCount(secondsLeft(m.revealAt));
      if (state.isHost && m.revealAt && nowSync() > m.revealAt) fbFinishReveal(m.revealAt);
    }
  }

  // The card's five seconds are up. The first drawer's clock starts here, not
  // when the word was dealt, so nobody loses their turn to reading time.
  function fbBeginDrawing(deadline) {
    if (!db || !state.roomCode) return;
    const key = 'card:' + deadline;
    if (phaseGuard === key) return;
    phaseGuard = key;
    update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
      phase: 'playing',
      turnAt: nowSync() + TURN_MS,
      lastActivity: serverTimestamp(),
    }).catch(() => { phaseGuard = ''; });
  }

  // The ballot has been up long enough. Name the impostor.
  function fbFinishReveal(deadline) {
    if (!db || !state.roomCode) return;
    const key = 'tally:' + deadline;
    if (phaseGuard === key) return;
    phaseGuard = key;
    update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
      phase: 'over',
      lastActivity: serverTimestamp(),
    }).catch(() => { phaseGuard = ''; });
  }

  // ============================================================
  // VOTE
  // Votes live at rooms-draw/<code>/votes/<voterId> = <targetId>. Voting
  // opens by itself when the last turn is taken and closes on the host's
  // reveal; in between anyone may change their mind. Nothing is tallied on
  // screen until the reveal.
  // ============================================================
  function fbCastVote(targetId) {
    if (!db || !state.roomCode || !state.myId) return;
    if (!state.meta || state.meta.phase !== 'vote') return;
    if (!targetId || targetId === state.myId) return;   // never vote for yourself
    set(ref(db, `${ROOMS}/${state.roomCode}/votes/${state.myId}`), targetId)
      .then(touchRoom)
      .catch(() => showToast('Could not save your vote'));
  }

  // Voting closes by itself the moment the last player has picked. Everyone
  // present counts: a player who left is no longer owed a vote, so the room
  // isn't held up by a closed tab.
  function everyonePresentVoted() {
    const players = state.players;
    if (players.length < 2) return false;
    const votes = state.votes || {};
    return players.every(p => !!votes[p.id]);
  }

  // Host only, so the write happens once. Opens the ballot screen, which
  // shows who voted for whom and then names the impostor on its own clock.
  function fbCloseVote() {
    if (!db || !state.isHost || !state.roomCode) return;
    if (!state.meta || state.meta.phase !== 'vote') return;
    if (phaseGuard === 'vote-closed') return;
    phaseGuard = 'vote-closed';
    update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
      phase: 'reveal',
      revealAt: nowSync() + REVEAL_MS,
      lastActivity: serverTimestamp(),
    }).catch(() => { phaseGuard = ''; });
  }

  // The host's override, for when someone stops answering and the room would
  // otherwise wait forever. Same destination as the automatic close.
  function fbReveal() {
    if (!db || !state.isHost || !state.roomCode) return;
    $('btn-reveal').disabled = true;
    fbCloseVote();
  }

  // Who got how many. Self-votes are ignored even if one somehow lands, and
  // votes from players who have since left still count: they were cast.
  function tallyVotes() {
    const counts = new Map();
    Object.entries(state.votes || {}).forEach(([voter, target]) => {
      if (!target || target === voter) return;
      counts.set(target, (counts.get(target) || 0) + 1);
    });
    return counts;
  }

  // The room only wins by pinning it on the impostor outright. A tie at the
  // top means the room never actually agreed, so the impostor walks.
  function voteOutcome() {
    const counts = tallyVotes();
    const impIds = Object.keys((state.meta && state.meta.imposterIds) || {});
    let top = 0;
    counts.forEach(n => { if (n > top) top = n; });
    if (!top) return { caught: false, tied: false, votes: 0 };
    const topIds = [...counts.entries()].filter(([, n]) => n === top).map(([id]) => id);
    return {
      caught: topIds.length === 1 && impIds.includes(topIds[0]),
      tied: topIds.length > 1,
      votes: top,
    };
  }

  async function fbReplay() {
    // state.isHost is true for the whole of Pass the Phone, so the room-code
    // guard is what keeps this off rooms-draw/null. replayLocalRound() is the
    // local equivalent and Play Again routes there first.
    if (!db || !state.isHost || !state.roomCode || state.local) return;
    // Ready state persists across rounds — players opt in once at the start
    // of the session. Only fresh joins default to unready.
    const updates = {};
    updates['meta/phase'] = 'lobby';
    updates['meta/startAt'] = null;
    updates['meta/imposterIds'] = null;
    updates['meta/secretWord'] = null;
    updates['meta/imposterHint'] = null;
    updates['meta/order'] = null;
    updates['meta/turn'] = null;
    updates['meta/turnAt'] = null;
    updates['meta/cardAt'] = null;
    updates['meta/revealAt'] = null;
    updates['strokes'] = null;
    updates['votes'] = null;
    updates['meta/lastActivity'] = serverTimestamp();
    await update(ref(db, `${ROOMS}/${state.roomCode}`), updates);
  }

  async function leaveRoom(skipDelete) {
    stopHintRotation();
    releaseWakeLock();
    stopAllTimers();
    closeFbPopup(false);
    closeQuitConfirm();

    detachStrokeListeners();
    resetCanvasState();
    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    // Cancel the pending auto-removal so it can't fire after we've left.
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `${ROOMS}/${state.roomCode}/players/${state.myId}`)).cancel(); } catch(e){}
    }

    if (db && state.roomCode && state.myId && !skipDelete) {
      try {
        if (state.isHost) {
          await remove(ref(db, `${ROOMS}/${state.roomCode}`));
        } else {
          await remove(ref(db, `${ROOMS}/${state.roomCode}/players/${state.myId}`));
        }
      } catch (e) { console.warn('leaveRoom cleanup failed', e); }
    }
    state.roomCode = null;
    state.myId = null;
    state.isHost = false;
    state.local = false;
    state.mode = 'online'; // next sitting starts on the default mode again
    state.passSeq = null;
    state.editingId = null;
    disarmPassBackTrap();
    state.players = [];
    state.meta = null;
    state.votes = {};
    resetRun(); // this sitting is over; the next room starts a fresh run
    resetRoomFunnel();
    joinSource = 'code'; // a later manual join shouldn't inherit this room's source
    lobbySeen.clear();
    burstFired.clear();
    playerMemo.clear();
    go('home');
  }

  function stopAllTimers() {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
    stopIdleWatch();
    stopCanvasFitWatch();
    stopTurnTicker();
    stopPhaseClock();
    hideVoteIntro();
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
  // canvas, the turn strip and the reveal all work unchanged. canDraw() in
  // particular compares currentDrawerId() with state.myId, which is why both
  // handovers here are literally "you are player N now".
  //
  // `state.roomCode` deliberately stays null for the whole mode. Every
  // Firebase call site in this file already guards on it, so a guard missed
  // here degrades into doing nothing rather than writing to rooms-draw/null.
  //
  // The draw game asks for one thing the word game does not: the phone goes
  // round TWICE. Once for the cards, and then once per drawing turn. Both
  // handovers are below, and they are deliberately different shapes — a card
  // is private and must be swiped for, whereas the canvas is public and only
  // needs the right person holding the phone.

  // Distinct animals AND distinct ink for a list of names, in order. Both
  // pickers take the players-so-far in their room shape, so building the
  // roster incrementally reuses the same collision avoidance the online game
  // gets at join time. Ink matters more here than online: every stroke on the
  // shared canvas is identified by colour alone.
  function rosterFromNames(names) {
    const soFar = {};
    return names.map((name, i) => {
      const av = pickAvatar(soFar);
      const c = pickColor(soFar);
      soFar[i] = { av, c };
      return { name, av, c };
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

  // Row ids must never be reused: a removed row's id lingering in lobbySeen,
  // burstFired or playerMemo would make a later row inherit its state.
  let localIdSeq = 0;

  function buildLocalRoom(roster) {
    state.players = roster.map((r, i) => ({
      id: 'local_' + (localIdSeq++),
      name: r.name,
      ready: true,          // nobody readies up on a shared phone
      joinedAt: i,          // keeps the roster in the order it was entered
      av: r.av,
      c: r.c,
      // Nobody is special on a shared phone. One person sets the game up,
      // but during the round they are just another name on the list, so no
      // row carries a Host tag, a YOU pill or a "(You)" on the turn strip.
      // The device still drives the round; that lives on state.isHost.
      isHost: false,
      isImposter: false,
      isMe: false,
      isBot: false,
    }));
    // The turn strip and the reveal both read names and ink out of here rather
    // than off state.players, because online a player can leave mid-round.
    // Nobody can leave a shared phone, but the renderers are shared, so the
    // memo has to be fed all the same.
    state.players.forEach(p => playerMemo.set(p.id, { name: p.name, c: p.c, av: p.av }));
    state.meta = {
      phase: 'lobby',
      categories: (state.meta && state.meta.categories) || [DEFAULT_CATEGORY],
      category: (state.meta && state.meta.category) || DEFAULT_CATEGORY,
      rounds: state.rounds,
      imposterIds: null,
      secretWord: null,
      imposterHint: null,
      order: null,
      turn: null,
      turnAt: null,
      played: (state.meta && state.meta.played) || {},
    };
  }

  // Names and ink are edited after the roster is built, so the memo has to be
  // refreshed or the turn strip shows a name the player has already changed.
  function refreshLocalMemo() {
    state.players.forEach(p => playerMemo.set(p.id, { name: p.name, c: p.c, av: p.av }));
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

  // Set up a sitting. Called when the host switches the lobby to Pass the
  // Phone, after the room it arrived in has been torn down.
  function enterLocalMode(hostName) {
    state.local = true;
    state.roomCode = null;
    state.isHost = true;      // this device drives the round
    state.meta = null;        // a fresh sitting, not a continuation
    state.editingId = null;
    state.votes = {};
    state.rounds = clampRounds(DEFAULT_LOCAL_ROUNDS);
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
    state.rounds = DEFAULT_ROUNDS;
    playerMemo.clear();
    disarmPassBackTrap();
  }

  // Deal a local round and start the cards going round. No countdown and no
  // card timer: the 3-2-1 exists to line up separate devices, and the card's
  // five seconds exist so a room reads its word together. Neither has anything
  // to line up here — each player reads their own card in their own time and
  // taps when they are done.
  function startLocalSitting() {
    const deal = dealRound();
    const meta = state.meta;
    meta.imposterIds = deal.imposterIds;
    meta.secretWord = deal.entry.w;
    meta.imposterHint = deal.hint;
    meta.order = deal.order;
    meta.rounds = clampRounds(state.rounds);
    meta.turn = 0;
    meta.turnAt = null;
    meta.phase = 'card';
    state.players.forEach(p => { p.isImposter = !!deal.imposterIds[p.id]; });
    applyLocalPlayed(deal);
    resetCanvasState();       // a fresh canvas, same as 'strokes': null online
    trackRound(deal.cat, deal.entry.w);
    startPassSequence();
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
    state.players.forEach((p, i) => { soFar[i] = { av: p.av, c: p.c }; });
    const id = 'local_' + (localIdSeq++);
    state.players.push({
      id,
      name: nextPlayerName(),
      ready: true,
      // Past the end, not at the count: deleting a row from the middle would
      // otherwise let the next one added tie with an existing row, and the
      // lobby sorts on this.
      joinedAt: Math.max(-1, ...state.players.map(p => p.joinedAt)) + 1,
      av: pickAvatar(soFar),
      c: pickColor(soFar),
      isHost: false,
      isImposter: false,
      isMe: false,
      isBot: false,
    });
    refreshLocalMemo();
    saveRoster();
    renderLobby();
  }

  function removeLocalPlayer(id) {
    commitOpenEdit();
    const p = state.players.find(x => x.id === id);
    if (!p || state.players.length <= MIN_PLAYERS) return;
    state.players = state.players.filter(x => x.id !== id);
    // Any row can go, row one included, so this device's default identity can
    // be the one that just left. Repoint it: both handovers overwrite
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

  // Commit whatever is in an open rename field before doing anything else, so
  // a half-typed name is never lost to a tap on another control.
  function commitOpenEdit() {
    if (!state.editingId) return;
    const input = document.querySelector('#players-list .roster-input');
    const id = state.editingId;
    state.editingId = null;
    if (input) applyRosterName(id, input.value);
  }

  function applyRosterName(id, raw) {
    const p = state.players.find(x => x.id === id);
    if (!p) return;
    const name = String(raw || '').trim().slice(0, 14);
    if (name) p.name = name;
    refreshLocalMemo();
    saveRoster();
  }

  // Roster controls, recognised as taps rather than presses.
  //
  // Firing on pointerdown would mean the instant a finger lands: starting a
  // scroll with a fingertip over the pencil would open a rename before the
  // page had moved. A tap needs the finger to go down and come up on the same
  // control without wandering, and the browser's pointercancel (fired the
  // moment it claims the gesture for panning) drops it outright.
  //
  // Delegated to the list, which survives the re-renders these actions cause.
  // Bound per row, a commit-driven rebuild could replace the button between
  // the finger going down and coming up, and the action would be lost with it.
  const TAP_SLOP = 10;   // px of drift still counted as a tap, not a drag
  let rosterTap = null;

  // Drive a button from its pointer events instead of from `click`.
  //
  // A button tapped immediately after a drag can lose that tap on Android. The
  // drag ends in Chrome's gesture pipeline, and a tap arriving while that is
  // still settling gets swallowed there: the touch still produces pointerdown
  // and pointerup, so the button lights up under the thumb, but no click is
  // ever generated and the phone appears to ignore the press. Waiting a beat
  // and tapping again works, which is exactly what players reported on the
  // word game's Pass button. iOS does not behave this way, so on an iPhone
  // this looks like dead code.
  //
  // Three buttons in this game sit right after a drag: Pass to Next Player
  // after the card swipe, and Done and Undo after drawing a stroke. The last
  // two are on the online path too, where the bug is just as real.
  //
  // `click` stays wired for keyboard and assistive tech.
  //
  // Acting on pointerup means the screen can change before the browser gets
  // round to dispatching the click for that same physical tap, and the click
  // then lands on whatever is now under the finger. That is not theoretical:
  // Reveal Impostor and Play Again both sit in the sticky bar at the foot of
  // consecutive screens, so tapping Reveal put its own trailing click straight
  // onto Play Again and sent the group back to the lobby instead of showing
  // them the impostor. A per-button guard could never have caught that, since
  // the click was landing on a different button entirely.
  //
  // So a tap we have already acted on swallows its click wherever it lands.
  // Capture phase, so no handler anywhere sees it; one-shot and short, so a
  // genuine second tap still gets through. It also covers the non-idempotent
  // case the per-button guard was there for: without it, one tap on Undo
  // removed two strokes.
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

  function wireTap(btn, fn) {
    if (!btn) return;
    let tap = null;

    btn.addEventListener('pointerdown', (e) => {
      tap = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // Capture, so the release comes back here even if something animating
      // above the button (the card's 3D flip on a short screen) covers it.
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    });

    btn.addEventListener('pointerup', (e) => {
      const t = tap;
      tap = null;
      try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!t || e.pointerId !== t.id) return;
      if (Math.abs(e.clientX - t.x) > TAP_SLOP ||
          Math.abs(e.clientY - t.y) > TAP_SLOP) return;
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

  (function wireRosterTaps() {
    const list = $('players-list');
    if (!list) return;
    const control = (e) => {
      const el = e.target.closest && e.target.closest('.roster-edit, .roster-del, .add-player-row');
      return (el && !el.disabled) ? el : null;
    };

    list.addEventListener('pointerdown', (e) => {
      if (!state.local) return;
      const el = control(e);
      rosterTap = el ? { el, x: e.clientX, y: e.clientY } : null;
    });

    list.addEventListener('pointerup', (e) => {
      const t = rosterTap;
      rosterTap = null;
      if (!t || !state.local) return;
      if (Math.abs(e.clientX - t.x) > TAP_SLOP || Math.abs(e.clientY - t.y) > TAP_SLOP) return;
      if (control(e) !== t.el) return;   // lifted over something else
      const row = t.el.closest('[data-pid]');
      const id = row && row.dataset.pid;
      if (t.el.classList.contains('add-player-row')) addLocalPlayer();
      else if (t.el.classList.contains('roster-edit')) startEditing(id);
      else if (t.el.classList.contains('roster-del')) removeLocalPlayer(id);
    });

    list.addEventListener('pointercancel', () => { rosterTap = null; });
  })();

  // ============================================================
  // PASS THE PHONE — the private card sequence
  // ============================================================
  // One card with two sides, turned over by hand. On separate devices privacy
  // is free: your card is on your own phone. On one phone it is entirely a UI
  // guarantee, and one way to see somebody else's side breaks the whole game.
  // So the rules here are strict, and they are the word game's rules verbatim.
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
  //   * Back is trapped for the whole sitting. A swipe or a hardware back
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
    // into the drawing instead of round-tripping through an extra screen.
    $('btn-pass-next').textContent = isLastPassCard() ? 'Start Drawing' : 'Pass to Next Player';
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
    if (!card) return;

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
      // next screen is never reached with a word still sitting behind it.
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

  wireTap($('btn-pass-next'), advancePass);

  function finishPassSequence() {
    state.passSeq = null;
    beginLocalDrawing();
  }

  // ============================================================
  // PASS THE PHONE — the drawing, one turn at a time
  // ============================================================
  // The second handover, and unlike the card there is nothing to it. Nothing
  // here is secret: the canvas is public and the group is watching it, so
  // there is no swipe to earn and no blanking to do. Done hands the pen
  // straight to the next player, the pill changes to their name, and the phone
  // goes across the table. No screen in between and nothing to tap first.
  //
  // There is also no clock. Online, a turn expires after TURN_MS so a player
  // who has closed their tab cannot stall the room forever, which is the only
  // job that timer has. Nobody can vanish from a phone that is being handed
  // round, and a countdown started when the previous player tapped Done would
  // burn down while the phone was still in the air. So meta.turnAt stays null
  // for the whole mode, the turn ticker never starts, and renderTurnBar's
  // existing `if (turnAt)` branch leaves the timer, its tick and its urgency
  // flash off by themselves.
  //
  // meta.turn and meta.order are the same fields the room game keeps in
  // Firebase, in the same shapes, so canDraw(), renderTurnBar() and
  // renderTurnStrip() all run unmodified.

  function beginLocalDrawing() {
    const meta = state.meta;
    meta.phase = 'playing';
    meta.turn = 0;
    meta.turnAt = null;
    advanceGuard = -1;
    drawerGoneAt = 0;
    if (!takeLocalTurn(0)) { finishLocalDrawing(); return; }
    go('game');
    sizeCanvas();
    startCanvasFitWatch();
    updatePlayControls();
  }

  // Give the pen to whoever owns this slot. "You are player N now", the same
  // trick the card sequence uses: canDraw() and every stroke written take
  // their identity from these two lines.
  function takeLocalTurn(turn) {
    const p = playerById(drawerAt(turn));
    if (!p) return false;
    state.myId = p.id;
    state.myC = p.c || 0;
    myStrokeIds = [];   // undo reaches back over this turn only
    updateDrawUI();
    return true;
  }

  // Done is the only way a local turn ends, and unlike online it does not go
  // inert once tapped: the next drawer is this same device, so canDraw() is
  // true again immediately and a fast double tap would hand the pen straight
  // past somebody, silently, with nobody noticing until the reveal. Online the
  // button stops being yours the moment the turn moves on, which is why this
  // guard has no counterpart there.
  //
  // Long enough to cover a double tap, which lands inside 300ms, and short
  // enough not to eat a real second press: a genuine one needs the phone to
  // change hands first, so it is seconds away, not milliseconds.
  const LOCAL_ADVANCE_LOCKOUT_MS = 350;
  let lastLocalAdvance = 0;

  // Pass the pen locally. Mirrors fbAdvanceTurn: same staleness guard, same
  // "nobody left to draw" ending, no writes.
  function advanceLocalTurn(fromTurn) {
    if (!state.local || !state.meta || state.meta.phase !== 'playing') return;
    if (currentTurn() !== fromTurn) return;
    if (Date.now() - lastLocalAdvance < LOCAL_ADVANCE_LOCKOUT_MS) return;
    lastLocalAdvance = Date.now();
    forceEndStroke();

    const next = nextPresentTurn(fromTurn);
    if (next === -1) { finishLocalDrawing(); return; }
    state.meta.turn = next;
    if (!takeLocalTurn(next)) finishLocalDrawing();
  }

  // Who drew in which colour. During play the turn strip carries this, and it
  // leaves with the play screen, which is precisely when the group starts
  // asking whose line the red one was. Rendered in turn order, so the list
  // reads in the order the drawing was built.
  //
  // Names come from playerMemo rather than state.players for the same reason
  // the reveal does: online a player can leave mid-round and still has to be
  // named against their ink.
  function renderInkLegend(elId) {
    const list = $(elId);
    if (!list) return;
    const ids = turnOrder().length ? turnOrder() : state.players.map(p => p.id);
    list.innerHTML = '';
    ids.forEach(id => {
      const known = playerMemo.get(id) || {};
      const row = document.createElement('div');
      row.className = 'legend-row';
      row.insertAdjacentHTML('beforeend', avatarHtml({ name: known.name || 'Player', av: known.av || 0 }));
      const name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = known.name || 'Player';
      const dot = document.createElement('span');
      dot.className = 'pdot';
      dot.style.background = inkOf(known.c || 0);
      row.appendChild(name);
      row.appendChild(dot);
      list.appendChild(row);
    });
  }

  // Every turn taken. No ballot: a secret vote needs a screen each, and there
  // is only the one. The group argues over the drawing instead and somebody
  // taps Reveal, which is how the dance game ends too.
  function finishLocalDrawing() {
    const meta = state.meta;
    forceEndStroke();
    stopTurnTicker();
    stopCanvasFitWatch();
    meta.phase = 'passover';
    meta.turn = totalTurns();
    meta.turnAt = null;
    state.myId = null;
    renderInkLegend('pass-over-legend');
    go('pass-over');
    // Painted after the screen is shown, so the thumbnail has a laid-out
    // parent to measure. strokes still hold the finished drawing.
    paintThumb('pass-over-canvas', 220);
  }

  // Wired the same way as the rest of the flow. Nothing drags on this screen
  // today, but it is the last action of the whole sitting and the group has
  // just spent a minute arguing to get here, so it is the worst one to lose.
  wireTap($('btn-pass-reveal'), () => {
    if (state.local) revealImposter();
  });

  // Play Again returns to the lobby rather than dealing on the spot, the same
  // as the room game does. Between rounds is when a group swaps a category,
  // adds someone who has just turned up or changes the round count, and the
  // lobby is the only place those controls exist.
  function replayLocalRound() {
    closeFbPopup(false);
    disarmPassBackTrap();  // the lobby has its own way out again
    const meta = state.meta || (state.meta = {});
    meta.phase = 'lobby';
    meta.imposterIds = null;
    meta.secretWord = null;
    meta.imposterHint = null;
    meta.order = null;
    meta.turn = null;
    meta.turnAt = null;
    state.players.forEach(p => { p.isImposter = false; });
    state.myId = state.players.length ? state.players[0].id : null;
    state.editingId = null;
    state.votes = {};
    resetCanvasState();
    enterLobby();
  }

  // Back is the one gesture that would otherwise walk onto the card just
  // handed over, so for the length of the sitting it does nothing at all.
  // Every intercepted press re-pushes the entry it consumed, which keeps the
  // history length flat however many times it happens.
  //
  // It stays armed past the last card, through every drawing turn and the
  // reveal, because none of it is written down anywhere: a stray back swipe on
  // a phone being handed across a table would take the whole round with it.
  // Every screen it covers has a button that moves forward, and leaving the
  // sitting disarms it.
  //
  // Disarming leaves the pushed entry behind rather than unwinding it:
  // history.back() is asynchronous, so a round started before it landed would
  // arm the trap over an entry that was about to vanish. Instead, arming
  // checks whether the marker is already the current entry and only pushes
  // when it is not.
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
  // HOME SCREEN
  // ============================================================

  // Hero character. It sketches on arrival, winds down, rests for 8.25s,
  // repeats. Tapping it restarts the burst. Choreography and the .dw-run /
  // .dw-once gates live in draw.css; this only decides which gate is on and
  // when to rewind.
  const heroDrawer = $('hero-drawer');
  const calmMotion = window.matchMedia
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  const wantsCalm = () => !!(calmMotion && calmMotion.matches);

  function restartHeroDraw() {
    if (!heroDrawer) return;
    heroDrawer.classList.remove('dw-run', 'dw-once');
    heroDrawer.classList.add(wantsCalm() ? 'dw-once' : 'dw-run');
    // Rewind every part to frame 0. The usual `void el.offsetWidth` reflow
    // trick does NOT work here: offsetWidth is an HTMLElement property and
    // reads undefined on an SVGElement, so no layout is forced, the class
    // swap coalesces into a single style recalc, and the animation simply
    // carries on from wherever it was. It fails silently, with no error and
    // nothing in the console. Driving currentTime is explicit and works.
    if (typeof heroDrawer.getAnimations !== 'function') return;
    heroDrawer.getAnimations({ subtree: true }).forEach(a => {
      a.currentTime = 0;
      a.play();
    });
  }

  function armHeroDraw() {
    if (!heroDrawer) return;
    heroDrawer.classList.remove('dw-run', 'dw-once');
    // Reduced motion means nothing moves on its own. A tap is different:
    // that is the visitor asking for it, so restartHeroDraw still runs,
    // just once instead of forever.
    if (!wantsCalm()) heroDrawer.classList.add('dw-run');
  }

  if (heroDrawer) {
    heroDrawer.addEventListener('pointerdown', restartHeroDraw);
    if (calmMotion && calmMotion.addEventListener) {
      calmMotion.addEventListener('change', armHeroDraw);
    }
    armHeroDraw();
  }

  $('howto-scroll').addEventListener('click', () => {
    const target = $('how-to-play');
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('btn-create').addEventListener('click', () => {
    if (!FB_CONFIGURED) { go('needs-setup'); return; }
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
      const roomSnap = await get(ref(db, `${ROOMS}/${code}`));
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
      if (room.meta.phase !== 'lobby') {
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

  // Mobile keyboards: the Enter/Go key submits the name screens directly.
  $('join-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-join').click(); }
  });
  $('host-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-go-lobby').click(); }
  });

  // iOS keyboards overlay the page instead of resizing it, so the
  // bottom-anchored action bars would hide behind the keyboard. Track the
  // visual viewport and lift the bars to sit on top of it.
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
  $('btn-go-lobby').addEventListener('click', async () => {
    const name = $('host-name').value.trim() || 'Host';
    $('btn-go-lobby').disabled = true;
    try {
      await createRoom(name);
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
    $('share-code').textContent = code;
    renderQRInto($('share-qr'), code);
    go('host-share');
  }

  // Build a QR for a deep link that drops the scanner on the join-name step.
  // Uses the vendored qrcode-generator global; fails quietly to the code-only
  // view if anything goes wrong. Always uses SHARE_BASE, which resolves the
  // native app's useless https://localhost origin to the real website.
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

  $('share-code').addEventListener('click', copyRoomCode);
  $('share-copy-btn').addEventListener('click', copyRoomCode);
  // Tap-driven, not click-driven. The share screen scrolls (QR, code, copy
  // button), so "Go to Lobby" is routinely tapped straight after a drag, which
  // is the exact Android case wireTap exists for: pointerdown and pointerup
  // both arrive, so press.js lights the tile up under the thumb, but no click
  // is ever generated and the host sits on the share screen wondering why the
  // button did nothing. Reported from production on the online path.
  wireTap($('btn-share-continue'), () => {
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
    // order — this copy is presentation-only.
    //
    // Pass the Phone keeps entry order instead. The roster is typed in rather
    // than joined into, so Player 2 above Player 3 is what the host expects,
    // and it is the order the phone will travel in — for the cards and then
    // for the pen, because locally the turn order is the roster (dealRound).
    const ordered = [...state.players].sort((a, b) =>
      pass ? (a.joinedAt - b.joinedAt) : ((b.isHost - a.isHost) || (b.joinedAt - a.joinedAt)));
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Before wiping the list, snapshot each current row's position keyed by
    // player id. Rows whose player just left become a fading ghost; survivors
    // get FLIP-slid to their new spot after the rebuild.
    const firstRects = new Map();
    if (!reduceMotion) {
      const liveIds = new Set(ordered.map(p => p.id));
      [...list.children].forEach(c => {
        const pid = c.dataset.pid;
        if (!pid) return;
        const rect = c.getBoundingClientRect();
        firstRects.set(pid, rect);
        if (!liveIds.has(pid)) {
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
        // would mean a finger landing anywhere on the list to scroll could
        // open a field.
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
        // and a confetti burst per added row reads as noise.
        burstFired.add(p.id);
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
    // The host draws and votes like everyone else here, so every player
    // counts toward the minimum — only non-hosts have a ready toggle.
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
    // stages have nothing to measure. games/modes/passphone is what counts it.
    if (isHost && !pass) {
      if (total >= 2) trackRoomStage('joined2');
      if (total >= MIN_PLAYERS) trackRoomStage('reachedMin');
      if (allReady) trackRoomStage('allReady');
    }

    $('ready-count').textContent = readyCount;
    $('player-count').textContent = nonHosts.length;

    // Rounds stepper: host-only controls, everyone sees the value.
    $('rounds-count-num').textContent = state.rounds;
    $('rounds-count-label').textContent = state.rounds === 1 ? 'Round' : 'Rounds';
    $('lobby-rounds-minus').style.display = isHost ? '' : 'none';
    $('lobby-rounds-plus').style.display = isHost ? '' : 'none';
    $('lobby-rounds-minus').disabled = state.rounds <= MIN_ROUNDS;
    $('lobby-rounds-plus').disabled = state.rounds >= MAX_ROUNDS;
    // The row's label reads just "Rounds", so the pill spells out what they
    // count for anyone hearing it rather than seeing it.
    $('rounds-pill').setAttribute('aria-label',
      `${state.rounds} drawing round${state.rounds === 1 ? '' : 's'}`);

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
    // Wake lock covers most devices; where it can't, rotate in the screen-on tip.
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

    // Category and mode are one row each, and both read the same either way.
    // For a player the row simply stops being a control: the chevron goes and
    // the tap does nothing, which is what .readonly carries. It used to swap
    // the whole trigger out for a static copy of the same text.
    $('category-trigger-text').textContent = categoriesSummary(activeCategories());
    $('category-trigger').classList.toggle('readonly', !isHost);
    // If the modal is currently open, re-render so the selected row reflects
    // changes that came in via Firebase.
    if ($('cat-modal-backdrop').classList.contains('open')) renderCategoryModal();
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
      await createRoom(name);
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
    detachStrokeListeners();
    if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
    if (db && state.roomCode && state.myId) {
      try { onDisconnect(ref(db, `${ROOMS}/${state.roomCode}/players/${state.myId}`)).cancel(); } catch (e) {}
      try { await remove(ref(db, `${ROOMS}/${state.roomCode}`)); } catch (e) {}
    }
    state.roomCode = null;
    resetRoomFunnel();
    lobbySeen.clear();
    burstFired.clear();
    playerMemo.clear();
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

  // Host only. A joined player sees the mode but can't change it.
  $('mode-trigger').addEventListener('click', () => { if (state.isHost) openModeModal(); });
  $('mode-modal-close').addEventListener('click', closeModeModal);
  $('mode-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('mode-modal-backdrop').classList.contains('open')) closeModeModal();
  });

  // ============================================================
  // CATEGORY PICKER — host only. Two modes, like iPhone Photos:
  //  - Default: tapping a row picks that single category and closes.
  //  - Select: tapping the "Select" pill turns each row into a checkbox so
  //    several can be chosen at once; "Done" commits, "Cancel" discards.
  // At least one category must stay selected. Closing via X / backdrop /
  // Escape always discards and leaves the committed set.
  // ============================================================
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
  }

  function closeCategoryModal() {
    $('cat-modal-backdrop').classList.remove('open');
  }

  function toggleSelectMode() {
    if (catMultiMode) {
      catMultiMode = false; // Cancel — leave Select mode without applying
    } else {
      catMultiMode = true;
      modalSelection = new Set(activeCategories());
    }
    renderCategoryModal();
  }

  async function commitCategories(cats) {
    closeCategoryModal();
    if (!cats.length) return;
    // Pass the Phone keeps its meta in this tab, so the pick lands directly.
    if (state.local) {
      state.meta.categories = cats;
      state.meta.category = cats[0];
      renderLobby();
      return;
    }
    if (!state.isHost || !db || !state.roomCode) return;
    try {
      // Keep `category` in sync (= first pick) for any reader that predates
      // the `categories` array.
      await update(ref(db, `${ROOMS}/${state.roomCode}/meta`), { categories: cats, category: cats[0] });
    } catch (err) {
      showToast('Could not change category');
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
    title: 'Talk to creator',
    opener: 'Hey! Hope you’re having fun 🙂\n\nFound a bug, got an idea, or want more categories or games? Tell me — let me fix it for you.',
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
  // Counts completed rounds per device (localStorage, shared across all
  // games — same origin). From FB_PROMPT_AT rounds on, the Round Over screen
  // auto-opens a small feedback popup, 2s after the reveal. It returns on
  // later Round Overs until the player interacts once, then never again.
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
  $('btn-ready').addEventListener('click', () => { fbToggleReady(); });
  $('btn-start').addEventListener('click', () => { fbStartGame(); });

  // ============================================================
  // SHARED CANVAS
  // Strokes live at rooms-draw/<code>/strokes/<pushId> as
  //   { by: playerId, c: inkIndex, p: [x0,y0,x1,y1,…] }
  // with coordinates normalised to integers 0..COORD. Normalised points
  // plus a square canvas are what make a phone and a laptop show the same
  // picture — raw pixels would not survive the aspect-ratio difference.
  //
  // Sync uses child listeners, NOT one onValue on the strokes node: onValue
  // would re-send every stroke in the room on every point flush, which is
  // precisely the wrong shape for live drawing.
  // ============================================================
  const COORD = 1000;      // normalised coordinate space
  const FLUSH_MS = 90;     // how often an in-progress stroke is pushed
  const MIN_STEP = 4;      // drop points closer than this (in COORD units)
  const MAX_POINTS = 400;  // per stroke, so one scribble can't run away

  const strokes = new Map();  // id -> { by, c, p:[] }; insertion order = draw order
  let strokeUnsubs = [];
  let myStrokeIds = [];       // strokes I laid down this round, newest last
  let live = null;            // the stroke currently under the pointer
  let canvas = null, ctx = null, cssSize = 0;
  // Held in a variable on purpose: an unreferenced ResizeObserver can be
  // garbage-collected, which silently stops the canvas following the window
  // (it kept its desktop size after a switch to a phone viewport).
  let canvasRO = null;
  // Belt and braces for the canvas size. ResizeObserver and the window resize
  // event are both unreliable in practice — mobile browsers famously skip
  // resize when the URL bar slides away, and neither fires at all in the
  // headless preview this was tested in. A cheap poll while a round is on
  // screen means a wrong-sized canvas can never persist for more than a beat.
  let canvasFitTimer = null;

  // Strictly one pen at a time: the canvas only accepts input from the player
  // whose slot is live. Everyone else is a spectator watching it arrive.
  function canDraw() {
    // The state.myId check matters locally: it is cleared once the last turn
    // is taken, so a touch landing on the canvas under the rounds-over screen
    // cannot add to a finished drawing.
    return !!(state.meta && state.meta.phase === 'playing'
              && state.myId && currentDrawerId() === state.myId);
  }

  function startCanvasFitWatch() {
    stopCanvasFitWatch();
    canvasFitTimer = setInterval(sizeCanvas, 500);
  }
  function stopCanvasFitWatch() {
    if (canvasFitTimer) { clearInterval(canvasFitTimer); canvasFitTimer = null; }
  }

  function sizeCanvas() {
    if (!canvas || !ctx) return;
    const wrap = $('canvas-wrap');
    // The turn strip now shares the wrap, sitting under the canvas. Leave it its
    // height (plus the flex gap) so the square is never sized over the chips.
    const strip = $('turn-strip');
    const reserved = strip && strip.offsetParent ? strip.offsetHeight + 10 : 0;
    const size = Math.max(160, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight - reserved)));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (size === cssSize && canvas.width === Math.round(size * dpr)) return;
    cssSize = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  // Paint every stroke into any square context at any size. Coordinates are
  // normalised, so the same drawing renders identically on the live canvas
  // and on the thumbnail that goes to the vote.
  function paintStrokes(g, size) {
    g.clearRect(0, 0, size, size);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1.5, size * 0.009);
    const k = size / COORD;
    strokes.forEach(st => {
      const p = st && st.p;
      if (!p || p.length < 2) return;
      g.strokeStyle = inkOf(st.c);
      g.beginPath();
      g.moveTo(p[0] * k, p[1] * k);
      if (p.length === 2) {
        // A tap with no drag still deserves a dot, so nudge the end point.
        g.lineTo(p[0] * k + 0.01, p[1] * k);
      } else {
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * k, p[i + 1] * k);
      }
      g.stroke();
    });
  }

  function redraw() {
    if (!ctx || !cssSize) return;
    paintStrokes(ctx, cssSize);
  }

  // One-off render of the finished drawing into a fixed-size square canvas.
  function paintThumb(elId, max) {
    const c = $(elId);
    if (!c || !c.parentElement) return;
    const size = Math.max(120, Math.min(c.parentElement.clientWidth, max));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintStrokes(g, size);
  }

  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    const clamp = (v) => Math.max(0, Math.min(COORD, Math.round(v)));
    return [clamp(((ev.clientX - r.left) / r.width) * COORD),
            clamp(((ev.clientY - r.top) / r.height) * COORD)];
  }

  // Write the whole stroke: it is one small array, and re-setting it keeps
  // late joiners and reconnects consistent without any patch bookkeeping.
  // Pass the Phone has no room and no second screen to keep consistent, so
  // strokes live only in the Map above and this never runs (l.ref is null).
  function flushStroke(l) {
    if (!l || !l.dirty || !db || !l.ref) return;
    l.dirty = false;
    set(l.ref, { by: state.myId, c: state.myC || 0, p: l.pts.slice() }).catch(() => {});
  }
  function flushLive() { flushStroke(live); }

  // Ids for local strokes. push() mints them online; here they only have to be
  // unique within the sitting, and never reused, since undo deletes by key.
  let localStrokeSeq = 0;

  function onDown(ev) {
    if (!canDraw() || live) return;
    if (!state.local && (!db || !state.roomCode)) return;
    ev.preventDefault();
    const [x, y] = canvasPoint(ev);
    const node = state.local ? null : push(ref(db, `${ROOMS}/${state.roomCode}/strokes`));
    const key = node ? node.key : 'local_s' + (localStrokeSeq++);
    live = { id: key, ref: node, pts: [x, y], dirty: true, timer: null };
    // Paint locally straight away; online the server echo lands on the same key.
    strokes.set(key, { by: state.myId, c: state.myC || 0, p: live.pts });
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    redraw();
    updateDrawUI();
    if (node) {
      flushLive();
      live.timer = setInterval(flushLive, FLUSH_MS);
    }
  }

  function onMove(ev) {
    if (!live) return;
    ev.preventDefault();
    const p = live.pts;
    if (p.length >= MAX_POINTS * 2) return;
    const [x, y] = canvasPoint(ev);
    const dx = x - p[p.length - 2], dy = y - p[p.length - 1];
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return;
    p.push(x, y);
    live.dirty = true;
    redraw();
  }

  function onUp() {
    if (!live) return;
    const l = live;
    live = null;
    clearInterval(l.timer);
    l.dirty = true;
    flushStroke(l);
    myStrokeIds.push(l.id);
    updateDrawUI();
    touchRoom();
  }

  // Undo removes only my own strokes, only while I may draw, and only one at
  // a time — never anyone else's work, and never mid-stroke.
  function undoLast() {
    if (!canDraw() || live || !myStrokeIds.length) return;
    if (!state.local && (!db || !state.roomCode)) return;
    const id = myStrokeIds.pop();
    strokes.delete(id);
    redraw();
    if (!state.local) remove(ref(db, `${ROOMS}/${state.roomCode}/strokes/${id}`)).catch(() => {});
    updateDrawUI();
    touchRoom();
  }

  // End the stroke under my finger as if I'd lifted it. Used when my turn is
  // taken away mid-line (timer, or the host forcing the round to end).
  function forceEndStroke() { if (live) onUp(); }

  function updateDrawUI() {
    const mine = canDraw();
    if (canvas) canvas.classList.toggle('locked', !mine);
    const undo = $('btn-undo');
    if (undo) undo.disabled = !(mine && myStrokeIds.length > 0 && !live);
    const done = $('btn-done');
    if (done) done.disabled = !mine;
    // The only thing that button mutes is the turn clock's tick, and Pass the
    // Phone has no clock. Left visible it would be a control that does nothing.
    const sound = $('btn-sound');
    if (sound) sound.style.display = state.local ? 'none' : '';
    $('game-back-btn').textContent = state.isHost ? '← Quit Game' : '← Leave';
    renderTurnStrip();
    renderTurnBar();
  }

  // The header: which round, and whose pen. Called on every tick, so it only
  // ever writes text and classes — the strip below is rebuilt separately.
  function renderTurnBar() {
    const pill = $('turn-pill');
    if (!pill) return;
    const m = state.meta || {};
    const phase = m.phase;
    const turn = currentTurn();
    const drawerId = currentDrawerId();
    const drawer = playerById(drawerId);
    const mine = drawerId === state.myId && phase === 'playing';
    pill.classList.toggle('is-mine', mine);
    // The canvas edge greens up on the drawer's own screen only, echoing the
    // green pill so "it's you" reads without words.
    if (canvas) canvas.classList.toggle('is-my-turn', mine);

    let label;
    if (phase === 'playing') {
      // On a shared phone the pill is the only thing saying whose go it is,
      // and "Your turn" would be read by four people at once. It always names
      // the drawer, which is also what the room game shows spectators.
      if (drawer && (state.local || !mine)) label = `${drawer.name}’s turn`;
      else if (mine) label = 'Your turn';
      else label = 'Passing…';   // drawer left; the watchdog is about to skip them
    } else {
      label = 'Getting ready…';
    }
    $('turn-label').textContent = label;

    const total = clampRounds(m.rounds);
    $('turn-round').textContent = (phase === 'playing' && turnOrder().length)
      ? `Round ${Math.min(roundOfTurn(turn), total)} / ${total}` : '';

    const timerEl = $('turn-timer');
    const turnAt = typeof m.turnAt === 'number' ? m.turnAt : 0;
    if (phase === 'playing' && turnAt) {
      const left = Math.max(0, Math.ceil((turnAt - nowSync()) / 1000));
      timerEl.textContent = String(left);
      timerEl.classList.toggle('urgent', left <= 10);
    } else {
      timerEl.textContent = '';
      timerEl.classList.remove('urgent');
    }
    pill.classList.toggle('no-timer', !timerEl.textContent);
  }

  // The play order, in everyone's ink. Rebuilt only when the room changes,
  // never on the 250ms tick, so the sideways scroll isn't yanked about.
  function renderTurnStrip() {
    const strip = $('turn-strip');
    if (!strip) return;
    const order = turnOrder();
    const activeId = (state.meta && state.meta.phase === 'playing') ? currentDrawerId() : null;
    strip.innerHTML = '';
    let activeEl = null;
    order.forEach(id => {
      const known = playerMemo.get(id) || {};
      const chip = document.createElement('span');
      chip.className = 'pchip'
        + (id === activeId ? ' is-active' : '')
        + (playerById(id) ? '' : ' is-gone');
      const dot = document.createElement('span');
      dot.className = 'pdot';
      dot.style.background = inkOf(known.c || 0);
      const nameEl = document.createElement('span');
      // No "(You)" on a shared phone: state.myId is only ever whoever is
      // holding it this turn, and the active chip already says so.
      nameEl.textContent = (known.name || 'Player')
        + ((!state.local && id === state.myId) ? ' (You)' : '');
      chip.appendChild(dot);
      chip.appendChild(nameEl);
      strip.appendChild(chip);
      if (id === activeId) activeEl = chip;
    });
    // Centre the live chip. Setting scrollLeft directly rather than calling
    // scrollIntoView, which would also scroll the page itself.
    if (activeEl) {
      strip.scrollLeft = Math.max(0, activeEl.offsetLeft - (strip.clientWidth - activeEl.offsetWidth) / 2);
    }
  }

  function attachStrokeListeners() {
    detachStrokeListeners();
    if (!db || !state.roomCode) return;
    const sref = ref(db, `${ROOMS}/${state.roomCode}/strokes`);
    const upsert = (snap) => {
      const v = snap.val();
      if (!v) return;
      // Ignore the echo of the stroke still under my pointer, or it would
      // replace the array I'm actively appending to.
      if (live && snap.key === live.id) return;
      strokes.set(snap.key, { by: v.by, c: v.c || 0, p: v.p || [] });
      redraw();
    };
    strokeUnsubs = [
      onChildAdded(sref, upsert),
      onChildChanged(sref, upsert),
      onChildRemoved(sref, (snap) => { strokes.delete(snap.key); redraw(); }),
    ];
  }

  function detachStrokeListeners() {
    strokeUnsubs.forEach(u => { try { u(); } catch (e) {} });
    strokeUnsubs = [];
  }

  function resetCanvasState() {
    if (live) { clearInterval(live.timer); live = null; }
    strokes.clear();
    myStrokeIds = [];
    redraw();
  }

  (function initCanvas() {
    canvas = $('draw-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', onDown);
    // Move/up on the window as well, so a stroke that runs off the canvas
    // (or lifts outside it) still ends cleanly.
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    if (window.ResizeObserver) {
      canvasRO = new ResizeObserver(() => sizeCanvas());
      canvasRO.observe($('canvas-wrap'));
    }
    window.addEventListener('resize', sizeCanvas);
    // Rotating a phone fires neither reliably on some browsers.
    window.addEventListener('orientationchange', () => setTimeout(sizeCanvas, 150));
    // Both of these are tapped straight after a stroke, so both are recognised
    // from their pointer events rather than from click. See wireTap.
    wireTap($('btn-undo'), undoLast);
    wireTap($('btn-done'), () => {
      if (!canDraw()) return;
      forceEndStroke();
      if (state.local) advanceLocalTurn(currentTurn());
      else fbAdvanceTurn(currentTurn());
    });
  })();

  // ============================================================
  // GAMEPLAY — driven by meta.startAt (synced across clients).
  // The turn engine (#43) plugs into canDraw() above.
  // ============================================================
  // The word screen. Everyone reads their card here; the canvas is not
  // reachable until the host presses Start Drawing.
  function enterCardScreen() {
    closeFbPopup(false);
    resetCanvasState();
    advanceGuard = -1;
    drawerGoneAt = 0;
    go('card');
    renderCard();
    runCountdown();
    startPhaseClock();
  }

  function beginGame() {
    closeFbPopup(false);
    stopPhaseClock();   // the card's deadline is spent
    resetCanvasState();
    advanceGuard = -1;
    drawerGoneAt = 0;
    go('game');
    sizeCanvas();
    startCanvasFitWatch();
    updateDrawUI();
    updatePlayControls();
    attachStrokeListeners();
    startTurnTicker();
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
        renderCard();
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

  // The word screen. Everyone sees the word to draw; the impostor sees only
  // the vague hint, and is told they're the impostor. It holds for five
  // seconds and then opens the canvas by itself.
  // What belongs on a card, for either mode. Two renderers read this, the
  // card screen below and the back face of the passed card, so the shared
  // phone and the online game cannot drift apart on what a card says.
  function cardContent(meta, isImposter) {
    return {
      isImposter: !!isImposter,
      role: isImposter ? 'YOUR HINT' : 'THE WORD TO DRAW',
      text: isImposter ? meta.imposterHint : meta.secretWord,
    };
  }

  function renderCard() {
    const meta = state.meta || {};
    const card = cardContent(meta, meta.imposterIds && meta.imposterIds[state.myId]);
    const isImposter = card.isImposter;

    $('imposter-banner').style.display = isImposter ? 'inline-flex' : 'none';
    $('game-role').textContent = card.role;
    $('game-word').textContent = card.text || '—';
    $('word-card').classList.toggle('is-imposter', isImposter);
    $('card-back-btn').textContent = state.isHost ? '← Quit Game' : '← Leave';
    renderCardCount(meta.phase === 'card' ? secondsLeft(meta.cardAt) : null);
  }

  // Until the 3-2-1 has finished, the room is still being dealt in and there
  // is no card deadline yet, so there is nothing honest to count.
  function renderCardCount(left) {
    $('card-count').textContent = left == null ? '' : String(left);
    $('card-hint').textContent = left == null
      ? 'Getting everyone ready…'
      : 'Drawing starts in';
  }

  // The foot of the play screen: the Done button plus a quiet line holding
  // the word, which has to stay to hand all game without competing with the
  // canvas for attention.
  function updatePlayControls() {
    const m = state.meta || {};
    // Pass the Phone: this screen is face-up on the table with the whole group
    // round it, so it cannot carry the word. Online the line is a private
    // reminder on your own phone; here it would hand the impostor the answer
    // the moment somebody else took their turn. Players remember their card,
    // exactly as they would with a physical one.
    if (state.local) {
      $('game-hint').textContent = 'Draw what was on your card. Everyone can see this screen, so it stays off it.';
      return;
    }
    const isImposter = !!(m.imposterIds && m.imposterIds[state.myId]);
    $('game-hint').textContent = isImposter
      ? `You're the impostor. Your hint is “${m.imposterHint || ''}”. Watch the others draw and fake it.`
      : `The word is “${m.secretWord || ''}”. Try not to give too much away while drawing.`;
  }

  // ============================================================
  // VOTE SCREEN
  // ============================================================

  // The handover overlay. The vote screen is built and live underneath it the
  // whole time, so the two seconds cost nothing and the ballot is ready the
  // instant it lifts.
  let voteIntroTimer = null;

  function hideVoteIntro() {
    if (voteIntroTimer) { clearTimeout(voteIntroTimer); voteIntroTimer = null; }
    $('vote-intro').classList.remove('active');
  }

  function enterVoteScreen() {
    stopTurnTicker();
    forceEndStroke();
    closeFbPopup(false);
    go('vote');
    paintThumb('vote-canvas', 220);
    renderVote();
    hideVoteIntro();
    $('vote-intro').classList.add('active');
    voteIntroTimer = setTimeout(hideVoteIntro, VOTE_INTRO_MS);
  }

  function renderVote() {
    const list = $('vote-list');
    if (!list) return;
    const votes = state.votes || {};
    const myPick = votes[state.myId] || null;
    // Everyone who was dealt into the game, in play order. Players who have
    // since left stay on the list: if the impostor rage-quit, the room still
    // has to be able to pin it on them.
    const ids = (turnOrder().length ? turnOrder() : state.players.map(p => p.id))
      .filter(id => id !== state.myId);

    list.innerHTML = '';
    ids.forEach(id => {
      const known = playerMemo.get(id) || {};
      const here = !!playerById(id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'vote-row'
        + (id === myPick ? ' is-picked' : '')
        + (here ? '' : ' is-gone');
      row.setAttribute('aria-pressed', id === myPick ? 'true' : 'false');

      // Face, name, then the ink they drew in. The dot sits after the name so
      // the eye lands on who it is first and the colour second, which is the
      // order you actually think in when tying a line back to a person.
      row.insertAdjacentHTML('beforeend', avatarHtml({ name: known.name || 'Player', av: known.av || 0 }));
      const name = document.createElement('span');
      name.className = 'vote-name';
      name.textContent = known.name || 'Player';
      const dot = document.createElement('span');
      dot.className = 'pdot';
      dot.style.background = inkOf(known.c || 0);
      row.appendChild(name);
      row.appendChild(dot);

      // Says they have voted. Never says for whom.
      if (votes[id]) {
        row.insertAdjacentHTML('beforeend',
          '<span class="vote-tag">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          'Voted</span>');
      }
      row.addEventListener('click', () => fbCastVote(id));
      list.appendChild(row);
    });

    const eligible = state.players.length;
    const cast = Object.keys(votes).length;
    $('vote-sub').textContent = myPick
      ? 'You can change your mind until reveal.'
      : 'Tap a name. Nobody sees your pick until the reveal.';
    $('vote-back-btn').textContent = state.isHost ? '← Quit Game' : '← Leave';

    // The vote closes itself the moment the last player picks, so this is
    // only the way out of a room waiting on somebody who has stopped playing.
    const btn = $('btn-reveal');
    btn.style.display = state.isHost ? '' : 'none';
    btn.disabled = false;
    $('vote-hint').textContent = state.isHost
      ? `${cast} of ${eligible} voted. Reveal early if someone has dropped off.`
      : `${cast} of ${eligible} voted.`;
  }

  // ============================================================
  // REVEAL COUNTDOWN
  // Three seconds of nothing but "And the Impostor is…". No information on
  // it at all: it exists so the answer lands on a held breath rather than
  // arriving the instant the last person taps a name.
  // ============================================================
  function enterRevealCountdown() {
    stopTurnTicker();
    hideVoteIntro();
    closeFbPopup(false);
    go('reveal');
    renderBallotCount(secondsLeft(state.meta && state.meta.revealAt));
    startPhaseClock();
  }

  function renderBallotCount(left) {
    $('reveal-count').textContent = left == null ? '' : String(left);
  }

  // Who voted for whom, in play order so it reads the same on every screen.
  // Lives on the final screen, under the vote counts.
  function renderBallot() {
    const list = $('ballot-list');
    if (!list) return;
    const votes = state.votes || {};
    // Anyone who voted and then left is appended rather than dropped: their
    // vote counted, so it has to be shown.
    const ids = turnOrder().length ? turnOrder().slice() : state.players.map(p => p.id);
    Object.keys(votes).forEach(id => { if (!ids.includes(id)) ids.push(id); });

    list.innerHTML = '';
    ids.forEach(id => {
      const voter = playerMemo.get(id) || {};
      const targetId = votes[id];
      const row = document.createElement('div');
      row.className = 'ballot-row' + (targetId ? '' : ' is-blank');
      row.insertAdjacentHTML('beforeend', avatarHtml({ name: voter.name || 'Player', av: voter.av || 0 }));

      // Name and its ink together take the flexible slot, so the dot hugs the
      // name while the arrow still lines up down the column.
      const who = document.createElement('span');
      who.className = 'ballot-voter';
      const whoName = document.createElement('span');
      whoName.className = 'ballot-name';
      whoName.textContent = (voter.name || 'Player') + (id === state.myId ? ' (you)' : '');
      const voterDot = document.createElement('span');
      voterDot.className = 'pdot';
      voterDot.style.background = inkOf(voter.c || 0);
      who.append(whoName, voterDot);
      row.appendChild(who);

      if (targetId) {
        const target = playerMemo.get(targetId) || {};
        row.insertAdjacentHTML('beforeend',
          '<svg class="ballot-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
        row.insertAdjacentHTML('beforeend', avatarHtml({ name: target.name || 'Player', av: target.av || 0 }));
        const pick = document.createElement('span');
        pick.className = 'ballot-target';
        pick.textContent = target.name || 'Player';
        row.appendChild(pick);
        const targetDot = document.createElement('span');
        targetDot.className = 'pdot';
        targetDot.style.background = inkOf(target.c || 0);
        row.appendChild(targetDot);
      } else {
        const none = document.createElement('span');
        none.className = 'ballot-target is-none';
        none.textContent = 'Did not vote';
        row.appendChild(none);
      }
      list.appendChild(row);
    });
  }

  $('btn-reveal').addEventListener('click', () => { fbReveal(); });

  // ============================================================
  // REVEAL
  // ============================================================
  function revealImposter() {
    stopAllTimers();
    detachStrokeListeners();
    const meta = state.meta || {};
    // Read the ids, not the player list: an impostor who closed their tab is
    // already gone from players/, and they still have to be named.
    const ids = Object.keys(meta.imposterIds || {});
    const names = ids.map(id => {
      const known = playerMemo.get(id);
      const name = (known && known.name) || 'Someone';
      // No "(YOU)" and nobody has left in Pass the Phone: local players carry
      // isMe false, because on a shared phone there is no you, and state.myId
      // is whatever the last handover left it pointing at.
      if (state.local) return name;
      if (id === state.myId) return name + ' (YOU)';
      return playerById(id) ? name : name + ' (left the room)';
    }).join(' & ');
    $('reveal-name').textContent = names || '—';
    $('reveal-word').textContent = meta.secretWord || '—';

    // No ballot on a shared phone, so there is no verdict to deliver and
    // nothing to tally. The reveal itself is the whole payoff: the group has
    // already argued it out loud and the answer settles it.
    if (state.local) {
      $('verdict-title').textContent = 'Round Over';
      $('verdict-sub').textContent = '';
    } else {
      const outcome = voteOutcome();
      // The headline is the same for the room, but the party popper is not:
      // the impostor wins precisely when the room loses, so it goes to whoever
      // is actually on the winning side of this screen.
      const amImposter = ids.includes(state.myId);
      const iWon = outcome.caught ? !amImposter : amImposter;
      $('verdict-title').textContent = (outcome.caught ? 'Caught!' : 'They got away')
        + (iWon ? ' 🎉' : '');
      $('verdict-sub').textContent = outcome.caught
        ? 'The room voted out the impostor.'
        : !outcome.votes ? 'Nobody voted, so the impostor walks.'
        : outcome.tied ? 'The vote was split, so the impostor walks.'
        : 'The room voted out the wrong player.';
    }

    $('over-tally-section').style.display = state.local ? 'none' : '';
    $('over-ballot-section').style.display = state.local ? 'none' : '';
    // The ballot names everyone in their own ink already, so the legend only
    // earns its place where there is no ballot.
    $('over-legend-section').style.display = state.local ? '' : 'none';
    if (state.local) renderInkLegend('over-legend');
    else { renderTally(); renderBallot(); }
    $('btn-replay').style.display = state.isHost ? '' : 'none';
    // "Exit Room" would be wrong in Pass the Phone, where there is no room to
    // exit. state.isHost is true for the whole of that mode, so it already
    // lands on the right label.
    $('btn-home').textContent = state.isHost ? 'Quit Game' : 'Exit Room';
    countRoundAndMaybePrompt();
    go('over');
    // Paint after the screen is shown so the thumb has a laid-out parent to
    // measure. strokes still hold the finished drawing here — nothing clears
    // them between the vote and this reveal.
    paintThumb('over-canvas', 220);
  }

  // Only players who actually drew a vote get a row — a column of zeroes
  // tells nobody anything and pushes the buttons off a phone screen.
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
      empty.textContent = 'No votes were cast.';
      el.appendChild(empty);
      return;
    }
    rows.forEach(([id, n]) => {
      const known = playerMemo.get(id) || {};
      const row = document.createElement('div');
      row.className = 'tally-row' + (impIds.has(id) ? ' is-imposter' : '');
      const dot = document.createElement('span');
      dot.className = 'pdot';
      dot.style.background = inkOf(known.c || 0);
      const name = document.createElement('span');
      name.className = 'tally-name';
      name.textContent = (known.name || 'Player') + (id === state.myId ? ' (you)' : '');
      const count = document.createElement('span');
      count.className = 'tally-count';
      count.textContent = n === 1 ? '1 vote' : `${n} votes`;
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(count);
      el.appendChild(row);
    });
  }

  // ============================================================
  // GAME OVER
  // ============================================================
  $('btn-replay').addEventListener('click', () => {
    if (state.local) { replayLocalRound(); return; }
    fbReplay();
  });
  $('btn-home').addEventListener('click', () => { leaveRoom(); });

  // ============================================================
  // BACK BUTTONS
  // ============================================================
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => { leaveRoom(); });
  });

  // Once a word has been dealt, walking out costs something: the host takes
  // the whole room with them, and a player leaves a hole in the turn order.
  // Both are too much to hang on one stray thumb, so both ask first.
  function openQuitConfirm() {
    const host = state.isHost;
    $('quit-title').textContent = host ? 'Quit the game?' : 'Leave the game?';
    $('quit-text').textContent = host
      ? 'You are the host, so this closes the room and ends the game for everyone.'
      : 'You will drop out of the round and your turns will be skipped.';
    $('quit-confirm').textContent = host ? 'Quit' : 'Leave';
    $('quit-modal-backdrop').classList.add('open');
  }
  function closeQuitConfirm() { $('quit-modal-backdrop').classList.remove('open'); }

  $('card-back-btn').addEventListener('click', openQuitConfirm);
  $('game-back-btn').addEventListener('click', openQuitConfirm);
  $('vote-back-btn').addEventListener('click', openQuitConfirm);
  $('quit-cancel').addEventListener('click', closeQuitConfirm);
  $('quit-confirm').addEventListener('click', () => { closeQuitConfirm(); leaveRoom(); });
  $('quit-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeQuitConfirm();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('quit-modal-backdrop').classList.contains('open')) closeQuitConfirm();
  });

  // ============================================================
  // ANALYTICS  (cookie-free, aggregate counters in our own DB)
  // ------------------------------------------------------------
  // No IPs, no per-user identifiers — only incrementing aggregate counts,
  // which is why this needs no consent banner. Everything lives under
  // analytics/draw/, mirroring the other games:
  //
  //   visits/  — someone OPENED the app (one per browser tab)
  //   games/   — a 3+ player game was PLAYED (every play/replay counts)
  //     games/modes/{online,passphone}   (which way the group played)
  //     games/players/<n>                (group size, lifetime only)
  //
  // The room funnel (rooms/*, joins/*) is DELIBERATELY SILENT for a Pass the
  // Phone round, and that is not a gap to be fixed later. There is no room and
  // nobody joins, so firing those stages would count rooms that were never
  // created and joins that never happened, which is exactly what would corrupt
  // the funnel gaps. games/modes/* is what tells the two apart, and it is why
  // every games/* number should be read against a mode split rather than
  // assumed to be online play.
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
  // None of this is on stats.html; the room funnel is Console-only.
  //
  // Player names never leave the device in either mode.
  //
  // analyticsEnabled / safeKey / todayKey / geo / bumpAnalytics /
  // trackError / trackSession / bumpFbPrompt live in shared/analytics.js;
  // createAnalytics(GAME) above binds them to this namespace.
  // ============================================================

  // Logged once per round by the host only (single source of truth).
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
    // Online only, on purpose. See the funnel note in the header below: a
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
    // geo lookup has resolved. Runs in the background — never blocks play.
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
  // than waiting for the .info/connected listener to catch up.
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

  // Web path: the param is in the page URL (impostorgames.com/draw/?join=...).
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
