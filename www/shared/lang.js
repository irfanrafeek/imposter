// ============================================================
// WHAT LANGUAGE THIS ROOM IS IN
// ============================================================
// The room's language decides the WHOLE experience: the words dealt and the
// interface around them. A player joining a room in another language is sent
// to that language's page rather than being given a translated shell around
// content they cannot read (#138).
//
// The alternative, letting the room pick the words while the page picks the
// buttons, was rejected. Everyone in a room must share one secret word, so
// that design gave a Spanish player English content behind Spanish buttons
// and still no way to actually play in Spanish.
//
// Because of that rule, PAGE LANGUAGE ALWAYS EQUALS ROOM LANGUAGE once a
// player is in a room. That is why the games can keep loading their word
// catalogue from the page language at module top, with no await on the room.
//
// NOTHING HERE IS SPANISH-SPECIFIC. The set of languages comes from the
// build, via data-paths on the i18n block, which is generated from
// `page.locales` in site.json. Adding a language is a build change, not a
// change here.

export const DEFAULT_LANG = 'en';

// 'es-ES' and 'es' are one language. Anything unparseable is the default.
export function baseLang(tag) {
  const base = String(tag || '').trim().toLowerCase().split(/[-_]/)[0];
  return base || DEFAULT_LANG;
}

// A language KEY, for anywhere a tag becomes part of a permanent record:
// analytics/<game>/games/langs/<lang> today (#140). The tag comes from the
// page's own html lang, so this is belt and braces rather than untrusted
// input, but a counter tree is forever and one malformed key sits in it for
// good. 'es-ES' and 'es-419' both fold to 'es', because a regional catalogue
// would be a different catalogue rather than a different counter.
export function langKey(tag) {
  const base = baseLang(tag);
  return /^[a-z]{2,3}$/.test(base) ? base : 'unknown';
}

// The language of the page this code is running on. `html lang` is already
// the base code ('en', 'es'); the i18n block's data-lang is the Intl tag
// ('en-GB') and is deliberately not used here.
export function pageLang() {
  if (typeof document === 'undefined') return DEFAULT_LANG;
  return baseLang(document.documentElement.getAttribute('lang'));
}

// { lang: path } for every language THIS page was built in. One entry means
// there is nowhere else to send anyone, so no redirect can fire.
export function pagePaths() {
  const out = {};
  if (typeof document === 'undefined') return out;
  const el = document.getElementById('i18n');
  const raw = (el && el.getAttribute('data-paths')) || '';
  for (const pair of raw.split(/\s+/)) {
    if (!pair) continue;
    const i = pair.indexOf(':');
    if (i < 1) continue;
    const lang = baseLang(pair.slice(0, i));
    const path = pair.slice(i + 1);
    if (path) out[lang] = path;
  }
  return out;
}

// The language a room is played in.
//
// A room with no `meta.lang` is English, and that is a fact rather than a
// guess: the field did not exist before #138, and every room created before
// it was created from an English-only build. This is what makes the deploy
// safe while old and new clients are both live.
export function roomLang(meta) {
  return baseLang((meta && meta.lang) || DEFAULT_LANG);
}

// Where to send a player whose room is in another language, or null if they
// are already in the right place. Null is also the answer when this build
// has no page in the room's language: joining in the wrong interface beats
// refusing to join, and loadCatalog() already falls back rather than dealing
// a blank word.
export function redirectFor(meta) {
  const room = roomLang(meta);
  if (room === pageLang()) return null;
  const path = pagePaths()[room];
  if (!path) return null;
  // Never send anyone to the page they are already on. With a correct map
  // this cannot happen, since each language has its own path; the guard is
  // here because the failure mode of a wrong map is an infinite redirect
  // loop, and that is too expensive to leave to trust.
  if (typeof location !== 'undefined' && path === location.pathname) return null;
  return { lang: room, path };
}

// Root-relative on purpose. The same build runs on localhost, on the
// web.app preview and on the live domain, and an absolute URL here would
// throw a local tester onto production.
export function joinUrl(path, code) {
  return `${path}?join=${encodeURIComponent(code)}`;
}
