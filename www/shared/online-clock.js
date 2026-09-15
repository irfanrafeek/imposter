// ============================================================
// THE ONLINE GAME RUNS ITSELF  (#275)
// ============================================================
// Strangers wander off. In an online game every wait has a clock, and when it
// runs out the room moves on whether or not anybody pressed anything, so no
// room of strangers sits stuck on the list at /online.
//
// The deadlines live in the room's meta as stamps (lobbyAt, voteAt, overAt),
// the same way revealAt already did, so every player counts down to the same
// moment. Only the host's browser acts on them. This file decides WHAT
// happens when a clock runs out; www/word/app.js does it.
//
// Pure on purpose, so it can be tested without a database, and no t() in
// here for the reason given at the top of shared/clock.js.

export const CLOCKS = {
  // The lobby. At zero the round starts with enough players, or the room
  // closes without them. It does not start again when somebody joins.
  lobby: 3 * 60 * 1000,
  // The host's +1 min (#287): what one tap adds, and the most the clock can
  // ever show. The host taps as often as they like below that.
  lobbyStep: 60 * 1000,
  lobbyMax: 10 * 60 * 1000,
  // The lobby between rounds, when the room is still full enough to play
  // (#289). Everyone is already here, so it only waits for a straggler.
  nextLobby: 60 * 1000,
  // The ballot, counted from the end of its two second intro. Was thirty,
  // cut to twenty after the first local play.
  vote: 20 * 1000,
  // The result screen, then back to the lobby for the next round.
  over: 10 * 1000,
  // How long players wait for a host who has dropped. A phone that locks for
  // a moment drops its socket, and a host back inside this keeps the game.
  hostGrace: 30 * 1000,
};

// The same clocks, short enough to test a whole round against.
export const FAST_CLOCKS = {
  lobby: 20 * 1000,
  lobbyStep: 10 * 1000,
  lobbyMax: 40 * 1000,
  nextLobby: 10 * 1000,
  vote: 10 * 1000,
  over: 5 * 1000,
  hostGrace: 8 * 1000,
};

// ?clocks=fast on localhost, and never anywhere else, so a live room cannot
// be hurried by somebody editing its URL.
export function clocksFor(loc) {
  try {
    const local = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
    if (local && new URLSearchParams(loc.search).get('clocks') === 'fast') return FAST_CLOCKS;
  } catch (e) { /* no location to read: the real clocks */ }
  return CLOCKS;
}

// How long the lobby waits after a round (#289): a minute when enough players
// are still in to start again, and the full first lobby when a room that lost
// players needs the time to fill. Decided once, as the lobby opens.
export function nextLobbyMs({ players, minPlayers, clocks }) {
  return players >= minPlayers ? clocks.nextLobby : clocks.lobby;
}

// Whether the host's +1 min can be tapped (#287): the lobby clock is still
// running and one more step would not take it past the most it can show.
// Off while it would, and on again once the time left drops.
export function canAddLobbyTime({ lobbyAt, now, step, max }) {
  return typeof lobbyAt === 'number' && lobbyAt > now && lobbyAt - now + step <= max;
}

// The lobby deadline after one tap. Capped as well as gated, so a clock the
// host's screen rounded down can still never pass the most.
export function addedLobbyTime({ lobbyAt, now, step, max }) {
  return Math.min(lobbyAt + step, now + max);
}

// Why an online room closed, counted so the numbers can say how often a host
// just disappears: that one decides whether #276, the host handoff, is built.
// The host writes the reason to meta/closed so the players are told it, all
// but hostGone, which by definition has nobody left to write it.
export const CLOSE_REASONS = ['hostQuit', 'hostGone', 'notEnough', 'nobodyPlayed'];

// What the host does now, or null. Each clock only counts on its own screen:
// a lobbyAt still sitting in meta from before the round started is not a
// reason to start another one.
export function clockAction({ phase, now, lobbyAt, voteAt, overAt, players, minPlayers, emptyRound }) {
  const due = (at) => typeof at === 'number' && now >= at;
  if (phase === 'lobby' && due(lobbyAt)) return players >= minPlayers ? 'start' : 'notEnough';
  if (phase === 'vote' && due(voteAt)) return 'closeVote';
  if (phase === 'over' && due(overAt)) return emptyRound ? 'nobodyPlayed' : 'replay';
  return null;
}

// Whether the host has stopped running the room (#284). A tab the browser has
// paused keeps its socket, so its row stays and the players cannot see it go.
// What they can see is the room not moving: the host acts within a tick of
// each deadline, and on a clue turn within turnGrace of it, so a room still
// on that screen grace later has a host who is not running. A stamp the
// server has not resolved yet, or a private room with none, is never late.
export function hostOverdue({ phase, now, lobbyAt, startAt, turnAt, voteAt, revealAt, overAt, turnGrace = 0, grace }) {
  const late = (at, extra = 0) => typeof at === 'number' && now > at + extra + grace;
  if (phase === 'lobby') return late(lobbyAt);
  if (phase === 'countdown') return late(startAt);
  if (phase === 'playing') return late(turnAt, turnGrace);
  if (phase === 'vote') return late(voteAt);
  if (phase === 'reveal') return late(revealAt);
  if (phase === 'over') return late(overAt);
  return false;
}

// Whether anybody played the round: one clue written, or one name picked. A
// skipped turn is not a clue. Without this, three idle tabs would loop
// through empty rounds for as long as the tabs stayed open.
export function roundWasPlayed(clues, votes) {
  const wrote = Object.values(clues || {})
    .some(row => !!row && typeof row.text === 'string' && row.text.length > 0);
  const voted = Object.values(votes || {})
    .some(ballot => !!ballot && Object.values(ballot).some(Boolean));
  return wrote || voted;
}

// m:ss, rounded up, so 0:00 only shows once the time has really run out.
export function clockText(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
