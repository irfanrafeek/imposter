// The word catalogues, and the text normalising the checker rests on.
//
// scripts/check-words.mjs is not in CI: it is a content check, run when the
// catalogue is edited. The invariants below are different. They are the ones
// that break a ROOM rather than a word list, so they belong in the suite that
// runs on every push.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, norm, tokens, stemsClash } from './words-lib.mjs';
import { CATALOGUE_LANGS, DEFAULT_LANG, catalogueLang, loadCatalog, pickHint } from '../www/shared/words/index.js';
import { WORD_CATEGORIES as EN } from '../www/shared/words/en.js';

// ------------------------------------------------------------
// Normalising
// ------------------------------------------------------------

test('an accent is stress on the same letter, so it folds away', () => {
  assert.equal(norm('Melón'), norm('Melon'));
  assert.equal(norm('Café'), norm('Cafe'));
  assert.equal(norm('José'), norm('Jose'));
});

// The reason the fold is not a plain NFD-and-strip. Getting this wrong does
// not crash: it reports a duplicate that is not one and blocks a real word.
test('the enye is its own letter and does NOT fold to n', () => {
  assert.notEqual(norm('año'), norm('ano'));
  assert.notEqual(norm('Piña'), norm('Pina'));
  assert.notEqual(norm('Caña'), norm('Cana'));
});

test('a precomposed and a decomposed enye are the same word', () => {
  assert.equal(norm('Piña'), norm('Piña'));
  assert.equal(norm('AÑO'), norm('año'));
});

test('the fold leaves English untouched, which is why it was safe to change', () => {
  for (const cat of Object.keys(EN)) {
    for (const e of EN[cat]) {
      assert.equal(fold(e.w), e.w.toLowerCase(), `${cat} / ${e.w}`);
    }
  }
});

test('tokens splits on punctuation but keeps the enye inside a word', () => {
  assert.deepEqual(tokens('Ice Cream'), ['ice', 'cream']);
  assert.deepEqual(tokens('Bite-sized'), ['bite', 'sized']);
  assert.deepEqual(tokens('Niño pequeño'), ['niño', 'pequeño']);
});

test('stemsClash catches a hint that is a stem of the word', () => {
  assert.ok(stemsClash('toast', 'toasted'));
  assert.ok(!stemsClash('pizza', 'cheesy'));
  // Under 4 characters it has to be an exact match, or half the catalogue
  // would collide on common short prefixes.
  assert.ok(!stemsClash('ice', 'iced'));
  assert.ok(stemsClash('ice', 'ice'));
});

// ------------------------------------------------------------
// Choosing a catalogue
// ------------------------------------------------------------

test('a regional tag resolves to its base catalogue', () => {
  assert.equal(catalogueLang('es-ES'), 'es');
  assert.equal(catalogueLang('en-GB'), 'en');
  assert.equal(catalogueLang('ES'), 'es');
});

test('a language with no catalogue falls back rather than dealing undefined', () => {
  assert.equal(catalogueLang('fr'), DEFAULT_LANG);
  assert.equal(catalogueLang(''), DEFAULT_LANG);
  assert.equal(catalogueLang(undefined), DEFAULT_LANG);
  assert.equal(catalogueLang(null), DEFAULT_LANG);
});

test('loadCatalog returns words for the language it was asked for', async () => {
  const en = await loadCatalog('en-GB');
  assert.equal(en.lang, 'en');
  assert.ok(en.categories['Food'].length > 0);
});

// #137 filled Food, so Spanish now serves Spanish. The empty-catalogue
// fallback in loadCatalog() is not dead code: it is what keeps the FIRST day
// of the next locale from dealing a blank word, and it stops firing for a
// locale the moment that locale has anything in it.
test('Spanish serves Spanish, not a fallback to English', async () => {
  const es = await loadCatalog('es');
  assert.equal(es.lang, 'es', 'must not have fallen back');
  assert.ok(es.categories['Food'].length > 0);
});

// The catalogue is meant to be written for a Spanish table, not translated
// word for word, so a heavy overlap with en.js means somebody copied it.
//
// One threshold does not fit, because the categories are not the same kind
// of thing. Measured against the real lists:
//
//   COMMON NOUNS run near zero. Food 3%, Animals 4%, Places 5%, Everyday
//   Objects 0%. The overlap that exists is real cognates: Chocolate, Pasta
//   and Churros are the same word in both languages, and refusing one to
//   satisfy a test would make the catalogue worse. A tenth is a wide margin
//   over that and nowhere near a translation.
//
//   PROPER NOUNS legitimately run high, because the correct Spanish entry is
//   whatever Spain actually calls it, and that is frequently the English
//   name. Movies & TV 16% (Friends, Breaking Bad, Shrek), Football 20%
//   (Messi, Guardiola), Super Heroes 40% (Batman, Thor, Loki). The ones
//   Spain DID rename are renamed here: Lobezno, Masacre, Mujer Maravilla,
//   Parque Jurásico, El Rey León. So the bar here only has to catch a
//   wholesale copy, which would sit near 100%.
const MAX_SHARED = {
  'Food': 0.1, 'Animals': 0.1, 'Places': 0.1, 'Everyday Objects': 0.1,
  'Movies & TV': 0.6, 'Football': 0.6, 'Super Heroes': 0.6,
};

