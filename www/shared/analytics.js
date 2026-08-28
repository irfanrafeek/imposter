// ============================================================
// SHARED ANALYTICS
// Cookie-free aggregate counters, one namespace per game under
// analytics/<game>. Everything here is fire-and-forget: analytics
// must never throw into gameplay code or block it.
//
// Usage:
//   import { createAnalytics } from '../shared/analytics.js';
//   const { bumpAnalytics, trackError, trackSession, bumpFbPrompt,
//           installGlobalErrorTracking } = createAnalytics(GAME);
// ============================================================
import { db } from './firebase.js';
import { langKey, pageLang } from './lang.js';
import { ref, update, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Analytics run ONLY in the real production environment, so trial runs
// never pollute the live counters. "Real" means the public website
// (impostorgames.com) or the native app (Capacitor WebView, origin
// https://localhost). Everything else — Firebase Hosting preview channels
// (*.web.app), localhost/127.0.0.1 dev, file:// — is treated as testing
// and writes nothing. This gate covers every analytics write path.
export function analyticsEnabled() {
  try {
    if (window.Capacitor) return true; // native app = real usage
    const h = location.hostname;
    return h === 'impostorgames.com' || h === 'www.impostorgames.com';
  } catch (e) { return false; }
}

// Firebase keys can't contain . # $ [ ] / — sanitise free-form text.
export function safeKey(s) {
  return (String(s == null ? '' : s).replace(/[.#$\[\]/]/g, '_').trim().slice(0, 120)) || 'unknown';
}

export function todayKey() { return new Date().toISOString().slice(0, 10); }

// ------------------------------------------------------------
// Coarse geo (country only, no IP stored) — shared across pages.
// ------------------------------------------------------------

// Last known coarse geo (set by trackSession); reused by feedback forms
// and game counters. Country rarely changes per device, so cache it: a
// page reload or in-tab re-entry skips the visit re-count (session
// guard) and would otherwise leave it null — hydrating from
// localStorage keeps game-country working.
let lastGeo = null;
try { const c = localStorage.getItem('imp_geo'); if (c) lastGeo = JSON.parse(c); } catch (e) {}

// Read the cached geo without triggering a network fetch.
export function peekGeo() { return lastGeo; }

// Persist a resolved country so later page loads (which skip the visit
// re-count) still have it for game tracking and the feedback form.
export function rememberGeo(geo) {
  lastGeo = geo;
  try { localStorage.setItem('imp_geo', JSON.stringify(geo)); } catch (e) {}
  return geo;
}

// Two free, key-less providers with a fallback; returns null silently
// on any failure.
export async function fetchGeo() {
  try {
    const r = await fetch('https://ipwho.is/?fields=success,country,country_code');
    if (r.ok) { const d = await r.json(); if (d && d.success && d.country_code) return rememberGeo({ cc: d.country_code, country: d.country }); }
  } catch (e) {}
  try {
    const r = await fetch('https://ipapi.co/json/');
    if (r.ok) { const d = await r.json(); if (d && d.country_code) return rememberGeo({ cc: d.country_code, country: d.country_name }); }
  } catch (e) {}
  return null;
}

// ------------------------------------------------------------
// Per-game counter kit. `game` picks the namespace: analytics/<game>.
// `lang` splits the games counter by language; it defaults to the
// page's own, which is always right, because a room's language and its
// page's language are the same thing (#138 redirects anyone whose room
// is in another language before they can join). Passing it explicitly
// is for tests.
// ------------------------------------------------------------
export function createAnalytics(game, lang) {
  const LANG = langKey(lang || pageLang());

  // Fire-and-forget atomic counter bumps. `paths` maps a path under
  // analytics/<game> to the amount to add. Never throws into callers.
  function bumpAnalytics(paths) {
    if (!db || !analyticsEnabled()) return;
    try {
      const payload = {};
      for (const p in paths) payload[p] = increment(paths[p]);
      update(ref(db, `analytics/${game}`), payload).catch(() => {});
    } catch (e) { /* analytics must never break gameplay */ }
  }

  // The language split on the games counter (#140). Spread into the
  // update each game already builds for a played round, so one round is
  // still one atomic write:
  //
  //   const u = { ...gameLangPaths(day), 'games/total': 1, ... };
  //
  // A path segment under games/, deliberately NOT a namespace of its
  // own: analytics/word-es would mean every existing chart silently
  // stopped counting Spanish rounds, and every number after it would
  // have to be summed across languages by hand.
  //
  // It is on games/ and not visits/ because the question is whether
  // people PLAY in a language, which a visit cannot answer. The
  // per-language visit is still readable from the country split.
  //
  // Two things to know before reading these numbers. They start at
  // zero on the day this shipped, so for any range spanning that day
  // the langs split totals LESS than games/total, and the gap is
  // untagged history rather than a missing language. And a game with
  // only one page has only one possible value, so 100% en means
  // "English is all we offer", not "nobody wants Spanish".
  function gameLangPaths(day) {
    return {
      [`games/langs/${LANG}`]: 1,
      [`games/daily/${day}/langs/${LANG}`]: 1,
    };
  }

  // Aggregate error telemetry — same privacy model as the counters:
  // we store a bucketed error LABEL and a count, never a stack trace,
  // URL, room code or user id. Lets a silent breakage surface in
  // analytics/<game>/errors instead of by luck. Throttled per-label so
  // a hot error loop can't spam the DB.
  const _errSeen = {};
  function trackError(label) {
    const key = safeKey(label).slice(0, 80);
    if (!key || key === 'unknown') return;
    const now = Date.now();
    if (_errSeen[key] && now - _errSeen[key] < 10000) return; // ≤1 bump / 10s / label
    _errSeen[key] = now;
    bumpAnalytics({ [`errors/${key}/count`]: 1, [`errors/daily/${todayKey()}/${key}`]: 1 });
  }

  // Catch-all for uncaught script + async failures. Resource 404s
  // (e.g. an <img> that fails to load) fire 'error' with no message —
  // skip those. Opt-in per page so the hub can stay listener-free.
  function installGlobalErrorTracking() {
    window.addEventListener('error', (e) => {
      const msg = (e && e.message) || (e && e.error && e.error.message);
      if (msg) trackError('js: ' + msg);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      const msg = r && (r.message || (typeof r === 'string' ? r : ''));
      if (msg) trackError('promise: ' + msg);
    });
  }

  // One visit = one app open. Deduped per tab via `sessKey` — the games
  // share 'imp_sess' (their historical behaviour), the hub uses its own
  // key so it counts as a separate funnel entry.
  async function trackSession(sessKey = 'imp_sess') {
    if (!db || !analyticsEnabled()) return;
    try { if (sessionStorage.getItem(sessKey)) return; sessionStorage.setItem(sessKey, '1'); } catch (e) {}
    const day = todayKey();
    const u = { 'visits/total': 1, [`visits/daily/${day}/count`]: 1 };
    const geo = await fetchGeo();
    if (geo && geo.cc) {
      const cc = safeKey(geo.cc);
      u[`visits/countries/${cc}`] = 1;
      u[`visits/daily/${day}/countries/${cc}`] = 1;
    }
    bumpAnalytics(u);
  }

  // Feedback-prompt funnel counters (shown / dismissed / rated).
  function bumpFbPrompt(key) {
    if (!db || !analyticsEnabled()) return;
    update(ref(db, `analytics/${game}/fbprompt`), { [key]: increment(1) }).catch(() => {});
  }

  // ----------------------------------------------------------
  // Run length — how many rounds a group plays back to back.
  // ----------------------------------------------------------
  // There is no reliable "the group finished" event: people just close
  // the tab. So we re-bucket as we go. On round N we add to the N
  // bucket and take back the N-1 we wrote last time, which means
  // runs/<size>/<n> always reads as "groups whose run ended at exactly
  // n rounds" and corrects itself when they play on.
  //
  // The per-day copy stamps the day of the FIRST round and keeps writing
  // there for the rest of the run, so a group still playing at midnight
  // still lands every +1 and every take-back in the same bucket. Stamping
  // the *current* day instead would add to tomorrow while subtracting
  // from yesterday, leaving yesterday inflated and today negative.
  //
  // A daily bucket therefore reads as "runs that STARTED that day, at
  // their full length", which is what a date range should mean anyway.
  let runSize = 0;   // group size, frozen at the run's first round
  let runRounds = 0; // rounds this group has started so far
  let runDay = '';   // YYYY-MM-DD of the run's first round

  // Bucket the long tails so the tree stays small and readable.
  function sizeKey(n) { return n >= 12 ? '12plus' : String(n); }
  function roundKey(n) { return n >= 20 ? '20plus' : String(n); }

  // One call per round, host side only, so each round counts once.
  function trackRun(size) {
    if (!db || !analyticsEnabled()) return;
    // Freeze the size at round 1. Players drift in and out mid-run, and
    // a take-back aimed at a different size bucket would corrupt both.
    if (!runRounds) { runSize = Math.max(1, parseInt(size, 10) || 1); runDay = todayKey(); }
    runRounds++;

    const s = sizeKey(runSize);
    const u = { [`games/size/${s}`]: 1 }; // every round, even past the clamp
    const now = roundKey(runRounds);
    const prev = runRounds > 1 ? roundKey(runRounds - 1) : null;
    // Past the clamp the bucket stops moving; a +1 and -1 on the same
    // key would cancel out and lose the run altogether.
    if (prev !== now) {
      u[`runs/${s}/${now}`] = 1;
      u[`runs/daily/${runDay}/${s}/${now}`] = 1;
      if (prev) {
        u[`runs/${s}/${prev}`] = -1;
        u[`runs/daily/${runDay}/${s}/${prev}`] = -1;
      }
    }
    bumpAnalytics(u);
  }

  // A run is one host's sitting. Leaving the room ends it — there is no
  // host migration and ids are not persisted, so a host who reloads can
  // no longer start rounds anyway.
  function resetRun() { runSize = 0; runRounds = 0; runDay = ''; }

  // ----------------------------------------------------------
  // Room funnel: how far a room gets before a round is played.
  // ----------------------------------------------------------
  // Visits and rounds were the only two numbers, so a busy day with no
  // games could mean nobody created a room, or that rooms filled up and
  // something stopped them starting. There was no way to tell those apart,
  // and they need opposite fixes. These stages are the missing middle.
  //
  // Every stage is a HIGH-WATER MARK, recorded the moment the room reaches
  // it, host side, once per room. Nothing is counted on the way out. That
  // is the whole design: most sittings end with a closed tab, which runs no
  // code at all, so any exit-time counter would under-count exactly the
  // case worth measuring. A stage that has been reached is a fact already
  // banked, whatever happens to the tab afterwards.
  //
  // Host side and deduped, so one room contributes at most one of each
  // regardless of how many players are in it or how often the lobby
  // re-renders. Counting these player side would multiply every stage by
  // the group size.
  //
  // The stages are cumulative, so why a group gave up is the gap between
  // two of them and needs no counter of its own:
  //
  //   created    - joined2     nobody ever joined the host
  //   joined2    - reachedMin  some joined, never enough to start
  //   reachedMin - allReady    enough people, but they never readied up
  //   allReady   - started     all ready, the host never pressed Start
  //
  // startFailed is the exception. It is an event rather than a stage,
  // because a host can hit it and then retry successfully, so it is not
  // deduped and does not belong in the cumulative chain.
  const ROOM_STAGES = ['joined2', 'reachedMin', 'allReady', 'started'];
  let stageSeen = {};

  function bumpRoom(key) {
    bumpAnalytics({ [`rooms/${key}`]: 1, [`rooms/daily/${todayKey()}/${key}`]: 1 });
  }

  // Host created a room. Also clears the dedupe, so a host who starts a
  // second sitting in the same tab is counted again from the top.
  function trackRoomCreated() { stageSeen = {}; bumpRoom('created'); }

  // Safe to call on every lobby render. Repeat calls for a stage already
  // banked do nothing, which is what makes this a high-water mark instead
  // of a per-snapshot count.
  function trackRoomStage(stage) {
    if (ROOM_STAGES.indexOf(stage) === -1 || stageSeen[stage]) return;
    stageSeen[stage] = true;
    bumpRoom(stage);
  }

  function trackRoomStartFailed() { bumpRoom('startFailed'); }

  // Leaving a room ends the sitting, same as resetRun.
  function resetRoomFunnel() { stageSeen = {}; }

  // How joiners arrived and why joins bounced. Joiner side, so unlike the
  // stages above these count people rather than rooms.
  const JOIN_METHODS = ['code', 'link', 'qr', 'crossgame'];
  function trackJoin(method) {
    const m = JOIN_METHODS.indexOf(method) === -1 ? 'code' : method;
    bumpAnalytics({ [`joins/${m}`]: 1, [`joins/daily/${todayKey()}/${m}`]: 1 });
  }

  const JOIN_FAILS = ['notFound', 'inProgress', 'full'];
  function trackJoinFail(reason) {
    if (JOIN_FAILS.indexOf(reason) === -1) return;
    bumpAnalytics({ [`joinFail/${reason}`]: 1, [`joinFail/daily/${todayKey()}/${reason}`]: 1 });
  }

  return {
    bumpAnalytics, trackError, installGlobalErrorTracking, trackSession, bumpFbPrompt,
    gameLangPaths,
    trackRun, resetRun,
    trackRoomCreated, trackRoomStage, trackRoomStartFailed, resetRoomFunnel,
    trackJoin, trackJoinFail,
  };
}
