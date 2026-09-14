// The online game runs itself (#275).
//
// The rule this file guards: when a clock runs out, the host does the one
// thing that screen calls for, and the short test clocks can never reach a
// live room.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLOCKS, FAST_CLOCKS, clocksFor, clockAction, roundWasPlayed, clockText, CLOSE_REASONS }
  from '../www/shared/online-clock.js';

const at = (over) => ({ phase: 'lobby', now: 1000, players: 3, minPlayers: 3, emptyRound: false, ...over });

test('the clocks are the ones agreed', () => {
  assert.deepEqual(CLOCKS, { lobby: 240000, vote: 20000, over: 10000, hostGrace: 30000 });
  assert.deepEqual(CLOSE_REASONS, ['hostQuit', 'hostGone', 'notEnough', 'nobodyPlayed']);
});

test('the lobby starts the round with enough players, and closes without them', () => {
  assert.equal(clockAction(at({ lobbyAt: 1000 })), 'start');
  assert.equal(clockAction(at({ lobbyAt: 900, players: 20 })), 'start');
  assert.equal(clockAction(at({ lobbyAt: 1000, players: 2 })), 'notEnough');
  assert.equal(clockAction(at({ lobbyAt: 1000, players: 1 })), 'notEnough');
  assert.equal(clockAction(at({ lobbyAt: 1001 })), null);
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
