// ============================================================
// THE SONG CATEGORIES THIS GAME OFFERS, AND IN WHAT ORDER
// ============================================================
// Ids only. The songs themselves stay in app.js, because they are 500 lines
// and nothing outside the game needs them.
//
// This is a module rather than a literal inside app.js because three things
// have to agree about the same list and they used to agree only by habit:
//
//   www/dance/app.js         offers these categories and picks songs by id
//   scripts/build.mjs        checks every id has a name and a description
//                            in each locale's bundle
//   scripts/check-songs.mjs  validates the pool behind each id (#163)
//
// An ID IS A VALUE, NOT A LABEL. It is the key into CATEGORIES, the value
// written to meta.categories that every other client reads, the played-ledger
// key, and an analytics counter key under games/categories/<id>. It stays
// English in every language; only `category.<id>.name` and `.desc` move.
// This is the split #135 made in word and #153 made in draw, arriving late
// here because dance was never internationalised at all (#170).
//
// `labelKey` is a key, not a string, for the same reason.

export const SONG_CATEGORY_GROUPS = [
  {
    labelKey: 'cat.group.international',
    ids: [
      'TikTok and Reels',
      "Today's Pop",
      'K-Pop',
      'Latin Hits',
      '80s Hits',
      '90s Hits',
    ],
  },
  {
    labelKey: 'cat.group.indian',
    ids: [
      'Bollywood',
      'Tamil',
      'Telugu',
      'Kannada',
      'Malayalam',
    ],
  },
];

// Flat, in picker order. The build checks this list against the runtime
// bundle, and app.js checks it against the song pools it actually ships.
export const SONG_CATEGORY_IDS = SONG_CATEGORY_GROUPS.flatMap((g) => g.ids);

// Every group heading, so the build can check those strings too. Rendered
// through t(group.labelKey), which is a variable and therefore invisible to
// the build's key scanner by design.
export const SONG_CATEGORY_GROUP_KEYS = SONG_CATEGORY_GROUPS.map((g) => g.labelKey);

// ============================================================
// THE SPANISH CATALOGUE (#164)
// ============================================================
// Four pools curated for /es/dance/. NOT OFFERED BY ANY PICKER YET: #165 is
// what makes the picker read a per-language list, and this ticket is only the
// songs and the ids. Declared here rather than left loose in app.js so that
// the two things which have to know about a pool already do:
//
//   scripts/check-songs.mjs  validates them, in US, ES and MX
//   www/dance/app.js         cross-checks pools against ids in both directions
//
// A pool nothing references is exactly the pool that goes stale unnoticed,
// which is the whole lesson of #163.
//
// The ids follow the same rule as every other id in this file, so they are
// English and they are stable. Only 'TikTok and Reels' collided with an
// English pool, so only it carries a qualifier. 'Global Hits' deliberately
// does not: that pool is language-neutral by construction, and an English
// picker could legitimately offer this exact list one day.
export const ES_SONG_CATEGORY_GROUPS = [
  {
    // One group, so the heading names the group's ROLE rather than the
    // language, the way draw's single group does. "Spanish" as a heading
    // inside a Spanish interface says nothing, and the key still reads right
    // if a second group is ever added beside it.
    labelKey: 'cat.group.main',
    ids: [
      'Spanish TikTok and Reels',
      'Reggaeton and Urbano',
      'Spanish Hits',
      'Global Hits',
    ],
  },
];

export const ES_SONG_CATEGORY_IDS = ES_SONG_CATEGORY_GROUPS.flatMap((g) => g.ids);

// Every id that must have a song pool behind it, in any language. This is the
// list for anything asking "does this pool exist and does it still work"; use
// SONG_CATEGORY_IDS for "what does the English picker offer", which is a
// different question and will stay different as more languages arrive.
export const ALL_SONG_CATEGORY_IDS = [...SONG_CATEGORY_IDS, ...ES_SONG_CATEGORY_IDS];
