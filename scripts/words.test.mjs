// The word catalogues, and the text normalising the checker rests on.
//
// scripts/check-words.mjs is not in CI: it is a content check, run when the
// catalogue is edited. The invariants below are different. They are the ones
// that break a ROOM rather than a word list, so they belong in the suite that
// runs on every push.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, norm, tokens, stemsClash, sharedRoot, looksGendered } from './words-lib.mjs';
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

// #228. Every French diacritic is a mark on a base letter, so all of them
// fold, and none of them is a separate letter of the alphabet the way the
// enye is. That makes French the easy case, which is worth pinning down
// rather than assuming: a fold that got the cedilla wrong would report
// duplicates that are not duplicates and block real words.
test('every French diacritic folds to its base letter', () => {
  assert.equal(norm('Été'), norm('Ete'));
  assert.equal(norm('Crème'), norm('Creme'));
  assert.equal(norm('Forêt'), norm('Foret'));
  assert.equal(norm('Noël'), norm('Noel'));
  assert.equal(norm('Garçon'), norm('Garcon'));
  assert.equal(norm('Où'), norm('Ou'));
  assert.equal(norm('Août'), norm('Aout'));
});

// The enye rescue is Spanish-specific and runs on every locale's text, so
// what matters for French is that it cannot fire. It only rewrites n plus a
// combining tilde, which no French word produces.
test('the enye rescue leaves French alone', () => {
  assert.equal(norm('Montagne'), 'montagne');
  assert.equal(norm('Agneau'), 'agneau');
});

// #228. French hints carry articles, and an elided article is glued to the
// word by an apostrophe. Both of the checker's ways of catching a hint that
// gives its answer away have to survive that, because "L'hiver" as a hint
// for "Hiver" is exactly the mistake an author makes at speed.
test('an elided article does not hide a hint inside its own word', () => {
  // norm() drops the apostrophe, so the substring check still sees it
  assert.ok(norm("L'hiver").includes(norm('Hiver')));
  assert.ok(norm("D'été").includes(norm('Été')));
  // and tokens() splits the article off, so the per-token stem check does too
  assert.deepEqual(tokens("D'hiver"), ['d', 'hiver']);
  assert.deepEqual(tokens("L'après-midi"), ['l', 'apres', 'midi']);
  assert.ok(stemsClash('hiver', tokens("D'hiver")[1]));
});

test('stemsClash catches a hint that is a stem of the word', () => {
  assert.ok(stemsClash('toast', 'toasted'));
  assert.ok(!stemsClash('pizza', 'cheesy'));
  // Under 4 characters it has to be an exact match, or half the catalogue
  // would collide on common short prefixes.
  assert.ok(!stemsClash('ice', 'iced'));
  assert.ok(stemsClash('ice', 'ice'));
});

// #186. The warning this backs is a judgement call, so what matters is that
// it names the pair it objected to and stays quiet on hints that merely open
// the same way as each other.
test('sharedRoot spots an easy hint built from a hard hint', () => {
  assert.deepEqual(sharedRoot('Global', 'Global tournament'), ['global', 'global']);
  assert.deepEqual(sharedRoot('Checked', 'Passport check'), ['checked', 'check']);
  // Neither of these starts with the other, so only the shared-prefix half of
  // the rule catches it. This is the case that made stemsClash() alone
  // insufficient.
  assert.deepEqual(sharedRoot('Groomed', 'Grooming appointment'), ['groomed', 'grooming']);
});

test('sharedRoot leaves unrelated hints alone', () => {
  assert.equal(sharedRoot('Cheesy', 'Delivered'), null);
  assert.equal(sharedRoot('Fluffy', 'Hillside grazing'), null);
  // Three shared characters is a coincidence, not a root: `Slow` and
  // `Slippery` are different words and the catalogue is full of such pairs.
  assert.equal(sharedRoot('Slow', 'Slippery trail'), null);
});

