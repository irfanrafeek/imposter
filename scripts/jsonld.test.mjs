// ============================================================
// THE STRUCTURED DATA HAS NOBODY CHECKING IT (#178)
//
// Every page carries a JSON-LD @graph, and until this file nothing looked
// at it. Not the build, not `build:check`, which compares built HTML to a
// fresh build and so catches a graph that CHANGED rather than one that is
// WRONG. A malformed or contradictory graph passes every gate, ships, and
// surfaces weeks later in Search Console, if anyone notices at all.
//
// That is not hypothetical. An EN/ES parity read found three real defects
// by hand: the Spanish hub emitted no WebSite node at all, the English
// VideoGame nodes inlined a duplicate publisher where the Spanish ones
// reference it by @id, and `genre` disagreed between the two languages for
// the same game (#175, #176).
//
// The checks here are the ones a person cannot do reliably by eye: that
// references resolve, that an id means one thing, and above all that the
// two languages agree about the parts of the graph which describe the SITE
// rather than the page. That last one is what was actually broken.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSite, outputPath, pageUrl } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = loadSite();

// Nodes that describe the site rather than the page they sit on. Any page
// may declare them, but every page that does must declare the SAME thing,
// and the two languages must agree about which ones exist. A per-language
// variant of one of these is the bug this list exists to catch: there is
// one organisation and one website, however many languages front them.
const SITE_LEVEL = ['Organization', 'WebSite'];

// Every built page, parsed. Only the pages the build writes: the two
// long-form guides are hand-written and carry a different graph shape.
const pages = site.pages.flatMap((page) =>
  page.locales.map((locale) => {
    const rel = outputPath(site, page, locale);
    const html = fs.readFileSync(path.join(ROOT, 'www', rel), 'utf8');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    return { rel, page, locale, blocks };
  }));

test('every page carries exactly one JSON-LD block', () => {
  for (const { rel, blocks } of pages) {
    assert.equal(blocks.length, 1, `${rel} has ${blocks.length} ld+json blocks, expected 1`);
  }
});

test('every JSON-LD block parses, and is a @graph', () => {
  for (const { rel, blocks } of pages) {
    let data;
    assert.doesNotThrow(() => { data = JSON.parse(blocks[0][1]); }, `${rel} has unparseable JSON-LD`);
    assert.equal(data['@context'], 'https://schema.org', `${rel} has the wrong @context`);
    assert.ok(Array.isArray(data['@graph']) && data['@graph'].length, `${rel} has no @graph nodes`);
  }
});

// Parsed once, now that the parse itself is covered.
const graphs = pages.map((p) => ({ ...p, nodes: JSON.parse(p.blocks[0][1])['@graph'] }));

test('every node declares an @type', () => {
  for (const { rel, nodes } of graphs) {
    nodes.forEach((n, i) => {
      assert.ok(n['@type'], `${rel} node ${i} has no @type`);
    });
  }
});

// A bare { "@id": ... } is a reference to a node described elsewhere. If
// nothing on the page describes it, the reference says nothing: crawlers
// do not go looking, they drop it.
function references(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => references(n, out));
  else if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === '@id') out.push(node['@id']);
    else Object.values(node).forEach((v) => references(v, out));
  }
  return out;
}

test('every @id reference resolves to a node on the same page', () => {
  for (const { rel, nodes } of graphs) {
    const declared = new Set(nodes.filter((n) => n['@id']).map((n) => n['@id']));
    for (const ref of references(nodes)) {
      assert.ok(declared.has(ref), `${rel} references ${ref}, which nothing on that page declares`);
    }
  }
});

test('an @id never names two different types', () => {
  const seen = new Map();
  for (const { rel, nodes } of graphs) {
    for (const n of nodes.filter((x) => x['@id'])) {
      const prev = seen.get(n['@id']);
      const type = JSON.stringify(n['@type']);
      if (prev) assert.equal(type, prev.type, `${n['@id']} is ${type} in ${rel} but ${prev.type} in ${prev.rel}`);
      else seen.set(n['@id'], { type, rel });
    }
  }
});

