// Validate the word catalogues, one locale at a time.
//
//   node scripts/check-words.mjs            every locale
//   node scripts/check-words.mjs es         just one
//   node scripts/check-words.mjs --strict   short categories fail the run
//
// Songs get validated against the real iTunes API; words have no such
// authority, so this script enforces the rules stated in the header of
// www/shared/words/index.js. Errors fail the run. Warnings are judgement
// calls worth eyeballing but not worth blocking on.
//
// The rule that actually matters for gameplay is DUPLICATE WORDS ACROSS
// CATEGORIES. The played ledger is keyed by category, so the same word
// sitting in two of them can be dealt twice to a room that picked both.
//
// WHY SIZES ARE SOFT OUTSIDE ENGLISH
// English is the reference: its category sizes are deliberate and a mismatch
// is a real error. A new locale is written a category at a time and is short
// by definition until it is finished, so a shortfall there is reported and
// does not fail. --strict promotes those to errors, which is what to run
// before shipping a locale.
//
// CONTENT rules are errors in every locale. A hint that gives the answer
// away is just as broken in Spanish.

import { readFileSync } from 'node:fs';
import { CATALOGUE_LANGS, DEFAULT_LANG, pickHint } from '../www/shared/words/index.js';
// Accent folding, and why the enye is exempt from it, live next door so
// that words.test.mjs can cover them. This script runs on import.
import { norm, tokens, stemsClash, looksGendered } from './words-lib.mjs';

// Target sizes per locale. English is enforced exactly; elsewhere these are
// targets a locale works towards, since parity is not a goal and a category
// that does not land with its audience is better left short.
const EXPECTED = {
  en: {
    'Food': 100, 'Animals': 100, 'Places': 100, 'Everyday Objects': 100,
    'Movies & TV': 50, 'Football': 50, 'Super Heroes': 50,
  },
  es: {
    'Food': 100, 'Animals': 100, 'Places': 100, 'Everyday Objects': 100,
    'Movies & TV': 50, 'Football': 50, 'Super Heroes': 50,
  },
};

