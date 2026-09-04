#!/usr/bin/env node
// ============================================================
// BUILD — compiles src/ into the static pages Firebase serves.
//
//   node scripts/build.mjs           write pages into www/
//   node scripts/build.mjs --check   render and compare, write nothing
//   node scripts/build.mjs --watch   rebuild when src/ changes
//
// WHY THIS EXISTS (#129)
// Every page used to be hand-written, so the topbar, the How to Play
// block, the FAQ and the head lived in four copies and had to be
// edited four times to change once. Adding Spanish would have made
// that eight. Here a page is a template plus a content file, and a
// language is a content file.
//
// The output is plain static HTML, committed to the repo. Nothing is
// bundled, minified or fetched at runtime: the FAQ prose and the
// JSON-LD have to be in the served bytes, because this site lives on
// search traffic.
//
// --check is the safety net for the migration. Moving an existing
// page onto a template must not change what it serves, and "I looked
// at it and it seemed fine" is not good enough for four pages of
// meta tags and two blocks of structured data.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import * as parse5 from 'parse5';
// The SAME kit the browser runs (www/shared/i18n.js). A string
// rendered into the page at build time and the same string written
// by app.js at runtime therefore cannot interpolate differently.
import { createI18n } from '../www/shared/i18n.js';
// The category IDS. Words are the same list in every locale, so the English
// catalogue is the reference; songs are NOT, since each language offers its
// own list (#165), so those come per locale.
import { WORD_CATEGORIES } from '../www/shared/words/en.js';
import { songCategoryIds, songCategoryGroupKeys } from '../www/dance/categories.js';
// Parses the CATEGORIES literal out of www/dance/app.js and cross-checks it
// against the declared ids. Imported for that assertion alone (#165).
import { readCategories } from './song-pools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'www');

// ------------------------------------------------------------
// MANIFEST
// ------------------------------------------------------------

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function loadSite() {
  return readJson(path.join(SRC, 'site.json'));
}

// Content is per page per locale. A page declares which locales it
// exists in, so /es/ can launch with only the word game while the
// English hub still lists three.
function loadContent(pageId, locale, { optional = false } = {}) {
  const p = path.join(SRC, 'content', locale, `${pageId}.json`);
  if (!fs.existsSync(p)) {
    // An internal page is allowed to have none. Its copy is a handful of
    // section headings on a page nobody translates, and routing those
    // through a content file would be ceremony with no reader (#201).
    if (optional) return {};
    throw new Error(`missing content: src/content/${locale}/${pageId}.json`);
  }
  return readJson(p);
}

// Runtime strings for the modules under www/shared/, which every page
// loads. Merged into each page's bundle rather than served separately,
// for the reasons in www/shared/i18n.js.
function loadSharedRuntime(locale) {
  const p = path.join(SRC, 'content', locale, 'shared.json');
  if (!fs.existsSync(p)) throw new Error(`missing content: src/content/${locale}/shared.json`);
  return readJson(p).runtime || {};
}

// Where a page lands, and the URL it will be served from.
export function outputPath(site, page, locale) {
  return path.posix.join(site.locales[locale].dir, page.out);
}
export function pageUrl(site, page, locale) {
  const rel = outputPath(site, page, locale).replace(/index\.html$/, '');
  return `${site.baseUrl}/${rel}`;
}

