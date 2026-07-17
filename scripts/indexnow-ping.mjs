#!/usr/bin/env node
/**
 * IndexNow ping — notify search engines (Bing, Yandex, Seznam, Naver, and the
 * engines that share Bing's index: DuckDuckGo, Yahoo, Ecosia, ChatGPT Search)
 * that pages changed, instead of waiting for them to crawl.
 *
 * Run it right AFTER `firebase deploy` so the live pages match what we submit:
 *
 *   node scripts/indexnow-ping.mjs                 # submit every URL in the sitemap
 *   node scripts/indexnow-ping.mjs /dance/ /word/  # submit only these paths
 *   node scripts/indexnow-ping.mjs https://impostorgames.com/dance/
 *
 * The key lives in a file hosted at the site root (www/<key>.txt); IndexNow
 * validates ownership by fetching that file, so the key here and the filename
 * must match. Requires Node 18+ (built-in fetch). No dependencies.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOST = 'impostorgames.com';
const KEY = 'bdb6e922c549db6b9fb7aee008298985';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const here = dirname(fileURLToPath(import.meta.url));
const SITEMAP = join(here, '..', 'www', 'sitemap.xml');

// Turn a CLI argument into a full https URL on our host. Accepts a full URL, a
// path ("/dance/"), or a bare page ("dance").
function toUrl(arg) {
  if (/^https?:\/\//i.test(arg)) return arg;
  const path = arg.startsWith('/') ? arg : `/${arg}`;
  return `https://${HOST}${path}`;
}

// Pull every <loc> out of the sitemap, keeping only our own host.
function sitemapUrls() {
  let xml;
  try {
    xml = readFileSync(SITEMAP, 'utf8');
  } catch (e) {
    console.error(`Could not read sitemap at ${SITEMAP}: ${e.message}`);
    process.exit(1);
  }
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map(m => m[1])
    .filter(u => u.includes(HOST));
  return [...new Set(urls)];
}

async function main() {
  const args = process.argv.slice(2);
  const urlList = args.length ? args.map(toUrl) : sitemapUrls();

  if (!urlList.length) {
    console.error('No URLs to submit.');
    process.exit(1);
  }

  console.log(`IndexNow → ${ENDPOINT}`);
  console.log(`Host: ${HOST}  Key file: ${KEY_LOCATION}`);
  console.log('Submitting:');
  urlList.forEach(u => console.log(`  ${u}`));

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });

  const body = await res.text().catch(() => '');
  // IndexNow returns 200 (accepted) or 202 (accepted, pending validation).
  if (res.status === 200 || res.status === 202) {
    console.log(`\nOK — HTTP ${res.status}. ${urlList.length} URL(s) submitted.`);
    return;
  }
  // Common failure meanings, surfaced so a bad deploy is obvious.
  const hints = {
    400: 'Bad request (malformed URL list).',
    403: 'Key not valid — is the key file live at the root yet? Deploy first.',
    422: 'URLs do not match the host, or key does not match keyLocation.',
    429: 'Too many requests — slow down.',
  };
  console.error(`\nFAILED — HTTP ${res.status}. ${hints[res.status] || ''}`);
  if (body) console.error(body.slice(0, 500));
  process.exit(1);
}

main().catch(e => {
  console.error(`IndexNow ping errored: ${e.message}`);
  process.exit(1);
});
