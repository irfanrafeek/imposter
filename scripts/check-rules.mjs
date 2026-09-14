#!/usr/bin/env node
// ============================================================
// DATABASE RULES, CHECKED  (#267)
// ============================================================
// Every question database.rules.json is supposed to answer about rooms-word,
// asked against a running emulator. The point is that "a player cannot read
// somebody else's card" stops being a claim about the code and becomes a
// thing that either passes or fails.
//
//   JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
//     firebase emulators:start --only database,auth --project imposter-20b85
//   npm run check:rules
//
// It needs the emulator and not the real project, for the obvious reason and
// one less obvious one: several checks below deliberately try to vandalise a
// room, and they should be vandalising a room that exists nowhere.
//
// HOW THE EMULATOR IS ASKED. Requests carry `Authorization: Bearer owner`,
// which is what gets past the front door, and `auth_variable_override`, which
// is what the rules then see as `auth`. Both are needed together. Without the
// header the override is ignored and everything comes back 401, which reads
// exactly like a rule denying you and cost an hour the first time.
//
// Seeding goes through the same door with no override at all, which is how a
// fixture can be laid down in a shape no player would be allowed to write.
// ============================================================

const BASE = process.env.RULES_EMULATOR || 'http://127.0.0.1:9000';
const NS = 'imposter-20b85-default-rtdb';
const SV = { '.sv': 'timestamp' };
const NOW = Date.now();
const R = 'rooms-word/TEST';

function url(path, who, admin) {
  const q = new URLSearchParams({ ns: NS });
  if (!admin) q.set('auth_variable_override', JSON.stringify(who === 'anon' ? null : { uid: who }));
  return `${BASE}/${path}.json?${q}`;
}

