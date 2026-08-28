// ============================================================
// THE WORD CATALOGUES
// ============================================================
// One catalogue file per locale (en.js, es.js), and this module picks one
// at runtime. The English catalogue alone is 30KB; loading every locale so
// that a Spanish player can use one of them would be paying for all of them
// on every page.
//
// A catalogue is a plain object: category id -> array of { w, h, h2 }.
//   `w`  the secret word every crewmate sees
//   `h`  and `h2`, two vague hints; the impostor is shown ONE of them,
//        picked fresh each round by pickHint(), so a word that comes round
//        again still plays differently and nobody learns that
//        "Cheesy means Pizza".
//
// THE CATEGORY IDS ARE THE SAME IN EVERY LOCALE, and they stay English and
// ASCII. An id is simultaneously the key into the catalogue, the value
// written to meta.categories and read by every other player in the room,
// the key of the played-word ledger both on the room and in localStorage,
// and the key of the lifetime counter at analytics/word/games/categories.
// Only the display names are translated, in the runtime string tables
// (category.<id>.name / .desc). See #135.
//
// So es.js translates the WORDS, not the KEYS. A Spanish room and an
// English room both write 'Food'.
//
// Rules for the entries, enforced by scripts/check-words.mjs:
//   - a hint is one or two words, descriptive, never a noun naming the thing
//   - a hint never contains the word, and the word never contains the hint
//   - a hint is never the category name: the host's pick is public, so that
//     would tell the impostor nothing they don't already know
//   - `h` and `h2` differ from each other
//   - no word appears in two categories, otherwise the per-category played
//     ledger would let the same word be dealt twice in one room
//
// In Spanish there is one more, which the checker cannot see: an adjective
// hint carries gender, and a gendered adjective next to a gendered noun
// narrows the answer sharply. Prefer hints that do not inflect.

// Explicit thunks rather than a computed import('./' + code + '.js'), so the
// set of catalogues is greppable and a bundler could follow it if this ever
// gains one.
const CATALOGUES = {
  en: () => import('./en.js'),
  es: () => import('./es.js'),
};

export const DEFAULT_LANG = 'en';

// 'es-ES' and 'es' are the same catalogue. Anything we have no catalogue
// for falls back to English rather than dealing `undefined` as the word.
export function catalogueLang(lang) {
  const base = String(lang || '').trim().toLowerCase().split(/[-_]/)[0];
  return CATALOGUES[base] ? base : DEFAULT_LANG;
}

export const CATALOGUE_LANGS = Object.keys(CATALOGUES);

// Await this once, at module top, before anything can deal a word. The games
// then treat the result as ordinary data, which is why nothing else in them
// had to become async.
//
// The argument is the PAGE's language, and #138 settled that this is also
// the ROOM's language: a player joining a room in another language is sent
// to that language's page first, so the two can never disagree. The earlier
// prediction here, that the call site would have to switch to the room's
// language, turned out to be wrong, and the call site did not change.
export async function loadCatalog(lang) {
  const code = catalogueLang(lang);
  const mod = await CATALOGUES[code]();
  const categories = mod.WORD_CATEGORIES || {};

  // A catalogue with no words in it at all is one that has not been written
  // yet, and dealing from it would hand `undefined` to every player as the
  // secret word. English is a worse experience than Spanish here and a far
  // better one than a broken round. A catalogue that is merely PARTIAL needs
  // no guard: pickWord() already drops ids this build has no words for.
  const empty = Object.keys(categories).every(c => !(categories[c] || []).length);
  if (empty && code !== DEFAULT_LANG) {
    console.warn(`words: the ${code} catalogue is empty, falling back to ${DEFAULT_LANG}`);
    const fallback = await CATALOGUES[DEFAULT_LANG]();
    return { lang: DEFAULT_LANG, categories: fallback.WORD_CATEGORIES, requested: code };
  }

  return { lang: code, categories, requested: code };
}

// The impostor sees ONE of the entry's two hints, chosen fresh each round.
// Locale-independent, so it lives here rather than in each catalogue, and so
// the fallback for a half-written entry lives in one place.
export function pickHint(entry) {
  if (!entry) return '';
  const hints = [entry.h, entry.h2].filter(Boolean);
  if (!hints.length) return '';
  return hints[Math.floor(Math.random() * hints.length)];
}
