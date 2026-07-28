// Validate the shared word catalogue.
//
//   node scripts/check-words.mjs
//
// Songs get validated against the real iTunes API; words have no such
// authority, so this script enforces the rules the catalogue's header
// comment states. Errors fail the run. Warnings are judgement calls worth
// eyeballing but not worth blocking on.
//
// The rule that actually matters for gameplay is DUPLICATE WORDS ACROSS
// CATEGORIES. The played ledger is keyed by category, so the same word
// sitting in two of them can be dealt twice to a room that picked both.

import { WORD_CATEGORIES, pickHint } from '../www/shared/words.js';

const EXPECTED = {
  'Food': 100,
  'Animals': 100,
  'Places': 100,
  'Everyday Objects': 100,
  'Movies & TV': 50,
  'Football': 50,
  'Super Heroes': 50,
};

// Longest word the draw and word cards can show without wrapping badly.
const MAX_WORD_LEN = 26;
const MAX_HINT_WORDS = 2;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// "Toast" vs "Toasted": same first 4+ characters means the hint is a stem of
// the word (or vice versa), which hands the impostor the answer.
function stemsClash(a, b) {
  if (a.length < 4 || b.length < 4) return a === b;
  return a.startsWith(b) || b.startsWith(a);
}

const cats = Object.keys(WORD_CATEGORIES);
const catNames = new Set(cats.map(norm));
const seenWords = new Map(); // normalised word -> "Category / Word"
let total = 0;

for (const cat of cats) {
  const list = WORD_CATEGORIES[cat];
  const where = (w) => `${cat} / ${w}`;

  if (!Array.isArray(list) || !list.length) { err(`${cat}: empty`); continue; }
  total += list.length;

  if (EXPECTED[cat] === undefined) warn(`${cat}: not in the expected-size table`);
  else if (list.length !== EXPECTED[cat]) err(`${cat}: ${list.length} entries, expected ${EXPECTED[cat]}`);

  const inCat = new Set();

  for (const e of list) {
    if (!e || typeof e.w !== 'string' || !e.w.trim()) { err(`${cat}: entry with no word`); continue; }
    const w = e.w.trim();

    for (const field of ['h', 'h2']) {
      if (typeof e[field] !== 'string' || !e[field].trim()) err(`${where(w)}: missing ${field}`);
    }
    if (!e.h || !e.h2) continue;

    if (norm(e.h) === norm(e.h2)) err(`${where(w)}: both hints are "${e.h}"`);
    if (w.length > MAX_WORD_LEN) warn(`${where(w)}: ${w.length} chars, over the ${MAX_WORD_LEN} the cards fit`);

    // Duplicates inside the category, then across the whole catalogue.
    const key = norm(w);
    if (inCat.has(key)) err(`${where(w)}: duplicated inside its own category`);
    inCat.add(key);
    if (seenWords.has(key)) err(`${where(w)}: also in ${seenWords.get(key)}, and the played ledger is per-category, so this word can be dealt twice`);
    else seenWords.set(key, where(w));

    for (const field of ['h', 'h2']) {
      const hint = e[field];
      const hTokens = tokens(hint);

      if (hTokens.length > MAX_HINT_WORDS) err(`${where(w)}: ${field} "${hint}" is ${hTokens.length} words, max ${MAX_HINT_WORDS}`);
      if (catNames.has(norm(hint))) err(`${where(w)}: ${field} "${hint}" is a category name, which the room already knows`);

      // Substring either way, then a stem check per token pair.
      if (norm(hint).includes(key) || key.includes(norm(hint))) {
        err(`${where(w)}: ${field} "${hint}" contains the word (or vice versa)`);
        continue;
      }
      for (const wt of tokens(w)) {
        for (const ht of hTokens) {
          if (stemsClash(wt, ht)) err(`${where(w)}: ${field} "${hint}" shares a stem with "${wt}"`);
        }
      }
    }
  }
}

// A hint that is itself a secret word elsewhere is survivable (only the
// selected categories are ever in play) but worth knowing about.
for (const cat of cats) {
  for (const e of WORD_CATEGORIES[cat]) {
    if (!e || !e.h) continue;
    for (const field of ['h', 'h2']) {
      const other = seenWords.get(norm(e[field] || ''));
      if (other && other !== `${cat} / ${e.w}`) warn(`${cat} / ${e.w}: ${field} "${e[field]}" is also the secret word ${other}`);
    }
  }
}

// pickHint has to return one of the two, never undefined.
for (const cat of cats) {
  for (const e of WORD_CATEGORIES[cat]) {
    for (let i = 0; i < 20; i++) {
      const got = pickHint(e);
      if (got !== e.h && got !== e.h2) { err(`${cat} / ${e.w}: pickHint returned "${got}"`); break; }
    }
  }
}
if (pickHint(null) !== '' || pickHint({ w: 'X' }) !== '') err('pickHint does not fall back to "" for a broken entry');
if (pickHint({ w: 'X', h: 'Only' }) !== 'Only') err('pickHint does not fall back to h when h2 is missing');

// Both hints should actually come up over many rounds.
const sample = WORD_CATEGORIES[cats[0]][0];
const seenHints = new Set();
for (let i = 0; i < 200; i++) seenHints.add(pickHint(sample));
if (seenHints.size !== 2) err(`pickHint returned ${seenHints.size} distinct hints over 200 draws, expected 2`);

// ------------------------------------------------------------
const DRAWABLE = ['Food', 'Animals', 'Everyday Objects', 'Super Heroes'];
console.log('Catalogue');
for (const cat of cats) {
  const n = WORD_CATEGORIES[cat].length;
  console.log(`  ${cat.padEnd(18)} ${String(n).padStart(3)}${DRAWABLE.includes(cat) ? '  (drawable)' : ''}`);
}
const drawTotal = DRAWABLE.reduce((n, c) => n + (WORD_CATEGORIES[c] || []).length, 0);
console.log(`  ${'word game'.padEnd(18)} ${String(total).padStart(3)}`);
console.log(`  ${'draw game'.padEnd(18)} ${String(drawTotal).padStart(3)}`);
console.log(`  ${'hints'.padEnd(18)} ${String(total * 2).padStart(3)}`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s)`);
  warnings.forEach((w) => console.log('  ! ' + w));
}
if (errors.length) {
  console.log(`\n${errors.length} error(s)`);
  errors.forEach((e) => console.log('  x ' + e));
  process.exit(1);
}
console.log('\nAll checks passed.');
