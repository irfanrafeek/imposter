// The word catalogues, and the text normalising the checker rests on.
//
// scripts/check-words.mjs is not in CI: it is a content check, run when the
// catalogue is edited. The invariants below are different. They are the ones
// that break a ROOM rather than a word list, so they belong in the suite that
// runs on every push.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, norm, tokens, stemsClash, substringClash, sharedRoot, looksGendered } from './words-lib.mjs';
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

// #305. The three German umlauts are marks on a base letter, exactly like
// the French diacritics above, so all three fold. That is the DIN 5007-1
// ordering, the one a German dictionary uses, and it is the right answer
// here: Grün and Grun are the same word for duplicate-detection.
//
// It is NOT the DIN 5007-2 transcription, where ü becomes ue. That rule is
// for sorting names and passports, and applying it would make Müller and
// Mueller collide. This catalogue writes the umlaut, so the transcription
// never appears and the collision would be invented rather than found.
test('every German umlaut folds to its base letter', () => {
  assert.equal(norm('Müller'), 'muller');
  assert.equal(norm('Öl'), 'ol');
  assert.equal(norm('Käse'), 'kase');
  assert.equal(norm('Grün'), norm('Grun'));
  assert.equal(norm('Gebäude'), norm('Gebaude'));
});

// The cost of that decision, pinned down rather than discovered halfway
// through the catalogue. Folding an umlaut away MERGES two real German
// words whenever they differ by nothing else, and unlike Mélon and Melon
// in Spanish these are not one word spelled two ways, they are two words:
//
//   Bär / Bar          a bear and a bar, and the catalogue wants both
//   Stück / Stuck       a piece and stucco
//   schön / schon       beautiful and already
//   Vögel / Vogel       birds and a bird
//
// Each one is a hard error from the checker, because no word may appear in
// two categories. Bär in Animals beside Bar in Places is the pair most
// likely to actually come up, and the way out is to drop one of them.
//
// This is a known trade rather than a bug, and #306 does not change it. The
// fold is shared with the word game's clue board (#244), where the merge is
// the POINT: an impostor typing Kase for the secret word Käse has to be
// caught. A catalogue-only fold would want the opposite. See the note in
// de.js before reaching for a third option.
test('folding an umlaut merges two real German words, deliberately', () => {
  assert.equal(norm('Bär'), norm('Bar'));
  assert.equal(norm('Stück'), norm('Stuck'));
  assert.equal(norm('schön'), norm('schon'));
});

// What it must NOT do, and the half that would break quietly. The vowel
// under the mark folds to ITS OWN base letter, never to a neighbouring one,
// and the ue transcription is a different string that stays different.
test('an umlaut never folds across to a different vowel', () => {
  assert.notEqual(norm('Ähre'), norm('Ehre'));
  assert.notEqual(norm('Müller'), norm('Mueller'));
  assert.notEqual(norm('München'), norm('Muenchen'));
});

// #306. The eszett is neither of the two cases above. It is not an accent,
// so stripping it is wrong, and it is not a letter of its own like the enye,
// so keeping it is wrong too. It is a LIGATURE and it has to expand, because
// Straße and Strasse are one word written two ways and Switzerland writes
// the second one everywhere.
test('the eszett expands to ss rather than folding away', () => {
  assert.equal(norm('Fuß'), 'fuss');
  assert.equal(norm('Straße'), norm('Strasse'));
  assert.equal(norm('weiß'), norm('weiss'));
  assert.equal(norm('Maß'), norm('Mass'));
  assert.deepEqual(tokens('Heißer Fußball'), ['heisser', 'fussball']);
});

// The bug it fixes, pinned in the shape it actually took. norm() used to
// DELETE the character, which got both directions wrong at once: it invented
// a collision that was not there and missed the one that was. The invented
// half was the dangerous one, because the shortened string dropped under the
// four-character floor in stemsClash() where the rule silently becomes
// strict equality, so the error it produced named the wrong cause.
test('deleting the eszett got duplicate detection wrong in both directions', () => {
  assert.notEqual(norm('Fuß'), 'fu');
  assert.notEqual(norm('Maß'), 'ma');
  assert.notEqual(norm('Straße'), 'strae');
  assert.ok(!stemsClash(norm('Fuß'), norm('Fu')));
});

// Capital eszett is not used in the catalogue and costs nothing to handle:
// toLowerCase() turns U+1E9E into the ordinary one before the rule runs, so
// a shouted title from a song pool folds the same way a hint does.
test('the eszett folds the same in either case', () => {
  assert.equal(fold('ẞ'), 'ss');
  assert.equal(norm('STRASSE'), norm('Straße'));
  assert.equal(norm('FUẞBALL'), norm('Fußball'));
});

