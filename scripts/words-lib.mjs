// Text normalising for the catalogue checks.
//
// Split out of check-words.mjs for one reason: check-words.mjs runs its
// checks on import, so nothing can import it to test it, and the enye rule
// below is exactly the kind of logic that breaks silently. It lives here so
// scripts/words.test.mjs can hold it still. See that file for the cases.

// Written as escapes, not as literal characters. ENYE_NFD has to be a
// DECOMPOSED enye to match what normalize('NFD') produces, and on screen a
// decomposed enye is indistinguishable from a precomposed one. Any tool that
// normalised this file would silently turn the rule off, and the symptom
// would be a wrong duplicate report rather than a crash.
const ENYE = '\u00f1';            // the single character
const ENYE_NFD = 'n\u0303';       // n + combining tilde, what NFD leaves
const MARKS = /[\u0300-\u036f]/g; // every combining diacritic

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
// The English catalogue is pure ASCII, so none of this can change an English
// result. That was verified, not assumed.
export const fold = (s) => String(s)
  .normalize('NFD')
  .replace(new RegExp(ENYE_NFD, 'gi'), ENYE)
  .replace(MARKS, '')
  .toLowerCase();

export const norm = (s) => fold(s).replace(new RegExp(`[^a-z0-9${ENYE}]`, 'g'), '');
export const tokens = (s) => fold(s).split(new RegExp(`[^a-z0-9${ENYE}]+`)).filter(Boolean);

// "Toast" vs "Toasted": same first 4+ characters means the hint is a stem of
// the word (or vice versa), which hands the impostor the answer.
export function stemsClash(a, b) {
  if (a.length < 4 || b.length < 4) return a === b;
  return a.startsWith(b) || b.startsWith(a);
}