// ------------------------------------------------------------
// DESIGN TOKENS, READ BACK OUT OF THE STYLESHEET
// ------------------------------------------------------------
// The component gallery shows every token as a swatch with its value.
// Reading them out of shared/tokens.css rather than restating them
// means a token added there appears in the gallery with no second
// edit, and a value changed there shows up as a diff in the generated
// page, which is the drift #128 was written to stop being invisible.
//
// Group headings come from the short single-line comments in that
// file (Surfaces, Text, ...). A long or multi-line comment is prose
// about one token, not a heading, so only short ones count (#201).
export function readTokens(rel) {
  const css = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // The brace matters: tokens.css's own header comment contains the words
  // ":root block", and slicing from a bare indexOf would start the scan
  // inside that comment and read its worked example as a real token.
  const at = css.search(/:root\s*\{/);
  if (at < 0) throw new Error(`${rel}: no :root block found`);
  const root = css.slice(at, css.indexOf('}', at));
  const groups = [];
  let group = null;
  const token = /\/\*([\s\S]*?)\*\/|--([a-z-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = token.exec(root))) {
    if (m[1] != null) {
      const text = m[1].trim();
      // A heading sits on its own line. The test matters: page.css closes
      // --measure with a trailing note about its width, and without this
      // that note becomes a heading and splits the set in two.
      const ownLine = /(^|\n)[ \t]*$/.test(root.slice(0, m.index));
      if (ownLine && !text.includes('\n') && text.length <= 40) {
        group = { name: text, tokens: [] };
        groups.push(group);
      }
      continue;
    }
    if (!group) { group = { name: 'Tokens', tokens: [] }; groups.push(group); }
    group.tokens.push({ name: `--${m[2]}`, value: m[3].trim() });
  }
  return groups.filter((g) => g.tokens.length);
}

// Every :root on the site, in one place, which is the only way the local
// ones are visible at all. The shared file is the system; the other three
// are what individual surfaces add or override on top of it, and the hub's
// single line is the drift #128 was written to stop hiding.
//
// Sources are read where they are AUTHORED, so the hub comes from its
// template rather than from the page the build writes: reading generated
// output back in as build input would make the gallery a copy of a copy.
const TOKEN_SETS = [
  {
    file: 'www/shared/tokens.css',
    note: 'The system. Every page links this before anything else, and a page that does not renders with every var() invalid.',
  },
  {
    file: 'www/shared/page.css',
    note: 'The long-form content pages only, which are set as prose rather than as an interface. Page-only roles, so they stay here. --step-body and --step-lead drop a size below 600px.',
  },
  {
    file: 'src/pages/hub.njk',
    note: 'One deliberate override, against the shared 26px. Reconciling it changes how the game cards look, which is a visual decision rather than a plumbing one. Filed as #142.',
  },
  {
    file: 'www/admin.html',
    note: 'Two chart hues. They separate series in a graph, which is a dashboard job and not a site-wide role.',
  },
];

export function readTokenSets() {
  const sets = TOKEN_SETS.map((set) => ({ ...set, groups: readTokens(set.file) }));
  // A local token that reuses a shared name is an override, and saying so
  // beside it is the whole point of listing the four sets together: the
  // hub's line reads as an ordinary declaration until you know there is a
  // different value under it.
  const shared = new Map();
  for (const g of sets[0].groups) for (const t of g.tokens) shared.set(t.name, t.value);
  for (const set of sets.slice(1)) {
    for (const g of set.groups) {
      for (const t of g.tokens) t.overrides = shared.get(t.name) || null;
    }
  }
  return sets;
}

// ------------------------------------------------------------
// RENDER
// ------------------------------------------------------------

export function makeEnv() {
  const env = nunjucks.configure(SRC, {
    autoescape: true,
    trimBlocks: true,
    lstripBlocks: true,
    // A missing string is a bug, not an empty space. Without this a
    // typo'd key renders the literal "undefined" into a shipped page,
    // and with two languages that is a matter of when, not if.
    throwOnUndefined: true,
  });
  env.addFilter('dedent', dedent);
  return env;
}

// Strips the common leading indent off a captured block, so the component
// gallery can print a specimen's own markup beside it without the template's
// indentation riding along (#201). Nowhere else needs it: this is the only
// place that renders a block twice, once live and once as text.
function dedent(value) {
  const text = String(value).replace(/^\n+/, '').replace(/\s+$/, '');
  const lines = text.split('\n');
  const widths = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const cut = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

// JSON for a <script> block. The parser ends the block at the first
// literal </script>, wherever it appears, so a string containing one
// would spill the rest of the bundle into the page as markup. Escaping
// every < rules that out for good rather than trusting that no
// translator ever writes one. JSON.parse reads < back as <.
function jsonForScriptTag(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// One string table per page per locale: the shared modules' strings plus
// this page's own. Templates read it through t()/plural(); the browser
// reads the same JSON back out of the page. Exported because the build
// checks it against the keys the JavaScript actually calls.
export function bundleFor(site, page, locale, content) {
  const c = content || loadContent(page.id, locale, { optional: !!page.internal });
  return { ...loadSharedRuntime(locale), ...(c.runtime || {}) };
}

// The href for a game, in a given locale. Deliberately DERIVED rather than
// stored: every game id is also a page id, and `page.locales` already knows
// which languages that page exists in. Storing an href in site.games means
// storing an English path and being right only by luck, which is what
// shipped /es/word/ and /es/draw/ with no cross-links at all rather than
// with wrong ones (#158). Null means this game has no page in this locale.
export function gameHref(site, gameId, locale) {
  const owner = site.pages.find((p) => p.id === gameId);
  if (!owner || !owner.locales.includes(locale)) return null;
  return '/' + outputPath(site, owner, locale).replace(/index\.html$/, '');
}

// The "more games" rows at the foot of a game page, resolved for this locale.
//
// A game with no page in this locale is DROPPED, never linked to its English
// page: sending a Spanish reader to an English page is worse than not
// offering the row. Dropping also means a new locale's page appears here on
// its own the day it exists, with no second edit.
//
// Two different kinds of empty, kept apart on purpose:
//   - content file has no altGames at all  -> throw. Every game page owes
//     this block, and the silent `{% if %}` skip is precisely how the
//     Spanish pages lost their cross-links without anyone noticing.
//   - every listed game dropped for this locale -> null, and the template
//     skips the heading too. Legitimate for a language with one game.
function resolveAltGames(site, page, content, locale) {
  const block = content.altGames;
  if (!block) {
    if (site.games[page.id]) {
      throw new Error(
        `missing altGames: src/content/${locale}/${page.id}.json. Every game `
        + 'page declares the other games it links to; the build drops the ones '
        + 'this locale does not have.'
      );
    }
    return null;
  }
  const games = block.games.map((g) => {
    const meta = site.games[g.id];
    if (!meta) throw new Error(`unknown game id "${g.id}" in src/content/${locale}/${page.id}.json`);
    const href = gameHref(site, g.id, locale);
    return href ? { ...g, ...meta, href } : null;
  }).filter(Boolean);
  return games.length ? { ...block, games } : null;
}

export function renderPage(env, site, page, locale) {
  const content = loadContent(page.id, locale, { optional: !!page.internal });
  // Every locale this page exists in, for the hreflang block and the
  // language switcher. Built here so no template has to know the map.
  const alternates = page.locales.map((l) => ({
    locale: l,
    lang: site.locales[l].lang,
    label: site.locales[l].label,
    url: pageUrl(site, page, l),
    // Root-relative, for anything that navigates. hreflang wants the
    // absolute `url`, but a redirect must not carry the host: the same
    // build runs on localhost, on the web.app preview and on the live
    // domain, and an absolute URL would throw a local tester onto
    // production. See #138.
    path: '/' + outputPath(site, page, l).replace(/index\.html$/, ''),
    current: l === locale,
  }));
  // Every game's page in every language it was built in, flat, for the
  // cross-game room lookup. That lookup runs on a page in one language and
  // may need to forward a player to a DIFFERENT game in a DIFFERENT
  // language, so `alternates` (this page only) cannot answer it. Same
  // principle as data-paths: the client is told what the build actually
  // produced instead of assembling a URL out of assumptions (#159).
  const gameLinks = Object.keys(site.games).flatMap((id) => {
    const owner = site.pages.find((p) => p.id === id);
    if (!owner) throw new Error(`site.games has "${id}" but no page owns it`);
    return owner.locales.map((l) => ({ game: id, lang: site.locales[l].lang, path: gameHref(site, id, l) }));
  });
  const otherGames = resolveAltGames(site, page, content, locale);
  const bundle = bundleFor(site, page, locale, content);
  const i18n = createI18n(bundle, site.locales[locale].intl || site.locales[locale].lang);
  return env.render(page.template, {
    site,
    page,
    i18nBundle: jsonForScriptTag(bundle),
    t: i18n.t,
    plural: i18n.plural,
    locale: { key: locale, ...site.locales[locale] },
    url: pageUrl(site, page, locale),
    alternates,
    defaultUrl: pageUrl(site, page, site.defaultLocale),
    // This language's hub, root-relative. Two templates link "up" to it
    // and both have to stay inside the language the reader is already in:
    // /es/word/ goes back to /es/, not to the English hub. Root-relative
    // for the same reason as `path` above.
    otherGames,
    gameLinks,
    home: '/' + site.locales[locale].dir,
    // Only the component gallery reads this, and only it should: every
    // other page consumes tokens through var(), not as data (#201).
    tokenSets: page.internal ? readTokenSets() : null,
    // The web app manifest sits beside the page it belongs to, so it moves
    // with the language: /es/word/ must not hand a Spanish player a manifest
    // whose start_url is the English game, which is what installing to the
    // home screen would otherwise give them. The default locale's dir is ''
    // so its href is unchanged (#139).
    // Null on an internal page, which installs to nobody's home screen.
    manifestHref: page.head.manifest
      ? '/' + site.locales[locale].dir + page.head.manifest.slice(1)
      : null,
    c: content,
  });
}

// ------------------------------------------------------------
// CANONICAL FORM — what "the same page" means
//
// Chasing byte-identical whitespace out of a template engine costs
// more than it proves, so the comparison runs on a canonical form
// instead. Two rules, both deliberately conservative:
//
//   - Runs of whitespace in text collapse to ONE space, never to
//     nothing. Indentation stops mattering; the presence or absence
//     of a space between two inline tags still does, because
//     <span>a</span><span>b</span> does not render like
//     <span>a</span> <span>b</span>.
//   - Attributes sort by name, so reordering them is not a diff.
//
// JSON-LD gets parsed and re-serialised with sorted keys, so the
// structured data is compared as data rather than as formatting.
// Script and style bodies are otherwise left exactly alone.
// ------------------------------------------------------------

const RAW_TEXT = new Set(['script', 'style', 'pre', 'textarea']);

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedJson(value[k])]));
  }
  return value;
}

