// Validate the dance song pool against the iTunes Search API.
//
//   node scripts/check-songs.mjs
//   node scripts/check-songs.mjs --category=Malayalam
//   node scripts/check-songs.mjs --country=IN --json=/tmp/report.json
//
// This makes the same call fetchPreview makes (entity=song, limit=5) and picks
// the first result carrying a previewUrl, so what it reports is what a player
// would actually hear.
//
// It checks two things, and the second is the one that caught us out.
//
//   BROKEN  - no result has a previewUrl. The round skips this song entirely.
//   BRITTLE - exactly one result has a previewUrl. It plays fine today, but
//             there is no fallback: the moment Apple drops that single preview
//             the query misses. "Jada Sushin Shyam" was the only entry in the
//             pool shaped like this, and it was the only entry that ever
//             appeared in analytics/music/errors/songMiss (6 misses against 58
//             successful plays, roughly a 10% flake rate). Everything else
//             returns 2 to 5 candidates and absorbs a bad preview silently.
//
// Apple sends the US storefront when no country is given, which is what the app
// relies on, so US is the default here too. --country exists to check whether a
// query is holding up elsewhere, not to describe what players get today.
//
// Exits non-zero if anything is BROKEN, so this can gate a release.

import { readFileSync, writeFileSync } from 'node:fs';
import { SONG_CATEGORY_IDS } from '../www/dance/categories.js';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v = 'true'] = a.slice(2).split('='); return [k, v]; })
);
const COUNTRY = args.country || 'US';
const ONLY = args.category || null;
const DELAY_MS = Number(args.delay || 1500); // Apple throttles around 20 calls/min
const SRC = new URL('../www/dance/app.js', import.meta.url);

// app.js is a browser module that touches the DOM as it loads, so it cannot be
// imported here. Parsing the literal keeps this script honest about reading the
// same list the game ships.
//
// THE IDS ARE NOT PARSED. They are imported from www/dance/categories.js, the
// same module app.js and the build read, and the parse is then checked against
// them. This is the fix for #163, and the bug it closes is worth stating.
//
// The header regex below used to be single-quote-only, while the item regex
// directly under it had already been widened to both styles, with a comment
// explaining exactly this trap. "Today's Pop" is double-quoted, because the
// label carries an apostrophe. It never matched a header, `cur` stayed null,
// and its whole list was dropped on the floor. This script reported 10
// categories while the game shipped 11, exited zero, and was used to gate
// releases. The unchecked one was the chart pool, which rots fastest, and it
// has 500 rounds behind it in analytics.
//
// A count alone would not have caught it either, since nothing said what the
// count should be. Comparing against the module does, in both directions.
function readCategories() {
  const lines = readFileSync(SRC, 'utf8').split('\n');
  const start = lines.findIndex(l => /const CATEGORIES\s*=/.test(l));
  if (start < 0) throw new Error('CATEGORIES not found in www/dance/app.js');
  const out = {};
  let cur = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '};') break;
    // Both quote styles, matching the item regex below. A label containing an
    // apostrophe has to be double-quoted, so single-quote-only silently skips
    // exactly the categories whose names read most like English.
    const head = line.match(/^\s*'([^']+)':\s*\[/) || line.match(/^\s*"([^"]+)":\s*\[/);
    if (head) { cur = head[1]; out[cur] = []; continue; }
    if (line.trim().startsWith(']')) { cur = null; continue; }
    // Only whole-line entries count. Comments in this block contain
    // apostrophes, and a looser match reads straight through them.
    // Both quote styles, because six entries are double-quoted precisely
    // because the title carries an apostrophe ("Livin' on a Prayer Bon Jovi").
    // Matching only single quotes silently drops them from the audit.
    const item = cur && (line.match(/^\s*'(.+)',\s*$/) || line.match(/^\s*"(.+)",\s*$/));
    if (item) out[cur].push(item[1]);
  }

  // The parse has to account for every category the game offers, and offer no
  // category the game does not. Either direction is a silent hole: one hides a
  // pool from the audit, the other audits a pool nobody can reach.
  const parsed = Object.keys(out);
  const missed = SONG_CATEGORY_IDS.filter(id => !parsed.includes(id));
  const extra = parsed.filter(id => !SONG_CATEGORY_IDS.includes(id));
  const empty = parsed.filter(id => out[id].length === 0);
  if (missed.length || extra.length || empty.length) {
    const say = [];
    if (missed.length) say.push(`  offered but not parsed: ${missed.join(', ')}`);
    if (extra.length) say.push(`  parsed but not offered: ${extra.join(', ')}`);
    if (empty.length) say.push(`  parsed with no songs:   ${empty.join(', ')}`);
    throw new Error(
      'check-songs cannot see the whole pool, so its "all clear" would be a lie.\n'
      + say.join('\n')
      + '\n  (SONG_CATEGORY_IDS is www/dance/categories.js; the songs are the '
      + 'CATEGORIES literal in www/dance/app.js)');
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function lookup(query) {
  const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(query)
    + '&entity=song&limit=5&country=' + COUNTRY;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const playable = (data.results || []).filter(r => r && r.previewUrl);
      return {
        total: (data.results || []).length,
        candidates: playable.length,
        chosen: playable[0] ? { title: playable[0].trackName, artist: playable[0].artistName } : null,
      };
    } catch (e) {
      if (attempt === 3) return { error: String(e.message || e) };
      await sleep(2000 * (attempt + 1)); // back off: a 403 here means throttled
    }
  }
}

const categories = readCategories();
const names = ONLY ? [ONLY] : Object.keys(categories);
for (const n of names) {
  if (!categories[n]) { console.error(`no such category: ${n}`); process.exit(2); }
}
const total = names.reduce((n, c) => n + categories[c].length, 0);

console.log(`Checking ${total} queries in ${names.length} categor${names.length === 1 ? 'y' : 'ies'} against the ${COUNTRY} storefront`);
console.log(`(about ${Math.ceil(total * DELAY_MS / 60000)} min at ${DELAY_MS}ms between calls)\n`);

const broken = [], brittle = [], errored = [], all = [];
let done = 0;

for (const cat of names) {
  for (const query of categories[cat]) {
    const r = await lookup(query);
    const row = { cat, query, ...r };
    all.push(row);
    if (r.error) errored.push(row);
    else if (r.candidates === 0) broken.push(row);
    else if (r.candidates === 1) brittle.push(row);
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${total}...`);
    await sleep(DELAY_MS);
  }
}

const report = (label, rows) => {
  console.log(`\n--- ${label} (${rows.length}) ---`);
  if (!rows.length) { console.log('  none'); return; }
  for (const r of rows) {
    const got = r.chosen ? `${r.chosen.title} / ${r.chosen.artist}` : (r.error || 'no playable result');
    console.log(`  [${r.cat}] ${r.query}\n      ${got}`);
  }
};

console.log(`\nchecked ${all.length} | ok ${all.length - broken.length - brittle.length - errored.length}`
  + ` | brittle ${brittle.length} | broken ${broken.length} | errors ${errored.length}`);
report('BROKEN: no playable result, the round skips these', broken);
report('BRITTLE: exactly one playable result, no fallback', brittle);
report('ERRORED: could not be checked', errored);

if (args.json) {
  writeFileSync(args.json, JSON.stringify(all, null, 1));
  console.log(`\nfull report written to ${args.json}`);
}

process.exit(broken.length ? 1 : 0);
