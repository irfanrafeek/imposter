// The room's language, and where it sends a player (#138).
//
// The rule this file guards: a room's language decides the whole experience,
// so a player joining a room in another language is moved to that language's
// page rather than being handed a translated shell around content they
// cannot read.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baseLang, langKey, roomLang, redirectFor, joinUrl, pagePaths, pageLang, gamePaths, gamePathFor, DEFAULT_LANG }
  from '../www/shared/lang.js';

// A DOM small enough to answer the questions the module asks of it.
// `games` is data-games: every GAME page in every language, which is a
// different map from `paths` (this page in every language) and answers a
// different question. See #159.
function withPage(htmlLang, paths, pathname = '/word/', games = '') {
  globalThis.document = {
    documentElement: { getAttribute: (a) => (a === 'lang' ? htmlLang : null) },
    getElementById: (id) => (id === 'i18n'
      ? {
        getAttribute: (a) => {
          if (a === 'data-paths') return paths;
          if (a === 'data-games') return games;
          return null;
        },
      }
      : null),
  };
  globalThis.location = { pathname };
}

// What the build actually emits today, so these tests fail if the shape
// of the attribute changes without the parser changing with it.
const GAMES_ATTR = 'dance:en:/dance/ word:en:/word/ word:es:/es/word/ draw:en:/draw/ draw:es:/es/draw/';

test('a regional tag is the same language as its base', () => {
  assert.equal(baseLang('es-ES'), 'es');
  assert.equal(baseLang('en_GB'), 'en');
  assert.equal(baseLang('ES'), 'es');
});

test('an unreadable tag is the default rather than a crash', () => {
  assert.equal(baseLang(''), DEFAULT_LANG);
  assert.equal(baseLang(null), DEFAULT_LANG);
  assert.equal(baseLang(undefined), DEFAULT_LANG);
});

// The analytics key (#140). A counter tree is permanent, so the thing worth
// guarding is not that 'es' comes out as 'es' but that nothing else can get
// in and stay there.
test('a language key is the base code, so regions do not split the counter', () => {
  assert.equal(langKey('es'), 'es');
  assert.equal(langKey('es-ES'), 'es');
  assert.equal(langKey('es-419'), 'es');
  assert.equal(langKey('en-GB'), 'en');
});

test('a key that is not a language code is parked, not written', () => {
  assert.equal(langKey('123'), 'unknown');
  assert.equal(langKey('english'), 'unknown');
  assert.equal(langKey('e'), 'unknown');
});

// A missing tag is English, the same fact baseLang rests on: every page this
// build serves has an html lang, and everything that predates the second
// language was English.
test('a missing tag is the default language, not unknown', () => {
  assert.equal(langKey(''), DEFAULT_LANG);
  assert.equal(langKey(null), DEFAULT_LANG);
});

// THE ONE THAT MAKES THE DEPLOY SAFE. Every room created before #138 has no
// meta.lang, and every one of them is English, because the build had no
// other language. If this ever returned anything else, old rooms would start
// bouncing their players somewhere.
test('a room with no lang is English, which is what old rooms actually are', () => {
  assert.equal(roomLang({}), 'en');
  assert.equal(roomLang({ hostId: 'x', phase: 'lobby' }), 'en');
  assert.equal(roomLang(null), 'en');
  assert.equal(roomLang(undefined), 'en');
});

test('a room states its own language when it has one', () => {
  assert.equal(roomLang({ lang: 'es' }), 'es');
  assert.equal(roomLang({ lang: 'es-ES' }), 'es');
});

test('the page map is read from what the build emitted', () => {
  withPage('en', 'en:/word/ es:/es/word/');
  assert.deepEqual(pagePaths(), { en: '/word/', es: '/es/word/' });
  assert.equal(pageLang(), 'en');
});

test('a malformed map degrades to what it can parse', () => {
  withPage('en', 'en:/word/  broken  :/nolang/ es:/es/word/');
  assert.deepEqual(pagePaths(), { en: '/word/', es: '/es/word/' });
});

test('a page built in one language has nowhere to send anyone', () => {
  withPage('en', 'en:/word/');
  assert.equal(redirectFor({ lang: 'es' }), null, 'no Spanish page exists yet');
  assert.equal(redirectFor({}), null);
});

