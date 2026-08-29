// Tests for the dance song catalogue: the ids, and the pools behind them.
//
//   node --test scripts/
//
// None of this touches the network. What it checks is the structure that
// check-songs.mjs then validates against Apple, and the reason it exists is
// #163: the pool audit reported ten categories while the game shipped eleven,
// exited zero, and was used to gate releases. Nothing said what the count
// should be, so nothing disagreed.
//
// app.js already cross-checks ids against pools at load time, but a
// console.error in one player's browser is not a gate. This is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SONG_CATALOGUE_LANGS,
  songCategoryGroups,
  songCategoryIds,
  songCategoryGroupKeys,
  defaultSongCategory,
  ALL_SONG_CATEGORY_IDS,
} from '../www/dance/categories.js';
import { readCategories, mismatchReason } from './song-pools.mjs';

const POOLS = readCategories();

// --- ids -----------------------------------------------------------

test('no language lists the same category twice', () => {
  // ALL_SONG_CATEGORY_IDS is a Set, so a duplicate cannot show up there. It
  // shows up in the picker, as one row printed twice.
  for (const lang of SONG_CATALOGUE_LANGS) {
    const seen = new Set();
    for (const id of songCategoryIds(lang)) {
      assert.ok(!seen.has(id), `${lang} offers ${id} more than once`);
      seen.add(id);
    }
  }
});

test('every language offers the category it defaults to', () => {
  // A default outside the language's own list is a room playing a category
  // its host's picker shows no row for, so nothing looks selected and there
  // is no way back to it once they choose something else (#165).
  for (const lang of SONG_CATALOGUE_LANGS) {
    assert.ok(songCategoryIds(lang).includes(defaultSongCategory(lang)),
      `${lang} defaults to ${defaultSongCategory(lang)}, which it does not offer`);
  }
});

test('an unknown language falls back to English rather than to nothing', () => {
  // A picker with no rows in it cannot start a game. #138 can land a player
  // on a page whose language this table has no list for.
  assert.deepEqual(songCategoryIds('fr'), songCategoryIds('en'));
  assert.equal(defaultSongCategory(''), defaultSongCategory('en'));
  // Region tags are the same language: 'es-ES' is not a third catalogue.
  assert.deepEqual(songCategoryIds('es-ES'), songCategoryIds('es'));
});

test('ALL_SONG_CATEGORY_IDS is exactly what the languages offer between them', () => {
  // Both directions, because each is a different silent failure: an id here
  // that nobody offers is a dead pool, and an offered id missing from here is
  // a pool the validator never sees.
  const offered = new Set(SONG_CATALOGUE_LANGS.flatMap((lang) => songCategoryIds(lang)));
  for (const id of ALL_SONG_CATEGORY_IDS) {
    assert.ok(offered.has(id), `${id} is declared but no language offers it`);
  }
  for (const id of offered) {
    assert.ok(ALL_SONG_CATEGORY_IDS.includes(id), `${id} is offered but not declared`);
  }
});

