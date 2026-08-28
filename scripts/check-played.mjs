// Exercise the cross-room played-word memory.
//
//   node scripts/check-played.mjs
//
// shared/played.js is the only piece of the word pipeline that carries state
// between rooms, so it is the piece worth testing off-browser. Node has no
// localStorage, so we stub one and can also simulate it failing.

import { WORD_CATEGORIES } from '../www/shared/words/en.js';
import { WORD_CATEGORIES as ES_CATEGORIES } from '../www/shared/words/es.js';
import { createPlayedStore } from '../www/shared/played.js';

// What loadCatalog() hands the games. English keeps the unsuffixed
// localStorage key, so these assertions cover the path real devices are on.
const CATALOG = { lang: 'en', categories: WORD_CATEGORIES };
const ES_CATALOG = { lang: 'es', categories: ES_CATEGORIES };

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ok   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}

function installStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return map;
}

const FOOD = WORD_CATEGORIES['Food'].map(e => e.w);
const CAP = Math.floor(FOOD.length * 0.6);

console.log('records and reports back');
{
  installStorage();
  const s = createPlayedStore('test', CATALOG);
  check('starts empty', Object.keys(s.recent()).length === 0);
  s.record('Food', 'Pizza');
  s.record('Food', 'Taco');
  const r = s.recent();
  check('remembers both words', r['Food'].size === 2 && r['Food'].has('Pizza') && r['Food'].has('Taco'));
  check('returns a Set, which is what pickWord expects', r['Food'] instanceof Set);
  s.record('Food', 'Pizza');
  check('re-recording does not duplicate', s.recent()['Food'].size === 2);
}

console.log('caps at 60% of the category');
{
  installStorage();
  const s = createPlayedStore('test', CATALOG);
  FOOD.forEach(w => s.record('Food', w));
  const r = s.recent();
  check(`holds ${CAP} of ${FOOD.length}`, r['Food'].size === CAP);
  check('keeps the most recent, drops the oldest', r['Food'].has(FOOD[FOOD.length - 1]) && !r['Food'].has(FOOD[0]));
  // The property that matters: something is always left to deal.
  const fresh = FOOD.filter(w => !r['Food'].has(w));
  check(`leaves ${fresh.length} words genuinely fresh`, fresh.length === FOOD.length - CAP && fresh.length > 0);
}

console.log('clears on exhaustion');
{
  installStorage();
  const s = createPlayedStore('test', CATALOG);
  s.record('Food', 'Pizza');
  s.record('Animals', 'Dog');
  s.clear(['Food']);
  const r = s.recent();
  check('named category is gone', !r['Food']);
  check('other categories survive', r['Animals'] && r['Animals'].has('Dog'));
  s.clear([]);
  s.clear(null);
  check('clearing nothing is a no-op', s.recent()['Animals'].size === 1);
}

console.log('ignores words the catalogue no longer has');
{
  const map = installStorage();
  map.set('played:test', JSON.stringify({ 'Food': ['Pizza', 'Mystery Meat'], 'Old Category': ['Whatever'] }));
  const r = createPlayedStore('test', CATALOG).recent();
  check('drops the retired word', r['Food'].size === 1 && r['Food'].has('Pizza'));
  check('drops the retired category', !r['Old Category']);
}

console.log('survives hostile storage');
{
  const map = installStorage();
  map.set('played:test', 'not json at all');
  check('unparseable value reads as empty', Object.keys(createPlayedStore('test', CATALOG).recent()).length === 0);

  map.set('played:test', JSON.stringify(['an', 'array']));
  check('wrong shape reads as empty', Object.keys(createPlayedStore('test', CATALOG).recent()).length === 0);

  map.set('played:test', JSON.stringify({ 'Food': 'not an array' }));
  check('wrong category shape reads as empty', Object.keys(createPlayedStore('test', CATALOG).recent()).length === 0);

  map.set('played:test', JSON.stringify({ 'Food': ['Pizza', 42, null] }));
  check('non-string entries are filtered', createPlayedStore('test', CATALOG).recent()['Food'].size === 1);
}

console.log('degrades when localStorage throws');
{
  globalThis.localStorage = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  const s = createPlayedStore('test', CATALOG);
  let threw = false;
  try {
    s.record('Food', 'Pizza');
    s.clear(['Food']);
    check('recent() returns empty rather than throwing', Object.keys(s.recent()).length === 0);
  } catch (e) { threw = true; }
  check('no exception escapes to the caller', !threw);
}

