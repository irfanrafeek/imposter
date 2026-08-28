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

// Spanish is empty until #137. Until then a Spanish page has to deal English
// words, because the alternative is a round where the secret word is blank.
test('an empty catalogue falls back to English instead of dealing nothing', async () => {
  const es = await loadCatalog('es');
  assert.equal(es.requested, 'es');
  assert.ok(es.categories['Food'].length > 0, 'must have words to deal');
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

test('every catalogue entry has a word and two distinct hints', async () => {
  for (const lang of CATALOGUE_LANGS) {
    const mod = await import(`../www/shared/words/${lang}.js`);
    for (const [cat, list] of Object.entries(mod.WORD_CATEGORIES)) {
      for (const e of list) {
        assert.ok(e.w && e.h && e.h2, `${lang} ${cat}: incomplete entry ${JSON.stringify(e)}`);
        assert.notEqual(norm(e.h), norm(e.h2), `${lang} ${cat} / ${e.w}: both hints are the same`);
      }
    }
  }
});

test('pickHint never returns undefined, whatever it is handed', () => {
  assert.equal(pickHint(null), '');
  assert.equal(pickHint(undefined), '');
  assert.equal(pickHint({ w: 'X' }), '');
  assert.equal(pickHint({ w: 'X', h: 'Only' }), 'Only');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickHint({ w: 'X', h: 'A', h2: 'B' }));
  assert.deepEqual([...seen].sort(), ['A', 'B']);
});
