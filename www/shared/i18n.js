// ============================================================
// SHARED RUNTIME STRINGS
//
// Everything a page says before JavaScript runs is rendered at build
// time from src/content/<lang>/<page>.json (see src/README.md). This
// module covers the rest: the strings app.js writes into the DOM while
// a round is being played.
//
// Those strings ride along in the page as a JSON block:
//
//   <script type="application/json" id="i18n">{ "lobby.…": "…" }</script>
//
// written by src/components/i18n.njk from the SAME content file, so one
// locale still has exactly one place where its words live.
//
// Inline rather than a separate .js per locale on purpose. The strings
// are needed by every player on every visit, so a second request would
// only buy a cache entry in exchange for a round trip on a phone that
// is often on a stranger's wifi. It also keeps working unchanged inside
// the native app, where there is no network at all.
//
// USAGE
//   import { t, plural, list } from '../shared/i18n.js';
//   t('lobby.waiting-for-host')                  → "Waiting for host…"
//   t('join.wrong-game', { game: 'Dance Game' }) → "That code is a …"
//   plural('lobby.need-players', 2)              → "Need 2 more players…"
//   list(['Ann', 'Bob', 'Cara'])                 → "Ann, Bob and Cara"
//
// A key that does not exist is caught by the build (assertI18nKeys in
// scripts/build.mjs walks every t()/plural() call and checks it against
// every locale's bundle), so a typo fails `npm run build` rather than
// surfacing mid-round.
// ============================================================

// {name} only. Deliberately not a general expression syntax: these
// strings are handed to translators, and anything they can write that
// runs is a liability rather than a feature.
const SLOT = /\{(\w+)\}/g;

function fill(template, params) {
  if (!params) return template;
  return template.replace(SLOT, (whole, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole
  ));
}

export function createI18n(bundle, lang) {
  const strings = bundle || {};
  // Both of these throw on a tag they cannot parse, and a page with a
  // broken lang attribute should still deal cards. Fall back to the
  // browser's own locale, then to English.
  const make = (Ctor, opts) => {
    try { return new Ctor(lang, opts); }
    catch (e) { try { return new Ctor(undefined, opts); } catch (e2) { return new Ctor('en', opts); } }
  };
  const rules = make(Intl.PluralRules);
  const conjunction = make(Intl.ListFormat, { style: 'long', type: 'conjunction' });

  // Return the key itself. It is ugly on screen, which is the point:
  // silent empty strings hide the bug, and throwing would take the
  // round down over a label.
  function missing(key, why) {
    console.warn(`i18n: ${why} for "${key}"`);
    return key;
  }

  function t(key, params) {
    const v = strings[key];
    if (v == null) return missing(key, 'no string');
    if (typeof v === 'object') return missing(key, 'plural forms, use plural()');
    return fill(v, params);
  }

  // `count` is always available to the string as {count}, because a
  // plural that cannot show its number is rarely the one you want.
  function plural(key, count, params) {
    const v = strings[key];
    if (v == null) return missing(key, 'no string');
    if (typeof v !== 'object') return missing(key, 'single form, use t()');
    const form = v[rules.select(count)] ?? v.other;
    if (form == null) return missing(key, `no "${rules.select(count)}" form`);
    return fill(form, { count, ...params });
  }

  // "Ann", "Ann and Bob", "Ann, Bob and Cara" — and in Spanish the
  // "y"/"e" alternation before an i- sound, which is exactly the sort
  // of rule not worth hand-writing.
  function list(items) {
    const clean = (items || []).filter(Boolean).map(String);
    if (clean.length <= 1) return clean[0] || '';
    try { return conjunction.format(clean); }
    catch (e) { return clean.join(', '); }
  }

  return { t, plural, list, lang, has: (key) => strings[key] != null };
}

// The page's own bundle. Read once at import time; the block is inert
// JSON in the markup, so it is parsed here and nowhere else.
function fromDocument() {
  let bundle = {};
  let lang = 'en';
  // Guarded so scripts/build.test.mjs can import createI18n under Node,
  // where there is no document at all.
  if (typeof document === 'undefined') return createI18n(bundle, lang);
  try {
    const el = document.getElementById('i18n');
    if (el) bundle = JSON.parse(el.textContent || '{}');
    // data-lang first, and NOT the html lang, which is only a fallback.
    // The two are deliberately different: the site's English copy is
    // British while the html lang is a bare "en", and a bare "en" hands
    // Intl.ListFormat en-US, which writes "Ann, Bob, and Cara". The
    // build stamps the formatting tag onto the block for this reason.
    lang = (el && el.getAttribute('data-lang') || '').trim()
        || (document.documentElement.getAttribute('lang') || '').trim()
        || 'en';
  } catch (e) {
    console.warn('i18n: could not read the page bundle', e);
  }
  return createI18n(bundle, lang);
}

const page = fromDocument();

export const lang = page.lang;
export const t = page.t;
export const plural = page.plural;
export const list = page.list;
// For strings whose key is built at runtime rather than written out, where
// a missing one is a legitimate state rather than a bug. The category ids
// are the case: a room created in another language carries ids this build
// has no names for, and showing the raw id beats showing nothing (#135).
export const has = page.has;