// ------------------------------------------------------------
// The gender leak, per language (#229)
// ------------------------------------------------------------
// This warning is the only check in the catalogue tooling that cannot be
// verified by reading its output, because Spanish and Portuguese both have
// complete allowlists and therefore emit nothing. The tests below are what
// hold the rule still.

test('Spanish and Portuguese still flag -o and -a, and nothing else', () => {
  assert.equal(looksGendered('Cremosa', new Set(), 'es').suffix, 'a');
  assert.equal(looksGendered('Salado', new Set(), 'es').suffix, 'o');
  assert.equal(looksGendered('Cremoso', new Set(), 'pt').suffix, 'o');
  // the forms that never inflect, which is why they were the advice
  assert.equal(looksGendered('Grande', new Set(), 'es'), null);
  assert.equal(looksGendered('Veloz', new Set(), 'es'), null);
  assert.equal(looksGendered('Derreter', new Set(), 'pt'), null);
});

// The regression that matters. #229 turned one regex into a table, and the
// only acceptable outcome for the two languages already using it is no
// change at all. Run against the real catalogues with an EMPTY allowlist,
// because the live allowlists are complete and would hide every difference.
test('the per-language table changed nothing for the catalogues that predate it', async () => {
  const before = (hint) => {
    for (const w of tokens(hint)) if (/[oa]$/.test(w)) return w;
    return null;
  };
  for (const code of ['en', 'es', 'pt']) {
    const mod = await import(`../www/shared/words/${code}.js`);
    for (const cat of Object.keys(mod.WORD_CATEGORIES)) {
      for (const e of mod.WORD_CATEGORIES[cat]) {
        for (const field of ['h', 'h2', 'h3']) {
          if (!e[field]) continue;
          const now = looksGendered(e[field], new Set(), code);
          assert.equal(now ? now.token : null, before(e[field]), `${code} ${cat} / ${e.w} ${field}`);
        }
      }
    }
  }
});

// The fold has already stripped the accents by the time the pattern runs, so
// `grillée` and `grillé` both arrive ending in a plain `e`. That is why one
// -e rule covers the feminine and the past participle at once.
test('French flags the trailing -e, accented or not', () => {
  assert.equal(looksGendered('Verte', new Set(), 'fr').suffix, 'e');
  assert.equal(looksGendered('Grillée', new Set(), 'fr').suffix, 'e');
  assert.equal(looksGendered('Grillé', new Set(), 'fr').suffix, 'e');
});

// The three masculine families whose feminine differs and which do not end
// in -e. Reported with the suffix they matched, not their last letter:
// "Heureux ends in -x" would send the author looking for the wrong thing.
test('French flags -eux, -if, -al and -ant, and names the suffix it matched', () => {
  assert.equal(looksGendered('Heureux', new Set(), 'fr').suffix, 'eux');
  assert.equal(looksGendered('Vif', new Set(), 'fr').suffix, 'if');
  assert.equal(looksGendered('National', new Set(), 'fr').suffix, 'al');
  assert.equal(looksGendered('Brillant', new Set(), 'fr').suffix, 'ant');
});

// Stated as a test rather than left as a surprise. The French masculine is
// the UNMARKED form, so `Vert` leaks (it says the word is masculine) and no
// suffix can catch it. Spanish marks both genders and can be checked both
// ways; French can only be checked one way.
test('French cannot catch a bare masculine adjective, and does not pretend to', () => {
  assert.equal(looksGendered('Vert', new Set(), 'fr'), null);
  assert.equal(looksGendered('Petit', new Set(), 'fr'), null);
  assert.equal(looksGendered('Gros', new Set(), 'fr'), null);
});

test('the -er and -ir infinitives stay clear of the French rule', () => {
  assert.equal(looksGendered('Griller', new Set(), 'fr'), null);
  assert.equal(looksGendered('Partager', new Set(), 'fr'), null);
  assert.equal(looksGendered('Rôtir', new Set(), 'fr'), null);
});