function isLdJson(node) {
  return node.tagName === 'script'
    && (node.attrs || []).some((a) => a.name === 'type' && a.value.trim() === 'application/ld+json');
}

export function canonical(html, { dropComments = false } = {}) {
  const doc = parse5.parse(html);

  const walk = (node) => {
    if (node.attrs) node.attrs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    if (isLdJson(node)) {
      const text = (node.childNodes || []).find((n) => n.nodeName === '#text');
      if (text) {
        try {
          text.value = JSON.stringify(sortedJson(JSON.parse(text.value)), null, 1);
        } catch {
          // Invalid JSON is itself worth failing on, so leave it as-is
          // and let the string comparison surface it.
        }
      }
      return;
    }

    for (const child of [...(node.childNodes || [])]) {
      if (child.nodeName === '#comment') {
        if (dropComments) {
          node.childNodes.splice(node.childNodes.indexOf(child), 1);
        } else {
          child.data = child.data.replace(/\s+/g, ' ');
        }
        continue;
      }
      if (child.nodeName === '#text') {
        if (!RAW_TEXT.has(node.tagName)) child.value = child.value.replace(/\s+/g, ' ');
        continue;
      }
      walk(child);
    }
  };

  walk(doc);
  return parse5.serialize(doc);
}

// First point of difference, with context, because a 50KB one-line
// string tells you nothing on its own.
export function describeDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 60);
  const line = a.slice(0, i).split('\n').length;
  return [
    `  first difference at character ${i} (line ${line})`,
    `    committed: ...${JSON.stringify(a.slice(from, i + 90)).slice(1, -1)}`,
    `    generated: ...${JSON.stringify(b.slice(from, i + 90)).slice(1, -1)}`,
  ].join('\n');
}

