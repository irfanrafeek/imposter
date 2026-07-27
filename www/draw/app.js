import {
  ref, set, get, update, onValue, onDisconnect, serverTimestamp, remove, push,
  onChildAdded, onChildChanged, onChildRemoved
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { FB_CONFIGURED, db } from "../shared/firebase.js";
import { analyticsEnabled, safeKey, todayKey, peekGeo, fetchGeo, createAnalytics } from "../shared/analytics.js";
import { WORD_CATEGORIES } from "../shared/words.js";

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

  // Shared counter kit bound to this game's namespace (analytics/draw).
  const { bumpAnalytics, trackError, installGlobalErrorTracking, trackSession, bumpFbPrompt } = createAnalytics(GAME);
  installGlobalErrorTracking();

  // Words come from the shared catalog. Draw uses the three categories that
  // are actually drawable — Places, Movies & TV and Football are fine to
  // *say* but not to sketch in one turn.
  const CATEGORY_GROUPS = [
    {
      label: 'Categories',
      categories: [
        { name: 'Food',             description: 'Dishes, snacks, fruits and drinks' },
        { name: 'Animals',          description: 'Pets, wildlife, birds and sea creatures' },
        { name: 'Everyday Objects', description: 'Things lying around every home' },
      ],
    },
  ];
  const DRAWABLE = CATEGORY_GROUPS[0].categories.map(c => c.name);

  // Firebase keys can't contain . # $ [ ] /. Words and category names are
  // ASCII-safe today, but sanitize anyway to future-proof.
  function sanitizeKey(s) { return String(s).replace(/[.#$\[\]/]/g, '_'); }

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
  function pickWord(categoryNames, playedMap) {
    const cats = (categoryNames && categoryNames.length) ? categoryNames : [DEFAULT_CATEGORY];
    const played = playedMap || {};
    const union = [];
    cats.forEach(c => (WORD_CATEGORIES[c] || []).forEach(e => union.push({ e, cat: c })));
    const unplayed = union.filter(({ e, cat }) => !(played[sanitizeKey(cat)] || {})[sanitizeKey(e.w)]);
    const reset = unplayed.length === 0;
    const usePool = reset ? union : unplayed;
    const chosen = usePool[Math.floor(Math.random() * usePool.length)];
    return { entry: chosen.e, cat: chosen.cat, reset };
  }

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    screen: 'home',
    roomCode: null,
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

    setupPresence();
    // NOTE: the room listener is attached later, when the host taps
    // "Go to Lobby" (see btn-share-continue). Attaching it here would let
    // the lobby-phase auto-router skip the share-code screen.
  }

  async function joinRoom(code, name) {
    if (!db) throw new Error('Firebase not configured');
    const roomSnap = await get(ref(db, `${ROOMS}/${code}`));
    if (!roomSnap.exists() || !roomSnap.val().meta) throw new Error('Room not found');
    const room = roomSnap.val();
    const meta = room.meta;
    if (meta.phase !== 'lobby') throw new Error('Game already in progress');
    if (Object.keys(room.players || {}).length >= MAX_PLAYERS) throw new Error('Room is full');

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
        if (phase === 'lobby' && state.screen !== 'lobby') enterLobby();
        else if ((phase === 'countdown' || phase === 'card') && state.screen !== 'card') enterCardScreen();
        else if (phase === 'playing' && state.screen !== 'game') beginGame();
        else if (phase === 'vote' && state.screen !== 'vote') enterVoteScreen();
        else if (phase === 'over' && state.screen !== 'over') revealImposter();
      }
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
    if (!db || !state.isHost || !state.roomCode) return;
    const v = clampRounds(n);
    if (v === state.rounds) return;
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

  // Deal the round: one secret word for everyone, one impostor who gets only
  // the word's vague hint, and a random turn order everyone can see.
  async function fbStartGame() {
    if (!db || !state.isHost) return;
    const startBtn = $('btn-start');
    const startHint = $('start-hint');
    startBtn.disabled = true;
    const prevHint = startHint.textContent;
    startHint.textContent = 'Dealing…';
    try {
      const cats = activeCategories();
      const playedMap = (state.meta && state.meta.played) || {};
      const picked = pickWord(cats, playedMap);
      const entry = picked.entry;
      const chosenCat = sanitizeKey(picked.cat);

      const imposterIds = {};
      shuffled(state.players).slice(0, NUM_IMPOSTERS).forEach(p => { imposterIds[p.id] = true; });

      // Turn order gets its OWN shuffle. Reusing the one the impostor was
      // sliced off the front of would put the impostor first every single
      // game — the order is public, so that hands the room the answer.
      const order = shuffled(state.players).map(p => p.id);

      const startAt = nowSync() + COUNTDOWN_MS;

      const wKey = sanitizeKey(entry.w);
      const updates = {
        'meta/phase': 'countdown',
        'meta/startAt': startAt,
        'meta/imposterIds': imposterIds,
        'meta/secretWord': entry.w,
        // The word's own vague hint, same as the word game. NOT the category:
        // the host's category pick is shown to everyone in the lobby, so it
        // would tell the impostor nothing they don't already know.
        'meta/imposterHint': entry.h,
        'meta/rounds': state.rounds,
        'meta/order': order,
        'meta/turn': 0,
        // No clock yet. The turn timer only starts when the host presses
        // Start Drawing, so nobody's turn burns down while the room is still
        // reading its word.
        'meta/turnAt': null,
        'meta/lastActivity': serverTimestamp(),
        // Fresh canvas for the new round.
        'strokes': null,
      };
      if (picked.reset) {
        // Union exhausted — wipe the played buckets for every selected
        // category, then seed just this word under its own bucket.
        cats.forEach(c => { updates[`meta/played/${sanitizeKey(c)}`] = null; });
        updates[`meta/played/${chosenCat}`] = { [wKey]: true };
      } else {
        updates[`meta/played/${chosenCat}/${wKey}`] = true;
      }
      await update(ref(db, `${ROOMS}/${state.roomCode}`), updates);

      trackRound(picked.cat, entry.w);

      // Countdown over: everyone lands on their word. The room waits there
      // until the host says go, so nobody arrives at the canvas mid-thought.
      setTimeout(() => {
        update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
          phase: 'card',
        }).catch(()=>{});
      }, Math.max(0, startAt - nowSync()) + 200);
    } catch (e) {
      trackError('round_start_failed');
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
    // Safety net, host only — one writer, so a stalled turn can't be passed
    // twice by two different spectators.
    if (!state.isHost) return;
    const clientDead = now > turnAt + TURN_GRACE_MS;
    const playerGone = !present && drawerGoneAt && now - drawerGoneAt > TURN_GRACE_MS;
    if (clientDead || playerGone) fbAdvanceTurn(turn);
  }

  // Host moves the room off the word screen and onto the canvas. The first
  // drawer's clock starts here, not when the word was dealt.
  async function fbStartDrawing() {
    if (!db || !state.isHost || !state.roomCode) return;
    if (!state.meta || state.meta.phase !== 'card') return;
    const btn = $('btn-start-drawing');
    btn.disabled = true;
    try {
      await update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
        phase: 'playing',
        turnAt: nowSync() + TURN_MS,
        lastActivity: serverTimestamp(),
      });
    } catch (e) {
      btn.disabled = false;
      showToast('Could not start drawing');
    }
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

  // Host closes voting. Deliberately available whether or not everyone has
  // voted: waiting on someone who has wandered off would strand the room.
  async function fbReveal() {
    if (!db || !state.isHost || !state.roomCode) return;
    const btn = $('btn-reveal');
    btn.disabled = true;
    try {
      await update(ref(db, `${ROOMS}/${state.roomCode}/meta`), {
        phase: 'over',
        lastActivity: serverTimestamp(),
      });
    } catch (e) {
      btn.disabled = false;
      showToast('Could not reveal');
    }
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
    if (!db || !state.isHost) return;
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
    state.players = [];
    state.meta = null;
    state.votes = {};
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
    hideVoteIntro();
  }

  // ============================================================
  // HOME SCREEN
  // ============================================================
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
        showToast('No room found with that code');
        clearCodeBoxes();
        return;
      }
      const room = roomSnap.val();
      if (room.meta.phase !== 'lobby') {
        showToast('Game already in progress');
        clearCodeBoxes();
        return;
      }
      if (Object.keys(room.players || {}).length >= MAX_PLAYERS) {
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
  // Uses the vendored qrcode-generator global; fails quietly to the code-only
  // view if anything goes wrong. Always uses SHARE_BASE, which resolves the
  // native app's useless https://localhost origin to the real website.
  function renderQRInto(el, code) {
    el.innerHTML = '';
    el.style.display = '';
    try {
      const url = `${SHARE_BASE}/?join=${encodeURIComponent(code)}`;
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
    const list = $('players-list');
    // Display order: host pinned on top, then newest join first so a new
    // player is immediately visible. state.players keeps its joinedAt-asc
    // order — this copy is presentation-only.
    const ordered = [...state.players].sort((a, b) =>
      (b.isHost - a.isHost) || (b.joinedAt - a.joinedAt));
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
      row.className = 'player-row' + (!p.isHost && p.ready ? ' ready' : '') + (isNew ? ' just-joined' : '');
      const status = p.isHost ? '' : (p.ready ? '✓ Ready' : 'Waiting');
      row.innerHTML = `
        ${avatarHtml(p)}
        <div class="player-name">
          ${escapeHtml(p.name)}
          ${p.isHost ? '<span class="player-tag tag-host">Host</span>' : ''}
          ${p.isMe ? '<span class="you-pill">YOU</span>' : ''}
        </div>
        <div class="player-status">${status}</div>
      `;
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
      } else if (isNew && !burstFired.has(p.id)) {
        burstFired.add(p.id);
        confettiBurst(row);
      }
    });

    if (!reduceMotion) flipRows(list, firstRects);

    const me = state.players.find(p => p.isMe);
    const isHost = me && me.isHost;
    const nonHosts = state.players.filter(p => !p.isHost);
    const readyCount = nonHosts.filter(p => p.ready).length;
    const total = state.players.length;
    // The host draws and votes like everyone else here, so every player
    // counts toward the minimum — only non-hosts have a ready toggle.
    const allReady = total >= MIN_PLAYERS && nonHosts.length > 0 && nonHosts.every(p => p.ready);

    $('ready-count').textContent = readyCount;
    $('player-count').textContent = nonHosts.length;

    // Rounds stepper: host-only controls, everyone sees the value.
    $('rounds-count-num').textContent = state.rounds;
    $('rounds-count-label').textContent = state.rounds === 1 ? 'Round' : 'Rounds';
    $('lobby-rounds-minus').style.display = isHost ? '' : 'none';
    $('lobby-rounds-plus').style.display = isHost ? '' : 'none';
    $('lobby-rounds-minus').disabled = state.rounds <= MIN_ROUNDS;
    $('lobby-rounds-plus').disabled = state.rounds >= MAX_ROUNDS;
    $('rounds-hint').textContent = isHost
      ? 'Each round, every player draws once.'
      : `The host set ${state.rounds} drawing round${state.rounds === 1 ? '' : 's'}.`;

    // Back button: host dissolves the room, players only remove themselves
    $('lobby-back-btn').textContent = isHost ? '← Quit Game' : '← Leave Room';

    // Ready button: hidden for host
    $('btn-ready').style.display = isHost ? 'none' : '';

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
      if (total < MIN_PLAYERS) {
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

    if (me && !isHost) {
      $('btn-ready').textContent = me.ready ? "I'm Not Ready" : "I'm Ready";
      $('btn-ready').classList.toggle('btn-secondary', me.ready);
      $('btn-ready').classList.toggle('btn-accent', !me.ready);
    }

    // Category: host sees a tappable trigger that opens the modal sheet,
    // players see the chosen category as static serif text.
    const trigger = $('category-trigger');
    const display = $('category-display');
    const hint = $('category-hint');
    const categorySummary = categoriesSummary(activeCategories());
    $('category-trigger-text').textContent = categorySummary;
    display.textContent = categorySummary;
    if (isHost) {
      trigger.style.display = '';
      display.style.display = 'none';
      hint.style.display = '';
      hint.textContent = 'You pick the theme. A random word from your chosen categories is dealt each round.';
    } else {
      trigger.style.display = 'none';
      display.style.display = '';
      hint.style.display = 'none';
    }
    // If the modal is currently open, re-render so the selected row reflects
    // changes that came in via Firebase.
    if ($('cat-modal-backdrop').classList.contains('open')) renderCategoryModal();
  }

  $('lobby-rounds-plus').addEventListener('click', () => fbSetRounds(state.rounds + 1));
  $('lobby-rounds-minus').addEventListener('click', () => fbSetRounds(state.rounds - 1));

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
    if (!state.isHost || !db || !state.roomCode || !cats.length) return;
    try {
      // Keep `category` in sync (= first pick) for any reader that predates
      // the `categories` array.
      await update(ref(db, `${ROOMS}/${state.roomCode}/meta`), { categories: cats, category: cats[0] });
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

  // ---- Feedback modal ----
  function openFeedbackModal() {
    const back = $('fb-modal-backdrop');
    back.classList.add('open');
    back.scrollTop = 0;
    setTimeout(() => $('fb-message').focus(), 50);
  }
  function closeFeedbackModal() {
    $('fb-modal-backdrop').classList.remove('open');
  }
  async function submitFeedback() {
    const msgEl = $('fb-message');
    const emailEl = $('fb-email');
    const sendBtn = $('fb-send');
    const message = msgEl.value.trim();
    if (!message) { msgEl.focus(); showToast('Please type a message first'); return; }
    const email = emailEl.value.trim().slice(0, 120);
    sendBtn.disabled = true;
    try {
      if (db) {
        await push(ref(db, `feedback/${GAME}`), {
          message: message.slice(0, 500),
          email: email || null,
          source: fbSource,
          country: (peekGeo() && peekGeo().country) || null,
          countryCode: (peekGeo() && peekGeo().cc) || null,
          version: ($('app-version') && $('app-version').textContent) || null,
          ts: serverTimestamp(),
        });
      }
      msgEl.value = '';
      emailEl.value = '';
      closeFeedbackModal();
      showToast('Thanks for the feedback! 🙏');
    } catch (e) {
      showToast('Could not send — please try again');
    } finally {
      sendBtn.disabled = false;
    }
  }
  $('feedback-link').addEventListener('click', () => { fbSource = 'landing'; openFeedbackModal(); });
  $('fb-modal-close').addEventListener('click', closeFeedbackModal);
  $('fb-send').addEventListener('click', submitFeedback);
  $('fb-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFeedbackModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('fb-modal-backdrop').classList.contains('open')) closeFeedbackModal();
  });

  // ---- Round-milestone feedback popup ----
  // Counts completed rounds per device (localStorage, shared across all
  // games — same origin). From FB_PROMPT_AT rounds on, the Round Over screen
  // auto-opens a small feedback popup, 2s after the reveal. It returns on
  // later Round Overs until the player interacts once, then never again.
  const FB_PROMPT_AT = 20;
  let fbSource = 'landing'; // tags feedback records with where the form was opened from
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
    fbSource = 'rounds-milestone';
    openFeedbackModal();
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
    return !!(state.meta && state.meta.phase === 'playing'
              && currentDrawerId() === state.myId);
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
    const size = Math.max(160, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)));
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
  function flushStroke(l) {
    if (!l || !l.dirty || !db) return;
    l.dirty = false;
    set(l.ref, { by: state.myId, c: state.myC || 0, p: l.pts.slice() }).catch(() => {});
  }
  function flushLive() { flushStroke(live); }

  function onDown(ev) {
    if (!canDraw() || live || !db || !state.roomCode) return;
    ev.preventDefault();
    const [x, y] = canvasPoint(ev);
    const node = push(ref(db, `${ROOMS}/${state.roomCode}/strokes`));
    live = { id: node.key, ref: node, pts: [x, y], dirty: true, timer: null };
    // Paint locally straight away; the server echo lands on the same key.
    strokes.set(node.key, { by: state.myId, c: state.myC || 0, p: live.pts });
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    redraw();
    updateDrawUI();
    flushLive();
    live.timer = setInterval(flushLive, FLUSH_MS);
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
    if (!canDraw() || live || !myStrokeIds.length || !db || !state.roomCode) return;
    const id = myStrokeIds.pop();
    strokes.delete(id);
    redraw();
    remove(ref(db, `${ROOMS}/${state.roomCode}/strokes/${id}`)).catch(() => {});
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

    let label;
    if (phase === 'playing') {
      if (mine) label = 'Your turn';
      else if (drawer) label = `${drawer.name}’s turn`;
      else label = 'Passing…';   // drawer left; the watchdog is about to skip them
    } else {
      label = 'Getting ready…';
    }
    $('turn-label').textContent = label;

    const total = clampRounds(m.rounds);
    $('turn-round').textContent = (phase === 'playing' && turnOrder().length)
      ? `Round ${Math.min(roundOfTurn(turn), total)}` : '';

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
      nameEl.textContent = (known.name || 'Player') + (id === state.myId ? ' (You)' : '');
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
    $('btn-undo').addEventListener('click', undoLast);
    $('btn-done').addEventListener('click', () => {
      if (!canDraw()) return;
      forceEndStroke();
      fbAdvanceTurn(currentTurn());
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
  }

  function beginGame() {
    closeFbPopup(false);
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
  // the vague hint, and is told they're the impostor. Only the host gets a
  // way forward, so the room reaches the canvas together.
  function renderCard() {
    const meta = state.meta || {};
    const isImposter = !!(meta.imposterIds && meta.imposterIds[state.myId]);

    $('imposter-banner').style.display = isImposter ? 'inline-flex' : 'none';
    $('game-role').textContent = isImposter ? 'YOUR HINT' : 'THE WORD TO DRAW';
    $('game-word').textContent = (isImposter ? meta.imposterHint : meta.secretWord) || '—';
    $('word-card').classList.toggle('is-imposter', isImposter);
    $('card-back-btn').textContent = state.isHost ? '← Quit Game' : '← Leave';

    // Until the countdown has finished, the room is still being dealt in.
    const ready = meta.phase === 'card';
    const btn = $('btn-start-drawing');
    btn.style.display = state.isHost ? '' : 'none';
    btn.disabled = !ready;
    $('card-hint').textContent = !ready
      ? 'Getting everyone ready…'
      : state.isHost
        ? 'Everyone has their word. Start when the room is ready.'
        : 'Waiting for the host to start the drawing…';
  }

  $('btn-start-drawing').addEventListener('click', () => { fbStartDrawing(); });

  // The foot of the play screen: the Done button plus a quiet line holding
  // the word, which has to stay to hand all game without competing with the
  // canvas for attention.
  function updatePlayControls() {
    const m = state.meta || {};
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

    const btn = $('btn-reveal');
    btn.style.display = state.isHost ? '' : 'none';
    btn.disabled = false;
    // The host has the button in front of them, so the count is all they need.
    $('vote-hint').textContent = state.isHost
      ? `${cast} of ${eligible} voted.`
      : `${cast} of ${eligible} voted. Waiting for the host to reveal…`;
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
      if (id === state.myId) return name + ' (YOU)';
      return playerById(id) ? name : name + ' (left the room)';
    }).join(' & ');
    $('reveal-name').textContent = names || '—';
    $('reveal-word').textContent = meta.secretWord || '—';

    const outcome = voteOutcome();
    // The headline is the same for the room, but the party popper is not: the
    // impostor wins precisely when the room loses, so it goes to whoever is
    // actually on the winning side of this screen.
    const amImposter = ids.includes(state.myId);
    const iWon = outcome.caught ? !amImposter : amImposter;
    $('verdict-title').textContent = (outcome.caught ? 'Caught!' : 'They got away')
      + (iWon ? ' 🎉' : '');
    $('verdict-sub').textContent = outcome.caught
      ? 'The room voted out the impostor.'
      : !outcome.votes ? 'Nobody voted, so the impostor walks.'
      : outcome.tied ? 'The vote was split, so the impostor walks.'
      : 'The room voted out the wrong player.';

    renderTally();
    $('btn-replay').style.display = state.isHost ? '' : 'none';
    $('btn-home').textContent = state.isHost ? 'Quit Game' : 'Exit Room';
    countRoundAndMaybePrompt();
    go('over');
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
  $('btn-replay').addEventListener('click', () => { fbReplay(); });
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
  //
  // analyticsEnabled / safeKey / todayKey / geo / bumpAnalytics /
  // trackError / trackSession / bumpFbPrompt live in shared/analytics.js;
  // createAnalytics(GAME) above binds them to this namespace.
  // ============================================================

  // Logged once per round by the host only (single source of truth).
  async function trackRound(category, word) {
    if (!analyticsEnabled()) return;
    const day = todayKey();
    const cat = safeKey(category);
    const wrd = safeKey(word);
    const u = {
      'games/total': 1,
      [`games/categories/${cat}`]: 1,
      [`games/words/${wrd}`]: 1,
      [`games/daily/${day}/count`]: 1,
      [`games/daily/${day}/categories/${cat}`]: 1,
      [`games/daily/${day}/words/${wrd}`]: 1,
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
  function routeJoinCode(raw) {
    if (!raw) return;
    const code = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length === 4 && FB_CONFIGURED && db) attemptCodeValidation(code);
  }

  // Web path: the param is in the page URL (impostorgames.com/draw/?join=...).
  // Strip it afterwards so a refresh/back doesn't re-trigger the join.
  (function handleWebJoinDeepLink() {
    const raw = new URLSearchParams(location.search).get('join');
    if (!raw) return;
    history.replaceState(null, '', location.pathname);
    routeJoinCode(raw);
  })();

  // Native-app path: inside the Capacitor WebView the page loads from
  // https://localhost, so the join code never appears in location.search.
  // Instead the OS hands the tapped/scanned App Link to the @capacitor/app
  // plugin. Handle both a cold start (getLaunchUrl) and the app already
  // running (appUrlOpen). Same routeJoinCode() as the web path.
  (function handleNativeJoinDeepLink() {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App) return; // not running inside the native app
    const codeFromUrl = (u) => { try { return new URL(u).searchParams.get('join'); } catch (e) { return null; } };
    App.getLaunchUrl().then((res) => { if (res && res.url) routeJoinCode(codeFromUrl(res.url)); }).catch(() => {});
    App.addListener('appUrlOpen', (ev) => { if (ev && ev.url) routeJoinCode(codeFromUrl(ev.url)); });
  })();
})();
