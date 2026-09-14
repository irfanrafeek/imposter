// The public index of online games (#269).
//
// The rule this file guards: a card holds what the list shows and nothing a
// player could cheat with, and a card whose host has gone quiet is not shown.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listingFor, listingSig, isFresh, freshListings, STALE_MS }
  from '../www/shared/online-games.js';

// A room mid-round, carrying every secret the room tree has ever held in meta.
const META = {
  mode: 'clue', lang: 'es', phase: 'playing', createdAt: 1000,
  hostId: 'pH', hostUid: 'UIDH',
  secretWord: 'Ajo', imposterHint: 'Fuerte', imposterIds: { pA: true },
  order: ['pH', 'pA'], seats: ['pH', 'pA'], blocked: { UIDX: true },
};

test('a private room is not listed', () => {
  assert.equal(listingFor({ meta: { ...META, mode: 'online' }, players: 3, host: 'Ana' }), null);
  assert.equal(listingFor({ meta: { ...META, mode: undefined }, players: 3, host: 'Ana' }), null);
  assert.equal(listingFor({ meta: { ...META, mode: 'passphone' }, players: 3, host: 'Ana' }), null);
  assert.equal(listingFor({ meta: null, players: 3, host: 'Ana' }), null);
});

test('an online room gets a card with exactly the fields a card shows', () => {
  const card = listingFor({ meta: META, players: 3, host: 'Ana', now: 5 });
  assert.deepEqual(card, {
    game: 'word', lang: 'es', mode: 'clue', host: 'Ana', players: 3, phase: 'playing', createdAt: 1000,
  });
});

test('the card holds no secret word, hint, impostor id or player id', () => {
  const text = JSON.stringify(listingFor({ meta: META, players: 2, host: 'Ana' }));
  for (const secret of ['Ajo', 'Fuerte', 'pA', 'pH', 'UIDH', 'UIDX']) {
    assert.ok(!text.includes(secret), `card leaks ${secret}: ${text}`);
  }
});

test('every screen past the lobby reads as playing', () => {
  for (const phase of ['countdown', 'playing', 'vote', 'reveal', 'over']) {
    assert.equal(listingFor({ meta: { ...META, phase }, players: 2, host: 'Ana' }).phase, 'playing');
  }
  assert.equal(listingFor({ meta: { ...META, phase: 'lobby' }, players: 2, host: 'Ana' }).phase, 'lobby');
});

test('a createdAt the server has not resolved yet falls back to now', () => {
  const card = listingFor({ meta: { ...META, createdAt: { '.sv': 'timestamp' } }, players: 1, host: 'Ana', now: 42 });
  assert.equal(card.createdAt, 42);
});

test('the signature changes with what a card shows', () => {
  const a = listingFor({ meta: META, players: 2, host: 'Ana' });
  assert.equal(listingSig(a), listingSig({ ...a, createdAt: 9 }));
  assert.notEqual(listingSig(a), listingSig({ ...a, players: 3 }));
  assert.notEqual(listingSig(a), listingSig({ ...a, phase: 'lobby' }));
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