// The check that matters, and the one the parity read had to do by hand.
test('site-level nodes are identical wherever they appear', () => {
  const seen = new Map();
  for (const { rel, nodes } of graphs) {
    for (const n of nodes.filter((x) => SITE_LEVEL.includes(x['@type']))) {
      const json = JSON.stringify(n);
      const prev = seen.get(n['@type']);
      if (prev) {
        assert.equal(json, prev.json,
          `the ${n['@type']} node differs between ${prev.rel} and ${rel}. It describes the site, not the page, so both must declare the same one.`);
      } else seen.set(n['@type'], { json, rel });
    }
  }
});

test('the two languages of a page declare the same site-level nodes', () => {
  const byPage = new Map();
  for (const { page, locale, nodes } of graphs) {
    const types = nodes.filter((n) => SITE_LEVEL.includes(n['@type'])).map((n) => n['@type']).sort();
    if (!byPage.has(page.id)) byPage.set(page.id, new Map());
    byPage.get(page.id).set(locale, types);
  }
  for (const [id, byLocale] of byPage) {
    const [first, ...rest] = [...byLocale.entries()];
    for (const [locale, types] of rest) {
      assert.deepEqual(types, first[1],
        `${id} declares [${types}] in ${locale} but [${first[1]}] in ${first[0]}. A site-level node present in one language and missing in the other is the #175 bug.`);
    }
  }
});

test('a VideoGame node is in its page\'s language, and points at its page\'s locale', () => {
  for (const { rel, locale, nodes } of graphs) {
    const dir = site.locales[locale].dir;
    for (const n of nodes.filter((x) => x['@type'] === 'VideoGame')) {
      assert.equal(n.inLanguage, site.locales[locale].lang,
        `${rel}: VideoGame "${n.name}" declares inLanguage ${n.inLanguage}`);
      assert.ok(n.url && new URL(n.url).pathname.startsWith('/' + dir),
        `${rel}: VideoGame "${n.name}" points at ${n.url}, which is not a ${locale} URL`);
    }
  }
});

// #143: the visible FAQ and the FAQPage node used to be two hand-written
// lists that drifted, and the draw page ended up showing readers a question
// it never told Google about. The fix was to delete every `faq.structured`
// override so the node is generated from the visible list. These two tests
// are what stop an override from being reintroduced, in either direction:
// the first checks the built output, the second checks the source.
test('the FAQPage node is exactly the visible FAQ, question for question', () => {
  for (const { rel, nodes } of graphs) {
    const html = fs.readFileSync(path.join(ROOT, 'www', rel), 'utf8');
    const visible = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    const faq = nodes.find((n) => n['@type'] === 'FAQPage');
    if (!visible.length) { assert.ok(!faq, `${rel} has no visible FAQ but emits a FAQPage`); continue; }
    assert.ok(faq, `${rel} shows ${visible.length} FAQ entries but emits no FAQPage`);
    assert.deepEqual(faq.mainEntity.map((q) => q.name), visible,
      `${rel} shows readers a different FAQ from the one it declares`);
  }
});

test('no page supplies a faq.structured override', () => {
  for (const page of site.pages) {
    for (const locale of page.locales) {
      const file = path.join(ROOT, 'src', 'content', locale, `${page.id}.json`);
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.ok(!content.faq || !content.faq.structured,
        `${locale}/${page.id}.json supplies faq.structured. The FAQPage is generated from faq.visible so the two cannot drift; an override brings #143 back.`);
    }
  }
});

test('a page with a visible FAQ emits exactly one FAQPage node', () => {
  for (const { rel, page, locale, nodes } of graphs) {
    const content = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'src', 'content', locale, `${page.id}.json`), 'utf8'));
    const wanted = content.faq && content.faq.visible && content.faq.visible.length ? 1 : 0;
    const got = nodes.filter((n) => n['@type'] === 'FAQPage').length;
    assert.equal(got, wanted, `${rel} has ${got} FAQPage nodes, expected ${wanted}`);
  }
});

test('the hub lists one VideoGame per game, at that locale\'s URL', () => {
  const hub = site.pages.find((p) => p.id === 'hub');
  const games = site.pages.filter((p) => p.id !== 'hub');
  for (const locale of hub.locales) {
    const { nodes, rel } = graphs.find((g) => g.page.id === 'hub' && g.locale === locale);
    const urls = new Set(nodes.filter((n) => n['@type'] === 'VideoGame').map((n) => n.url));
    for (const game of games.filter((g) => g.locales.includes(locale))) {
      const url = pageUrl(site, game, locale);
      assert.ok(urls.has(url), `${rel} has no VideoGame node for ${url}`);
    }
  }
});
