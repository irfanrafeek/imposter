// Validate the dance song pool against the iTunes Search API.
//
//   node scripts/check-songs.mjs
//   node scripts/check-songs.mjs --category=Malayalam
//   node scripts/check-songs.mjs --category='Spanish Hits,Global Hits' --country=MX
//   node scripts/check-songs.mjs --category='Global Hits' --strict
//   node scripts/check-songs.mjs --country=IN --json=/tmp/report.json
//
// This makes the same call fetchPreview makes (entity=song, limit=5) and picks
// the first result carrying a previewUrl, so what it reports is what a player
// would actually hear.
//
// It checks three things, and the third is the one that matters most.
//
//   BROKEN   - no result has a previewUrl. The round skips this song entirely.
//   MISMATCH - there are playable results, but the first one is not the song
//              the query asked for. This is the failure the other two checks
//              are blind to, and it is the WORST of the three for a player: a
//              skipped song is invisible, whereas a wrong song makes the round
//              nonsense. The iTunes Search API always returns something for a
//              plausible query, so a track that is not in the storefront comes
//              back as a different track by the same artist, or as a bootleg
//              remix, or as a KIDZ BOP cover, with a playable preview and a
//              clean bill of health. "Safaera Bad Bunny" returns five playable
//              Bad Bunny songs and not one of them is Safaera (#164).
//   BRITTLE  - exactly one result has a previewUrl. It plays fine today, but
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
// Exits non-zero if anything is BROKEN. Pass --strict to fail on MISMATCH and
// BRITTLE too, which is what a NEW pool should be held to: both are judgement
// calls on an existing pool and hard failures on one nobody has played yet.
//
// MISMATCH is a heuristic and it can be wrong, so it prints what it saw and
// expects an eyeball. It compares the query against the chosen track's name
// and artist, which is a comparison and not a proof: the query has no marker
// saying where the title stops and the artist starts.

import { writeFileSync } from 'node:fs';
import { readCategories, mismatchReason } from './song-pools.mjs';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v = 'true'] = a.slice(2).split('='); return [k, v]; })
);
const COUNTRY = args.country || 'US';
// Comma-separated, so the four Spanish pools can be checked in three
// storefronts without re-running the whole catalogue nine times over.
const ONLY = args.category ? args.category.split(',').map(c => c.trim()).filter(Boolean) : null;
const DELAY_MS = Number(args.delay || 1500); // Apple throttles around 20 calls/min
const STRICT = !!args.strict;
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
const names = ONLY || Object.keys(categories);
for (const n of names) {
  if (!categories[n]) { console.error(`no such category: ${n}`); process.exit(2); }
}
const total = names.reduce((n, c) => n + categories[c].length, 0);

console.log(`Checking ${total} queries in ${names.length} categor${names.length === 1 ? 'y' : 'ies'} against the ${COUNTRY} storefront`);
console.log(`(about ${Math.ceil(total * DELAY_MS / 60000)} min at ${DELAY_MS}ms between calls)\n`);

const broken = [], brittle = [], mismatched = [], errored = [], all = [];
let done = 0;

for (const cat of names) {
  for (const query of categories[cat]) {
    const r = await lookup(query);
    const row = { cat, query, ...r };
    all.push(row);
    if (r.error) errored.push(row);
    else if (r.candidates === 0) broken.push(row);
    else {
      // Checked before brittleness, because a wrong song with five fallbacks
      // is a worse round than the right song with one.
      row.why = mismatchReason(query, r.chosen);
      if (row.why) mismatched.push(row);
      else if (r.candidates === 1) brittle.push(row);
    }
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
    console.log(`  [${r.cat}] ${r.query}\n      ${got}${r.why ? `\n      (${r.why})` : ''}`);
  }
};

const bad = broken.length + brittle.length + mismatched.length + errored.length;
console.log(`\nchecked ${all.length} | ok ${all.length - bad}`
  + ` | mismatch ${mismatched.length} | brittle ${brittle.length}`
  + ` | broken ${broken.length} | errors ${errored.length}`);
report('BROKEN: no playable result, the round skips these', broken);
report('MISMATCH: plays, but this is not the song asked for (check each one)', mismatched);
report('BRITTLE: exactly one playable result, no fallback', brittle);
report('ERRORED: could not be checked', errored);

if (args.json) {
  writeFileSync(args.json, JSON.stringify(all, null, 1));
  console.log(`\nfull report written to ${args.json}`);
}

// --strict is for a pool nobody has played yet, where every one of these is a
// defect rather than a trade-off already living in production.
process.exit((broken.length || (STRICT && (mismatched.length || brittle.length))) ? 1 : 0);