test('the Spanish words are their own list, not a translation of the English one', async () => {
  const es = await loadCatalog('es');
  for (const [cat, list] of Object.entries(es.categories)) {
    if (!list.length) continue;
    const english = new Set((EN[cat] || []).map(e => e.w));
    const shared = list.filter(e => english.has(e.w));
    const limit = MAX_SHARED[cat];
    assert.ok(limit !== undefined, `no overlap limit set for ${cat}`);
    assert.ok(shared.length / list.length < limit,
      `${cat}: ${shared.length} of ${list.length} identical to English, over the ${limit * 100}% bar (${shared.map(e => e.w).join(', ')})`);
  }
});

// ------------------------------------------------------------
// The invariants that break a room, not a word list
// ------------------------------------------------------------

// A category id is the key into the catalogue, the value in meta.categories
// that every other client reads, the played-ledger key on the room and in
// localStorage, and the analytics counter key. A locale that renamed one
// would not show less, it would break joins. See #135.
test('every locale offers exactly the same category ids', async () => {
  const ids = Object.keys(EN);
  for (const lang of CATALOGUE_LANGS) {
    const mod = await import(`../www/shared/words/${lang}.js`);
    assert.deepEqual(Object.keys(mod.WORD_CATEGORIES), ids, `${lang} category ids`);
  }
});

test('every catalogue entry has a word and distinct hints', async () => {
  for (const lang of CATALOGUE_LANGS) {
    const mod = await import(`../www/shared/words/${lang}.js`);
    for (const [cat, list] of Object.entries(mod.WORD_CATEGORIES)) {
      for (const e of list) {
        assert.ok(e.w && e.h && e.h2, `${lang} ${cat}: incomplete entry ${JSON.stringify(e)}`);
        // h3 is the optional easy hint (#181). Absent is fine, since it
        // lands a category at a time; present and empty is a broken edit.
        const hints = ['h', 'h2', ...(e.h3 === undefined ? [] : ['h3'])];
        if (e.h3 !== undefined) {
          assert.ok(typeof e.h3 === 'string' && e.h3.trim(), `${lang} ${cat} / ${e.w}: h3 is present but empty`);
        }
        for (let i = 0; i < hints.length; i++) {
          for (let j = i + 1; j < hints.length; j++) {
            assert.notEqual(norm(e[hints[i]]), norm(e[hints[j]]),
              `${lang} ${cat} / ${e.w}: ${hints[i]} and ${hints[j]} are the same hint`);
          }
        }
      }
    }
  }
});

test('pickHint never returns undefined, whatever it is handed', () => {
  assert.equal(pickHint(null), '');
  assert.equal(pickHint(undefined), '');
  assert.equal(pickHint({ w: 'X' }), '');
  assert.equal(pickHint({ w: 'X', h: 'Only' }), 'Only');
  assert.equal(pickHint({ w: 'X', h3: 'Easy' }), 'Easy');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickHint({ w: 'X', h: 'A', h2: 'B' }));
  assert.deepEqual([...seen].sort(), ['A', 'B']);
});

// The pick is uniform over the hints that exist, and that IS the difficulty
// weighting (#181): three hints means the easy one comes up one round in
// three. Nothing else in the codebase sets that rate, so it is asserted
// here rather than left to the shape of pickHint.
test('an entry with an easy hint deals it one round in three', () => {
  const entry = { w: 'X', h: 'A', h2: 'B', h3: 'C' };
  const counts = { A: 0, B: 0, C: 0 };
  const draws = 30000;
  for (let i = 0; i < draws; i++) counts[pickHint(entry)]++;
  assert.deepEqual(Object.keys(counts).filter((k) => counts[k] === 0), [], 'a hint was never dealt');
  // Generous band: this is guarding against a weighting mistake, not
  // testing Math.random. A third is 10000; anything outside 9000-11000
  // means the pool is wrong, not that the run was unlucky.
  for (const k of ['A', 'B', 'C']) {
    assert.ok(Math.abs(counts[k] - draws / 3) < draws / 30,
      `${k} dealt ${counts[k]} times in ${draws}, expected about ${draws / 3}`);
  }
});
