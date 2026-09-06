// ============================================================
// THE SONG CATEGORIES THIS GAME OFFERS, PER LANGUAGE
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
//
// WHICH POOLS A LANGUAGE OFFERS IS NOT WHICH POOLS EXIST (#165). Every pool
// lives in the one CATEGORIES literal and any room can play any of them; this
// file only decides what each language's picker puts in front of a host. Draw
// already works this way, offering four of the word catalogue's seven
// categories through DRAWABLE, and this is the same idea with a language
// rather than a drawability as the reason.

import { baseLang, DEFAULT_LANG } from '../shared/lang.js';

// ------------------------------------------------------------
// WHAT EACH LANGUAGE OFFERS
// ------------------------------------------------------------
// Spanish offers the four curated for it in #164, and NOT the English list
// translated: the five Indian-language pools are dead weight for a Spanish
// speaker, and eleven rows to scroll through to reach the one you want is
// worse than four. Portuguese offers four on the same reasoning (#213).
//
// Three of the four rows differ per language and the fourth, Global Hits, is
// the same pool in both. That is the point of an id naming a list of songs
// rather than a language's list: nothing had to be copied for Portuguese to
// offer it, and nothing had to be copied for English to take four of these
// six in #223. Moving a pool across is a change to this table and nothing
// else, which is exactly what that turned out to be.
//
// English does NOT take all six. Global Hits is redundant beside Today's Pop
// and TikTok and Reels, which the Spanish and Portuguese pickers do not have.
// Spanish TikTok and Reels is nearly two thirds duplicated against Latin Hits
// and TikTok and Reels combined, so it buys a row of scrolling and little new
// music. Sertanejo overlaps nothing at all, which is the argument against it
// rather than for it: the overlap is zero because it is unknown outside
// Brazil, and a round nobody in the room recognises is not a round. Funk
// Brasileiro shares that zero and still travels, through Anitta and the
// TikTok wave, which is why it crossed and Sertanejo did not.
//
// `default` is the category a room starts in before anyone opens the picker.
// It has to be a category that language OFFERS, or a host who never opens the
// picker plays a list their own picker cannot show as selected. That is why
// it sits here beside the groups rather than as one constant in app.js.
const CATALOGUE = {
  en: {
    default: 'TikTok and Reels',
    groups: [
      {
        labelKey: 'cat.group.international',
        ids: [
          'TikTok and Reels',
          "Today's Pop",
          'K-Pop',
          // Beside K-Pop rather than in a group of its own (#226). A heading
          // over a single row says nothing the row does not already say, and
          // these two are the same kind of thing: one regional pool a player
          // reaches for by name. Latin and Indian earned headings by holding
          // five rows each.
          'Arabic Hits',
          '80s Hits',
          '90s Hits',
        ],
      },
      {
        // Latin Hits used to sit in International and moved here (#223). A
        // heading reading Latin directly above a row reading Latin Hits in
        // another group reads as a mistake, and this is where that pool
        // belonged anyway. Only the picker position moved: the id is the
        // value on the wire, so no room, ledger or counter noticed.
        labelKey: 'cat.group.latin',
        ids: [
          'Latin Hits',
          'Reggaeton and Urbano',
          'Spanish Hits',
          'Brazilian TikTok and Reels',
          'Funk Brasileiro',
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
    ],
  },
  es: {
    default: 'Spanish TikTok and Reels',
    groups: [
      {
        // One group, so the heading names the group's ROLE rather than the
        // language: "Spanish" as a heading inside a Spanish interface says
        // nothing. It is the same key, and the same single-group shape, that
        // word and draw already use in both languages.
        labelKey: 'cat.group.main',
        ids: [
          'Spanish TikTok and Reels',
          'Reggaeton and Urbano',
          'Spanish Hits',
          'Global Hits',
        ],
      },
    ],
  },
  pt: {
    default: 'Brazilian TikTok and Reels',
    groups: [
      {
        // One group again, and the same key: see the Spanish note above.
        labelKey: 'cat.group.main',
        ids: [
          'Brazilian TikTok and Reels',
          'Funk Brasileiro',
          'Sertanejo',
          'Global Hits',
        ],
      },
    ],
  },
};

// Every language with its own list. The build walks this to check that each
// one's strings exist; nothing needs it at runtime, where a page knows its
// own language and only its own.
export const SONG_CATALOGUE_LANGS = Object.keys(CATALOGUE);

// A language this build has no list for gets English rather than nothing.
// That is not a hypothetical: #138 lets a player land on a page in one
// language holding a room created in another, and a picker with no rows in
// it is a worse answer than a picker in the wrong language.
function catalogueFor(lang) {
  return CATALOGUE[baseLang(lang)] || CATALOGUE[DEFAULT_LANG];
}

// The picker's own shape: groups in order, each with a heading key and its
// ids. Display order is this order.
export function songCategoryGroups(lang) {
  return catalogueFor(lang).groups;
}

// Flat, in picker order. The build checks this list against the locale's
// runtime bundle, and app.js checks it against the song pools it ships.
export function songCategoryIds(lang) {
  return catalogueFor(lang).groups.flatMap((g) => g.ids);
}

// Every group heading, so the build can check those strings too. They are
// rendered as t(group.labelKey), and a key held in a variable is invisible to
// the build's key scanner by design.
export function songCategoryGroupKeys(lang) {
  return catalogueFor(lang).groups.map((g) => g.labelKey);
}

// What a new room plays before anyone chooses.
export function defaultSongCategory(lang) {
  return catalogueFor(lang).default;
}

// Every id that must have a song pool behind it, in any language. This is the
// list for anything asking "does this pool exist and does it still work".
// Use songCategoryIds(lang) for "what does this language's picker offer",
// which is a different question and stays different as languages arrive.
//
// Deduplicated, because two languages offering the same pool is expected: an
// id names one list of songs, not one language's list. It is also why an id
// missing from here is a dead pool rather than a merge, and why the build
// asserts this set against the CATEGORIES literal in both directions.
export const ALL_SONG_CATEGORY_IDS = [
  ...new Set(SONG_CATALOGUE_LANGS.flatMap((lang) => songCategoryIds(lang))),
];
