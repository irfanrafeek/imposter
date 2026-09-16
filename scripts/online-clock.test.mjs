// The online game runs itself (#275).
//
// The rule this file guards: when a clock runs out, the host does the one
// thing that screen calls for, and the short test clocks can never reach a
// live room.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLOCKS, FAST_CLOCKS, clocksFor, clockAction, canAddLobbyTime, addedLobbyTime, nextLobbyMs, hostOverdue, roundWasPlayed, clockText, CLOSE_REASONS }
  from '../www/shared/online-clock.js';

const at = (over) => ({ phase: 'lobby', now: 1000, players: 3, minPlayers: 3, emptyRound: false, ...over });

test('the clocks are the ones agreed', () => {
  assert.deepEqual(CLOCKS, { lobby: 300000, lobbyStep: 60000, lobbyMax: 600000, nextLobby: 60000, vote: 20000, over: 10000, hostGrace: 30000 });
  assert.deepEqual(CLOSE_REASONS, ['hostQuit', 'hostGone', 'notEnough', 'nobodyPlayed']);
});

test('the lobby starts the round with enough players, and closes without them', () => {
  assert.equal(clockAction(at({ lobbyAt: 1000 })), 'start');
  assert.equal(clockAction(at({ lobbyAt: 900, players: 20 })), 'start');
  assert.equal(clockAction(at({ lobbyAt: 1000, players: 2 })), 'notEnough');
  assert.equal(clockAction(at({ lobbyAt: 1000, players: 1 })), 'notEnough');
  assert.equal(clockAction(at({ lobbyAt: 1001 })), null);
});

test('after a round a full room waits a minute, and a short one the full lobby (#289)', () => {
  const next = (players) => nextLobbyMs({ players, minPlayers: 3, clocks: CLOCKS });
  assert.equal(next(3), 60000);
  assert.equal(next(20), 60000);
  assert.equal(next(2), 300000);
  assert.equal(next(1), 300000);
  assert.equal(nextLobbyMs({ players: 3, minPlayers: 3, clocks: FAST_CLOCKS }), FAST_CLOCKS.nextLobby);
});

test('the host adds a minute as often as they like, but never past ten (#287)', () => {
  const m = 60000;
  const add = (lobbyAt, now = 0) => ({ lobbyAt, now, step: m, max: 10 * m });
  assert.equal(canAddLobbyTime(add(3 * m)), true);
  assert.equal(canAddLobbyTime(add(9 * m)), true);
  // Above nine minutes a tap would pass ten: off, and on again once it drops.
  assert.equal(canAddLobbyTime(add(9 * m + 1)), false);
  assert.equal(canAddLobbyTime(add(10 * m)), false);
  assert.equal(canAddLobbyTime(add(9 * m + 1, 1)), true);
  // A clock that has run out, or a room with no clock, takes no taps.
  assert.equal(canAddLobbyTime(add(1000, 1000)), false);
  assert.equal(canAddLobbyTime(add(undefined)), false);
  assert.equal(addedLobbyTime(add(3 * m)), 4 * m);
  assert.equal(addedLobbyTime(add(9 * m)), 10 * m);
  assert.equal(addedLobbyTime(add(9 * m + 500)), 10 * m);
});

test('the vote closes, and the result screen goes back or closes the room', () => {
  assert.equal(clockAction(at({ phase: 'vote', voteAt: 1000 })), 'closeVote');
  assert.equal(clockAction(at({ phase: 'vote', voteAt: 5000 })), null);
  assert.equal(clockAction(at({ phase: 'over', overAt: 1000 })), 'replay');
  assert.equal(clockAction(at({ phase: 'over', overAt: 1000, emptyRound: true })), 'nobodyPlayed');
  assert.equal(clockAction(at({ phase: 'over', overAt: 5000, emptyRound: true })), null);
});

test('a clock only counts on its own screen', () => {
  // lobbyAt stays in meta after the round starts; it must not start another.
  for (const phase of ['countdown', 'playing', 'vote', 'reveal', 'over']) {
    assert.equal(clockAction(at({ phase, lobbyAt: 1 })), null, phase);
  }
  assert.equal(clockAction(at({ phase: 'lobby', voteAt: 1, overAt: 1 })), null);
  assert.equal(clockAction(at({ phase: 'playing', voteAt: 1, overAt: 1 })), null);
});

test('a private room, or a stamp the server has not resolved, does nothing', () => {
  assert.equal(clockAction(at({})), null);
  assert.equal(clockAction(at({ lobbyAt: { '.sv': 'timestamp' } })), null);
  assert.equal(clockAction(at({ lobbyAt: null })), null);
});

