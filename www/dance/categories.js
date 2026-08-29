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