// And the price, which is the same price the umlaut rule pays. Maße and
// Masse are two different German words, and after expansion they are one
// string. Recorded rather than fixed: see the test above on Bär and Bar.
test('expanding the eszett merges two real German words, deliberately', () => {
  assert.equal(norm('Maße'), norm('Masse'));
  assert.equal(norm('Buße'), norm('Busse'));
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

// #307. The containment check beside it, which catches what a prefix test
// cannot: a compound with the word buried in the middle or at the end.
test('substringClash catches a compound that hides the word', () => {
  assert.ok(substringClash(norm('Hand'), norm('Handschuh')));
  assert.ok(substringClash(norm('Fuss'), norm('Fussball')));
  assert.ok(substringClash(norm('Katze'), norm('Katzenfutter')));
  assert.ok(!substringClash(norm('Pizza'), norm('Cremig')));
});

// The bug, and the reason this check needed the floor stemsClash() already
// had. Two and three letter words sit inside unrelated longer ones all the
// time, and German builds enough compounds that they sit inside a great
// many of them. Every pair below was a HARD ERROR that failed the build on
// an entry with nothing wrong with it.
test('a short word inside an unrelated longer one is not a leak', () => {
  for (const [word, hint] of [
    ['Hut', 'Schutz'], ['Ohr', 'Rohr'], ['Eis', 'Reis'], ['Arm', 'Warm'],
    ['Ei', 'Zwei'], ['Ass', 'Tasse'], ['Uhr', 'Fuhrpark'], ['Bar', 'Barsch'],
  ]) {
    assert.ok(!substringClash(norm(word), norm(hint)),
      `${word} / ${hint} should not be a leak`);
  }
});

// A boundary rule was the other candidate and it fails this set: Ohr, Eis
// and Arm all sit at the END of their false positive, and Bar at the start,
// so "only at a word edge" would still have flagged four of the eight. The
// length floor is what separates them.
test('the floor, not a word boundary, is what clears the false positives', () => {
  assert.ok(norm('Rohr').endsWith(norm('Ohr')));
  assert.ok(norm('Barsch').startsWith(norm('Bar')));
  assert.ok(!substringClash(norm('Bar'), norm('Barsch')));
});

// Exact equality still counts at any length, which is what keeps a hint
// that IS the word from slipping under the floor.
test('a hint identical to a short word is still caught', () => {
  assert.ok(substringClash(norm('Eis'), norm('Eis')));
  assert.ok(substringClash(norm('Ei'), norm('Ei')));
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
  assert.equal(looksGendered('Cremosa', new Set(), 'es').match, 'a');
  assert.equal(looksGendered('Salado', new Set(), 'es').match, 'o');
  assert.equal(looksGendered('Cremoso', new Set(), 'pt').match, 'o');
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
  assert.equal(looksGendered('Verte', new Set(), 'fr').match, 'e');
  assert.equal(looksGendered('Grillée', new Set(), 'fr').match, 'e');
  assert.equal(looksGendered('Grillé', new Set(), 'fr').match, 'e');
});

// The three masculine families whose feminine differs and which do not end
// in -e. Reported with the suffix they matched, not their last letter:
// "Heureux ends in -x" would send the author looking for the wrong thing.
test('French flags -eux, -if, -al and -ant, and names the suffix it matched', () => {
  assert.equal(looksGendered('Heureux', new Set(), 'fr').match, 'eux');
  assert.equal(looksGendered('Vif', new Set(), 'fr').match, 'if');
  assert.equal(looksGendered('National', new Set(), 'fr').match, 'al');
  assert.equal(looksGendered('Brillant', new Set(), 'fr').match, 'ant');
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
  assert.equal(looksGendered('Cremosa', new Set(), 'it').match, 'a');
  assert.equal(looksGendered('Cremosa', new Set()).match, 'a');
});

// ------------------------------------------------------------
// German: the same leak, caught at the other end of the word (#308)
// ------------------------------------------------------------
// German is the first locale whose rule is not a suffix test, so these tests
// carry more weight than the French ones did: there is no second mechanism
// backing them up, and GENDER_REVIEWED.de is empty by design, so a rule that
// quietly stopped working would emit nothing and look exactly like a clean
// catalogue.

test('German flags the article, which is where its gender actually leaks', () => {
  assert.equal(looksGendered('Der Hund', new Set(), 'de').match, 'der');
  assert.equal(looksGendered('Die Katze', new Set(), 'de').match, 'die');
  assert.equal(looksGendered('Das Brot', new Set(), 'de').match, 'das');
  assert.equal(looksGendered('Ein Vogel', new Set(), 'de').match, 'ein');
  assert.equal(looksGendered('Eine Blume', new Set(), 'de').match, 'eine');
});

// Past the seven the ticket named. These will almost never appear in a hint
// capped at two words, and they are in the list precisely because that
// "almost" is not worth relying on.
test('the German list covers the dative and genitive forms too', () => {
  for (const a of ['dem', 'den', 'des', 'einen', 'einem', 'einer', 'eines']) {
    assert.equal(looksGendered(`${a} Haus`, new Set(), 'de').match, a, a);
  }
});

// The whole argument of #308 in one test. Every word below ends in -e, -er,
// -en or -es, so a German entry built like the Romance ones would flag all
// of them, and every one of them is an ordinary noun or an uninflecting
// predicative adjective that leaks nothing at all.
test('German does not flag an ending, because its adjectives do not inflect', () => {
  const safe = [
    'Rot', 'Laut', 'Rund', 'Süß',                  // predicative adjectives
    'Käse', 'Zimmer', 'Wasser', 'Fenster', 'Messer', // nouns that end the way
    'Lehrer', 'Kuchen', 'Wagen', 'Garten', 'Besen',  // an inflected adjective
    'Gebäude', 'Schere', 'Blume',                    // would
    'Grillen', 'Teilen', 'Backen',                 // infinitives
  ];
  for (const hint of safe) assert.equal(looksGendered(hint, new Set(), 'de'), null, hint);
});

// The trap the `article` kind is named for. If this rule is ever rewritten
// as a character-prefix test, every line below starts firing, and each one
// is a perfectly good German hint.
test('the article rule matches a whole token, never the start of one', () => {
  const opens = [
    'Dienstag', 'Dieb', 'Diener', 'Diesel',   // die
    'Einhorn', 'Eintritt', 'Einkaufen',       // ein
    'Denkmal', 'Denken',                      // den
    'Dasein', 'Demut', 'Dessert',             // das, dem, des
    'Derby',                                  // der
  ];
  for (const hint of opens) assert.equal(looksGendered(hint, new Set(), 'de'), null, hint);
});

// The table entry is load-bearing, not decorative. Without it German would
// fall through to DEFAULT_GENDER_PATTERN, and the fallback is the Spanish
// -o/-a rule, which flags ordinary German nouns and catches no article.
test('German would be checked wrongly if it fell through to the default', () => {
  assert.equal(looksGendered('Kakao', new Set(), 'de'), null);
  assert.equal(looksGendered('Kakao', new Set(), 'xx').match, 'o');
  assert.equal(looksGendered('Der Hund', new Set(), 'xx'), null);
});

// The caller words the two warnings differently, so the kind has to survive
// the trip. An article is a fact about the hidden word; an ending is only a
// suspicion, because the author is the one who can tell a noun from an
// adjective.
test('the rule reports which kind it is, so the warning can be worded for it', () => {
  assert.equal(looksGendered('Der Hund', new Set(), 'de').kind, 'article');
  assert.equal(looksGendered('Cremosa', new Set(), 'es').kind, 'suffix');
  assert.equal(looksGendered('Verte', new Set(), 'fr').kind, 'suffix');
});

// German's allowlist is empty on purpose, but the mechanism is shared, so
// prove it still works there rather than assuming it does.
test('the allowlist still skips a token in German', () => {
  assert.equal(looksGendered('Die Katze', new Set(['die']), 'de'), null);
});

// ------------------------------------------------------------
// Choosing a catalogue
// ------------------------------------------------------------

test('a regional tag resolves to its base catalogue', () => {
  assert.equal(catalogueLang('es-ES'), 'es');
  assert.equal(catalogueLang('en-GB'), 'en');
  assert.equal(catalogueLang('ES'), 'es');
});

// The stand-in used to be written down: `fr` until #228 registered it, then
// `de` until #305 did. Twice a launch turned this test into one that asserts
// nothing, and both times the comment above it had already asked the next
// person not to let that happen. So it is derived now. Pick the first code
// the registry does not hold, and fail if the candidates ever run out.
const UNREGISTERED = ['ja', 'ko', 'th', 'sw', 'fi']
  .find((c) => !CATALOGUE_LANGS.includes(c));

test('a language with no catalogue falls back rather than dealing undefined', () => {
  assert.ok(UNREGISTERED,
    'every candidate stand-in is now a real catalogue; add one the site has no plans for');
  assert.equal(catalogueLang(UNREGISTERED), DEFAULT_LANG);
  assert.equal(catalogueLang(`${UNREGISTERED}-XX`), DEFAULT_LANG);
  assert.equal(catalogueLang(''), DEFAULT_LANG);
  assert.equal(catalogueLang(undefined), DEFAULT_LANG);
  assert.equal(catalogueLang(null), DEFAULT_LANG);
});

// Being REGISTERED and having WORDS are two different mechanisms, and this
// covers the first one: a locale in the registry resolves to itself even
// while its file is still empty. German is the empty one today, as French
// was at #228, and the loop means neither has to be named.
test('a registered catalogue resolves to itself, empty or not', () => {
  for (const code of CATALOGUE_LANGS) assert.equal(catalogueLang(code), code);
  assert.equal(catalogueLang('de-AT'), 'de');
  assert.equal(catalogueLang('de-CH'), 'de');
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
  test(`the ${code} words are their own list, not a translation of the English one`, async (t) => {
    // A catalogue that is registered but still empty falls back to English
    // BY DESIGN, so loadCatalog() would hand back en.js here and the overlap
    // would read as a perfect copy. Ask the file rather than the loader, and
    // skip while there is nothing to measure: the moment the first category
    // lands, this starts measuring it. #305 hit this on the day German
    // registered, which is the same day fr.js would have hit it had this
    // loop existed before #230.
    const mod = await import(`../www/shared/words/${code}.js`);
    if (!Object.values(mod.WORD_CATEGORIES).some((l) => l.length)) {
      return t.skip(`${code} is registered but still empty`);
    }
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