// Hints whose -o/-a ending has been read and judged safe: nouns, invariant
// colours, place names. See looksGendered() in words-lib.mjs for why an
// allowlist rather than a cleverer rule. Locales with no gendered adjectives
// need no entry here; only Spanish is checked.
//
// Entries are matched against FOLDED tokens, so write them the way norm()
// leaves them: accents stripped ('lagrima', not 'lágrima') but the enye kept
// ('caña', not 'cana'). Getting that wrong shows up as a warning that will
// not go away.
const GENDER_REVIEWED = {
  es: new Set([
    // seasons, occasions, times
    'verano', 'invierno', 'otoño', 'primavera', 'domingo', 'navidad',
    'fiesta', 'merienda', 'desayuno', 'infancia', 'semana', 'mañana',
    'verbena', 'romeria', 'romería', 'feria', 'boda', 'cumpleaños',
    // places and regions used as hints
    'galicia', 'asturias', 'andalucia', 'andalucía', 'cordoba', 'córdoba',
    'madrid', 'valencia', 'burgos', 'sevilla', 'granada', 'cataluña',
    'castilla', 'mancha', 'rioja', 'huerta', 'campo', 'playa', 'pueblo',
    'terraza', 'mercado', 'colegio', 'recreo', 'estadio', 'cine',
    // ingredients and things, as nouns
    'azafran', 'azafrán', 'pimenton', 'pimentón', 'bellota', 'sangre',
    'plancha', 'brasa', 'salsa', 'cuchara', 'sarten', 'sartén', 'horno',
    'vinagre', 'aceite', 'harina', 'humo', 'vapor', 'hielo', 'fuego',
    'sobras', 'pastor', 'abuela', 'abuelo', 'cascara', 'cáscara', 'hueso',
    'espina', 'semilla', 'corteza', 'molde', 'papel', 'cuchillo',
    // invariant colours and noun-adjectives
    'rosa', 'naranja', 'malva', 'lila', 'crema',
    'lagrima', 'caña', 'mediodia',
    'lata', 'isla', 'ocho', 'cosecha', 'sorpresa',
    // texture, part and shape nouns: the gender-safe way to write a
    // PHYSICAL hint in Spanish, where most sensory adjectives inflect
    'grumo', 'lamina', 'pulpa', 'punta', 'curva', 'mordisco',
    'violeta', 'masa', 'mezcla', 'barra', 'vainilla', 'fruta',
    'ventosa', 'trigo', 'crujido', 'hielo',
    // reviewed while writing Animals (#137): body parts, sounds,
    // habitats and movement, all nouns
    'abanico', 'aleta', 'aleteo', 'alga', 'altura', 'arena',
    'arroyo', 'arrullo', 'astucia', 'aullido', 'baba', 'banco',
    'bandada', 'barro', 'basura', 'bola', 'bolsa', 'bostezo',
    'brillo', 'brinco', 'cacareo', 'campanario', 'carga', 'carroña',
    'cetreria', 'charca', 'chillido', 'chorro', 'cinco', 'cola',
    'colmillo', 'coraza', 'cornamenta', 'cresta', 'cuerno', 'cueva',
    'desierto', 'elegancia', 'equilibrio', 'espectaculo', 'espera', 'eucalipto',
    'familia', 'fila', 'filtro', 'fondo', 'fuerza', 'gallinero',
    'garfio', 'gelatina', 'graznido', 'grito', 'hocico', 'jaula',
    'joroba', 'ladrido', 'lago', 'lana', 'lengua', 'lujo',
    'luna', 'madriguera', 'manada', 'mandibula', 'melena', 'montaña',
    'nado', 'nido', 'pantano', 'panza', 'pasto', 'pecho',
    'pico', 'pinza', 'planeo', 'plaza', 'polo', 'presa',
    'presagio', 'puerto', 'rama', 'raya', 'rebaño', 'rio',
    'roca', 'ronroneo', 'rueda', 'rugido', 'ruido', 'sabana',
    'salto', 'sigilo', 'siglo', 'silbido', 'sonrisa', 'sueño',
    'tela', 'torpedo', 'torpeza', 'trampa', 'travesura', 'trineo',
    'trino', 'trompa', 'tubo', 'veneno', 'verruga', 'zambullida',
    'zancada',
    // reviewed while writing the Spanish Food category (#137): every one
    // of these is a noun, a place name or an invariant colour
    'abeja', 'agujero', 'ajillo', 'aliento', 'almendra', 'anillo',
    'anzuelo', 'aperitivo', 'batidora', 'botella', 'breva', 'cacao',
    'canela', 'cena', 'chufa', 'cogollo', 'compota', 'concha',
    'conejo', 'copa', 'corona', 'cuaresma', 'cucurucho', 'cuello',
    'ensalada', 'envoltorio', 'esponja', 'espuma', 'figura', 'freidora',
    'gajo', 'galleta', 'gallina', 'gaseosa', 'grano', 'grifo',
    'huerto', 'italia', 'jarra', 'loncha', 'mallorca', 'mexico',
    'migaja', 'mono', 'mueca', 'navarra', 'pajita', 'pareja',
    'parrilla', 'pata', 'pelusa', 'puchero', 'rabito', 'racimo',
    'rejilla', 'rodaja', 'sombrero', 'tabla', 'tableta', 'tallo',
    'taza', 'tinta', 'toledo', 'tostada', 'turista', 'vaca',
    'vaina', 'vampiro', 'vaso', 'vela', 'vello', 'viento',
    'vista', 'vitamina', 'zarza', 'zelanda',
  ]),
};

// Longest word the draw and word cards can show without wrapping badly.
const MAX_WORD_LEN = 26;
const MAX_HINT_WORDS = 2;

// Categories Impostor Draw offers. Reported, not enforced.
const DRAWABLE = ['Food', 'Animals', 'Everyday Objects', 'Super Heroes'];

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.filter(a => !a.startsWith('--'));
const langs = only.length ? only : CATALOGUE_LANGS;

for (const l of only) {
  if (!CATALOGUE_LANGS.includes(l)) {
    console.error(`No catalogue for "${l}". Have: ${CATALOGUE_LANGS.join(', ')}`);
    process.exit(2);
  }
}

// The display names for a locale, so "a hint is never the category name" can
// check the name players actually see and not only the English id. Absent
// before a locale has a string table, which is fine.
function displayNames(lang) {
  const out = [];
  try {
    const json = JSON.parse(readFileSync(new URL(`../src/content/${lang}/word.json`, import.meta.url), 'utf8'));
    for (const [k, v] of Object.entries(json.runtime || {})) {
      if (k.startsWith('category.') && k.endsWith('.name') && typeof v === 'string') out.push(v);
    }
  } catch (e) { /* no table for this locale yet */ }
  return out;
}

// ------------------------------------------------------------
let failed = false;
const idSets = {};

