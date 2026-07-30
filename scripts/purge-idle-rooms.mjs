// Delete abandoned rooms from the three room trees.
//
//   node scripts/purge-idle-rooms.mjs               # dry run, deletes nothing
//   node scripts/purge-idle-rooms.mjs --delete      # actually delete
//   node scripts/purge-idle-rooms.mjs --idle-min=30 # different cutoff
//
// WHY THIS EXISTS
// Each game closes its own room after IDLE_MS of inactivity, but that
// watchdog is a setInterval living inside the page. It can only fire while
// somebody still has the tab open. When the last person closes their tab the
// room is orphaned with nobody left to clean it up, and createRoom only
// reclaims a code if a new room happens to roll that exact string, which at
// well under 1% occupancy of the 32^4 code space is close to never.
//
// So orphans accumulate forever. This script is the missing enforcer: the
// same rule the games already apply, run by something that does not depend on
// a browser tab being open.
//
// SAFETY
// Dry run is the default; deleting needs --delete. The cutoff matches the
// games' own IDLE_MS, so a room this script removes is one the in-app
// watchdog would already have removed had anyone been present to run it.
// That is the argument for why this cannot destroy a room the app itself
// considers alive.
//
// Three kinds of dead room get removed, each for its own stated reason:
//
//   idle     Older than the cutoff. This is the games' own rule.
//   ghost    Has a players node but no meta. Not a room mid-creation:
//            createRoom writes meta and players in a single atomic set(), so
//            this state can only be reached afterwards, when the presence
//            system re-adds a player to a room whose meta was already
//            deleted. Both joinRoom and attemptCodeValidation require .meta,
//            so a room in this state is unjoinable and invisible by
//            construction. Nothing can ever use it again.
//   corrupt  lastActivity sits more than an hour in the future, which no real
//            room can reach: both stamps are serverTimestamp(), so the server
//            clock would have to be an hour wrong. Something wrote a raw
//            number instead (we found two rooms stamped for the year 2286).
//            These matter because no time-based rule will EVER catch them, so
//            without this they are immortal.
//
// There is a small race by design: a room could become active in the seconds
// between the read and the delete. If that happens we have done exactly what
// the in-app watchdog would have done anyway, so it is not worth a second
// round of reads over a couple of thousand rooms to close it.

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'imposter-20b85';
// Mirrors IDLE_MS in each game's app.js. Keep them in step: this script
// enforcing a different number to the games would be two rules, not one.
const DEFAULT_IDLE_MIN = 15;
// Trees the three games write to. Kept separate so the games can hand out the
// same 4-char code without colliding.
const TREES = ['rooms', 'rooms-word', 'rooms-draw'];
// One update carries this many deletions. Big enough that 2000+ rooms take a
// handful of requests, small enough that one failure is not the whole run.
const CHUNK = 400;

// How far ahead of now a stamp has to sit before we call it corrupt rather
// than merely surprising. Generous: both stamps are server-side, so any drift
// at all already means something other than the server wrote it.
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

const args = process.argv.slice(2);
const DELETE = args.includes('--delete');
const idleArg = args.find(a => a.startsWith('--idle-min='));
const IDLE_MIN = idleArg ? parseInt(idleArg.split('=')[1], 10) : DEFAULT_IDLE_MIN;

if (!Number.isFinite(IDLE_MIN) || IDLE_MIN <= 0) {
  console.error('--idle-min must be a positive number of minutes');
  process.exit(1);
}
const IDLE_MS = IDLE_MIN * 60 * 1000;

function fb(cmdArgs) {
  return execFileSync('firebase', [...cmdArgs, '--project', PROJECT], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function readTree(tree) {
  const raw = fb(['database:get', `/${tree}`]);
  return JSON.parse(raw || 'null') || {};
}

// A room's age comes from lastActivity, falling back to createdAt. Both are
// serverTimestamp() in all three games, so neither can be skewed by a client
// with a bad clock.
function stampOf(room) {
  const m = (room || {}).meta || {};
  const t = m.lastActivity ?? m.createdAt;
  return typeof t === 'number' ? t : null;
}

function classify(tree, rooms, now) {
  const idle = [], fresh = [], corrupt = [], ghost = [], unknown = [];
  let bytes = 0;
  const size = (r) => JSON.stringify(r).length;
  for (const [code, room] of Object.entries(rooms)) {
    const hasMeta = !!(room && room.meta);
    const t = stampOf(room);
    if (!hasMeta) { ghost.push(code); bytes += size(room); continue; }
    if (t === null) { unknown.push(code); continue; } // has meta, unreadable stamp: leave alone
    if (t > now + FUTURE_TOLERANCE_MS) { corrupt.push(code); bytes += size(room); continue; }
    if (now - t > IDLE_MS) { idle.push(code); bytes += size(room); }
    else fresh.push(code);
  }
  return { tree, total: Object.keys(rooms).length, idle, fresh, corrupt, ghost, unknown, bytes };
}

function purge(tree, codes) {
  const tmp = join(tmpdir(), `purge-${tree}-${Date.now()}.json`);
  let done = 0;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const payload = {};
    for (const c of slice) payload[c] = null;
    writeFileSync(tmp, JSON.stringify(payload));
    try {
      fb(['database:update', `/${tree}`, tmp, '--force']);
      done += slice.length;
      process.stdout.write(`   deleted ${done}/${codes.length}\r`);
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  }
  process.stdout.write('\n');
  return done;
}

const now = Date.now();
console.log(`Cutoff: rooms idle more than ${IDLE_MIN} min`);
console.log(DELETE ? 'Mode:   DELETE\n' : 'Mode:   dry run, nothing will be deleted\n');

const reports = TREES.map(t => classify(t, readTree(t), now));

const doomed = (r) => [...r.idle, ...r.ghost, ...r.corrupt];

let totDel = 0, totBytes = 0, totFresh = 0, totUnknown = 0;
for (const r of reports) {
  console.log(`${r.tree}`);
  console.log(`   total            ${r.total}`);
  console.log(`   keep (active)    ${r.fresh.length}`);
  console.log(`   DELETE idle      ${r.idle.length}`);
  if (r.ghost.length)   console.log(`   DELETE ghost     ${r.ghost.length}  (players, no meta)`);
  if (r.corrupt.length) console.log(`   DELETE corrupt   ${r.corrupt.length}  ${r.corrupt.slice(0, 6).join(', ')}`);
  if (r.unknown.length) console.log(`   keep (unreadable stamp) ${r.unknown.length}`);
  console.log('');
  totDel += doomed(r).length; totBytes += r.bytes;
  totFresh += r.fresh.length; totUnknown += r.unknown.length;
}

console.log(`TOTAL to delete: ${totDel} rooms, about ${Math.round(totBytes / 1024)} KB`);
console.log(`TOTAL to keep:   ${totFresh} active${totUnknown ? `, ${totUnknown} with an unreadable stamp` : ''}`);

if (!DELETE) {
  console.log('\nDry run. Re-run with --delete to apply.');
  process.exit(0);
}

console.log('');
let removed = 0;
for (const r of reports) {
  const codes = doomed(r);
  if (!codes.length) continue;
  console.log(`${r.tree}: deleting ${codes.length}`);
  removed += purge(r.tree, codes);
}
console.log(`\nDone. Removed ${removed} rooms.`);