test('the allowlist skips a token in every language', () => {
  assert.equal(looksGendered('Verano', new Set(['verano']), 'es'), null);
  assert.equal(looksGendered('Croûte', new Set(['croute']), 'fr'), null);
  // and it is per token, so a two-word hint is only cleared once both are
  assert.equal(looksGendered('Croûte dorée', new Set(['croute']), 'fr').token, 'doree');
});

// A locale added to GENDER_REVIEWED without a thought about its morphology
// gets the Spanish rule rather than no rule, which fails loud instead of
// silent.
test('an unregistered language falls back to the -o/-a rule', () => {
  assert.equal(looksGendered('Cremosa', new Set(), 'it').suffix, 'a');
  assert.equal(looksGendered('Cremosa', new Set()).suffix, 'a');
});

// ------------------------------------------------------------
// Choosing a catalogue
// ------------------------------------------------------------

test('a regional tag resolves to its base catalogue', () => {
  assert.equal(catalogueLang('es-ES'), 'es');
  assert.equal(catalogueLang('en-GB'), 'en');
  assert.equal(catalogueLang('ES'), 'es');
});

// The example here was `fr` until #228 registered it. Reach for a language
// the site has no plans for, or this test quietly stops testing anything the
// day that language ships.
test('a language with no catalogue falls back rather than dealing undefined', () => {
  assert.equal(catalogueLang('de'), DEFAULT_LANG);
  assert.equal(catalogueLang('ja'), DEFAULT_LANG);
  assert.equal(catalogueLang(''), DEFAULT_LANG);
  assert.equal(catalogueLang(undefined), DEFAULT_LANG);
  assert.equal(catalogueLang(null), DEFAULT_LANG);
});

// French IS registered, so it resolves to itself rather than falling back,
// even while fr.js is still empty. Those are two different mechanisms and
// the next test covers the other one.
test('a registered catalogue resolves to itself, empty or not', () => {
  assert.equal(catalogueLang('fr'), 'fr');
  assert.equal(catalogueLang('fr-FR'), 'fr');
  assert.equal(catalogueLang('fr-CA'), 'fr');
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

// This ran on Spanish alone until #230, which is how Portuguese and French
// both arrived unmeasured against a bar written for them. It now runs on
// every catalogue that is not the English one, so the next language is
// covered on the day it registers rather than the day somebody remembers.
//
// French is the reason the Super Heroes bar earns its width. Spanish renames
// these characters (Lobezno, Masacre, Mujer Maravilla) and Portuguese renames
// them too (Homem-Aranha, Viuva Negra), but French keeps the English name for
// almost the whole Marvel and DC roster, so the correct French entry IS the
// English string. The first French draft came in at 74% on that alone. It was
// brought down by replacing ten of the most generic entries with heroes a
// French room actually grew up with (Goldorak, Albator, Capitaine Flam,
// Ulysse 31, Les Chevaliers du Zodiaque, Nicky Larson), which is a better
// list rather than a test-shaped one. Raising the bar to fit 74% was the
// other option and it would have bought nothing.
for (const code of CATALOGUE_LANGS.filter((c) => c !== 'en')) {
  test(`the ${code} words are their own list, not a translation of the English one`, async () => {
    const cat = await loadCatalog(code);
    assert.equal(cat.lang, code, `${code} fell back instead of loading its own catalogue`);
    for (const [name, list] of Object.entries(cat.categories)) {
      if (!list.length) continue;
      const english = new Set((EN[name] || []).map(e => e.w));
      const shared = list.filter(e => english.has(e.w));
      const limit = MAX_SHARED[name];
      assert.ok(limit !== undefined, `no overlap limit set for ${name}`);
      assert.ok(shared.length / list.length < limit,
        `${code} ${name}: ${shared.length} of ${list.length} identical to English, over the ${limit * 100}% bar (${shared.map(e => e.w).join(', ')})`);
    }
  });
}

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