// ------------------------------------------------------------
// COMMANDS
// ------------------------------------------------------------

// Every t('…') and plural('…') in the JavaScript this page loads has to
// resolve in this page's bundle. Without it a renamed key is invisible
// until somebody hits that screen mid-round, in a language nobody on
// the team reads. A build failure is a much cheaper place to find out.
//
// Deliberately a text scan rather than a parse: the check has to be
// blunt enough that nobody is tempted to route a key through a variable
// to keep it quiet.
const KEY_CALL = /\b(?:t|plural)\(\s*'([^']+)'/g;

// Comments are not calls. i18n.js documents its own API with worked
// examples, and a commented-out line should not hold a key hostage.
// Only whole-line // comments and /* */ blocks go: a trailing comment
// containing a t('…') call would be a false positive, which is a
// one-line fix, where mangling string literals would be a false
// negative, which is the failure this check exists to prevent.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function keysUsedIn(source) {
  const keys = new Set();
  let m;
  const code = stripComments(source);
  KEY_CALL.lastIndex = 0;
  while ((m = KEY_CALL.exec(code))) keys.add(m[1]);
  return keys;
}

function scriptsFor(page, html) {
  const files = [];
  const dir = path.dirname(path.join(OUT, page.out));
  for (const f of fs.readdirSync(path.join(OUT, 'shared'))) {
    if (f.endsWith('.js')) files.push(path.join(OUT, 'shared', f));
  }
  const app = path.join(dir, 'app.js');
  if (fs.existsSync(app)) files.push(app);
  const sources = files.map((f) => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')]);
  // Pages that carry their own module script (the hub) rather than a file.
  for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
    sources.push([`${page.out} (inline)`, m[1]]);
  }
  return sources;
}