async function req(method, path, who, body, admin) {
  const res = await fetch(url(path, who, admin), {
    method,
    headers: { Authorization: 'Bearer owner' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok ? 'ALLOW' : 'DENY';
}

const seed  = (path, data) => req('PUT', path, null, data, true);
const wipe  = () => req('DELETE', 'rooms-word', null, undefined, true);
const rd    = (who, path) => req('GET', path, who);
const wr    = (who, path, data) => req('PUT', path, who, data);
const patch = (who, path, data) => req('PATCH', path, who, data);
const rm    = (who, path) => req('DELETE', path, who);

// The fixture: a room mid-round, a host and two players, each with their own
// session. Three uids and not one, because the thing most of these checks are
// about is the boundary between them.
function fixture() {
  return seed(R, {
    meta: {
      hostId: 'pH', hostUid: 'UIDH', phase: 'playing', dealtImposters: 1,
      order: ['pH', 'pA', 'pB'],
      seats: ['pH', 'pA', 'pB', 'pH', 'pA', 'pB'],
      turn: 0, rounds: 2, lastActivity: NOW,
    },
    players: {
      pH: { name: 'Host', uid: 'UIDH', ready: true, joinedAt: 1, av: 1 },
      pA: { name: 'Ann',  uid: 'UIDA', ready: true, joinedAt: 2, av: 2 },
      pB: { name: 'Bo',   uid: 'UIDB', ready: true, joinedAt: 3, av: 3 },
    },
    cards: {
      UIDH: { pH: { imp: false, text: 'Garlic' } },
      UIDA: { pA: { imp: true,  text: 'Strong' } },
      UIDB: { pB: { imp: false, text: 'Garlic' } },
    },
    answer: { word: 'Garlic', imps: { pA: true } },
  });
}

const failures = [];
async function check(label, promise, want) {
  const got = await promise;
  if (got !== want) failures.push(`${label}: wanted ${want}, got ${got}`);
  console.log(`  ${got === want ? 'ok  ' : 'FAIL'}  ${label.padEnd(46)} ${got}`);
}

async function reachable() {
  try {
    const res = await fetch(`${BASE}/.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } });
    return res.ok;
  } catch (e) { return false; }
}

async function main() {
  if (!await reachable()) {
    console.error(`No database emulator at ${BASE}.\n` +
      'Start one first:\n' +
      '  JAVA_HOME=/opt/homebrew/opt/openjdk@21 \\\n' +
      '    firebase emulators:start --only database,auth --project imposter-20b85');
    process.exit(2);
  }
  await wipe();
  await fixture();

  console.log('\nwho can read what (#266)');
  await check('the room node, a player in it',      rd('UIDA', R), 'DENY');
  await check('the room node, anonymous',           rd('anon', R), 'DENY');
  await check('meta, anonymous',                    rd('anon', `${R}/meta`), 'ALLOW');
  await check('players, anonymous',                 rd('anon', `${R}/players`), 'ALLOW');
  await check('my own card',                        rd('UIDA', `${R}/cards/UIDA/pA`), 'ALLOW');
  await check('somebody else’s card',               rd('UIDA', `${R}/cards/UIDB/pB`), 'DENY');
  await check('the cards node whole',               rd('UIDA', `${R}/cards`), 'DENY');
  await check('a card, anonymous',                  rd('anon', `${R}/cards/UIDA/pA`), 'DENY');
  await check('the answer, the host',               rd('UIDH', `${R}/answer`), 'ALLOW');
  await check('the answer, a player',               rd('UIDA', `${R}/answer`), 'DENY');

  console.log('\nwhat drives the round is the host’s (#267)');
  await check('the host sets the phase',            wr('UIDH', `${R}/meta/phase`, 'vote'), 'ALLOW');
  await check('a player sets the phase',            wr('UIDA', `${R}/meta/phase`, 'over'), 'DENY');
  await check('anonymous sets the phase',           wr('anon', `${R}/meta/phase`, 'over'), 'DENY');
  await check('the host rewrites the seating',      wr('UIDH', `${R}/meta/seats`, ['pA']), 'ALLOW');
  await check('a player rewrites the seating',      wr('UIDA', `${R}/meta/seats`, ['pA']), 'DENY');
  await fixture();
  await check('a player stamps lastActivity',       wr('UIDA', `${R}/meta/lastActivity`, SV), 'ALLOW');
  await check('a player forges lastActivity',       wr('UIDA', `${R}/meta/lastActivity`, 4102444800000), 'DENY');
  await check('a player deletes the room',          rm('UIDA', R), 'DENY');
  await check('a player deletes every player',      rm('UIDA', `${R}/players`), 'DENY');
  await check('a player deletes the board',         rm('UIDA', `${R}/clues`), 'DENY');

  console.log('\nclaiming a code');
  await check('create a room I host',               wr('UIDA', 'rooms-word/NEW1/meta', { hostUid: 'UIDA', lastActivity: SV }), 'ALLOW');
  await check('create one hosted by somebody else', wr('UIDA', 'rooms-word/NEW2/meta', { hostUid: 'UIDH', lastActivity: SV }), 'DENY');
  await seed('rooms-word/OLD',  { meta: { hostUid: 'UIDH', lastActivity: NOW - 20 * 60 * 1000 } });
  await seed('rooms-word/LIVE', { meta: { hostUid: 'UIDH', lastActivity: NOW - 60 * 1000 } });
  await check('clear a room idle past the cutoff',  rm('UIDA', 'rooms-word/OLD'), 'ALLOW');
  await check('clear a room that is still live',    rm('UIDA', 'rooms-word/LIVE'), 'DENY');

  console.log('\na player’s own row');
  await fixture();
  await check('change my own ready flag',           patch('UIDA', `${R}/players/pA`, { ready: false }), 'ALLOW');
  await check('change somebody else’s name',        patch('UIDA', `${R}/players/pB`, { name: 'Rude' }), 'DENY');
  await check('delete somebody else’s row',         rm('UIDA', `${R}/players/pB`), 'DENY');
  await check('the host rewrites my row',           wr('UIDH', `${R}/players/pA`, { name: 'Ann', uid: 'UIDA', ready: true, joinedAt: 2, av: 2 }), 'DENY');
  await check('join, claiming a row as myself',     wr('UIDC', `${R}/players/pC`, { name: 'Cy', uid: 'UIDC', ready: false, joinedAt: 4, av: 4 }), 'ALLOW');
  await check('join, claiming one as somebody else',wr('UIDA', `${R}/players/pD`, { name: 'Fake', uid: 'UIDB', ready: false, joinedAt: 5, av: 5 }), 'DENY');
  await check('smuggle a field onto my row',        patch('UIDA', `${R}/players/pA`, { isHost: true }), 'DENY');
  await check('a name of 200 characters',           patch('UIDA', `${R}/players/pA`, { name: 'x'.repeat(200) }), 'DENY');
  await check('delete my own row',                  rm('UIDA', `${R}/players/pA`), 'ALLOW');

  console.log('\nthe ballot');
  await fixture();
  await check('cast my own vote',                   wr('UIDA', `${R}/votes/pA`, { pB: true }), 'ALLOW');
  await check('cast a vote as somebody else',       wr('UIDB', `${R}/votes/pA`, { pH: true }), 'DENY');
  await check('vote for myself',                    wr('UIDA', `${R}/votes/pA/pA`, true), 'DENY');
  await check('a vote that is not a yes',           wr('UIDA', `${R}/votes/pA/pH`, 'maybe'), 'DENY');
  await check('withdraw my own vote',               rm('UIDA', `${R}/votes/pA`), 'ALLOW');

  console.log('\nthe clue board   seats: pH pA pB pH pA pB');
  await fixture();
  await check('write my own slot',                  wr('UIDA', `${R}/clues/1`, { by: 'pA', text: 'pungent', ts: SV }), 'ALLOW');
  await check('write over it',                      wr('UIDA', `${R}/clues/1`, { by: 'pA', text: 'again', ts: SV }), 'DENY');
  await check('write their slot under my name',     wr('UIDA', `${R}/clues/2`, { by: 'pA', text: 'mine', ts: SV }), 'DENY');
  await check('write their slot under theirs',      wr('UIDA', `${R}/clues/2`, { by: 'pB', text: 'framed', ts: SV }), 'DENY');
  await check('the seat holder writes their slot',  wr('UIDB', `${R}/clues/2`, { by: 'pB', text: 'clove', ts: SV }), 'ALLOW');
  await fixture();
  await check('the host skips an absent player',    wr('UIDH', `${R}/clues/2`, { by: 'pB', skipped: true, ts: SV }), 'ALLOW');
  await check('the host writes under a wrong name', wr('UIDH', `${R}/clues/3`, { by: 'pA', text: 'x', ts: SV }), 'DENY');
  await check('a clue of 200 characters',           wr('UIDA', `${R}/clues/1`, { by: 'pA', text: 'x'.repeat(200), ts: SV }), 'DENY');
  await check('a clue with a smuggled field',       wr('UIDA', `${R}/clues/1`, { by: 'pA', text: 'ok', ts: SV, admin: true }), 'DENY');
  await check('a clue with a forged timestamp',     wr('UIDA', `${R}/clues/1`, { by: 'pA', text: 'ok', ts: 1 }), 'DENY');

  console.log('\nchat');
  await fixture();
  await check('post as myself',                     wr('UIDA', `${R}/chat/m1`, { from: 'pA', name: 'Ann', text: 'hi', ts: SV }), 'ALLOW');
  await check('post as somebody else',              wr('UIDA', `${R}/chat/m2`, { from: 'pB', name: 'Bo', text: 'I did it', ts: SV }), 'DENY');
  await check('post anonymously',                   wr('anon', `${R}/chat/m3`, { from: 'pA', name: 'Ann', text: 'hi', ts: SV }), 'DENY');

  console.log('\nthe deal is the host’s to write');
  await fixture();
  await check('tamper with a card I cannot read',   wr('UIDA', `${R}/cards/UIDB/pB`, { imp: true, text: 'x' }), 'DENY');
  await check('rewrite my own card',                wr('UIDA', `${R}/cards/UIDA/pA`, { imp: false, text: 'Garlic' }), 'DENY');
  await check('the host deals a card',              wr('UIDH', `${R}/cards/UIDA/pA`, { imp: true, text: 'Strong' }), 'ALLOW');
  await check('a player rewrites the answer',       wr('UIDA', `${R}/answer`, { word: 'x', imps: {} }), 'DENY');
  await check('the host writes the answer',         wr('UIDH', `${R}/answer`, { word: 'Garlic', imps: { pA: true } }), 'ALLOW');
  await check('the host closes the room',           rm('UIDH', R), 'ALLOW');

  await wipe();
  console.log();
  if (failures.length) {
    console.error(`${failures.length} rule check(s) failed:`);
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
  }
  console.log('All rule checks passed.');
}

main().catch((e) => { console.error(e); process.exit(2); });