console.log('the point of the whole thing: a second room deals new words');
{
  installStorage();
  const s = createPlayedStore('test', CATALOG);
  const pick = (roomPlayed) => {
    const device = s.recent();
    const unplayed = FOOD.filter(w => !roomPlayed.has(w));
    const fresh = unplayed.filter(w => !(device['Food'] && device['Food'].has(w)));
    const pool = fresh.length ? fresh : unplayed;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const roomA = new Set();
  const dealtA = [];
  for (let i = 0; i < 20; i++) { const w = pick(roomA); roomA.add(w); dealtA.push(w); s.record('Food', w); }
  check('room A never repeated', new Set(dealtA).size === 20);

  const roomB = new Set();
  const dealtB = [];
  for (let i = 0; i < 20; i++) { const w = pick(roomB); roomB.add(w); dealtB.push(w); s.record('Food', w); }
  check('room B never repeated', new Set(dealtB).size === 20);

  const overlap = dealtB.filter(w => dealtA.includes(w));
  check(`room B reused none of room A's words (overlap ${overlap.length})`, overlap.length === 0);

  // Before this change room B started blank, so ~20% overlap was expected.
  const blank = [];
  for (let i = 0; i < 20; i++) {
    const pool = FOOD.filter(w => !blank.includes(w));
    blank.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  console.log(`       (a blank-ledger room would have reused ~${blank.filter(w => dealtA.includes(w)).length})`);
}

// The ledger is keyed by CATEGORY ID, and the ids are identical in every
// locale by design (#135), so 'Food' means one bucket unless the key itself
// carries the language. Two separate things break if it does not, and both
// are silent, which is why they are worth a test rather than a comment:
// the 60% cap would evict one language's history to make room for the
// other's, and recent() drops words the live catalogue no longer has, so
// every switch between languages would bin the history it just came from.
console.log('one ledger per language, sharing category ids');
{
  const store = installStorage();
  const en = createPlayedStore('word', CATALOG);
  const es = createPlayedStore('word', ES_CATALOG);

  // English keeps the unsuffixed key. This is not cosmetic: every device
  // already carrying a history is on that key, and a rename would throw
  // it away on the deploy that introduced the second language.
  en.record('Food', 'Pizza');
  check('English writes the original unsuffixed key', store.has('played:word'));
  check('English did NOT write a suffixed key', !store.has('played:word:en'));

  es.record('Food', 'Ceviche');
  check('Spanish writes its own key', store.has('played:word:es'));

  const rEn = en.recent();
  const rEs = es.recent();
  check('English sees only its own word', rEn['Food'].size === 1 && rEn['Food'].has('Pizza'));
  check('Spanish sees only its own word', rEs['Food'].size === 1 && rEs['Food'].has('Ceviche'));

  // The failure this really guards. Spanish fills its Food bucket past the
  // English cap; if the two shared a key, the cap would start evicting
  // English history that the English catalogue still wants excluded.
  ES_CATEGORIES['Food'].forEach(e => es.record('Food', e.w));
  check('a full Spanish ledger leaves English untouched',
    en.recent()['Food'].size === 1 && en.recent()['Food'].has('Pizza'));

  // And the other direction: recent() filters against the LIVE catalogue,
  // so a shared key would have dropped every Spanish word as "retired"
  // the moment an English page read it.
  check('Spanish history survives an English read',
    es.recent()['Food'].size === Math.floor(ES_CATEGORIES['Food'].length * 0.6));
}

// Draw and word already had separate ledgers; the language suffix must not
// have collapsed that. Four stores, four keys, no crossing.
console.log('game and language are independent axes');
{
  const store = installStorage();
  createPlayedStore('word', CATALOG).record('Food', 'Pizza');
  createPlayedStore('draw', CATALOG).record('Food', 'Pizza');
  createPlayedStore('word', ES_CATALOG).record('Food', 'Ceviche');
  createPlayedStore('draw', ES_CATALOG).record('Food', 'Ceviche');
  const keys = [...store.keys()].sort();
  check(`four distinct ledgers (${keys.join(', ')})`,
    keys.length === 4
    && keys.includes('played:word') && keys.includes('played:draw')
    && keys.includes('played:word:es') && keys.includes('played:draw:es'));
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
