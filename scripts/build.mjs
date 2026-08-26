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

export function renderPage(env, site, page, locale) {
  const content = loadContent(page.id, locale);
  // Every locale this page exists in, for the hreflang block and the
  // language switcher. Built here so no template has to know the map.
  const alternates = page.locales.map((l) => ({
    locale: l,
    lang: site.locales[l].lang,
    label: site.locales[l].label,
    url: pageUrl(site, page, l),
    current: l === locale,
  }));
  return env.render(page.template, {
    site,
    page,
    locale: { key: locale, ...site.locales[locale] },
    url: pageUrl(site, page, locale),
    alternates,
    defaultUrl: pageUrl(site, page, site.defaultLocale),
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