test('a room in this page\'s own language stays put', () => {
  withPage('en', 'en:/word/ es:/es/word/');
  assert.equal(redirectFor({ lang: 'en' }), null);
  assert.equal(redirectFor({}), null, 'no lang means English, and this is the English page');
});

test('a room in another language is sent to that language\'s page', () => {
  withPage('en', 'en:/word/ es:/es/word/');
  assert.deepEqual(redirectFor({ lang: 'es' }), { lang: 'es', path: '/es/word/' });
});

test('the mirror case: Spanish page, English room', () => {
  withPage('es', 'en:/word/ es:/es/word/', '/es/word/');
  assert.deepEqual(redirectFor({ lang: 'en' }), { lang: 'en', path: '/word/' });
  // An old room with no field is English, so it moves them too.
  assert.deepEqual(redirectFor({}), { lang: 'en', path: '/word/' });
});

// Joining in the wrong interface beats refusing to join. loadCatalog()
// already falls back to English rather than dealing a blank word.
test('a language this build has no page for does not block the join', () => {
  withPage('en', 'en:/word/ es:/es/word/');
  assert.equal(redirectFor({ lang: 'fr' }), null);
});

test('nobody is redirected to the page they are already on', () => {
  // A misconfigured map pointing another language at this very page would
  // otherwise loop forever.
  withPage('en', 'en:/word/ es:/word/');
  assert.equal(redirectFor({ lang: 'es' }), null);
});

// The same build runs on localhost, on the web.app preview and on the live
// domain. An absolute URL here would throw a local tester onto production,
// which would also quietly inflate the live analytics.
test('the join URL is root-relative and never carries a host', () => {
  const url = joinUrl('/es/word/', 'AB12');
  assert.equal(url, '/es/word/?join=AB12');
  assert.ok(!/^https?:/.test(url));
  assert.ok(!url.includes('impostorgames.com'));
});

test('a room code is escaped into the join URL', () => {
  assert.equal(joinUrl('/word/', 'A B'), '/word/?join=A%20B');
});


// ------------------------------------------------------------
// WHERE ANOTHER GAME LIVES, IN THE ROOM'S LANGUAGE (#159)
//
// The cross-game room lookup runs on one game's page and forwards a player
// to another game's page. Before this, the destination was a hardcoded
// English path, so a Spanish room reached the English page and bounced off
// the #138 redirect. Nothing was broken, which is why it lasted.
// ------------------------------------------------------------

test('data-games parses into a game-by-language map', () => {
  withPage('es', 'en:/word/ es:/es/word/', '/es/word/', GAMES_ATTR);
  assert.deepEqual(gamePaths(), {
    dance: { en: '/dance/' },
    word: { en: '/word/', es: '/es/word/' },
    draw: { en: '/draw/', es: '/es/draw/' },
  });
});

test('a Spanish room in a game that HAS a Spanish page goes straight there', () => {
  withPage('es', 'en:/word/ es:/es/word/', '/es/word/', GAMES_ATTR);
  assert.equal(gamePathFor('draw', 'es'), '/es/draw/');
});

test('a Spanish room in a game with NO Spanish page falls back to English', () => {
  withPage('es', 'en:/word/ es:/es/word/', '/es/word/', GAMES_ATTR);
  // Joining in the wrong interface beats refusing to join, the same
  // trade-off redirectFor() makes. Dance has no /es/ page yet.
  assert.equal(gamePathFor('dance', 'es'), '/dance/');
});

test('a regional room tag resolves like its base language', () => {
  withPage('es', 'en:/word/ es:/es/word/', '/es/word/', GAMES_ATTR);
  assert.equal(gamePathFor('draw', 'es-419'), '/es/draw/');
});

test('a game this build never produced is null, not a guessed path', () => {
  withPage('en', 'en:/word/', '/word/', GAMES_ATTR);
  assert.equal(gamePathFor('chess', 'en'), null);
});

test('a missing data-games is an empty map, not a crash', () => {
  withPage('en', 'en:/word/', '/word/');
  assert.deepEqual(gamePaths(), {});
  assert.equal(gamePathFor('draw', 'en'), null);
});

test('a malformed entry is skipped without taking the good ones with it', () => {
  withPage('en', 'en:/word/', '/word/', 'draw:es:/es/draw/ garbage nolang: :es:/x/ word:en:/word/');
  assert.deepEqual(gamePaths(), { draw: { es: '/es/draw/' }, word: { en: '/word/' } });
});
