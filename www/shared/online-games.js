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

// The public list is off (#300). A room still plays the online mode, but no
// row is written for it and /online draws no list, so a game is shared by its
// code alone. Everything the list needs is still here and still allowed by the
// rules. Flip this with "onlineList" in src/site.json, which is the same
// switch on the page side, when the site can keep the list full: rooms it runs
// itself (#277), or bots.
export const ROOM_LIST_ON = false;

// The host rewrites its row this often. Three missed beats and the row is
// hidden. 180000 is also written into database.rules.json, where it lets any
// client clear a row that stale; keep the two in step.
export const HEARTBEAT_MS = 60 * 1000;
export const STALE_MS = 3 * 60 * 1000;

// What one card needs, or null when the room should not be listed at all.
// Built from an allow-list rather than by copying meta and deleting the
// secrets: a field added to meta later stays out of the index unless somebody
// writes it in here.
//
// `players` is the room's player rows. A card shows two of their animals
// (#271), so it carries those numbers and nothing else about them: never a
// name or an id.
export function listingFor({ meta, players, host, now }) {
  if (!meta || meta.mode !== 'clue') return null;
  const rows = Object.values(players || {});
  const card = {
    game: 'word',
    lang: meta.lang,
    mode: 'clue',
    host: String(host || '').slice(0, 20),
    players: rows.length,
    // Everything past the lobby reads as one state on a card: somebody
    // arriving now waits for the next round whichever screen it is on.
    phase: meta.phase === 'lobby' ? 'lobby' : 'playing',
    createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : now,
  };
  // Left out rather than written empty: the database stores no empty list,
  // and refuses undefined.
  const avs = facesOf(rows);
  if (avs.length) card.avs = avs;
  // When the lobby clock runs out, for "Starts in 3 min".
  if (card.phase === 'lobby' && typeof meta.lobbyAt === 'number') card.lobbyAt = meta.lobbyAt;
  return card;
}

// The animals of the first two players to join, the host's usually first.
// An animal is a number from 1 to 20 (AVATAR_COUNT in word/app.js); a row
// from before avatars has none and is skipped.
export const FACES = 2;
export function facesOf(rows) {
  return Object.values(rows || {})
    .filter(p => p && Number.isInteger(p.av) && p.av >= 1 && p.av <= 20)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .slice(0, FACES)
    .map(p => p.av);
}

// Whether a card has changed enough to be written again. The heartbeat is
// left out, because it changes on every write by design.
export function listingSig(card) {
  if (!card) return '';
  return [card.game, card.lang, card.mode, card.host, card.players, card.phase,
    (card.avs || []).join(','), card.lobbyAt || ''].join('|');
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

// A game in its lobby with this many players cannot be joined, so it is not
// listed (#271). MAX_PLAYERS in word/app.js. A game in a round stays listed,
// full or not: its next round is what the card offers, and the room says
// whether there is a seat when that round comes.
export const FULL_AT = 20;

// The list as /online shows it (#271): fresh rows only, a full lobby left
// out, split into games to join now and games in a round. The page's own
// language comes first in each, then the rest, newest first within that.
export function listForPage(tree, now, pageLang) {
  const rows = freshListings(tree, now)
    .filter(row => row.game === 'word')
    .filter(row => !(row.phase === 'lobby' && row.players >= FULL_AT));
  const mine = (row) => (row.lang === pageLang ? 0 : 1);
  // sort() is stable, so freshListings' newest-first order holds within each language group.
  const byLang = (list) => list.sort((a, b) => mine(a) - mine(b));
  return {
    open: byLang(rows.filter(row => row.phase === 'lobby')),
    playing: byLang(rows.filter(row => row.phase !== 'lobby')),
  };
}