// A category id is a value, not a label: it goes on the wire, into the
// played ledger and into the counters, so it stays English in every
// language and only its two display strings move. That makes a missing
// one invisible at runtime -- catName() falls back to the raw id, which
// reads as correct in English and as a bug in Spanish. So it is checked
// here instead (#135).
//
// Two catalogues, because the games do not share one. Word and draw deal
// words and take their ids from WORD_CATEGORIES; dance deals songs and takes
// its ids from the song category module (#160). `page.categories` names which,
// so a page opts in by saying what it offers rather than by a bare boolean
// that silently meant "words".
//
// Group headings are checked here too. They are rendered as t(group.labelKey),
// and a key held in a variable is invisible to the scanner below by design.
//
// Both sides take the locale, because since #165 the answer depends on it:
// the Spanish dance picker offers four ids under one heading where the
// English one offers eleven under two. Asking for the wrong locale's list
// would demand strings a bundle has no reason to carry, and, worse, would
// pass a bundle that is missing the ones it actually needs.
const CATEGORY_SOURCES = {
  words: {
    ids: () => Object.keys(WORD_CATEGORIES),
    groups: () => [],
    label: () => 'WORD_CATEGORIES',
  },
  songs: {
    ids: (locale) => songCategoryIds(locale),
    groups: (locale) => songCategoryGroupKeys(locale),
    label: (locale) => `songCategoryIds('${locale}')`,
  },
};

function assertCategoryStrings(rel, page, locale, bundle) {
  if (!page.categories) return;
  const source = CATEGORY_SOURCES[page.categories];
  if (!source) {
    throw new Error(
      `src/site.json: page "${page.id}" has categories: ${JSON.stringify(page.categories)}, `
      + `which is not one of ${Object.keys(CATEGORY_SOURCES).join(', ')}.`);
  }
  const missing = [];
  for (const id of source.ids(locale)) {
    for (const part of ['name', 'desc']) {
      const key = `category.${id}.${part}`;
      if (bundle[key] == null) missing.push(key);
    }
  }
  for (const key of source.groups(locale)) {
    if (bundle[key] == null) missing.push(key);
  }
  if (!missing.length) return;
  throw new Error(
    `${rel}: ${missing.length} category string(s) missing from the ${locale} `
    + `bundle. Every id in ${source.label(locale)} needs both:\n    ` + missing.join('\n    '));
}

