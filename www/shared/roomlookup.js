// ============================================================
// SHARED CROSS-GAME ROOM LOOKUP
// The three games keep their rooms in separate trees so they can hand out
// the same 4-char code without colliding. That works until a player types
// a Word code on the Dance page (or scans a Draw QR while the Dance tab
// happens to be open), which used to dead-end on "No room found".
//
// So when a game's own tree comes up empty, it asks here whether one of
// the other games owns the code, and forwards the player if so.
//
// Usage, inside the game's own code-validation path:
//   import { findRoomInOtherGames, goToGame } from '../shared/roomlookup.js';
//   const hit = await findRoomInOtherGames(code, GAME);
//   if (hit) { showToast(...); goToGame(hit, code, GAME); return; }
// ============================================================
import { db } from './firebase.js';
import { t } from './i18n.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Every game's room tree and the page that owns it. `game` matches the
// GAME constant each app.js already defines for its analytics namespace.
// `label` is a getter, not a string: i18n.js reads the page's bundle at
// import time, and this array is built at import time too, so a plain
// value here would be evaluated in whichever order the two modules
// happen to load. Reading it at use time removes the question.
const GAMES = [
  { game: 'music', tree: 'rooms',      path: '/dance/', get label() { return t('game.music'); } },
  { game: 'word',  tree: 'rooms-word', path: '/word/',  get label() { return t('game.word');  } },
  { game: 'draw',  tree: 'rooms-draw', path: '/draw/',  get label() { return t('game.draw');  } },
];

// One hop, never two. A forward only happens on a positive hit, so a loop
// would need the room to vanish between the lookup and the next page's
// lookup. Rare, but the marker rules it out entirely instead of leaving it
// to chance. Read at import time, which runs before the deep-link handlers
// strip the query string off the URL.
const ARRIVED = (() => {
  try { return new URLSearchParams(location.search).has('via'); } catch (e) { return false; }
})();

// Mirrors IDLE_MS in each game's app.js: how long a room may sit untouched
// before it counts as dead. Kept in step deliberately. A room this lookup
// forwards to should be one the receiving game would still consider alive,
// or we send the player somewhere that greets them with an error.
const IDLE_MS = 15 * 60 * 1000;

// Is this room worth forwarding a player into?
//
// Abandoned rooms outlive their group. Each game closes its own room after
// IDLE_MS, but only while somebody still has the tab open; once the last
// person leaves there is nobody to run the cleanup, so orphans accumulate.
// Plenty of them sit in `lobby` phase, which is exactly what this lookup
// prefers, so without this check a mistyped code could forward a player into
// a room that has been empty for weeks.
//
// A stamp we cannot read gets the benefit of the doubt: rooms are written
// with serverTimestamp(), so the likeliest reason for an unresolved stamp is
// a room created seconds ago, which is the last thing we want to reject.
function isAlive(meta, now) {
  const t = meta.lastActivity ?? meta.createdAt;
  if (typeof t !== 'number') return true;
  return now - t <= IDLE_MS;
}

// Look for `code` in the OTHER games' trees. Callers only reach this after
// their own tree came up empty, so a real local room always wins and this
// can never hijack a valid join.
//
// Reads /meta rather than the whole room: enough to prove the room exists
// and to see its phase, without pulling players and game state we would
// throw away. Both reads go out together, so this costs one round-trip on
// a path that was about to show an error anyway.
export async function findRoomInOtherGames(code, currentGame) {
  if (!db || ARRIVED || !code) return null;
  const others = GAMES.filter(g => g.game !== currentGame);
  const snaps = await Promise.all(
    others.map(g => get(ref(db, `${g.tree}/${code}/meta`)).catch(() => null))
  );

  // Note this reads /meta, so a room left with only a stray players node and
  // no meta (the presence system re-adding someone to an already-deleted
  // room) fails this check outright and never reaches the liveness test.
  const now = Date.now();
  const hits = [];
  others.forEach((g, i) => {
    const s = snaps[i];
    if (!s || !s.exists()) return;
    const meta = s.val() || {};
    if (!isAlive(meta, now)) return;
    hits.push({ ...g, phase: meta.phase });
  });
  if (!hits.length) return null;

  // Codes are only unique within a game, so the same one can legitimately
  // be live in two trees at once. Prefer the room the player can actually
  // still join; otherwise take the first and let the target page explain
  // why it can't be joined.
  return hits.find(h => h.phase === 'lobby') || hits[0];
}

// Hand the player over to the game that owns the code. Deliberately a
// same-origin path rather than the canonical impostorgames.com URL: on a
// preview channel, on a laptop over the LAN, or inside the native app
// (Capacitor serves www/ from https://localhost) the player has to stay in
// the build they are already running.
//
// `?join=` is the deep-link parameter every game already handles, so the
// receiving page needs no new code. `&via=` is the hop marker above.
export function goToGame(hit, code, fromGame) {
  location.href = `${hit.path}?join=${encodeURIComponent(code)}&via=${encodeURIComponent(fromGame)}`;
}
