// Do the locales of one page describe the same page?
//
//   node --test scripts/
//
// The build throws on a missing content FILE and assertI18nKeys covers the
// `runtime` block. Everything else in a content file (head, howto, faq,
// screens, jsonldGraph, altGames) had no check at all, so a key added to
// src/content/en/word.json and forgotten in es/word.json rendered as
// NOTHING on the Spanish page. No error, no warning, no failing test. Just
// a missing sentence, in a language most of the team does not read.
//
// PARITY IS NOT THE GOAL, so this test cannot simply demand equality.
// Real, deliberate gaps exist and more will arrive: Spanish has no guide
// pages to link to, and the dance game offers a different set of song
// categories per language (#165). Demanding equality would mean deleting
// those decisions or muting the test, and a muted test is worse than none.
//
// So the test encodes EXPECTED_GAPS, each with a written reason. The value
// of this file is not the assertion; it is that the next person can tell a
// deliberate gap from a forgotten one without going back through the git
// history to find out. Silence is the bug, not asymmetry.
//
// Arrays collapse to `[]` rather than being indexed, so `faq.visible[].q`
// is one path however many questions a language asks. That is on purpose:
// the FAQ's core set is shared and its search questions deliberately do
// NOT match across languages (see src/README.md), so a length comparison
// would fail on the very thing the FAQ rule asks for. A field missing from
// one entry is still caught, because every entry contributes its keys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSite } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src', 'content');
const site = loadSite();
const DEFAULT_LOCALE = site.defaultLocale;

// 'shared' is a content file without being a page, so it is named rather
// than derived. The rest come from the site, so a new page is covered the
// day it is registered.
const FILES = ['shared', ...site.pages.map((p) => p.id)];

// Locales come from the directory, not from site.json. A locale is
// registered there before its content is written, which is what lets a
// page join `locales` one file at a time, so reading the registry would
// fail this test for the whole of a language's build-out.
const LOCALES = fs.readdirSync(CONTENT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((l) => l !== DEFAULT_LOCALE)
  .sort();

// A key whose last segment starts with // or _ is a note to a human. They
// are not content, they are not rendered, and asking a translator to carry
// one across would be asking for a comment nobody reads twice.
const isComment = (p) => p.split('.').some((seg) => seg.startsWith('//') || seg.startsWith('_'));

function keyPaths(node, prefix = '') {
  const out = new Set();
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.add(p);
      for (const sub of keyPaths(v, p)) out.add(sub);
    }
  } else if (Array.isArray(node)) {
    const p = `${prefix}[]`;
    if (node.length) out.add(p);
    for (const e of node) for (const sub of keyPaths(e, p)) out.add(sub);
  }
  return out;
}

