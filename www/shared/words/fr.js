// ============================================================
// THE FRENCH WORD CATALOGUE
// ============================================================
// 550 entries across seven categories, every one carrying all three hint
// bands. Written with the easy band from the start, the way pt.js was, so
// it never needs the retrofit pass Spanish took in #182 to #186.
//
// EMPTY ON PURPOSE RIGHT NOW. The registration (#228) lands before the
// content (#230), and an empty or partial catalogue is an anticipated state
// rather than a broken one: loadCatalog() falls back to English while the
// whole file is empty and says so in the console, pickWord() drops ids with
// no words, and check-words reports a short category as a warning until
// --strict. That is what lets this file be filled one category at a time.
//
// Written, not translated from en.js. Parity with any other catalogue is
// explicitly not a goal: a category that does not land at a French table is
// worth less than a shorter one that does. Food and Places are where this
// bites hardest, and neither should converge on the English list.
//
// STANDARD FRENCH, AND THAT IS A REGISTER RULE RATHER THAN A COUNTRY RULE
// (#227). This is the difference from Portuguese. Brazil against Portugal
// was a fork between two real standards with sharp everyday splits, so
// pt.js had to commit to one country. French has one written standard with
// regional vocabulary sitting on top of it, so this file commits to a
// REGISTER instead: write it the way France writes it, and keep the jokes
// portable. A player in Montreal, Brussels, Geneva or Abidjan should not be
// reading someone else's in-jokes.
//
// In practice that means the thing to watch is slang, not grammar:
//
//   VERLAN AND YOUTH SLANG.  Meuf, relou, chelou, kiffer. Perfectly good
//   French in Paris and a shibboleth everywhere else. A hint the impostor
//   cannot parse is a dead round.
//
//   FRANCE-ONLY BRANDS AND INSTITUTIONS.  A word whose whole recognition
//   comes from a French supermarket aisle or a French TV schedule fails
//   outside France for the same reason a Portugal-only dish failed inside
//   pt.js. Prefer the thing over the brand.
//
// THE GENDER TRAP, and its French shape is NOT the Spanish one. An
// adjective hint carries gender, and a gendered adjective beside a gendered
// noun narrows the answer sharply. Spanish and Portuguese give that away
// with a final -o or -a. French gives it away with a trailing -e, plus
// -euse and -ve on the common irregulars: vert/verte, petit/petite,
// heureux/heureuse, vif/vive. The checker holds one pattern per language
// for exactly this reason (#229), and GENDER_REVIEWED.fr in
// scripts/check-words.mjs is the allowlist of endings that have been read
// and cleared. Note the check does not run at all for a locale with no
// entry in that table.
//
// WHAT A HINT SHOULD BE IN FRENCH, which the gender rule decides more than
// taste does. Three forms are safe and all three sound like speech rather
// than a thesaurus:
//
//   INFINITIVE VERBS   Griller, Partager, Fondre, Verser, Trembler,
//                      Etaler. The workhorse, exactly as in Portuguese.
//                      They end in -er/-ir/-re and carry no agreement at
//                      all.
//   INVARIANT ADJECTIVES  The ones already ending in -e in the masculine,
//                      so the feminine adds nothing: Rouge, Calme, Rapide,
//                      Facile, Tiede, Fragile, Sombre. These are the ones
//                      the checker will flag most often, and they are what
//                      the allowlist is for.
//   CONCRETE NOUNS     Croute, Noyau, Mousse, Braise, Manche, Miette. A
//                      noun carries its OWN gender rather than agreeing
//                      with the hidden word, so it leaks nothing.
//
// The bookish escape hatch is the same trap Spanish and Portuguese both
// hit: -ite and -eur abstractions (onctuosite, moelleux as a noun) are
// gender-safe and nobody says them, and a page of them is exactly what
// reads as machine-written.
//
// ELISION, WHICH IS NEW HERE. French hints want articles: d'hiver, l'ete,
// a table. tokens() splits on every non-alphanumeric, so d'hiver becomes
// two tokens and nothing breaks. The decision is editorial, not technical:
// bare or elided has to be chosen once and held, or the hints read
// inconsistently. THIS FILE WRITES THEM BARE wherever the phrase survives
// it, and carries the article only where dropping it changes the sense.
//
// EVERY ENTRY GETS AT LEAST ONE PHYSICAL HINT. The other may be an
// occasion, and often should be, since the impostor sees one at random and
// that variance is what makes a round tense instead of solvable.
//
// A hint must not NAME the thing. The French trap for that is regional
// origin: Savoie on a Tartiflette or Marseille on a Bouillabaisse
// identifies the dish outright, and only the impostor sees it, so an
// identifying hint hands them something safe to say and makes them
// impossible to catch.
//
// THE CATEGORY IDS STAY ENGLISH AND ASCII. 'Food', not 'Nourriture'. An id
// is the key into this catalogue, the value written to meta.categories and
// read by every other player in the room, the played-ledger key both on the
// room and in localStorage, and the analytics counter key. Only the display
// names move, and those live in the runtime string table as
// category.<id>.name and .desc. See the header of index.js and #135.
//
// The entry shape and the three hint bands are documented once, in
// index.js. Read that before writing a hint.

export const WORD_CATEGORIES = {
  'Food': [],
  'Animals': [],
  'Places': [],
  'Everyday Objects': [],
  'Movies & TV': [],
  'Football': [],
  'Super Heroes': [],
};