for (const lang of langs) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const { WORD_CATEGORIES } = await import(`../www/shared/words/${lang}.js`);
  const expected = EXPECTED[lang];
  const reference = lang === DEFAULT_LANG;

  const cats = Object.keys(WORD_CATEGORIES);
  idSets[lang] = cats;

  // Both the ids and the translated names: a Spanish hint of "Comida" in the
  // Food category is exactly as useless as an English one of "Food".
  const forbidden = new Set([...cats, ...displayNames(lang)].map(norm));

  const seenWords = new Map(); // normalised word -> "Category / Word"
  let total = 0;

  if (!expected) warn('no expected-size table for this locale');

  for (const cat of cats) {
    const list = WORD_CATEGORIES[cat];
    const where = (w) => `${cat} / ${w}`;

    if (!Array.isArray(list)) { err(`${cat}: not a list`); continue; }
    total += list.length;

    // A category with nothing in it is one nobody has written yet, not a
    // broken one. pickWord() drops ids with no words, so the game is fine
    // while a locale is being filled in.
    //
    // Under --strict it IS a failure, because --strict asks a different
    // question: not "is this catalogue sane" but "is this locale ready to
    // ship". An empty category is the loudest possible no. Without this the
    // ship gate passed an entirely empty catalogue, since the size check
    // below is never reached.
    if (!list.length) {
      if (reference || strict) err(`${cat}: empty`);
      else notes.push(`${cat}: not written yet`);
      continue;
    }

    if (expected && expected[cat] === undefined) warn(`${cat}: not in the expected-size table`);
    else if (expected && list.length !== expected[cat]) {
      const msg = `${cat}: ${list.length} entries, target ${expected[cat]}`;
      if (reference || strict) err(msg);
      else warn(msg);
    }

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
        if (forbidden.has(norm(hint))) err(`${where(w)}: ${field} "${hint}" is a category name, which the room already knows`);

        // A warning, not an error: the ending is a signal, not proof, and the
        // author is the one who can tell a noun from an adjective.
        const gendered = looksGendered(hint, GENDER_REVIEWED[lang]);
        if (gendered) warn(`${where(w)}: ${field} "${hint}" ends in -${gendered.slice(-1)} ("${gendered}"), so if it is an adjective it leaks the word's gender`);

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

  // ----------------------------------------------------------
  console.log(`\n${lang}${reference ? '  (reference)' : ''}`);
  for (const cat of cats) {
    const n = WORD_CATEGORIES[cat].length;
    const target = expected ? expected[cat] : undefined;
    const short = (target !== undefined && n !== target) ? `  of ${target}` : '';
    console.log(`  ${cat.padEnd(18)} ${String(n).padStart(3)}${short}${DRAWABLE.includes(cat) ? '  (drawable)' : ''}`);
  }
  const drawTotal = DRAWABLE.reduce((n, c) => n + (WORD_CATEGORIES[c] || []).length, 0);
  console.log(`  ${'word game'.padEnd(18)} ${String(total).padStart(3)}`);
  console.log(`  ${'draw game'.padEnd(18)} ${String(drawTotal).padStart(3)}`);
  console.log(`  ${'hints'.padEnd(18)} ${String(total * 2).padStart(3)}`);

  if (notes.length) {
    console.log(`\n  ${notes.length} not written yet`);
    notes.forEach((n) => console.log('    - ' + n));
  }
  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning(s)`);
    warnings.forEach((w) => console.log('    ! ' + w));
  }
  if (errors.length) {
    console.log(`\n  ${errors.length} error(s)`);
    errors.forEach((e) => console.log('    x ' + e));
    failed = true;
  }
}

// ------------------------------------------------------------
// pickHint's own contract, checked once rather than per locale.
{
  const bad = [];
  if (pickHint(null) !== '' || pickHint({ w: 'X' }) !== '') bad.push('pickHint does not fall back to "" for a broken entry');
  if (pickHint({ w: 'X', h: 'Only' }) !== 'Only') bad.push('pickHint does not fall back to h when h2 is missing');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickHint({ w: 'X', h: 'A', h2: 'B' }));
  if (seen.size !== 2) bad.push(`pickHint returned ${seen.size} distinct hints over 200 draws, expected 2`);
  if (bad.length) { console.log('\npickHint'); bad.forEach(b => console.log('    x ' + b)); failed = true; }
}

// Every locale must offer the same category ids. They are the cross-client
// keys in meta.categories, so a locale that renamed or dropped one would
// break room joins rather than just show less.
if (langs.length > 1) {
  const refName = idSets[DEFAULT_LANG] ? DEFAULT_LANG : langs[0];
  const ref = idSets[refName];
  for (const lang of langs) {
    if (lang === refName) continue;
    const missing = ref.filter(id => !idSets[lang].includes(id));
    const extra = idSets[lang].filter(id => !ref.includes(id));
    if (missing.length || extra.length) {
      console.log(`\ncategory ids: ${lang} does not match ${refName}`);
      missing.forEach(id => console.log(`    x missing "${id}"`));
      extra.forEach(id => console.log(`    x has "${id}", which ${refName} does not`));
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('\nAll checks passed.');