test('a host who lets a clock run out by the grace has stopped running the room (#284)', () => {
  const late = (over) => hostOverdue({ phase: 'lobby', now: 40000, grace: 30000, ...over });
  assert.equal(late({ lobbyAt: 9999 }), true);
  assert.equal(late({ lobbyAt: 10000 }), false);
  assert.equal(late({ phase: 'countdown', startAt: 5000 }), true);
  assert.equal(late({ phase: 'countdown', startAt: 20000 }), false);
  assert.equal(late({ phase: 'vote', voteAt: 5000 }), true);
  assert.equal(late({ phase: 'vote', voteAt: 20000 }), false);
  assert.equal(late({ phase: 'reveal', revealAt: 5000 }), true);
  assert.equal(late({ phase: 'reveal', revealAt: 20000 }), false);
  assert.equal(late({ phase: 'over', overAt: 5000 }), true);
  // A clue turn also gets the host's own grace for a writer who has gone.
  assert.equal(late({ phase: 'playing', turnAt: 7000, turnGrace: 4000 }), false);
  assert.equal(late({ phase: 'playing', turnAt: 5000, turnGrace: 4000 }), true);
});

test('only the clock of the screen the room is on can make the host late', () => {
  const late = (over) => hostOverdue({ now: 100000, grace: 30000, lobbyAt: 1, startAt: 1, turnAt: 1, voteAt: 1, revealAt: 1, overAt: 1, ...over });
  assert.equal(late({ phase: 'lobby', lobbyAt: 90000 }), false);
  assert.equal(late({ phase: 'countdown', startAt: 90000 }), false);
  assert.equal(late({ phase: 'playing', turnAt: 90000 }), false);
  assert.equal(late({ phase: 'vote', voteAt: 90000 }), false);
  assert.equal(late({ phase: 'over', overAt: 90000 }), false);
  assert.equal(late({ phase: 'reveal', revealAt: 90000 }), false);
  assert.equal(late({ phase: 'finished' }), false);
  assert.equal(hostOverdue({ phase: 'lobby', now: 100000, grace: 30000 }), false);
  assert.equal(hostOverdue({ phase: 'lobby', now: 100000, grace: 30000, lobbyAt: { '.sv': 'timestamp' } }), false);
});

test('a round counts as played with one clue or one vote', () => {
  assert.equal(roundWasPlayed(null, null), false);
  assert.equal(roundWasPlayed({}, {}), false);
  const skipped = [{ by: 'pA', skipped: true, ts: 1 }, { by: 'pB', skipped: true, ts: 2 }];
  assert.equal(roundWasPlayed(skipped, {}), false, 'skipped turns are not clues');
  assert.equal(roundWasPlayed([...skipped, { by: 'pC', text: 'hot', ts: 3 }], {}), true);
  assert.equal(roundWasPlayed({ 4: { by: 'pC', text: 'hot', ts: 3 } }, null), true);
  assert.equal(roundWasPlayed(skipped, { pA: { pB: true } }), true);
  assert.equal(roundWasPlayed(skipped, { pA: {} }), false);
});

test('the clock reads m:ss and rounds up', () => {
  assert.equal(clockText(240000), '4:00');
  assert.equal(clockText(239001), '4:00');
  assert.equal(clockText(239000), '3:59');
  assert.equal(clockText(9500), '0:10');
  assert.equal(clockText(1), '0:01');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(-5000), '0:00');
  assert.equal(clockText(undefined), '0:00');
});

test('the fast clocks only work on localhost', () => {
  const loc = (hostname, search = '?clocks=fast') => ({ hostname, search });
  assert.equal(clocksFor(loc('localhost')), FAST_CLOCKS);
  assert.equal(clocksFor(loc('127.0.0.1', '?emu=1&clocks=fast')), FAST_CLOCKS);
  assert.equal(clocksFor(loc('localhost', '')), CLOCKS);
  assert.equal(clocksFor(loc('localhost', '?clocks=slow')), CLOCKS);
  for (const live of ['impostorgames.com', 'www.impostorgames.com', 'imposter-20b85.web.app']) {
    assert.equal(clocksFor(loc(live)), CLOCKS, live);
  }
  assert.equal(clocksFor(undefined), CLOCKS);
  assert.ok(Object.keys(FAST_CLOCKS).every(k => FAST_CLOCKS[k] < CLOCKS[k]));
});
