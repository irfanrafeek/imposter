// ============================================================
// TEXT FOLDING
//
// One question, asked in two places: are these two pieces of text the
// same word, ignoring case and accents?
//
//   * the catalogue checks, which use it to find duplicate entries and
//     hints that give the answer away (scripts/words-lib.mjs)
//   * the word game's clue board, which uses it to refuse a clue that is
//     the secret word wearing a different hat (#244)
//
// It lives here rather than in the script because the browser needs it
// too, and a second copy is a second thing to get wrong: the enye rule
// below is subtle, it is covered by scripts/words.test.mjs, and a copy
// would fail silently rather than loudly. scripts/words-lib.mjs imports
// this file back, which works because package.json is "type": "module"
// and scripts/build.mjs already does the same with shared/i18n.js.
// ============================================================

// Written as escapes, not as literal characters. ENYE_NFD has to be a
// DECOMPOSED enye to match what normalize('NFD') produces, and on screen a
// decomposed enye is indistinguishable from a precomposed one. Any tool that
// normalised this file would silently turn the rule off, and the symptom
// would be a wrong duplicate report rather than a crash.
const ENYE = '\u00f1';            // the single character
const ENYE_NFD = 'n\u0303';       // n + combining tilde, what NFD leaves
const MARKS = /[\u0300-\u036f]/g; // every combining diacritic
const ESZETT = /\u00df/g;         // the German sharp s, written as an escape

// An accent is a stress mark on the same letter, so `a` and `a-acute` are one
// letter for duplicate-detection: "Melon" and "Melón" are the same word and
// only one of them belongs in the catalogue.
//
// THE ENYE IS NOT AN ACCENTED N. It is a separate letter of the Spanish
// alphabet, and folding it away would make "año" and "ano" collide and report
// a duplicate that is not one. So the decomposition is undone for that one
// combination before the remaining marks are stripped, and the enye survives
// into the alphabet norm() keeps.
//
// THE ESZETT IS NOT AN ACCENTED S, AND IT IS NOT A LETTER OF ITS OWN EITHER.
// It is a LIGATURE, so it neither strips like an accent nor survives like the
// enye: it has to EXPAND (#306). Stra\u00dfe and Strasse are one word written two
// ways, and Switzerland writes the second everywhere, so they have to fold
// together. Before this rule ran, norm() dropped it entirely and got both
// directions wrong at once: Fu\u00df collapsed to "fu" and collided with Fu, while
// Stra\u00dfe became "strae" and missed Strasse completely.
//
// Written as an escape for the same reason ENYE_NFD is. On screen \u00df is easy
// to mistake for a Greek beta, and a tool that helpfully "fixed" it would
// turn the rule off silently rather than crash.
//
// It runs AFTER toLowerCase() on purpose. Capital \u1e9e lowercases to \u00df, so one
// rule catches both cases; going the other way, \u00df.toUpperCase() is already
// "SS" and the expansion would happen twice.
//
// The reverse pairing is left alone deliberately. Ma\u00dfe and Masse are two
// different German words that now fold together, exactly as B\u00e4r and Bar do
// under the umlaut rule. That is the price of folding at all, and the
// catalogue's answer is to choose a different word. See www/shared/words/de.js.
//
// The English catalogue is pure ASCII, so none of this can change an English
// result. That was verified, not assumed.
export const fold = (s) => String(s)
  .normalize('NFD')
  .replace(new RegExp(ENYE_NFD, 'gi'), ENYE)
  .replace(MARKS, '')
  .toLowerCase()
  .replace(ESZETT, 'ss');

export const norm = (s) => fold(s).replace(new RegExp(`[^a-z0-9${ENYE}]`, 'g'), '');
export const tokens = (s) => fold(s).split(new RegExp(`[^a-z0-9${ENYE}]+`)).filter(Boolean);
