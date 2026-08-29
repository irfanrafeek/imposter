// ============================================================
// A SPANISH PAGE NEVER LINKS TO AN ENGLISH ONE (#158, #159)
//
// Two navigation surfaces used to carry hardcoded English paths, and both
// failed quietly rather than loudly:
//
//   alt-games   read site.games[].href, which is one language's path. The
//               Spanish content files responded by omitting the block
//               entirely, so /es/word/ and /es/draw/ shipped with NO
//               cross-links at all and the `{% if %}` guard made the
//               absence look deliberate.
//
//   roomlookup  forwarded a Spanish room to the English page, where the
//               #138 redirect caught it and sent the player on. Correct
//               in the end, via an English page and an English modal.
//
// Both are now derived from site.json per locale. The point of this file is
// that the derivation is checked against the SHIPPED HTML, not against the
// build's own idea of itself: these bugs were invisible precisely because
// every layer agreed with every other layer.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSite, outputPath, gameHref } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = loadSite();

function html(page, locale) {
  return fs.readFileSync(path.join(ROOT, 'www', outputPath(site, page, locale)), 'utf8');
}
const gamePages = site.pages.filter((p) => site.games[p.id]);
const every = [];
for (const page of site.pages) for (const locale of page.locales) every.push([page, locale]);

// Every path this build produced for a game page, so "is this an English
// URL" is a lookup rather than a guess.
const pathsByLocale = {};
for (const page of gamePages) {
  for (const l of page.locales) (pathsByLocale[l] || (pathsByLocale[l] = [])).push(gameHref(site, page.id, l));
}

test('no page links to a game page in another language', () => {
  for (const [page, locale] of every) {
    const doc = html(page, locale);
    const foreign = Object.entries(pathsByLocale)
      .filter(([l]) => l !== locale)
      .flatMap(([, paths]) => paths);
    for (const p of foreign) {
      // The language switcher and the hreflang block link across languages
      // on purpose; that is their whole job. Everything else must not.
      const links = [...doc.matchAll(new RegExp(`<[^>]*href="${p}"[^>]*>`, 'g'))].map((m) => m[0]);
      const wrong = links.filter((tag) => !/hreflang=|rel="alternate"|rel="canonical"/.test(tag));
      assert.deepEqual(
        wrong, [],
        `${outputPath(site, page, locale)} links to ${p}, which is not ${locale}`,
      );
    }
  }
});

test('every game page carries an alt-games row for each other game it has in this locale', () => {
  for (const page of gamePages) {
    for (const locale of page.locales) {
      const doc = html(page, locale);
      const rows = [...doc.matchAll(/class="alt-game (\w+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
      for (const [id, href] of rows) {
        assert.notEqual(id, page.id, `${outputPath(site, page, locale)} links to itself`);
        assert.equal(href, gameHref(site, id, locale), `wrong href for ${id} on ${outputPath(site, page, locale)}`);
      }
    }
  }
});

// The #152 failure, generalised: a page can ship correct and unreachable.
test('a game page that exists in a locale is reachable from its siblings in that locale', () => {
  for (const locale of Object.keys(site.locales)) {
    const here = gamePages.filter((p) => p.locales.includes(locale));
    if (here.length < 2) continue;
    for (const target of here) {
      const linked = here.some((from) => from !== target
        && html(from, locale).includes(`class="alt-game ${target.id}" href="${gameHref(site, target.id, locale)}"`));
      assert.ok(linked, `${outputPath(site, target, locale)} is not linked from any sibling game page`);
    }
  }
});

// The hub is the other half of that, and the half the test above cannot see:
// `gamePages` excludes it, so a hub could list one game while the build shipped
// three and every assertion here would still pass. That is not hypothetical.
// `/es/` shipped with two cards and one footer link while three Spanish game
// pages existed, and the missing draw footer link had been missing since #152
// without anyone writing it down (#168).
//
// Cards render straight from `c.cards` in the content file; nothing derives
// them from site.json. So this is checked against the shipped HTML, like
// everything else in this file.
test('the hub offers every game built in its locale, in the grid and in the footer', () => {
  const hub = site.pages.find((p) => p.id === 'hub');
  for (const locale of hub.locales) {
    const doc = html(hub, locale);
    // Sliced to the footer, because an FAQ answer links these same paths in
    // prose and would otherwise satisfy the assertion without a footer link
    // existing at all.
    const footer = doc.slice(doc.indexOf('<footer>'), doc.indexOf('</footer>'));
    assert.ok(footer, `${outputPath(site, hub, locale)} has no <footer>`);
    for (const game of gamePages) {
      if (!game.locales.includes(locale)) continue;
      const href = gameHref(site, game.id, locale);
      assert.ok(doc.includes(`class="game-card ${game.id}" href="${href}"`),
        `${outputPath(site, hub, locale)} has no card for ${game.id} (${href})`);
      assert.ok(footer.includes(`href="${href}"`),
        `${outputPath(site, hub, locale)} has no footer link for ${game.id} (${href})`);
    }
  }
});

// data-games is what shared/lang.js parses to route a cross-game join. If it
// disagrees with the pages that were built, a player is forwarded to a URL
// that does not exist, or is denied one that does.
test('data-games lists exactly the game pages the build produced', () => {
  const expected = gamePages
    .flatMap((p) => p.locales.map((l) => `${p.id}:${site.locales[l].lang}:${gameHref(site, p.id, l)}`))
    .sort();
  for (const [page, locale] of every) {
    const doc = html(page, locale);
    const m = doc.match(/data-games="([^"]*)"/);
    assert.ok(m, `${outputPath(site, page, locale)} has no data-games`);
    assert.deepEqual(m[1].split(' ').sort(), expected, `data-games drifted on ${outputPath(site, page, locale)}`);
  }
});