test('no song category id carries a character Firebase rejects in a key', () => {
  // The same rule the word categories are held to. An id is an analytics
  // counter key and a played-ledger key, so a rejected character is a write
  // that silently fails rather than an error anyone sees.
  for (const id of ALL_SONG_CATEGORY_IDS) {
    assert.doesNotMatch(id, /[.#$[\]/]/, `${id} cannot be a Firebase key`);
  }
});

test('every group declares a label KEY, never a label', () => {
  // A string here would be an English label baked into a structure the
  // Spanish picker reads. The build checks these keys exist per locale.
  for (const lang of SONG_CATALOGUE_LANGS) {
    for (const g of songCategoryGroups(lang)) {
      assert.match(g.labelKey, /^cat\.group\.[a-z]+$/, `${g.labelKey} is not a key`);
      assert.ok(Array.isArray(g.ids) && g.ids.length, `${g.labelKey} has no ids`);
    }
  }
});

test('the heading keys the build checks are the ones the picker renders', () => {
  // These two read the same groups from the same table; the test is that they
  // keep reading the SAME table, since a build gate against a stale list is a
  // gate that passes a picker with a missing heading.
  for (const lang of SONG_CATALOGUE_LANGS) {
    assert.deepEqual(songCategoryGroupKeys(lang),
      songCategoryGroups(lang).map((g) => g.labelKey));
  }
});

// --- ids vs pools --------------------------------------------------

test('every declared category has a song pool', () => {
  // A declared id with no pool is a picker row that deals nothing.
  for (const id of ALL_SONG_CATEGORY_IDS) {
    assert.ok(POOLS[id], `${id} has no entry in the CATEGORIES literal`);
    assert.ok(POOLS[id].length > 0, `${id} has an empty song pool`);
  }
});

test('every song pool is declared', () => {
  // The #163 direction: a pool nothing declares is a pool the validator never
  // sees, so it rots without anyone being told.
  for (const id of Object.keys(POOLS)) {
    assert.ok(ALL_SONG_CATEGORY_IDS.includes(id),
      `${id} is a pool that www/dance/categories.js does not declare`);
  }
});

test('no pool is small enough to repeat itself in one sitting', () => {
  // A round burns two songs and the played ledger blocks repeats until the
  // pool is exhausted. Below about 30 a long session runs out and starts
  // recycling, which reads as the game being broken (#164 sets this floor).
  for (const id of ALL_SONG_CATEGORY_IDS) {
    assert.ok(POOLS[id].length >= 30, `${id} has only ${POOLS[id].length} songs`);
  }
});

test('no pool lists the same query twice', () => {
  // A duplicate is a song that can be dealt to both sides of the same round.
  // pickPair compares urls and titles so it would not actually deal a pair of
  // identical tracks, but it would burn attempts doing it.
  for (const id of ALL_SONG_CATEGORY_IDS) {
    const seen = new Set();
    for (const q of POOLS[id]) {
      assert.ok(!seen.has(q), `${id} lists "${q}" twice`);
      seen.add(q);
    }
  }
});

// There is deliberately no test here for over-qualified queries, the #172
// shape where a film name after the artist narrows a search to one master
// with no fallback. The obvious proxy is word count, and it does not work:
// "Should I Stay or Should I Go The Clash" is nine words and perfectly
// healthy, while "Jimikki Kammal Velipadinte Pusthakam" is four and brittle.
// A test that fires on correct data gets loosened until it means nothing.
// Brittleness is a property of what Apple returns, so check-songs.mjs against
// the live API is the only thing that can see it.

// --- does the result match the query? (#164) ------------------------
//
// mismatchReason is a heuristic over two free-text fields, so it is worth
// pinning to the real cases that produced it. Every "wrong" case below is an
// actual iTunes result from the first US run of the Spanish pools, and every
// "right" case is one the heuristic must not flag, because a check that cries
// wolf on good data gets switched off.

const wrong = (query, title, artist) => {
  const why = mismatchReason(query, { title, artist });
  assert.ok(why, `${query} -> ${title} / ${artist} should have been caught`);
  return why;
};
const right = (query, title, artist) => {
  const why = mismatchReason(query, { title, artist });
  assert.equal(why, null, `${query} -> ${title} / ${artist} was flagged: ${why}`);
};

test('a track missing from the storefront comes back as another song by the same artist', () => {
  // The failure this whole check exists for. Safaera is not in the US store,
  // so the search returns five playable Bad Bunny songs and none is Safaera.
  wrong('Safaera Bad Bunny', 'Después de la Playa', 'Bad Bunny');
  wrong('Callaita Bad Bunny Tainy', 'Si Veo a Tu Mamá', 'Bad Bunny');
  wrong('Bichota Karol G', 'GATÚBELA', 'KAROL G & Maldy');
  wrong('Normal Feid', 'DESQUITE', 'Feid');
});

test('a cover, a soundalike and a bootleg all carry the right title', () => {
  // Only the artist credit separates these from the real record.
  wrong('Todo de Ti Rauw Alejandro', 'Todo de Ti', 'KIDZ BOP Kids');
  wrong('Pepas Farruko', 'Pepas (Original Radio Version)', 'Farru Co');
  wrong('Cuatro Babys Maluma', 'Cuatro Babys (Acoustic Version)', 'Trap Acústico');
  wrong('Gata Only FloyyMenor Cris Mj', 'GATA ONLY (ITALIAN REMIX)', 'CRI SCARCIA');
});

test('a common first word is not enough on its own', () => {
  // "Me Porto Bonito ..." matched "Me Fui de Vacaciones" on "me", and then
  // matched the artist on "bad". Three of seven words is not the song. Once
  // articles stopped counting, the leading-word test caught it first, which is
  // the better place: the reason is about the title rather than a ratio.
  const why = wrong('Me Porto Bonito Bad Bunny Chencho Corleone', 'Me Fui de Vacaciones', 'Bad Bunny');
  assert.match(why, /no "porto"/);
});

test('an article carries no evidence, in either language', () => {
  // "Dile a El Rauw Alejandro" came back as a different song by a different
  // artist and passed on "el" appearing in "El Chaval de la Bachata".
  wrong('Dile a El Rauw Alejandro', 'Dile A Él', 'El Chaval de la Bachata');
  // But an article inside a real title is still part of that title, and an
  // artist genuinely named after one still matches.
  right('La Bamba Los Lobos', 'La Bamba', 'Los Lobos');
  right('Macarena Los Del Rio', 'Macarena', 'Los Del Rio');
  right('A Dios le Pido Juanes', 'A Dios le Pido', 'Juanes');
});

test('somebody else covering the song is not the song', () => {
  wrong('La Jeepeta Nio Garcia Anuel AA',
    'La Jeepeta (feat. Anuel AA, Nio Garcia & Myke Towers) [Mashup]', 'MattOfficiel');
  // A remix is not a cover: Dakiti (Remix) is the record people know. Nor is
  // an artist's own sped-up edit, which is how Cupid went viral in the first
  // place, and which Spain returns as the primary result.
  right('Dakiti Bad Bunny Jhay Cortez', 'Dakiti (Remix) [Mixed]', 'JHAYCO & Bad Bunny');
  right('Cupid Twin Version FIFTY FIFTY',
    'Cupid - Twin Ver. (FIFTY FIFTY) [Sped Up Version]', 'FIFTY FIFTY');
});

test('a featured artist missing from the credit is not a mismatch', () => {
  // The reason the artist test asks for one word and not all of them.
  right('La Bebe Yng Lvcas Peso Pluma', 'La Bebe', 'Yng Lvcas');
  right('Calm Down Rema Selena Gomez', 'Calm Down', 'Rema');
  right('Dakiti Bad Bunny Jhay Cortez', 'Dakiti (Remix) [Mixed]', 'JHAYCO & Bad Bunny');
});

test('a one-word title does not fail on the artist that follows it', () => {
  // An earlier version required the first TWO query words in the track name,
  // which flagged every single-word title in the catalogue.
  right('Provenza Karol G', 'PROVENZA', 'KAROL G');
  right('Espresso Sabrina Carpenter', 'Espresso', 'Sabrina Carpenter');
});

test('punctuation inside a title does not read as a different song', () => {
  // Apostrophes are deleted rather than spaced, and a title is additionally
  // matched against its squashed form, which is what "Y.M.C.A." needs.
  right('YMCA Village People', 'Y.M.C.A.', 'Village People');
  right('Hips Dont Lie Shakira', "Hips Don't Lie (feat. Wyclef Jean)", 'Shakira');
  right('Dont Stop Me Now Queen', "Don't Stop Me Now", 'Queen');
  right('Sweet Child O Mine Guns N Roses', "Sweet Child O' Mine", "Guns N' Roses");
  right('Boys a liar Pt 2 PinkPantheress Ice Spice', "Boy's a liar Pt. 2 (Mixed)", 'PinkPantheress & Ice Spice');
});

test('an artist credit is matched on whole words, never on a substring', () => {
  // "cris" is inside "CRI SCARCIA" once both are squashed, and that single
  // coincidence would have waved through a bootleg remix of Gata Only.
  wrong('Gata Only FloyyMenor Cris Mj', 'GATA ONLY (ITALIAN REMIX)', 'CRI SCARCIA');
  right('Gata Only FloyyMenor Cris Mj', 'Gata Only', 'FloyyMenor & Cris Mj');
});

test('a featured artist named in the title counts as the artist', () => {
  // Spain returns Danza Kuduro credited to Lucenzo alone, with Don Omar in
  // the title. It is the right record, and it was the heuristic's only false
  // positive across 342 rows before the bracketed part of the title counted.
  right('Danza Kuduro Don Omar', 'Danza Kuduro (feat. Don Omar)', 'Lucenzo');
  // The loosening is narrow: a bracket that names something other than the
  // artist still does not rescue a cover.
  wrong('Pepas Farruko', 'Pepas (Original Radio Version)', 'Farru Co');
  wrong('Cuatro Babys Maluma', 'Cuatro Babys (Acoustic Version)', 'Trap Acústico');
});

test('nothing to compare against is not a mismatch', () => {
  // A query with no playable result at all is BROKEN, which is a different
  // finding and is reported separately.
  assert.equal(mismatchReason('Whatever Someone', null), null);
});