function assertI18nKeys(rel, page, locale, bundle, html) {
  const missing = [];
  for (const [where, source] of scriptsFor(page, html)) {
    for (const key of keysUsedIn(source)) {
      if (bundle[key] == null) missing.push(`${key}  (used in ${where})`);
    }
  }
  if (!missing.length) return;
  throw new Error(
    `${rel}: ${missing.length} string(s) missing from the ${locale} bundle. `
    + `Add them to src/content/${locale}/ (shared.json for www/shared/, the page's `
    + `own file otherwise):\n    ` + missing.join('\n    '));
}

// Comments explaining the markup belong in src/, not in every visitor's
// download (#133). They are written as {# #} so nunjucks strips them; this
// catches an <!-- --> that slipped into a template. 15.5KB of the four pages
// used to be comments, and 12.8% of the draw page alone.
function assertNoHtmlComments(rel, html) {
  const found = html.match(/<!--[\s\S]*?-->/g);
  if (!found) return;
  const preview = found.slice(0, 3).map((c) => c.replace(/\s+/g, ' ').slice(0, 70));
  throw new Error(
    `${rel}: ${found.length} HTML comment(s) in the output. Write them as {# #} `
    + `so they stay in src/ instead of shipping:\n    ` + preview.join('\n    '));
}

// ------------------------------------------------------------
// EVERY SONG POOL IS OFFERED, AND EVERY OFFERED CATEGORY HAS A POOL
// ------------------------------------------------------------
// Two silent failures, one on each side of the same list (#165):
//
//   offered but no pool   a picker row that deals nothing, and it only shows
//                         up when a host actually picks that row
//   a pool nobody offers  a list of songs no picker can reach, which then
//                         rots without the audit or anyone else noticing
//
// Neither is visible in the built HTML, so `npm run build:check` would pass a
// broken catalogue. readCategories() parses the pools out of app.js and
// throws on either direction; calling it here is the whole check.
//
// Once per run rather than per page: it reads and parses app.js, and the
// answer cannot differ between locales.
function assertSongPools(site) {
  if (!site.pages.some((page) => page.categories === 'songs')) return;
  readCategories();
}

// Both lists. `site.internal` holds pages that are built and deployed but are
// not part of the public site: no manifest, no structured data, no
// cross-links, no sitemap entry, and noindex. They live in their own list
// rather than behind a flag inside `pages` so the four test files that
// iterate site.pages keep asserting exactly what they assert about the
// public site today, with no filter for a future page to hide behind (#201).
export function allPages(site) {
  return [...site.pages, ...(site.internal || [])];
}

function eachPage(site, fn) {
  const out = [];
  for (const page of allPages(site)) {
    for (const locale of page.locales) out.push(fn(page, locale));
  }
  return out;
}

// ---- www/admin.html, the one hand-written page (#206) ----
//
// The dashboard is not rendered from src/pages: it is a single self-contained
// file with its own charts, and templating it would buy nothing. But it mounts
// the shared account button and the shared sign-in modal, and those speak
// through t(). With no bundle in the page every one of their labels rendered
// as its own key, which stopped being cosmetic the day sign-in became the
// whole point of the page (#204).
//
// So the build stamps one line into it, from the same shared.json every built
// page reads. Only the shared block: the page's own copy is English written
// in place, and there is no second locale of this page to keep it honest for.
const ADMIN_FILE = 'www/admin.html';
const ADMIN_I18N = /(<script type="application\/json" id="i18n" data-lang="[^"]*">)[\s\S]*?(<\/script>)/;

function stampAdmin(site) {
  const abs = path.join(ROOT, ADMIN_FILE);
  if (!fs.existsSync(abs)) return null;
  const before = fs.readFileSync(abs, 'utf8');
  if (!ADMIN_I18N.test(before)) {
    throw new Error(`${ADMIN_FILE}: no <script id="i18n"> block to stamp. Put one back, or drop stampAdmin.`);
  }
  const locale = site.defaultLocale || 'en';
  const bundle = jsonForScriptTag(loadSharedRuntime(locale));
  return { abs, before, after: before.replace(ADMIN_I18N, `$1${bundle}$2`) };
}

