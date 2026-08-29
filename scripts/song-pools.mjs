import { readFileSync } from 'node:fs';
import { ALL_SONG_CATEGORY_IDS } from '../www/dance/categories.js';

// ============================================================
// THE OFFLINE HALF OF THE SONG TOOLING
// ============================================================
// Reading the pools out of app.js, and judging whether a result is the song a
// query asked for. Neither touches the network, which is why they live here
// and not in check-songs.mjs: both need testing, and check-songs.mjs cannot be
// imported because it starts hitting the iTunes API at module scope.
//
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
export function readCategories() {
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

  // The parse has to account for every category categories.js declares, and
  // turn up none it does not. Either direction is a silent hole: one hides a
  // pool from the audit, the other audits a pool nothing can reach.
  const parsed = Object.keys(out);
  const missed = ALL_SONG_CATEGORY_IDS.filter(id => !parsed.includes(id));
  const extra = parsed.filter(id => !ALL_SONG_CATEGORY_IDS.includes(id));
  const empty = parsed.filter(id => out[id].length === 0);
  if (missed.length || extra.length || empty.length) {
    const say = [];
    if (missed.length) say.push(`  declared but not parsed: ${missed.join(', ')}`);
    if (extra.length) say.push(`  parsed but not declared: ${extra.join(', ')}`);
    if (empty.length) say.push(`  parsed with no songs:    ${empty.join(', ')}`);
    throw new Error(
      'check-songs cannot see the whole pool, so its "all clear" would be a lie.\n'
      + say.join('\n')
      + '\n  (ALL_SONG_CATEGORY_IDS is www/dance/categories.js; the songs are the '
      + 'CATEGORIES literal in www/dance/app.js)');
  }
  return out;
}

// ============================================================
// IS THIS THE SONG THE QUERY ASKED FOR?
// ============================================================
// Two foldings, because neither alone is enough. Tokens catch ordinary word
// matches; the squashed string catches punctuation that splits a word
// ("Y.M.C.A." tokenises to y/m/c/a but squashes to ymca). Apostrophes are
// DELETED rather than spaced, so "Don't" reduces to "dont" and matches a query
// written without one, which is how every entry in these pools is written.
const fold = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/['\u2019]/g, '');
const words = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const squash = (s) => fold(s).replace(/[^a-z0-9]/g, '');

// Articles and prepositions match by accident, and Spanish is full of them.
// "Dile a El Rauw Alejandro" came back as "Dile A El" by El Chaval de la
// Bachata, a different song by a different artist, and passed on the word
// "el" appearing in that artist's name. Words this common carry no evidence,
// so they are excluded from the artist test and from the overlap count. They
// still count inside a track name, where "La Bamba" really is the title.
const STOP = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'me',
  'mi', 'para', 'por', 'que', 'se', 'su', 'te', 'tu', 'un', 'una', 'y',
  'and', 'for', 'in', 'is', 'it', 'my', 'of', 'on', 'the', 'to', 'with',
]);
const content = (list) => { const c = list.filter((w) => !STOP.has(w)); return c.length ? c : list; };

// Substring matching is allowed against a TITLE and not against an ARTIST.
// A title is where punctuation splits a word apart; an artist credit is where
// a substring match invents a hit that is not there. "Cris MJ" appears to be
// inside "CRI SCARCIA" if you squash both, and that one coincidence would have
// waved through a bootleg remix of Gata Only.
const inTitle = (w, title) => new Set(words(title)).has(w) || squash(title).includes(w);
const inCredit = (w, artist) => new Set(words(artist)).has(w);

// A featured artist is sometimes in the credit and sometimes only in the
// title's parenthetical: Spain returns Danza Kuduro as "Danza Kuduro (feat.
// Don Omar)" credited to Lucenzo alone, which is the right record and was the
// heuristic's one false positive across 342 checked rows.
//
// So a bracket counts toward the artist test, but ONLY a bracket that opens
// like a feature credit. The first version of this counted any bracket, and
// "Callaita (Made Popular By Bad Bunny & Tainy) [Instrumental Version]" by
// Party Tyme Karaoke sailed through it: naming the original artist is exactly
// what a karaoke track does.
// "From" belongs here alongside the feature words because the Indian pools are
// written Title + FILM NAME rather than Title + Artist, and iTunes puts the
// film in the track name: "Naatu Naatu (From \"RRR\")" credited to its singers.
// Without this, all five Indian pools report as mismatched, which is 181 of
// the 185 the first full English audit produced (#164).
const FEATURE = /^[([]\s*(feat|ft|featuring|with|con|w\/|from)\b/i;
const credits = (title) => (String(title || '').match(/[([][^)\]]*[)\]]/g) || [])
  .filter((b) => FEATURE.test(b)).join(' ');
