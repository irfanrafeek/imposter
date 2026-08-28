// ============================================================
// PLAYED-WORD MEMORY (host device)
// ============================================================
// A room already refuses to repeat a word: `meta/played` records every word
// dealt and pickWord() only draws from what's left. But that ledger lives on
// the room, so creating a new room starts from a blank slate and round 1 can
// hand out the word the same group had an hour ago.
//
// This remembers what the host's device has dealt and feeds it to pickWord()
// as a second exclusion list. Only the host picks words, so one device holds
// everything that matters.
//
// It is NOT written to the room. `meta/played` would then carry hundreds of
// keys from round zero, and onValue re-sends the entire room snapshot on
// every change, so every player would re-download it each time somebody
// tapped Ready.
//
// Deliberately per game (`played:word`, `played:draw`): drawing a word you
// said out loud last night is a different experience, not a repeat.
//
// AND deliberately per language. The ledger is keyed by category id, and the
// ids are the same in every locale, so one shared bucket would put Spanish
// and English words in the same `Food` list. Two things would then go wrong:
// the cap would evict one language's history to make room for the other's,
// and recent() drops words the live catalogue no longer has, so every switch
// between languages would silently bin the history it just came from.
//
// No identifiers, no personal data, and not a cookie, so this does not touch
// the site's cookie-free claim.

// Never remember more than this share of a category. At 100% the device
// would eventually exclude everything, pickWord() would fall back to
// room-only memory, and this would quietly stop doing anything. Capping
// keeps at least 40% of every category available as genuinely fresh.
const REMEMBER_FRACTION = 0.6;

// `catalogue` is what loadCatalog() returned: { lang, categories }. It used
// to be imported at module scope, which is exactly what stopped a locale
// from being chosen at runtime.
export function createPlayedStore(game, catalogue) {
  // Not `cat`: record(cat, word) below takes a category id under that name,
  // and a silent shadow is how a wrong bucket gets written.
  const source = catalogue || {};
  const CATEGORIES = source.categories || {};

  // English keeps the original unsuffixed key so that every device already
  // carrying a history keeps it. Only new languages get a suffix.
  const KEY = (!source.lang || source.lang === 'en')
    ? `played:${game}`
    : `played:${game}:${source.lang}`;

  // localStorage throws in private-mode Safari and is absent in some
  // WebViews. Every path below degrades to today's per-room behaviour.
  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out = {};
      for (const cat of Object.keys(parsed)) {
        if (Array.isArray(parsed[cat])) out[cat] = parsed[cat].filter(w => typeof w === 'string');
      }
      return out;
    } catch (e) { return {}; }
  }

  function writeAll(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function cap(id) {
    const size = (CATEGORIES[id] || []).length;
    return size ? Math.floor(size * REMEMBER_FRACTION) : 0;
  }

  return {
    // Called once per round, alongside the host's write to meta/played.
    // Oldest first, so the cap drops the least recent.
    record(cat, word) {
      if (!cat || !word || !cap(cat)) return;
      const all = readAll();
      const list = (all[cat] || []).filter(w => w !== word);
      list.push(word);
      all[cat] = list.slice(-cap(cat));
      writeAll(all);
    },

    // The room exhausted these categories and wiped its own buckets. Forget
    // them here too: the group has demonstrably seen everything, so holding
    // the history back would only shrink the pool they restart with.
    clear(cats) {
      if (!cats || !cats.length) return;
      const all = readAll();
      let touched = false;
      cats.forEach(c => { if (all[c]) { delete all[c]; touched = true; } });
      if (touched) writeAll(all);
    },

    // { category: Set<word> } for pickWord(). Words the catalogue no longer
    // has are dropped, so an edit to a catalogue can't waste exclusion slots.
    recent() {
      const all = readAll();
      const out = {};
      for (const cat of Object.keys(all)) {
        const list = CATEGORIES[cat];
        if (!list) continue; // category was removed from the catalogue
        const live = new Set(list.map(e => e.w));
        const keep = all[cat].filter(w => live.has(w));
        if (keep.length) out[cat] = new Set(keep);
      }
      return out;
    },
  };
}