function build(site, env) {
  assertSongPools(site);
  let written = 0;
  eachPage(site, (page, locale) => {
    const rel = outputPath(site, page, locale);
    const dest = path.join(OUT, rel);
    const html = renderPage(env, site, page, locale);
    assertNoHtmlComments(rel, html);
    const bundle = bundleFor(site, page, locale);
    assertI18nKeys(rel, page, locale, bundle, html);
    assertCategoryStrings(rel, page, locale, bundle);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (before !== html) { fs.writeFileSync(dest, html); written++; console.log(`  wrote  ${rel}`); }
    else console.log(`  same   ${rel}`);
  });

  const stats = stampAdmin(site);
  if (stats && stats.before !== stats.after) {
    fs.writeFileSync(stats.abs, stats.after); written++; console.log(`  wrote  ${ADMIN_FILE}  (i18n block)`);
  } else if (stats) console.log(`  same   ${ADMIN_FILE}`);

  console.log(written ? `\n${written} file(s) written.` : '\nUp to date.');
}

function check(site, env) {
  assertSongPools(site);
  const problems = [];
  let commentOnly = 0;
  eachPage(site, (page, locale) => {
    const rel = outputPath(site, page, locale);
    const dest = path.join(OUT, rel);
    const html = renderPage(env, site, page, locale);
    assertNoHtmlComments(rel, html);
    const bundle = bundleFor(site, page, locale);
    assertI18nKeys(rel, page, locale, bundle, html);
    assertCategoryStrings(rel, page, locale, bundle);
    if (!fs.existsSync(dest)) { console.log(`  new    ${rel}`); return; }
    const committed = fs.readFileSync(dest, 'utf8');

    // Semantic equivalence ignores comments: during a migration the
    // comments genuinely do get rewritten, and failing on that would
    // make the gate noisy enough to start ignoring, which is worse
    // than not having it.
    const a = canonical(committed, { dropComments: true });
    const b = canonical(html, { dropComments: true });
    if (a !== b) {
      problems.push(`${rel}\n${describeDiff(a, b)}`);
      console.log(`  DIFFER ${rel}`);
      return;
    }
    if (canonical(committed) !== canonical(html)) { commentOnly++; console.log(`  ok*    ${rel}  (comments differ)`); }
    else console.log(`  ok     ${rel}`);
  });

  // Not canonicalised like the pages above: this is one generated line inside
  // a hand-written file, so byte equality is exactly the right test.
  const stats = stampAdmin(site);
  if (stats && stats.before !== stats.after) {
    problems.push(`${ADMIN_FILE}\n  the stamped <script id="i18n"> block is stale — run \`npm run build\``);
    console.log(`  DIFFER ${ADMIN_FILE}`);
  } else if (stats) console.log(`  ok     ${ADMIN_FILE}`);

  if (commentOnly) console.log(`\n${commentOnly} page(s) differ only in HTML comments, which is allowed.`);
  if (problems.length) {
    console.log(`\n${problems.length} page(s) are NOT equivalent:\n`);
    problems.forEach((p) => console.log(p + '\n'));
    process.exit(1);
  }
  console.log('\nAll pages equivalent.');
}

function watch(site) {
  console.log('Watching src/ ...');
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { build(loadSite(), makeEnv()); } catch (e) { console.error('build failed:', e.message); }
    }, 80);
  });
}

function main() {
  const args = process.argv.slice(2);
  const site = loadSite();
  const env = makeEnv();
  if (!site.pages.length) {
    console.log('No pages in src/site.json yet. The compiler is in place; pages move onto it one at a time (#130 onward).');
    return;
  }
  if (args.includes('--check')) return check(site, env);
  build(site, env);
  if (args.includes('--watch')) watch(site);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