const inArtist = (w, chosen) => inCredit(w, chosen.artist) || inCredit(w, credits(chosen.title));

// A cover, a karaoke backing track and a tribute band all carry the right
// title, a playable preview, and frequently the original artist's name spelled
// out somewhere in the metadata. They are never the record the pool means.
// Two things are deliberately NOT here.
//
// "Remix", because Dakiti (Remix) is the record people know.
//
// "Sped up" and "slowed", because artists release those themselves now: Spain
// returns Cupid as FIFTY FIFTY's own sped-up version, which is the one that
// went viral and is the right record for a TikTok pool. Bootleg edits are
// caught by the artist test instead, where "Slawd & Vallvete" is plainly not
// FloyyMenor, and that test does not need a guess about the arrangement.
//
// What is left is somebody else's recording of the same song, which names the
// original artist in full and therefore passes every other test here. That is
// how "La Jeepeta (feat. Anuel AA, Nio Garcia & Myke Towers) [Mashup]" by
// MattOfficiel got through.
const IMPOSTOR = new RegExp('\\b(' + [
  'karaoke', 'tribute', 'instrumental', 'made popular by', 'originally performed',
  'as made famous', 'in the style of', 'cover version', 'mashup', 'medley',
  'acoustic version', 'piano version', 'workout', 'backing track',
].join('|') + ')\\b', 'i');

// Is the chosen track plausibly the song the query asked for?
//
// The query is "Title Artist" with no separator saying where one ends, so this
// cannot be exact. Four tests, each earning its place against a real failure
// seen in the #164 run:
//
//   1. The FIRST query word is in the track name. These pools are written
//      title-first, so this is the cheapest strong signal. It is what catches
//      "Safaera Bad Bunny" coming back as "Despues de la Playa": Safaera is
//      not in the US storefront at all, so Apple returns five other Bad Bunny
//      songs, every one of them playable.
//
//      Only the first word, not the first two. A one-word title makes the
//      second word part of the artist, and "Provenza Karol G" would fail on
//      "karol" not being in the track name.
//
//   2. The result is not openly a karaoke track, a tribute or a cover. These
//      carry the right title AND usually name the original artist in their
//      metadata, so they pass every other test here.
//
//   3. SOME query word is in the artist credit. Nothing else separates the
//      real record from a soundalike ("Pepas" by "Farru Co"), a children's
//      cover ("Todo de Ti" by KIDZ BOP Kids) or a slowed-and-reverbed bootleg,
//      all of which carry the right title and a playable preview.
//
//   4. At least 60% of the query is accounted for between the two. Test 1 can
//      be satisfied by an accident on a common word: "Me Porto Bonito Bad
//      Bunny Chencho Corleone" matched "Me Fui de Vacaciones" on "me", and
//      then matched the artist on "bad". Three of seven words is not the song.
//
// A featured artist missing from the credit is NOT a mismatch: "La Bebe Yng
// Lvcas Peso Pluma" comes back credited to Yng Lvcas alone and is the right
// record, at 4 of 6 words. That is what sets the threshold where it is.
const MIN_OVERLAP = 0.6;

export function mismatchReason(query, chosen) {
  if (!chosen) return null;
  const q = words(query);
  if (!q.length) return null;
  const unique = content([...new Set(q)]);
  const seen = (w) => inTitle(w, chosen.title) || inArtist(w, chosen);

  // The first word that carries meaning, not simply the first word: a title
  // beginning "La ..." or "Me ..." would otherwise be tested on the article.
  // Skipping to "porto" is what catches "Me Porto Bonito ..." on this test
  // rather than leaving it to the overlap count below.
  const lead = content(q)[0];
  if (!inTitle(lead, chosen.title)) return `the track name has no "${lead}"`;
  const impostor = `${chosen.title} ${chosen.artist}`.match(IMPOSTOR);
  if (impostor) return `this is a ${impostor[0].toLowerCase()}, not the record`;
  if (!unique.some((w) => inArtist(w, chosen))) return 'nothing in the query is in the artist credit';
  const found = unique.filter(seen).length;
  if (found / unique.length < MIN_OVERLAP) {
    return `only ${found} of ${unique.length} meaningful query words appear in the result`;
  }
  return null;
}
