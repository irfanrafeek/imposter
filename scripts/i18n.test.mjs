// Tests for the runtime string kit in www/shared/i18n.js.
//
//   node --test scripts/
//
// The kit is small, so the tests are mostly about the two things that
// go wrong quietly in a translated app: a string that interpolates
// nothing because a parameter was renamed, and a plural that picks the
// English form in a language with different rules. Both look fine in
// review and only surface to a player mid-round, in a language nobody
// on the team reads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createI18n } from '../www/shared/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const en = createI18n({
  greet: 'Hello {name}',
  two: '{a} then {b}',
  plain: 'No slots here',
  players: { one: 'Need {count} more player', other: 'Need {count} more players' },
}, 'en-GB');

// --- interpolation ----------------------------------------------

test('a slot is filled', () => {
  assert.equal(en.t('greet', { name: 'Ann' }), 'Hello Ann');
});

test('several slots are filled', () => {
  assert.equal(en.t('two', { a: 'this', b: 'that' }), 'this then that');
});

test('an unsupplied slot is left visible, not blanked', () => {
  // "Hello " reads like finished copy and would ship. "Hello {name}"
  // does not, which is the whole point.
  assert.equal(en.t('greet'), 'Hello {name}');
  assert.equal(en.t('greet', { nmae: 'Ann' }), 'Hello {name}');
});

test('a string with no slots is returned untouched', () => {
  assert.equal(en.t('plain', { name: 'Ann' }), 'No slots here');
});

test('a value that looks like a slot is not re-expanded', () => {
  // Otherwise a player named "{name}" would loop, and a player named
  // "{count}" would leak an unrelated number into the sentence.
  assert.equal(en.t('greet', { name: '{name}' }), 'Hello {name}');
  assert.equal(en.t('two', { a: '{b}', b: 'ok' }), '{b} then ok');
});

// --- plurals ------------------------------------------------------

test('English picks one vs other', () => {
  assert.equal(en.plural('players', 1), 'Need 1 more player');
  assert.equal(en.plural('players', 2), 'Need 2 more players');
  assert.equal(en.plural('players', 0), 'Need 0 more players');
});

test('count is available without being passed', () => {
  assert.match(en.plural('players', 7), /7/);
});

test('a language with different rules gets its own form', () => {
  // Not a tautology: the point is that the count-to-form mapping comes
  // from Intl and not from `n === 1`, so a language where 0 is singular
  // (French) does not inherit English's answer.
  const fr = createI18n({ p: { one: '{count} joueur', other: '{count} joueurs' } }, 'fr');
  assert.equal(fr.plural('p', 0), '0 joueur');
  assert.equal(en.plural('players', 0), 'Need 0 more players');
});

// --- lists --------------------------------------------------------

test('list joins the way the copy already reads', () => {
  assert.equal(en.list(['Ann']), 'Ann');
  assert.equal(en.list(['Ann', 'Bob']), 'Ann and Bob');
  assert.equal(en.list(['Ann', 'Bob', 'Cara']), 'Ann, Bob and Cara');
});

test('en-GB is what keeps the Oxford comma out', () => {
  // The site's copy is British. If the intl tag in site.json ever
  // drifts to a bare "en", this is the test that says so.
  const us = createI18n({}, 'en-US');
  assert.equal(us.list(['Ann', 'Bob', 'Cara']), 'Ann, Bob, and Cara');
});

test('Spanish gets its y/e alternation for free', () => {
  const es = createI18n({}, 'es-ES');
  assert.equal(es.list(['Ana', 'Bea', 'Iris']), 'Ana, Bea e Iris');
});

test('empty and single lists do not gain punctuation', () => {
  assert.equal(en.list([]), '');
  assert.equal(en.list([null, 'Ann', undefined]), 'Ann');
});

// --- misuse -------------------------------------------------------

test('a missing key returns the key rather than an empty string', () => {
  assert.equal(en.t('nope.not.here'), 'nope.not.here');
  assert.equal(en.plural('nope.not.here', 2), 'nope.not.here');
});

test('using t() on a plural, or plural() on a string, does not silently half-work', () => {
  assert.equal(en.t('players'), 'players');
  assert.equal(en.plural('greet', 2), 'greet');
});

test('a nonsense locale tag still deals cards', () => {
  const odd = createI18n({ p: { one: 'a', other: 'b' } }, 'not-a-locale-!!');
  assert.equal(typeof odd.plural('p', 1), 'string');
  assert.equal(typeof odd.list(['x', 'y']), 'string');
});

// --- the shipped tables -------------------------------------------

test('every en string interpolates with the parameters its callers pass', () => {
  // A key whose {slot} was renamed in the JSON but not in app.js is the
  // failure this catches: the build checks that keys EXIST, not that
  // their slots still match.
  const bundle = {
    ...readJson('src/content/en/shared.json').runtime,
    ...readJson('src/content/en/word.json').runtime,
  };
  const slots = (v) => {
    const forms = typeof v === 'object' ? Object.values(v) : [v];
    return new Set(forms.flatMap((f) => [...String(f).matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
  };
  const expected = {
    'error.check-room': ['detail'],
    'error.create-room': ['detail'],
    'error.create-room-failed': ['detail'],
    'join.other-game': ['game'],
    'player.numbered': ['n'],
    'lobby.need-players': ['count'],
    'lobby.add-players': ['count'],
    'lobby.need-players-share': ['count'],
    'lobby.waiting-n-ready': ['count'],
    'a11y.rename': ['name'],
    'a11y.remove': ['name'],
    'a11y.swipe-reveal': ['name'],
    'pass.step': ['current', 'total'],
    'pass.pass-to': ['name'],
    'over.you-suffix': ['name'],
  };
  for (const [key, want] of Object.entries(expected)) {
    assert.ok(bundle[key] != null, `${key} is missing from the en bundle`);
    assert.deepEqual([...slots(bundle[key])].sort(), [...want].sort(), `${key} slots`);
  }
  // And no OTHER key carries a slot, because a slot nobody fills ships
  // a literal {brace} to a player.
  for (const [key, v] of Object.entries(bundle)) {
    if (expected[key]) continue;
    assert.deepEqual([...slots(v)], [], `${key} has an unfilled slot`);
  }
});

test('every plural set in the en tables carries both English forms', () => {
  const bundle = {
    ...readJson('src/content/en/shared.json').runtime,
    ...readJson('src/content/en/word.json').runtime,
  };
  for (const [key, v] of Object.entries(bundle)) {
    if (typeof v !== 'object') continue;
    assert.ok(v.one != null, `${key} has no "one" form`);
    assert.ok(v.other != null, `${key} has no "other" form`);
  }
});