// Every gap that is allowed to exist, and why. `only` names the locale the
// key is expected to live in; anywhere else is still a failure.
//
// Adding an entry here is a decision, not a way to get a red run green.
// The second test below fails if an entry stops describing a real gap, so
// a fixed gap has to be deleted from this list rather than left to rot.
const EXPECTED_GAPS = [
  {
    file: 'hub',
    only: DEFAULT_LOCALE,
    match: /^guides(\.|\[|$)/,
    reason:
      'The hub links /party-games/ and /games-like-among-us/, which exist in English only. '
      + 'Translating the block would mean linking a reader to a page they cannot read. '
      + 'Delete this entry the day a translated guide page ships.',
  },
  {
    file: 'hub',
    only: DEFAULT_LOCALE,
    match: /^jsonldGraph\[\]\.publisher(\.|\[|$)/,
    reason:
      'NOT a deliberate gap. This is open bug #175: the hub declares an inline publisher in '
      + 'English and nothing in Spanish, so a site-level claim differs by language when it '
      + 'describes one site. Excepted only so this test can ship ahead of the fix. '
      + 'Delete this entry when #175 closes.',
  },
  {
    file: ['word', 'draw', 'dance'],
    only: DEFAULT_LOCALE,
    match: /^moreReading(\.|\[|$)/,
    reason:
      'Same reason as the hub guides block: the two long-form pages it links exist in '
      + 'English only.',
  },
  {
    file: 'dance',
    match: /^runtime\.(category\.|cat\.group\.)/,
    reason:
      'Song categories are per language since #165. English offers eleven pools and Spanish '
      + 'four, so each locale carries names and descriptions for the pools its OWN picker '
      + 'offers and no others. A locale carrying another language\'s category strings would '
      + 'be the bug. Word and draw are deliberately not excepted here: they share one '
      + 'catalogue, so all seven of their category pairs must exist in every locale.',
  },
];

const gapFor = (file, key) => EXPECTED_GAPS.find((g) => {
  const files = Array.isArray(g.file) ? g.file : [g.file];
  return files.includes(file) && g.match.test(key);
});

const read = (locale, file) => {
  const p = path.join(CONTENT, locale, `${file}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const pathsFor = (locale, file) => {
  const doc = read(locale, file);
  return doc === null ? null : new Set([...keyPaths(doc)].filter((p) => !isComment(p)));
};

test('every content file carries the same keys in every locale', () => {
  for (const file of FILES) {
    const base = pathsFor(DEFAULT_LOCALE, file);
    assert.ok(base, `src/content/${DEFAULT_LOCALE}/${file}.json is missing`);
    for (const locale of LOCALES) {
      const theirs = pathsFor(locale, file);
      // A locale part-way through being written has no file yet, which is a
      // normal state during a launch. The build is what refuses to ship a
      // page whose content is missing; this test is about what is IN one.
      if (!theirs) continue;

      for (const key of base) {
        if (theirs.has(key)) continue;
        const gap = gapFor(file, key);
        // `only` names the one locale a key is allowed to live in. An entry
        // with no `only` is a set that differs freely by locale, which is
        // what the dance categories are, so both directions are allowed.
        assert.ok(
          gap && (gap.only === undefined || gap.only === DEFAULT_LOCALE),
          `${locale}/${file}.json is missing "${key}", which ${DEFAULT_LOCALE} has. `
          + 'It will render as nothing on that page. If the gap is deliberate, add it to '
          + 'EXPECTED_GAPS in scripts/content-parity.test.mjs with a reason.',
        );
      }
      for (const key of theirs) {
        if (base.has(key)) continue;
        const gap = gapFor(file, key);
        assert.ok(
          gap && gap.only === undefined,
          `${locale}/${file}.json has "${key}", which ${DEFAULT_LOCALE} does not. `
          + 'Either it is a key nothing renders, or the default locale is the one missing it. '
          + 'If the gap is deliberate, add it to EXPECTED_GAPS with a reason.',
        );
      }
    }
  }
});

test('every declared gap still describes a real gap', () => {
  // Without this, the list only ever grows. An exception that outlives the
  // decision behind it turns into permission for the next real bug that
  // happens to match its pattern, which is exactly how #175 would hide a
  // second missing site-level node.
  for (const gap of EXPECTED_GAPS) {
    const files = Array.isArray(gap.file) ? gap.file : [gap.file];
    const used = files.some((file) => {
      const base = pathsFor(DEFAULT_LOCALE, file);
      if (!base) return false;
      return LOCALES.some((locale) => {
        const theirs = pathsFor(locale, file);
        if (!theirs) return false;
        const missing = [...base].some((k) => !theirs.has(k) && gap.match.test(k));
        const extra = [...theirs].some((k) => !base.has(k) && gap.match.test(k));
        return missing || extra;
      });
    });
    assert.ok(
      used,
      `EXPECTED_GAPS entry for ${files.join(', ')} matching ${gap.match} no longer matches any `
      + 'real difference. The gap it described has been closed, so delete the entry.',
    );
  }
});

test('a comment key is never treated as content', () => {
  // //runtime in en/draw.json is the live example. If this stops holding,
  // the parity test starts demanding that translators carry notes across.
  assert.ok(isComment('//runtime'));
  assert.ok(isComment('_note'));
  assert.ok(isComment('head.//titleNote'));
  assert.ok(!isComment('runtime'));
  assert.ok(!isComment('faq.visible[].q'));
});
