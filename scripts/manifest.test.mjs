// ============================================================
// EVERY PAGE'S MANIFEST HAS TO EXIST, AND HAS TO BE ITS OWN (#167)
//
// The manifest is the one per-locale asset the build LINKS but does not
// WRITE. `manifestHref` in build.mjs is assembled from the locale's
// directory, so the moment a page gains a language the head confidently
// points at /es/<game>/manifest.webmanifest whether or not anybody created
// that file. Nothing fails: the page renders, the tests pass, and the only
// symptom is that installing to the home screen from the Spanish page opens
// the English one, or silently does nothing.
//
// The second half is the copy-paste case, which is how these files actually
// get written. A manifest cloned from a sibling and left with the sibling's
// `scope` installs an app that navigates out of its own scope on first tap.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSite, outputPath } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = loadSite();

// Every built page, as { rel, locale, href } where href is what its head
// actually asks the browser for.
const linked = site.pages.flatMap((page) =>
  page.locales.map((locale) => {
    const rel = outputPath(site, page, locale);
    const html = fs.readFileSync(path.join(ROOT, 'www', rel), 'utf8');
    const m = html.match(/<link rel="manifest" href="([^"]+)">/);
    return { rel, page, locale, href: m && m[1] };
  }));

test('every page links a manifest', () => {
  for (const { rel, href } of linked) {
    assert.ok(href, `${rel} has no <link rel="manifest">`);
  }
});

test('every linked manifest is a file that exists', () => {
  for (const { rel, href } of linked) {
    const file = path.join(ROOT, 'www', href.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `${rel} links ${href}, which is not in www/`);
  }
});

test('a manifest scopes itself to the page that links it, not to a sibling', () => {
  for (const { rel, locale, href } of linked) {
    const file = path.join(ROOT, 'www', href.replace(/^\//, ''));
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    // The directory the manifest sits in is the app it describes. Sliced
    // rather than dirname'd so the root comes out as '/' and not ''.
    const dir = href.slice(0, href.lastIndexOf('/') + 1);
    for (const key of ['id', 'start_url', 'scope']) {
      assert.equal(m[key], dir, `${href} ${key} is ${m[key]}, but it is linked from ${rel}`);
    }
    // `lang` is what tells an installed app which language it is. The
    // default locale leaves it off, which is the shape the English
    // manifests already ship in and is not worth churning them for.
    if (locale !== site.defaultLocale) {
      assert.equal(m.lang, site.locales[locale].lang,
        `${href} is the ${locale} manifest but declares lang ${m.lang}`);
    }
  }
});
