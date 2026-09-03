// ============================================================
// THE SITEMAP AND THE PAGES HAVE TO AGREE (#139)
//
// hreflang is declared twice: in each page's <head>, which the build
// generates from site.json, and in www/sitemap.xml, which is written by
// hand. Google reads both and quietly drops the pairing when they
// disagree, so the failure is invisible from the outside: no error, no
// warning, the Spanish page simply never gets shown to Spanish readers.
//
// The sitemap also carries URLs the build knows nothing about (the
// long-form guides), which is why it is not generated. That is exactly
// the situation where the two drift, so they are checked against each
// other instead.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSite, pageUrl, outputPath } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = loadSite();
const sitemap = fs.readFileSync(path.join(ROOT, 'www', 'sitemap.xml'), 'utf8');

// <url> blocks, each as { loc, alternates: Map<hreflang, href> }. A regex
// rather than a parser: this file is ours, it is 120 lines, and a parser
// would be a dependency for one test.
function entries(xml) {
  const out = new Map();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const body = m[1];
    const loc = body.match(/<loc>([^<]+)<\/loc>/)[1];
    const alts = new Map();
    for (const a of body.matchAll(/<xhtml:link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/>/g)) {
      alts.set(a[1], a[2]);
    }
    out.set(loc, alts);
  }
  return out;
}

const urls = entries(sitemap);

// Pages that exist in more than one language. These are the only ones that
// should carry an alternate set, in the head and here.
const translated = site.pages.filter((p) => p.locales.length > 1);

test('the sitemap lists every page the build writes', () => {
  for (const page of site.pages) {
    for (const locale of page.locales) {
      const url = pageUrl(site, page, locale);
      assert.ok(urls.has(url), `${url} is built but missing from sitemap.xml`);
    }
  }
});

// The other direction. An internal page is built and deployed but is not
// part of the site, so it must never appear here: a styleguide in the
// sitemap is an invitation to index it, and the noindex tag on the page
// would then be the only thing standing between it and a search result.
// Asserted rather than assumed, because the two lists sit side by side in
// site.json and a page added to the wrong one would otherwise be silent (#201).
test('an internal page is absent from the sitemap', () => {
  for (const page of site.internal || []) {
    for (const locale of page.locales) {
      const url = pageUrl(site, page, locale);
      assert.ok(!urls.has(url), `${url} is internal but listed in sitemap.xml`);
    }
  }
});

test('a translated page carries the same alternate set in the sitemap as in its head', () => {
  for (const page of translated) {
    const expected = new Map(page.locales.map((l) => [site.locales[l].lang, pageUrl(site, page, l)]));
    expected.set('x-default', pageUrl(site, page, site.defaultLocale));

    for (const locale of page.locales) {
      const url = pageUrl(site, page, locale);
      const got = urls.get(url);
      assert.deepEqual(
        Object.fromEntries(got), Object.fromEntries(expected),
        `sitemap alternates for ${url} do not match what the build emits`);

      // The page's own head is the other half of the pair.
      const html = fs.readFileSync(path.join(ROOT, 'www', outputPath(site, page, locale)), 'utf8');
      for (const [lang, href] of expected) {
        assert.ok(
          html.includes(`<link rel="alternate" hreflang="${lang}" href="${href}">`),
          `${outputPath(site, page, locale)} is missing hreflang="${lang}" -> ${href}`);
      }
    }
  }
});

test('an untranslated page claims no alternates anywhere', () => {
  for (const page of site.pages) {
    if (page.locales.length > 1) continue;
    const url = pageUrl(site, page, page.locales[0]);
    assert.equal(urls.get(url).size, 0, `${url} has one language but lists alternates`);
    const html = fs.readFileSync(path.join(ROOT, 'www', outputPath(site, page, page.locales[0])), 'utf8');
    assert.ok(!html.includes('rel="alternate" hreflang'),
      `${url} has one language but its head declares hreflang`);
  }
});

test('every alternate set is reciprocal, itself included', () => {
  for (const [loc, alts] of urls) {
    if (!alts.size) continue;
    assert.ok([...alts.values()].includes(loc), `${loc} does not list itself`);
    for (const href of alts.values()) {
      const other = urls.get(href);
      assert.ok(other, `${loc} points at ${href}, which is not in the sitemap`);
      assert.deepEqual(Object.fromEntries(other), Object.fromEntries(alts),
        `${loc} and ${href} disagree about the alternate set`);
    }
  }
});
