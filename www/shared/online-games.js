// ============================================================
// THE PUBLIC INDEX OF ONLINE GAMES  (#269)
// ============================================================
// The room tree cannot be listed and must stay that way: `rooms-word` grants
// no read above $code, which is exactly what keeps a private room invisible.
// So the list at /online reads a separate node, `online-games/<code>`, that
// holds only what a card shows and nothing a player could cheat with.
//
// Two rules keep a row honest, and the database enforces both (see
// database.rules.json): only the room's own host can write it, and only while
// the room itself is in the clue mode, which is the online game. The joining
// client checks the room again anyway. The list is a hint; the room is the
// authority.
//
// A row goes when the host leaves, switches the room away from online, or
// loses their connection (onDisconnect). What none of those catch, a tab the
// browser froze without closing its socket, is caught by the heartbeat: a
// row the host has not refreshed for STALE_MS is not shown, whatever the
// tree still holds. scripts/purge-idle-rooms.mjs sweeps what is left.
//
// Pure on purpose, so it can be tested without a database, and no t() in
// here for the reason given at the top of shared/clock.js.

export const ONLINE_TREE = 'online-games';

// The host rewrites its row this often. Three missed beats and the row is
// hidden. 180000 is also written into database.rules.json, where it lets any
// client clear a row that stale; keep the two in step.
export const HEARTBEAT_MS = 60 * 1000;
export const STALE_MS = 3 * 60 * 1000;

// Online games are built but not launched. They wait for the list at /online,
// and #273 deletes this the day it ships. Until then the create screen's
// Private or Online choice shows everywhere except the live site, so it can
// be played on localhost and on imposter-20b85.web.app (#262). Same shape as
// analyticsEnabled() in shared/analytics.js.
const LIVE_HOSTS = ['impostorgames.com', 'www.impostorgames.com'];

export function onlineGamesVisible(loc) {
  try { return LIVE_HOSTS.indexOf(loc.hostname) === -1; } catch (e) { return false; }
}

// What one card needs, or null when the room should not be listed at all.
// Built from an allow-list rather than by copying meta and deleting the
// secrets: a field added to meta later stays out of the index unless somebody
// writes it in here.
export function listingFor({ meta, players, host, now }) {
  if (!meta || meta.mode !== 'clue') return null;
  return {
    game: 'word',
    lang: meta.lang,
    mode: 'clue',
    host: String(host || '').slice(0, 20),
    players: Math.max(0, Number(players) || 0),
    // Everything past the lobby reads as one state on a card: somebody
    // arriving now waits for the next round whichever screen it is on.
    phase: meta.phase === 'lobby' ? 'lobby' : 'playing',
    createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : now,
  };
}

// Whether a card has changed enough to be written again. The heartbeat is
// left out, because it changes on every write by design.
export function listingSig(card) {
  if (!card) return '';
  return [card.game, card.lang, card.mode, card.host, card.players, card.phase].join('|');
}

export function isFresh(row, now) {
  return !!row && typeof row.heartbeat === 'number' && now - row.heartbeat < STALE_MS;
}

// The tree as the list should show it: stale rows dropped, joinable games
// first, and the newest of each first within its group.
export function freshListings(tree, now) {
  return Object.entries(tree || {})
    .filter(([, row]) => isFresh(row, now))
    .map(([code, row]) => ({ code, ...row }))
    .sort((a, b) => (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1)
      || (b.createdAt || 0) - (a.createdAt || 0));
}
