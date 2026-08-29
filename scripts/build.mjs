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
// The category IDS, which are the same in every locale. This gate is about
// ids having display strings, so the reference catalogue is the right source.
import { WORD_CATEGORIES } from '../www/shared/words/en.js';

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
function loadContent(pageId, locale) {
  const p = path.join(SRC, 'content', locale, `${pageId}.json`);
  if (!fs.existsSync(p)) throw new Error(`missing content: src/content/${locale}/${pageId}.json`);
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
// RENDER
// ------------------------------------------------------------

export function makeEnv() {
  return nunjucks.configure(SRC, {
    autoescape: true,
    trimBlocks: true,
    lstripBlocks: true,
    // A missing string is a bug, not an empty space. Without this a
    // typo'd key renders the literal "undefined" into a shipped page,
    // and with two languages that is a matter of when, not if.
    throwOnUndefined: true,
  });
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
  const c = content || loadContent(page.id, locale);
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
  const content = loadContent(page.id, locale);
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
    // The web app manifest sits beside the page it belongs to, so it moves
    // with the language: /es/word/ must not hand a Spanish player a manifest
    // whose start_url is the English game, which is what installing to the
    // home screen would otherwise give them. The default locale's dir is ''
    // so its href is unchanged (#139).
    manifestHref: '/' + site.locales[locale].dir + page.head.manifest.slice(1),
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
function assertCategoryStrings(rel, page, locale, bundle) {
  if (!page.categories) return;
  const missing = [];
  for (const id of Object.keys(WORD_CATEGORIES)) {
    for (const part of ['name', 'desc']) {
      const key = `category.${id}.${part}`;
      if (bundle[key] == null) missing.push(key);
    }
  }
  if (!missing.length) return;
  throw new Error(
    `${rel}: ${missing.length} category string(s) missing from the ${locale} `
    + `bundle. Every id in WORD_CATEGORIES needs both:\n    ` + missing.join('\n    '));
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

function eachPage(site, fn) {
  const out = [];
  for (const page of site.pages) {
    for (const locale of page.locales) out.push(fn(page, locale));
  }
  return out;
}

function build(site, env) {
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
  console.log(written ? `\n${written} file(s) written.` : '\nUp to date.');
}

function check(site, env) {
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
