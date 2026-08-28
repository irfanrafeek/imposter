// ============================================================
// THE SPANISH WORD CATALOGUE
// ============================================================
// Written for players in Spain, not translated from en.js. Parity with the
// English catalogue is explicitly not a goal: a category that does not land
// with a Spanish table is worth less than a shorter one that does.
//
// The KEYS below stay English. They are data keys with history behind them,
// not labels; see the header of index.js. Only the arrays are Spanish.
//
// This file is the shelf. #137 fills it, one category at a time so each can
// be read through before the next is written. Until a category has words,
// scripts/check-words.mjs reports it as not-yet-written rather than failing,
// and loadCatalog() falls back to English while the whole file is empty, so
// a half-finished catalogue can never deal `undefined` as the secret word.
//
// Two Spanish-only traps, neither of which a checker can see:
//
//   - GENDER LEAKS THE ANSWER. `Roja` next to a hidden noun says the noun is
//     feminine, which cuts the field in half before anyone speaks. Prefer
//     hints that do not inflect: a noun-ish adjective, or one whose masculine
//     and feminine forms are identical (`Grande`, `Verde`, `Brillante`).
//
//   - THE ARTICLE IS PART OF THE WORD, or it is not, but it has to be one or
//     the other everywhere. `Playa` and `La Playa` in the same catalogue read
//     as two different registers on the card. No articles is the rule here.
export const WORD_CATEGORIES = {
  'Food': [],
  'Animals': [],
  'Places': [],
  'Everyday Objects': [],
  'Movies & TV': [],
  'Football': [],
  'Super Heroes': [],
};
