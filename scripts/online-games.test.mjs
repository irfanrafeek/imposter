// The public index of online games (#269).
//
// The rule this file guards: a card holds what the list shows and nothing a
// player could cheat with, and a card whose host has gone quiet is not shown.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listingFor, listingSig, isFresh, freshListings, listForPage, facesOf, onlineGamesVisible, STALE_MS, FULL_AT }
  from '../www/shared/online-games.js';

// A room mid-round, carrying every secret the room tree has ever held in meta.
const META = {
  mode: 'clue', lang: 'es', phase: 'playing', createdAt: 1000,
  hostId: 'pH', hostUid: 'UIDH',
  secretWord: 'Ajo', imposterHint: 'Fuerte', imposterIds: { pA: true },
  order: ['pH', 'pA'], seats: ['pH', 'pA'], blocked: { UIDX: true },
};

// Player rows as the room holds them, each with an animal.
const rows = (n) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, joinedAt: i + 1, av: i + 1 }));

test('a private room is not listed', () => {
  assert.equal(listingFor({ meta: { ...META, mode: 'online' }, players: rows(3), host: 'Ana' }), null);
  assert.equal(listingFor({ meta: { ...META, mode: undefined }, players: rows(3), host: 'Ana' }), null);
  assert.equal(listingFor({ meta: { ...META, mode: 'passphone' }, players: rows(3), host: 'Ana' }), null);
  assert.equal(listingFor({ meta: null, players: rows(3), host: 'Ana' }), null);
});

test('an online room gets a card with exactly the fields a card shows', () => {
  const card = listingFor({ meta: META, players: rows(3), host: 'Ana', now: 5 });
  assert.deepEqual(card, {
    game: 'word', lang: 'es', mode: 'clue', host: 'Ana', players: 3, phase: 'playing', createdAt: 1000, avs: [1, 2],
  });
});

test('the card holds no secret word, hint, impostor id or player id', () => {
  const text = JSON.stringify(listingFor({ meta: META, players: rows(2), host: 'Ana' }));
  for (const secret of ['Ajo', 'Fuerte', 'pA', 'pH', 'UIDH', 'UIDX']) {
    assert.ok(!text.includes(secret), `card leaks ${secret}: ${text}`);
  }
});

test('every screen past the lobby reads as playing', () => {
  for (const phase of ['countdown', 'playing', 'vote', 'reveal', 'over']) {
    assert.equal(listingFor({ meta: { ...META, phase }, players: rows(2), host: 'Ana' }).phase, 'playing');
  }
  assert.equal(listingFor({ meta: { ...META, phase: 'lobby' }, players: rows(2), host: 'Ana' }).phase, 'lobby');
});

test('a createdAt the server has not resolved yet falls back to now', () => {
  const card = listingFor({ meta: { ...META, createdAt: { '.sv': 'timestamp' } }, players: rows(1), host: 'Ana', now: 42 });
  assert.equal(card.createdAt, 42);
});

test('the signature changes with what a card shows', () => {
  const a = listingFor({ meta: META, players: rows(2), host: 'Ana' });
  assert.equal(listingSig(a), listingSig({ ...a, createdAt: 9 }));
  assert.notEqual(listingSig(a), listingSig({ ...a, players: 3 }));
  assert.notEqual(listingSig(a), listingSig({ ...a, phase: 'lobby' }));
  assert.notEqual(listingSig(a), listingSig({ ...a, avs: [3, 4] }));
  assert.notEqual(listingSig(a), listingSig({ ...a, lobbyAt: 7 }));
  assert.equal(listingSig(null), '');
});

test('a stale card is not shown even while it is still in the tree', () => {
  const now = 10 * STALE_MS;
  assert.ok(isFresh({ heartbeat: now - 1000 }, now));
  assert.ok(!isFresh({ heartbeat: now - STALE_MS }, now));
  assert.ok(!isFresh({}, now));
  assert.ok(!isFresh(null, now));

  const list = freshListings({
    OLD1: { phase: 'lobby', createdAt: 5, heartbeat: now - STALE_MS - 1 },
    PLAY: { phase: 'playing', createdAt: 9, heartbeat: now - 10 },
    NEW1: { phase: 'lobby', createdAt: 8, heartbeat: now - 10 },
    NEW2: { phase: 'lobby', createdAt: 7, heartbeat: now - 10 },
  }, now);
  assert.deepEqual(list.map(r => r.code), ['NEW1', 'NEW2', 'PLAY']);
  assert.deepEqual(freshListings(null, now), []);
});

test('a card shows the first two animals by join order, and only the numbers', () => {
  assert.deepEqual(facesOf([
    { name: 'Late', joinedAt: 9, av: 7, uid: 'U9' },
    { name: 'Host', joinedAt: 1, av: 4, uid: 'U1' },
    { name: 'Old',  joinedAt: 2 },
    { name: 'Two',  joinedAt: 3, av: 11 },
  ]), [4, 11]);
  assert.deepEqual(facesOf({ a: { joinedAt: 1, av: 0 }, b: { joinedAt: 2, av: 21 }, c: { joinedAt: 3, av: '5' } }), []);
  assert.deepEqual(facesOf(null), []);

  const card = listingFor({ meta: META, players: [{ name: 'Old', joinedAt: 1 }], host: 'Ana' });
  assert.ok(!('avs' in card), 'no faces means no field, not an empty one');
});

test('a card in the lobby says when it starts, and a round does not', () => {
  const lobby = listingFor({ meta: { ...META, phase: 'lobby', lobbyAt: 5000 }, players: rows(2), host: 'Ana' });
  assert.equal(lobby.lobbyAt, 5000);
  const round = listingFor({ meta: { ...META, lobbyAt: 5000 }, players: rows(2), host: 'Ana' });
  assert.ok(!('lobbyAt' in round));
});

test('the page lists its own language first, and leaves out a full lobby', () => {
  const now = 10 * STALE_MS;
  const row = (over) => ({ game: 'word', phase: 'lobby', players: 3, createdAt: 1, heartbeat: now, ...over });
  const { open, playing } = listForPage({
    ENNEW: row({ lang: 'en', createdAt: 9 }),
    FROLD: row({ lang: 'fr', createdAt: 2 }),
    FRNEW: row({ lang: 'fr', createdAt: 8 }),
    FULL1: row({ lang: 'fr', players: FULL_AT, createdAt: 10 }),
    STALE: row({ lang: 'fr', heartbeat: now - STALE_MS }),
    DRAW1: row({ lang: 'fr', game: 'draw' }),
    PLAY1: row({ lang: 'en', phase: 'playing', players: FULL_AT, createdAt: 5 }),
    PLAY2: row({ lang: 'fr', phase: 'playing', createdAt: 4 }),
  }, now, 'fr');
  assert.deepEqual(open.map(r => r.code), ['FRNEW', 'FROLD', 'ENNEW']);
  assert.deepEqual(playing.map(r => r.code), ['PLAY2', 'PLAY1'], 'a full game in a round stays listed');
  assert.deepEqual(listForPage(null, now, 'en'), { open: [], playing: [] });
});

test('the Private or Online choice stays off the live site until #273', () => {
  for (const live of ['impostorgames.com', 'www.impostorgames.com']) {
    assert.equal(onlineGamesVisible({ hostname: live }), false, live);
  }
  for (const other of ['localhost', '127.0.0.1', 'imposter-20b85.web.app']) {
    assert.equal(onlineGamesVisible({ hostname: other }), true, other);
  }
  assert.equal(onlineGamesVisible(undefined), false);
});
