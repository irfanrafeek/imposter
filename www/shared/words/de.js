// ============================================================
// THE GERMAN WORD CATALOGUE
// ============================================================
// 550 entries across seven categories, every one carrying all three hint
// bands. Written with the easy band from the start, the way pt.js and fr.js
// were, so it never needs the retrofit pass Spanish took in #182 to #186.
//
// EMPTY ON PURPOSE RIGHT NOW. The registration (#305) lands before the
// content (#309), and an empty or partial catalogue is an anticipated state
// rather than a broken one: loadCatalog() falls back to English while the
// whole file is empty and says so in the console, pickWord() drops ids with
// no words, and check-words reports a short category as a warning until
// --strict. That is what lets this file be filled one category at a time.
//
// TWO CHECKER BUGS LAND BEFORE THE FIRST ENTRY IS WRITTEN (#306, #307).
// Neither is German's fault and both only show up in German:
//
//   norm() DELETES THE ESZETT.  Fuß folds to "fu" and Straße to "strae", so
//   the duplicate check both invents collisions that are not there and
//   misses the real one between Straße and Strasse. #306 expands it to ss.
//
//   THE SUBSTRING CHECK HAS NO LENGTH FLOOR.  German compounding means a
//   short noun sits inside an unrelated longer one constantly: Hut inside
//   Schutz, Ohr inside Rohr, Eis inside Reis, Arm inside Warm. Those are
//   hard errors today and they would fail the build on perfectly good
//   entries. #307 puts a floor on it.
//
// Writing entries against broken checks means authoring around them and
// then not knowing which entries were shaped by a real rule. #229 already
// paid for that lesson in the French epic.
//
// Written, not translated from en.js. Parity with any other catalogue is
// explicitly not a goal: a category that does not land at a German table is
// worth less than a shorter one that does. Food and Places are where this
// bites hardest, and neither should converge on the English list.
//
// STANDARD GERMAN, AND THAT IS A REGISTER RULE RATHER THAN A COUNTRY RULE
// (#304). Same call French made in #227, and for the same reason: German
// has one written standard with regional vocabulary sitting on top of it,
// so this file commits to a REGISTER. Write it the way Germany writes it
// and keep the jokes portable. A player in Vienna, Zürich or Hamburg should
// not be reading someone else's in-jokes.
//
// In practice the things to watch are vocabulary and slang, not grammar:
//
//   THE GENUINELY SPLIT EVERYDAY WORDS.  Brötchen against Semmel against
//   Schrippe, Sahne against Obers, Kartoffel against Erdapfel, Tüte against
//   Sackerl. These are not register differences, they are different words
//   for the same object, and picking the wrong one makes a round unplayable
//   for a whole country. Prefer the form that is read everywhere even where
//   it is not said, which is usually the northern German one.
//
//   YOUTH SLANG.  It dates within a year and it is regional on top of that.
//   A hint the impostor cannot parse is a dead round.
//
//   GERMANY-ONLY BRANDS AND INSTITUTIONS.  A word whose whole recognition
//   comes from a German supermarket aisle or a German TV schedule fails
//   outside Germany for the same reason a Portugal-only dish failed inside
//   pt.js. Prefer the thing over the brand.
//
// THE ESZETT IS WRITTEN, not spelled ss (#304). Standard German spelling
// after a long vowel or diphthong: Fuß, Straße, weiß, groß, heißen. Swiss
// German abolished it and writes ss throughout, but a Swiss reader reads ß
// without effort, while writing ss everywhere looks like a spelling mistake
// to the large majority in Germany and Austria. Capital ẞ is not used;
// hints are not set in all caps anywhere in the games.
//
// THE UMLAUT FOLDS, AND THAT MERGES A HANDFUL OF REAL WORDS. norm() strips
// the two dots, so Grün and Grun are one word to the checker. That is DIN
// 5007-1 and it is the right answer for the clue board, where an impostor
// typing Kase for the secret word Käse has to be caught (#244). The price
// is paid here: a few pairs that differ by nothing but the umlaut are two
// different German words and collide anyway.
//
//   Bär / Bar          a bear and a bar, and both want a place
//   Stück / Stuck       a piece and stucco
//   Vögel / Vogel       birds and a bird
//   schön / schon       beautiful and already
//
// No word may appear in two categories, so Bär in Animals beside Bar in
// Places is a hard error. WHEN THAT FIRES, CHOOSE A DIFFERENT WORD. Do not
// reach for the fold: it is shared, and the clue board wants the merge.
// The behaviour is pinned in scripts/words.test.mjs so nobody has to
// rediscover it at entry 300.
//
// THE GENDER TRAP EXISTS, AND ITS GERMAN SHAPE IS NOT THE ROMANCE ONE.
// Spanish and Portuguese leak gender through a final -o or -a, French
// through a trailing -e. German leaks it nowhere in the adjective at all:
// a PREDICATIVE adjective does not inflect. Der Apfel ist rot, die Banane
// ist rot, das Brot ist rot. So a bare one-word adjective hint, which is
// the form that cost French the most care, is free here.
//
// What leaks in German is the ARTICLE. Der Hund, eine Blume, das Messer
// each hand the impostor the noun's gender, and gender plus a category
// narrows the field hard. So the rule is a prefix test on der, die, das,
// ein, eine, dem and den rather than a suffix test, and an ending rule
// would be worse than useless: Zimmer, Wasser, Fenster, Messer, Lehrer,
// Kuchen, Wagen, Garten, Besen, Käse and Gebäude would all be flagged and
// none of them leak anything. #308 owns that rule, and GENDER_REVIEWED.de
// in scripts/check-words.mjs is the allowlist. Note the check does not run
// at all for a locale with no entry in that table.
//
// WHAT A HINT SHOULD BE IN GERMAN. Three forms are safe and all three
// sound like speech rather than a thesaurus:
//
//   BARE ADJECTIVES     Rot, Kalt, Laut, Rund, Bitter, Scharf, Klebrig.
//                       Uninflected in this position, so they carry no
//                       gender. This is the German saving over French,
//                       where the same band needed an allowlist.
//   INFINITIVE VERBS    Grillen, Teilen, Schmelzen, Gießen, Zittern,
//                       Streichen. The workhorse, as in Portuguese and
//                       French, and they double as nouns without changing
//                       shape.
//   CONCRETE NOUNS      Kruste, Kern, Schaum, Glut, Griff, Krümel. A noun
//                       carries its OWN gender rather than agreeing with
//                       the hidden word, so it leaks nothing. WRITE IT
//                       WITHOUT ITS ARTICLE.
//
// The bookish escape hatch is the same trap the other three hit: -heit,
// -keit and -ung abstractions (Cremigkeit, Beschaffenheit) are gender-safe
// and nobody says them, and a page of them is exactly what reads as
// machine-written.
//
// GERMAN CAPITALISES ITS NOUNS, and that is not a typo for a reviewer to
// fix. Every catalogue capitalises a hint's first letter already, so a
// one-word hint looks the same as in any other language. The difference is
// the SECOND word: in Heißer Tee the noun stays capitalised, and in Scharf
// anbraten the verb stays lowercase. Both are correct.
//
// PREFER ONE COMPOUND TO TWO WORDS where German would build one. Handschuh
// rather than Hand Schuh. That keeps hints inside the two-word limit and it
// is what a German speaker would actually write, but it is also exactly
// what makes #307 matter: a compound genuinely containing the secret word
// is a real leak the checker must keep catching.
//
// NO ELISION TRAP, which is the other place German is cheaper than French.
// German keeps a name in the nominative, so there is no d'Amélie problem
// and hints need no article-shaped decision at all.
//
// EVERY ENTRY GETS AT LEAST ONE PHYSICAL HINT. The other may be an
// occasion, and often should be, since the impostor sees one at random and
// that variance is what makes a round tense instead of solvable.
//
// A hint must not NAME the thing. The German trap for that is regional
// origin: Nürnberg on a Bratwurst or Schwarzwald on a Kirschtorte
// identifies the dish outright, and only the impostor sees it, so an
// identifying hint hands them something safe to say and makes them
// impossible to catch.
//
// THE CATEGORY IDS STAY ENGLISH AND ASCII. 'Food', not 'Essen'. An id is
// the key into this catalogue, the value written to meta.categories and
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
