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
import { WORD_CATEGORIES } from '../www/shared/words/en.js';
import { loadSite } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DEFAULT_LOCALE = loadSite().defaultLocale;

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

// Every content file, not just the two that happened to exist when this
// was written. Dance alone added 122 runtime strings in #161, none of them
// covered while the list here was hand-picked.
const RUNTIME_FILES = ['shared', 'word', 'draw', 'dance'];

// Every locale that has content, discovered from the directory rather than
// listed here, so a new language is covered the day its folder appears and
// not the day someone remembers this file. Deliberately NOT site.json's
// locale list: a locale is registered there before its content is written
// (that is what lets a page join `locales` one at a time), so reading it
// would fail this test for the whole of a language's build-out.
const CONTENT = path.join(ROOT, 'src', 'content');
const LOCALES = fs.readdirSync(CONTENT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

// Null, not {}, for a file this locale does not have yet. A half-written
// locale is a normal state during a launch and must not read as a locale
// whose every string has no slots.
const runtimeOf = (locale, name) => {
  const p = path.join(CONTENT, locale, `${name}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).runtime || {};
};
const slotsIn = (v) => {
  const forms = typeof v === 'object' ? Object.values(v) : [v];
  return [...new Set(forms.flatMap((f) => [...String(f).matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
};

// key → the slots its callers actually fill. Written out rather than
// derived, because deriving it from the call sites is exactly the thing
// that would stop the test from disagreeing with them.
const EXPECTED_SLOTS = {
  'a11y.remove': ['name'],
  'a11y.rename': ['name'],
  'a11y.rounds': ['count'],
  'a11y.swipe-reveal': ['name'],
  'card.starting-in': ['n'],
  'error.check-room': ['detail'],
  'error.create-room': ['detail'],
  'error.create-room-failed': ['detail'],
  'game.gm-impostors': ['names'],
  'game.track': ['artist', 'title'],
  'groups.cap-note': ['count'],
  'groups.cap-toast': ['count'],
  'groups.confirm-delete': ['name'],
  'groups.default-name': ['n'],
  'groups.row-songs-session': ['count'],
  'groups.song-cap': ['count'],
  'join.other-game': ['game'],
  'lang.switch-body': ['lang'],
  'lang.switch-go': ['lang'],
  'lang.switch-title': ['lang'],
  'lobby.add-players': ['count'],
  'lobby.need-dancers': ['count'],
  'lobby.need-dancers-share': ['count'],
  'lobby.need-players': ['count'],
  'lobby.need-players-share': ['count'],
  'lobby.picked-song': ['artist', 'title'],
  'lobby.waiting-n-ready': ['count'],
  'over.squad-n': ['n'],
  'over.you-suffix': ['name'],
  'pass.pass-to': ['name'],
  'pass.step': ['current', 'total'],
  'play.done-pass': ['name'],
  'play.hint-crew': ['word'],
  'play.hint-impostor': ['hint'],
  'player.left-room': ['name'],
  'player.numbered': ['n'],
  'player.you-caps': ['name'],
  'player.you-lower': ['name'],
  'player.you-title': ['name'],
  'song.count': ['count'],
  'tally.votes': ['count'],
  'turn.round': ['n', 'total'],
  'turn.theirs': ['name'],
  'vote.hint-host': ['cast', 'total'],
  'vote.hint-player': ['cast', 'total'],
};

test('every string in every locale interpolates with the parameters its callers pass', () => {
  // A key whose {slot} was renamed in the JSON but not in app.js is the
  // failure this catches: the build checks that keys EXIST, not that
  // their slots still match. Checked per file rather than on one merged
  // object, so two games that share a key but disagree about its slots
  // disagree loudly instead of whichever spread happened to win.
  //
  // EVERY LOCALE, not just en (#209). A slot name looks like a word to
  // translate, because in the source it is one, so `{name}` becoming
  // `{nombre}` is the natural mistake rather than an exotic one. The
  // English-only version of this test could not see it, and fill() leaves
  // an unfilled slot VISIBLE on purpose, so the failure was loud on a
  // player's screen and silent in CI. The slots belong to the call site,
  // not to the language, which is why one map covers every locale.
  for (const locale of LOCALES) {
    for (const name of RUNTIME_FILES) {
      const table = runtimeOf(locale, name);
      if (!table) continue;
      for (const [key, v] of Object.entries(table)) {
        const found = slotsIn(v);
        // A slot nobody fills ships a literal {brace} to a player, so a key
        // that is not in the map has to have none.
        assert.deepEqual(found, EXPECTED_SLOTS[key] || [], `${locale}/${name}.json: ${key} slots`);
      }
    }
  }
  // And the map does not name a key that no longer exists. Against the
  // default locale, which is the complete table: a key that lives only in
  // a translation is a different bug, and it belongs to the parity test.
  const live = new Set(RUNTIME_FILES.flatMap((n) => Object.keys(runtimeOf(DEFAULT_LOCALE, n) || {})));
  for (const key of Object.keys(EXPECTED_SLOTS)) {
    assert.ok(live.has(key), `${key} is in the slot map but in no ${DEFAULT_LOCALE} bundle`);
  }
});

test('every plural set in the en tables carries both English forms', () => {
  // Still English only, and correctly so: which forms a language NEEDS
  // comes from its own plural rules, so es and pt want one/other while
  // ru wants one/few/many/other. Generalising this means asking
  // Intl.PluralRules per locale, which is a different test.
  for (const name of RUNTIME_FILES) {
    for (const [key, v] of Object.entries(runtimeOf(DEFAULT_LOCALE, name))) {
      if (typeof v !== 'object') continue;
      assert.ok(v.one != null, `${name}.json: ${key} has no "one" form`);
      assert.ok(v.other != null, `${name}.json: ${key} has no "other" form`);
    }
  }
});

// --- category ids vs category labels (#135) -----------------------

const CATEGORY_IDS = Object.keys(WORD_CATEGORIES);
const wordRuntime = readJson('src/content/en/word.json').runtime;

test('every catalogue category has both display strings in en', () => {
  // The same check the build runs. Here too because this is the one that
  // will fail first when a category is added and a locale's table is not
  // updated with it.
  for (const id of CATEGORY_IDS) {
    assert.ok(wordRuntime[`category.${id}.name`], `category.${id}.name missing`);
    assert.ok(wordRuntime[`category.${id}.desc`], `category.${id}.desc missing`);
  }
});

test('the category ids are the ones the stored data already uses', () => {
  // Frozen on purpose. An id is not a label: it is the key of a lifetime
  // counter at games/categories/<id> with months of history behind it, of
  // the played ledger on every live room, and of the localStorage ledger
  // on every returning player's device. Renaming one splits the counter
  // and orphans both ledgers, silently and irreversibly.
  //
  // Changing the English WORDING is fine and does not come through here:
  // that is category.<id>.name, which this test deliberately ignores.
  // Editing THIS list is the deliberate act, and it should be.
  assert.deepEqual(CATEGORY_IDS, [
    'Food',
    'Animals',
    'Places',
    'Everyday Objects',
    'Movies & TV',
    'Football',
    'Super Heroes',
  ]);
});

test('no category id carries a character Firebase rejects in a key', () => {
  // Ids are path segments under meta/played and games/categories. Both
  // games sanitise before writing, but an id that NEEDS sanitising reads
  // differently in the console than it does in the picker.
  for (const id of CATEGORY_IDS) {
    assert.doesNotMatch(id, /[.#$[\]/]/, `${id} contains a reserved character`);
    assert.match(id, /^[\x20-\x7E]+$/, `${id} is not ASCII`);
  }
});

// --- prose that never reached a content file ----------------------

// Three separate strings shipped to Spanish players in English because they
// were typed straight into a template instead of a content file: dance's
// "Songs" label and "Game Master" badge, and draw's "You're the Impostor"
// banner, which is the single most important line in that game. Draw's own
// Pass-the-Phone copy of that banner used the key correctly, one screen away.
//
// Nothing here errors. `throwOnUndefined` catches a MISSING key; a literal
// asks for no key at all, so the build renders it happily into every locale
// and the page looks complete in review. All three were found in #169 by
// playing the game in Spanish, which is not a repeatable process.
//
// The dev-only Firebase setup block is exempt: it renders only when the
// config is absent, which is a state no player is ever in.
test('no template ships prose that never reached a content file', () => {
  const strip = (s) => s
    .replace(/\{#[\s\S]*?#\}/g, '')                             // nunjucks comments
    .replace(/<section[^>]*id="screen-needs-setup"[\s\S]*?<\/section>/g, '');
  // The internal pages are exempt, and the exemption is read from
  // site.json rather than matched on a filename. The component gallery is
  // English-only and is not part of the site; its prose is specimen text
  // naming the component beside it, so a content file would add a layer
  // of indirection and translate nothing (#201).
  const internal = new Set((loadSite().internal || []).map((p) => path.basename(p.template)));
  for (const file of fs.readdirSync(path.join(ROOT, 'src/pages'))) {
    if (!file.endsWith('.njk') || internal.has(file)) continue;
    const src = strip(fs.readFileSync(path.join(ROOT, 'src/pages', file), 'utf8'));
    const stray = [];
    for (const m of src.matchAll(/>([^<>{}]+)</g)) {
      const text = m[1].replace(/&[a-z]+;/g, ' ');              // &nbsp; is not prose
      if (!/[A-Za-z]{2}/.test(text)) continue;                  // digits, arrows, dashes
      stray.push(`${file}: "${text.trim().slice(0, 60)}"`);
    }
    assert.deepEqual(stray, [], 'translatable text sits outside a content file');
  }
});
