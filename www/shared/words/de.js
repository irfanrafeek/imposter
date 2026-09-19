// ============================================================
// THE GERMAN WORD CATALOGUE
// ============================================================
// 550 entries across seven categories, every one carrying all three hint
// bands. Written with the easy band from the start, the way pt.js and fr.js
// were, so it never needs the retrofit pass Spanish took in #182 to #186.
//
// FILLED IN #309, one category at a time against the checker. An empty or
// partial catalogue was an anticipated state rather than a broken one while
// that was happening: loadCatalog() falls back to English while the whole
// file is empty and says so in the console, pickWord() drops ids with no
// words, and check-words reports a short category as a warning until
// --strict. That is what let this file arrive in seven pieces.
//
// TWO CHECKER BUGS LANDED BEFORE THE FIRST ENTRY WAS WRITTEN (#306, #307).
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
// paid for that lesson in the French epic. Both were fixed first, and both
// earned it: the eszett fix is what lets Fuß and Fußball be caught as the
// leak they are, and the floor cleared eight hard errors on entries with
// nothing wrong with them.
//
// WHAT THE CHECKER CAUGHT ONCE THE ENTRIES EXISTED is worth one line,
// because it is the trade this file was warned about below and it turned up
// on the first pass: Löcher as a hint for Käse folds to "locher" and
// collides with Locher, the hole punch, over in Everyday Objects. The fold
// is doing what it was built to do. The hint changed; the fold did not.
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
// The checker understands it since #306, which expands it to ss rather than
// deleting it. That is what makes writing it free: the catalogue can spell a
// word the German way and still be checked against the Swiss spelling.
//
// THE FOLD MERGES A HANDFUL OF REAL GERMAN WORDS, AND THAT IS THE TRADE.
// norm() strips the two dots off an umlaut, so Grün and Grun are one word
// to the checker, and it expands ß to ss, so Straße and Strasse are one
// word too (#306). Both rules are right for the clue board, where an
// impostor typing Kase for the secret word Käse, or Fuss for Fuß, has to
// be caught (#244). The price is paid here, on the pairs that differ by
// nothing but the mark and are still two different words:
//
//   Bär / Bar          a bear and a bar, and both want a place
//   Stück / Stuck       a piece and stucco
//   Vögel / Vogel       birds and a bird
//   schön / schon       beautiful and already
//   Maße / Masse        measurements and mass
//   Buße / Busse        penance and buses
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
// none of them leak anything. That rule is live since #308: the checker
// warns `uses the article "der", which announces the word's gender`, and
// it matches a WHOLE token, so Dienstag, Einhorn and Denkmal are all fine.
// GENDER_REVIEWED.de in scripts/check-words.mjs is the allowlist and is
// expected to stay empty, because an article is never a false positive the
// way a Romance ending is. Note the check does not run at all for a locale
// with no entry in that table.
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
// SUPER HEROES IS DELIBERATELY NOT THE ENGLISH ROSTER, and if a future pass
// "corrects" it back the not-a-translation test in scripts/words.test.mjs
// will fail. German keeps the English name for almost the whole Marvel and
// DC line-up, the way French does, so the correct German entry IS the
// English string and the first draft came in at 90% identical. It was
// brought down to 54% by replacing eighteen of the most generic entries
// with heroes a German room actually grew up with: Phantomias, Perry
// Rhodan, Captain Future, Sigurd, Nick Knatterton, the Abrafaxe, and the
// anime and comic figures that ran here rather than in the US, Son-Goku,
// Sailor Moon, Ruffy, Saber Rider, Asterix and Obelix. That is a better
// list for this room, not a test-shaped one, which is the same call #230
// made for French.
//
// The entry shape and the three hint bands are documented once, in
// index.js. Read that before writing a hint.

export const WORD_CATEGORIES = {
  'Food': [
    { w: 'Brötchen', h: 'Knusprig', h2: 'Aufbacken', h3: 'Frühstück' },
    { w: 'Brezel', h: 'Gesalzen', h2: 'Verknotet', h3: 'Oktoberfest' },
    { w: 'Schwarzbrot', h: 'Kräftig', h2: 'Scheiben', h3: 'Abendbrot' },
    { w: 'Zwieback', h: 'Trocken', h2: 'Steinhart', h3: 'Krankenbett' },
    { w: 'Streuselkuchen', h: 'Bröselig', h2: 'Backblech', h3: 'Kaffeetafel' },
    { w: 'Bienenstich', h: 'Mandeln', h2: 'Füllung', h3: 'Kaffeetafel' },
    { w: 'Apfelstrudel', h: 'Blättrig', h2: 'Rosinen', h3: 'Kaffeehaus' },
    { w: 'Käsekuchen', h: 'Cremig', h2: 'Springform', h3: 'Kaffeetafel' },
    { w: 'Marmorkuchen', h: 'Gemustert', h2: 'Rühren', h3: 'Geburtstag' },
    { w: 'Lebkuchen', h: 'Würzig', h2: 'Weich', h3: 'Weihnachtsmarkt' },
    { w: 'Stollen', h: 'Puderzucker', h2: 'Schwer', h3: 'Weihnachten' },
    { w: 'Zimtschnecke', h: 'Gerollt', h2: 'Klebrig', h3: 'Sonntagmorgen' },
    { w: 'Donauwelle', h: 'Geschichtet', h2: 'Kirschen', h3: 'Kaffeetafel' },
    { w: 'Schokolade', h: 'Schmelzen', h2: 'Rippen', h3: 'Pause' },
    { w: 'Marzipan', h: 'Formbar', h2: 'Mandelig', h3: 'Weihnachtsteller' },
    { w: 'Pudding', h: 'Wackeln', h2: 'Löffeln', h3: 'Nachtisch' },
    { w: 'Gummibärchen', h: 'Kauen', h2: 'Tüte', h3: 'Fernsehabend' },
    { w: 'Lakritz', h: 'Salzig', h2: 'Schwarz', h3: 'Kindheit' },
    { w: 'Eis', h: 'Kalt', h2: 'Tropfen', h3: 'Sommer' },
    { w: 'Sahne', h: 'Schlagen', h2: 'Steif', h3: 'Kaffeetafel' },
    { w: 'Quark', h: 'Sauer', h2: 'Verrühren', h3: 'Vorratsfach' },
    { w: 'Joghurt', h: 'Becher', h2: 'Gerührt', h3: 'Frühstück' },
    { w: 'Butter', h: 'Streichen', h2: 'Gelblich', h3: 'Frühstückstisch' },
    { w: 'Käse', h: 'Reifen', h2: 'Streng', h3: 'Frühstück' },
    { w: 'Wurst', h: 'Gepökelt', h2: 'Aufschneiden', h3: 'Grillabend' },
    { w: 'Bratwurst', h: 'Rost', h2: 'Knackig', h3: 'Grillabend' },
    { w: 'Currywurst', h: 'Gewürzt', h2: 'Pappteller', h3: 'Straßenecke' },
    { w: 'Leberkäse', h: 'Gebacken', h2: 'Handlich', h3: 'Mittagspause' },
    { w: 'Schnitzel', h: 'Paniert', h2: 'Klopfen', h3: 'Gasthaus' },
    { w: 'Frikadelle', h: 'Flach', h2: 'Gebraten', h3: 'Picknick' },
    { w: 'Roulade', h: 'Gerollt', h2: 'Gefüllt', h3: 'Sonntagsessen' },
    { w: 'Gulasch', h: 'Schmoren', h2: 'Würfel', h3: 'Winterabend' },
    { w: 'Sauerbraten', h: 'Mariniert', h2: 'Dunkel', h3: 'Sonntagsessen' },
    { w: 'Eisbein', h: 'Deftig', h2: 'Gepökelt', h3: 'Wirtshaus' },
    { w: 'Kassler', h: 'Geräuchert', h2: 'Herzhaft', h3: 'Wirtshaus' },
    { w: 'Hackbraten', h: 'Geformt', h2: 'Ofen', h3: 'Familienessen' },
    { w: 'Klopse', h: 'Kapern', h2: 'Sämig', h3: 'Kantine' },
    { w: 'Hähnchen', h: 'Keule', h2: 'Knusprig', h3: 'Grillstand' },
    { w: 'Ente', h: 'Fettig', h2: 'Gebraten', h3: 'Weihnachten' },
    { w: 'Gans', h: 'Prall', h2: 'Füllung', h3: 'Festessen' },
    { w: 'Forelle', h: 'Zart', h2: 'Gräten', h3: 'Angeln' },
    { w: 'Hering', h: 'Eingelegt', h2: 'Silbrig', h3: 'Fischbude' },
    { w: 'Matjes', h: 'Roh', h2: 'Mild', h3: 'Fischbude' },
    { w: 'Lachs', h: 'Räuchern', h2: 'Rosa', h3: 'Feiertag' },
    { w: 'Krabben', h: 'Winzig', h2: 'Pulen', h3: 'Nordsee' },
    { w: 'Kartoffel', h: 'Schälen', h2: 'Knollig', h3: 'Acker' },
    { w: 'Pommes', h: 'Frittiert', h2: 'Goldgelb', h3: 'Jahrmarkt' },
    { w: 'Knödel', h: 'Rund', h2: 'Formen', h3: 'Sonntagsessen' },
    { w: 'Spätzle', h: 'Geschabt', h2: 'Eierreich', h3: 'Gasthaus' },
    { w: 'Nudeln', h: 'Kochen', h2: 'Abgießen', h3: 'Mittagessen' },
    { w: 'Reis', h: 'Körnig', h2: 'Quellen', h3: 'Beilage' },
    { w: 'Suppe', h: 'Dampfend', h2: 'Löffeln', h3: 'Krankenbett' },
    { w: 'Eintopf', h: 'Sättigend', h2: 'Umrühren', h3: 'Winterabend' },
    { w: 'Linsen', h: 'Erdig', h2: 'Einweichen', h3: 'Wintertag' },
    { w: 'Erbsen', h: 'Grün', h2: 'Rollen', h3: 'Tiefkühlfach' },
    { w: 'Sauerkraut', h: 'Gegoren', h2: 'Fein gehobelt', h3: 'Wirtshaus' },
    { w: 'Rotkohl', h: 'Eingekocht', h2: 'Violett', h3: 'Weihnachten' },
    { w: 'Spargel', h: 'Stechen', h2: 'Weiß', h3: 'Frühling' },
    { w: 'Kohlrabi', h: 'Knackig', h2: 'Roh', h3: 'Gemüsebeet' },
    { w: 'Gurke', h: 'Wässrig', h2: 'Einlegen', h3: 'Salatschüssel' },
    { w: 'Tomate', h: 'Saftig', h2: 'Rot', h3: 'Balkonkasten' },
    { w: 'Zwiebel', h: 'Beißend', h2: 'Hacken', h3: 'Küchenbrett' },
    { w: 'Knoblauch', h: 'Streng', h2: 'Zehen', h3: 'Küchenbrett' },
    { w: 'Paprika', h: 'Bunt', h2: 'Hohl', h3: 'Gemüsebeet' },
    { w: 'Pilze', h: 'Dunkel', h2: 'Sammeln', h3: 'Herbstwald' },
    { w: 'Apfel', h: 'Kernig', h2: 'Pflücken', h3: 'Obstwiese' },
    { w: 'Birne', h: 'Süßlich', h2: 'Bauchig', h3: 'Obstwiese' },
    { w: 'Kirsche', h: 'Prall', h2: 'Kern', h3: 'Obstbaum' },
    { w: 'Erdbeere', h: 'Duftend', h2: 'Gezuckert', h3: 'Feld' },
    { w: 'Himbeere', h: 'Samtig', h2: 'Zerfallen', h3: 'Strauch' },
    { w: 'Traube', h: 'Kernlos', h2: 'Gedrängt', h3: 'Weinberg' },
    { w: 'Banane', h: 'Krumm', h2: 'Weich', h3: 'Schulranzen' },
    { w: 'Orange', h: 'Spalten', h2: 'Dickschalig', h3: 'Winter' },
    { w: 'Zitrone', h: 'Sauer', h2: 'Pressen', h3: 'Teeglas' },
    { w: 'Melone', h: 'Prall', h2: 'Schwer', h3: 'Picknick' },
    { w: 'Nuss', h: 'Knacken', h2: 'Schalig', h3: 'Weihnachtsteller' },
    { w: 'Honig', h: 'Zähflüssig', h2: 'Golden', h3: 'Frühstück' },
    { w: 'Marmelade', h: 'Einkochen', h2: 'Süß', h3: 'Vorratsschrank' },
    { w: 'Senf', h: 'Scharf', h2: 'Klecks', h3: 'Imbissbude' },
    { w: 'Ketchup', h: 'Süßlich', h2: 'Quetschbar', h3: 'Imbissbude' },
    { w: 'Essig', h: 'Spritzer', h2: 'Stechend', h3: 'Salatschüssel' },
    { w: 'Öl', h: 'Glänzend', h2: 'Gießen', h3: 'Küchenregal' },
    { w: 'Salz', h: 'Streuen', h2: 'Körnig', h3: 'Küchentisch' },
    { w: 'Pfeffer', h: 'Mahlen', h2: 'Niesen', h3: 'Küchentisch' },
    { w: 'Zucker', h: 'Rieseln', h2: 'Kristalle', h3: 'Kaffeetasse' },
    { w: 'Mehl', h: 'Stauben', h2: 'Sieben', h3: 'Backschüssel' },
    { w: 'Hefe', h: 'Blasen', h2: 'Gehen lassen', h3: 'Teigschüssel' },
    { w: 'Teig', h: 'Kneten', h2: 'Dehnbar', h3: 'Backschüssel' },
    { w: 'Ei', h: 'Zerbrechlich', h2: 'Pellen', h3: 'Frühstückstisch' },
    { w: 'Milch', h: 'Aufschäumen', h2: 'Weiß', h3: 'Müslischale' },
    { w: 'Kakao', h: 'Pulvrig', h2: 'Wärmend', h3: 'Winterabend' },
    { w: 'Kaffee', h: 'Bitter', h2: 'Aufbrühen', h3: 'Morgen' },
    { w: 'Tee', h: 'Ziehen lassen', h2: 'Kräuter', h3: 'Krankenbett' },
    { w: 'Limonade', h: 'Prickelnd', h2: 'Strohhalm', h3: 'Kindergeburtstag' },
    { w: 'Apfelschorle', h: 'Verdünnt', h2: 'Spritzig', h3: 'Sportplatz' },
    { w: 'Bier', h: 'Zapfen', h2: 'Schaum', h3: 'Oktoberfest' },
    { w: 'Wein', h: 'Schwenken', h2: 'Jahrgang', h3: 'Feierabend' },
    { w: 'Schnaps', h: 'Brennen', h2: 'Klar', h3: 'Stammtisch' },
    { w: 'Glühwein', h: 'Nelken', h2: 'Zimt', h3: 'Weihnachtsmarkt' },
    { w: 'Salat', h: 'Waschen', h2: 'Knackfrisch', h3: 'Mittagstisch' },
  ],
  'Animals': [
    { w: 'Hund', h: 'Treu', h2: 'Bellen', h3: 'Gassirunde' },
    { w: 'Katze', h: 'Schnurren', h2: 'Geschmeidig', h3: 'Sofalehne' },
    { w: 'Kuh', h: 'Wiederkäuen', h2: 'Gefleckt', h3: 'Weide' },
    { w: 'Schwein', h: 'Rosig', h2: 'Suhlen', h3: 'Stall' },
    { w: 'Schaf', h: 'Wollig', h2: 'Blöken', h3: 'Koppel' },
    { w: 'Ziege', h: 'Meckern', h2: 'Kletternd', h3: 'Bergwiese' },
    { w: 'Pferd', h: 'Wiehern', h2: 'Galopp', h3: 'Reitstall' },
    { w: 'Esel', h: 'Störrisch', h2: 'Langohrig', h3: 'Bergpfad' },
    { w: 'Huhn', h: 'Scharren', h2: 'Gackern', h3: 'Futterschale' },
    { w: 'Hahn', h: 'Krähen', h2: 'Prahlerisch', h3: 'Misthaufen' },
    { w: 'Truthahn', h: 'Kollern', h2: 'Plump', h3: 'Festtafel' },
    { w: 'Kaninchen', h: 'Buddeln', h2: 'Anschmiegsam', h3: 'Gehege' },
    { w: 'Hase', h: 'Hoppeln', h2: 'Flink', h3: 'Feldrand' },
    { w: 'Maus', h: 'Winzig', h2: 'Piepsen', h3: 'Speicher' },
    { w: 'Ratte', h: 'Gewitzt', h2: 'Nagen', h3: 'Kanalschacht' },
    { w: 'Hamster', h: 'Backentaschen', h2: 'Laufrad', h3: 'Käfig' },
    { w: 'Meerschweinchen', h: 'Quieken', h2: 'Rundlich', h3: 'Streichelzoo' },
    { w: 'Igel', h: 'Stachelig', h2: 'Einrollen', h3: 'Laubhaufen' },
    { w: 'Maulwurf', h: 'Blind', h2: 'Erdhügel', h3: 'Rasenfläche' },
    { w: 'Fuchs', h: 'Schlau', h2: 'Rötlich', h3: 'Waldrand' },
    { w: 'Wolf', h: 'Rudel', h2: 'Heulen', h3: 'Wildnis' },
    { w: 'Bär', h: 'Zottig', h2: 'Brummen', h3: 'Nadelwald' },
    { w: 'Hirsch', h: 'Geweih', h2: 'Röhren', h3: 'Lichtung' },
    { w: 'Reh', h: 'Scheu', h2: 'Zierlich', h3: 'Wiesenrand' },
    { w: 'Wildschwein', h: 'Borstig', h2: 'Wühlen', h3: 'Unterholz' },
    { w: 'Dachs', h: 'Gestreift', h2: 'Nachtaktiv', h3: 'Erdbau' },
    { w: 'Eichhörnchen', h: 'Buschig', h2: 'Klettern', h3: 'Parkbaum' },
    { w: 'Fledermaus', h: 'Kopfüber', h2: 'Dämmerung', h3: 'Abendhimmel' },
    { w: 'Biber', h: 'Fällen', h2: 'Breitschwanz', h3: 'Flussufer' },
    { w: 'Otter', h: 'Glatt', h2: 'Tauchen', h3: 'Bachlauf' },
    { w: 'Marder', h: 'Zerbeißen', h2: 'Geschmeidig', h3: 'Motorhaube' },
    { w: 'Wiesel', h: 'Schlank', h2: 'Blitzschnell', h3: 'Steinhaufen' },
    { w: 'Frosch', h: 'Quaken', h2: 'Hüpfen', h3: 'Teich' },
    { w: 'Kröte', h: 'Warzig', h2: 'Träge', h3: 'Tümpel' },
    { w: 'Molch', h: 'Glitschig', h2: 'Gemächlich', h3: 'Gartenteich' },
    { w: 'Eidechse', h: 'Sonnen', h2: 'Huschen', h3: 'Mauerritze' },
    { w: 'Schlange', h: 'Züngeln', h2: 'Ringeln', h3: 'Terrarium' },
    { w: 'Schildkröte', h: 'Langsam', h2: 'Panzer', h3: 'Terrarium' },
    { w: 'Krokodil', h: 'Lauern', h2: 'Schuppig', h3: 'Flussmündung' },
    { w: 'Vogel', h: 'Zwitschern', h2: 'Flattern', h3: 'Futterhaus' },
    { w: 'Spatz', h: 'Frech', h2: 'Tschilpen', h3: 'Straßencafé' },
    { w: 'Amsel', h: 'Flöten', h2: 'Pechschwarz', h3: 'Vorgarten' },
    { w: 'Meise', h: 'Gelbbäuchig', h2: 'Picken', h3: 'Futterhaus' },
    { w: 'Specht', h: 'Hämmern', h2: 'Buntgefiedert', h3: 'Baumstamm' },
    { w: 'Eule', h: 'Lautlos', h2: 'Wachsam', h3: 'Mitternacht' },
    { w: 'Uhu', h: 'Riesig', h2: 'Rufen', h3: 'Felswand' },
    { w: 'Adler', h: 'Majestätisch', h2: 'Kreisen', h3: 'Gebirge' },
    { w: 'Falke', h: 'Sturzflug', h2: 'Scharfäugig', h3: 'Kirchturm' },
    { w: 'Storch', h: 'Klappern', h2: 'Langbeinig', h3: 'Schornstein' },
    { w: 'Schwan', h: 'Anmutig', h2: 'Zischen', h3: 'Schlossteich' },
    { w: 'Möwe', h: 'Kreischen', h2: 'Aufdringlich', h3: 'Hafenmauer' },
    { w: 'Reiher', h: 'Reglos', h2: 'Langhalsig', h3: 'Schilfgürtel' },
    { w: 'Kranich', h: 'Ziehen', h2: 'Trompeten', h3: 'Herbsthimmel' },
    { w: 'Rabe', h: 'Krächzen', h2: 'Düster', h3: 'Feldweg' },
    { w: 'Elster', h: 'Diebisch', h2: 'Schwarzweiß', h3: 'Gartenzaun' },
    { w: 'Taube', h: 'Gurren', h2: 'Zutraulich', h3: 'Brunnenrand' },
    { w: 'Kuckuck', h: 'Fremdnest', h2: 'Zweisilbig', h3: 'Frühlingswald' },
    { w: 'Schwalbe', h: 'Pfeilschnell', h2: 'Gabelschwanz', h3: 'Stallbalken' },
    { w: 'Pinguin', h: 'Watscheln', h2: 'Gedrungen', h3: 'Eisscholle' },
    { w: 'Papagei', h: 'Nachplappern', h2: 'Farbenprächtig', h3: 'Zoohandlung' },
    { w: 'Flamingo', h: 'Einbeinig', h2: 'Rosarot', h3: 'Salzsee' },
    { w: 'Strauß', h: 'Rennen', h2: 'Riesenhaft', h3: 'Sandboden' },
    { w: 'Pfau', h: 'Radschlagen', h2: 'Eitel', h3: 'Schlosspark' },
    { w: 'Karpfen', h: 'Bartfäden', h2: 'Schlammig', h3: 'Weiher' },
    { w: 'Hecht', h: 'Lauernd', h2: 'Spitzmaulig', h3: 'Seegrund' },
    { w: 'Aal', h: 'Schlängeln', h2: 'Dunkelhäutig', h3: 'Reuse' },
    { w: 'Wels', h: 'Bärtig', h2: 'Grundnah', h3: 'Flussgrund' },
    { w: 'Hai', h: 'Furchterregend', h2: 'Rückenflosse', h3: 'Riff' },
    { w: 'Wal', h: 'Gewaltig', h2: 'Blasloch', h3: 'Ozean' },
    { w: 'Delfin', h: 'Verspielt', h2: 'Springend', h3: 'Meereswellen' },
    { w: 'Robbe', h: 'Speckig', h2: 'Behäbig', h3: 'Sandbank' },
    { w: 'Qualle', h: 'Durchsichtig', h2: 'Nesselnd', h3: 'Brandung' },
    { w: 'Krebs', h: 'Zwicken', h2: 'Rückwärts', h3: 'Felsküste' },
    { w: 'Tintenfisch', h: 'Tentakel', h2: 'Ausweichend', h3: 'Meeresgrund' },
    { w: 'Seestern', h: 'Fünfarmig', h2: 'Nachwachsend', h3: 'Strandgut' },
    { w: 'Muschel', h: 'Zuklappen', h2: 'Gerippt', h3: 'Strandgut' },
    { w: 'Schnecke', h: 'Kriechen', h2: 'Schleimspur', h3: 'Gemüsebeet' },
    { w: 'Regenwurm', h: 'Ringelig', h2: 'Wühlend', h3: 'Blumenerde' },
    { w: 'Spinne', h: 'Achtbeinig', h2: 'Gewebe', h3: 'Kellerecke' },
    { w: 'Biene', h: 'Summen', h2: 'Fleißig', h3: 'Blütenfeld' },
    { w: 'Wespe', h: 'Stechend', h2: 'Zudringlich', h3: 'Kaffeetisch' },
    { w: 'Hummel', h: 'Pelzig', h2: 'Tieftönend', h3: 'Lavendel' },
    { w: 'Ameise', h: 'Emsig', h2: 'Tragfähig', h3: 'Waldboden' },
    { w: 'Käfer', h: 'Gepanzert', h2: 'Krabbeln', h3: 'Baumrinde' },
    { w: 'Marienkäfer', h: 'Gepunktet', h2: 'Glücksbringer', h3: 'Fensterbrett' },
    { w: 'Schmetterling', h: 'Gaukeln', h2: 'Zartflügelig', h3: 'Sommerwiese' },
    { w: 'Libelle', h: 'Schwirren', h2: 'Schillernd', h3: 'Seeufer' },
    { w: 'Grille', h: 'Zirpen', h2: 'Verborgen', h3: 'Sommernacht' },
    { w: 'Heuschrecke', h: 'Schnellend', h2: 'Dürr', h3: 'Trockenwiese' },
    { w: 'Mücke', h: 'Surren', h2: 'Lästig', h3: 'Sommerabend' },
    { w: 'Fliege', h: 'Sirrend', h2: 'Unruhig', h3: 'Fensterscheibe' },
    { w: 'Floh', h: 'Springkräftig', h2: 'Unsichtbar', h3: 'Fell' },
    { w: 'Laus', h: 'Kratzen', h2: 'Hartnäckig', h3: 'Schulklasse' },
    { w: 'Löwe', h: 'Mähne', h2: 'Brüllen', h3: 'Savanne' },
    { w: 'Tiger', h: 'Streifen', h2: 'Anschleichen', h3: 'Dschungel' },
    { w: 'Elefant', h: 'Rüssel', h2: 'Grau', h3: 'Steppe' },
    { w: 'Giraffe', h: 'Hochgewachsen', h2: 'Tupfen', h3: 'Baumwipfel' },
    { w: 'Nashorn', h: 'Wuchtig', h2: 'Dickhäutig', h3: 'Grasland' },
    { w: 'Affe', h: 'Nachahmen', h2: 'Behände', h3: 'Urwald' },
    { w: 'Zebra', h: 'Gestreift', h2: 'Herdenhaft', h3: 'Savanne' },
  ],
  'Places': [
    { w: 'Bahnhof', h: 'Durchgangsort', h2: 'Ansagen', h3: 'Gleiswechsel' },
    { w: 'Flughafen', h: 'Abheben', h2: 'Warteschlange', h3: 'Abflugtafel' },
    { w: 'Haltestelle', h: 'Fahrplan', h2: 'Ungeduldig', h3: 'Nieselregen' },
    { w: 'Krankenhaus', h: 'Steril', h2: 'Kittel', h3: 'Besuchszeit' },
    { w: 'Apotheke', h: 'Rezept', h2: 'Beratung', h3: 'Grippezeit' },
    { w: 'Schule', h: 'Pausenhof', h2: 'Klingel', h3: 'Zeugnistag' },
    { w: 'Universität', h: 'Vorlesung', h2: 'Hörsaal', h3: 'Semesterbeginn' },
    { w: 'Kindergarten', h: 'Basteln', h2: 'Lärmend', h3: 'Morgenkreis' },
    { w: 'Bibliothek', h: 'Leise', h2: 'Regale', h3: 'Lesekarte' },
    { w: 'Museum', h: 'Ausgestellt', h2: 'Geräuschlos', h3: 'Schulausflug' },
    { w: 'Theater', h: 'Vorhang', h2: 'Applaus', h3: 'Premiere' },
    { w: 'Kino', h: 'Abgedunkelt', h2: 'Leinwand', h3: 'Popcorntüte' },
    { w: 'Oper', h: 'Gesang', h2: 'Prunkvoll', h3: 'Abendgarderobe' },
    { w: 'Konzerthalle', h: 'Akustik', h2: 'Beifall', h3: 'Kartenvorverkauf' },
    { w: 'Stadion', h: 'Flutlicht', h2: 'Gesänge', h3: 'Anstoß' },
    { w: 'Schwimmbad', h: 'Gechlort', h2: 'Rutsche', h3: 'Badetasche' },
    { w: 'Sauna', h: 'Aufguss', h2: 'Schwitzen', h3: 'Wintertag' },
    { w: 'Turnhalle', h: 'Hallend', h2: 'Matten', h3: 'Sportstunde' },
    { w: 'Spielplatz', h: 'Sandkasten', h2: 'Schaukel', h3: 'Nachmittag' },
    { w: 'Park', h: 'Bänke', h2: 'Grünflächen', h3: 'Spaziergang' },
    { w: 'Zoo', h: 'Gehege', h2: 'Fütterung', h3: 'Familienausflug' },
    { w: 'Friedhof', h: 'Gedämpft', h2: 'Grabsteine', h3: 'Allerheiligen' },
    { w: 'Kirche', h: 'Orgel', h2: 'Gewölbe', h3: 'Taufe' },
    { w: 'Dom', h: 'Wuchtig', h2: 'Glockenspiel', h3: 'Stadtsilhouette' },
    { w: 'Kloster', h: 'Abgeschieden', h2: 'Kreuzgang', h3: 'Einkehr' },
    { w: 'Moschee', h: 'Kuppel', h2: 'Gebetsteppich', h3: 'Freitagmittag' },
    { w: 'Rathaus', h: 'Amtlich', h2: 'Sitzungssaal', h3: 'Trauung' },
    { w: 'Postamt', h: 'Schalter', h2: 'Paket', h3: 'Warteschlange' },
    { w: 'Bank', h: 'Tresor', h2: 'Geldautomat', h3: 'Kontoauszug' },
    { w: 'Supermarkt', h: 'Einkaufswagen', h2: 'Grell', h3: 'Samstagvormittag' },
    { w: 'Bäckerei', h: 'Ofenwarm', h2: 'Theke', h3: 'Morgengrauen' },
    { w: 'Metzgerei', h: 'Aufschnitt', h2: 'Kühltheke', h3: 'Einkaufszettel' },
    { w: 'Kaufhaus', h: 'Rolltreppe', h2: 'Etagen', h3: 'Weihnachtseinkauf' },
    { w: 'Buchhandlung', h: 'Stöbern', h2: 'Neuerscheinung', h3: 'Geschenksuche' },
    { w: 'Friseursalon', h: 'Spiegelwand', h2: 'Schnippeln', h3: 'Terminkalender' },
    { w: 'Waschsalon', h: 'Trommelnd', h2: 'Münzeinwurf', h3: 'Wartezeit' },
    { w: 'Tankstelle', h: 'Zapfsäule', h2: 'Nachts offen', h3: 'Reisepause' },
    { w: 'Werkstatt', h: 'Ölig', h2: 'Hebebühne', h3: 'Inspektion' },
    { w: 'Baustelle', h: 'Absperrung', h2: 'Staubig', h3: 'Umleitung' },
    { w: 'Fabrik', h: 'Schichtbetrieb', h2: 'Fließband', h3: 'Werkstor' },
    { w: 'Büro', h: 'Großraum', h2: 'Kaffeeküche', h3: 'Montagmorgen' },
    { w: 'Kneipe', h: 'Tresen', h2: 'Verraucht', h3: 'Stammtischrunde' },
    { w: 'Restaurant', h: 'Speisekarte', h2: 'Bedienung', h3: 'Jahrestag' },
    { w: 'Imbiss', h: 'Stehtische', h2: 'Schnell', h3: 'Mittagspause' },
    { w: 'Café', h: 'Plaudern', h2: 'Milchschaum', h3: 'Nachmittagslicht' },
    { w: 'Hotel', h: 'Rezeption', h2: 'Zimmerschlüssel', h3: 'Geschäftsreise' },
    { w: 'Jugendherberge', h: 'Stockbetten', h2: 'Günstig', h3: 'Klassenfahrt' },
    { w: 'Campingplatz', h: 'Zeltreihen', h2: 'Gemeinschaftsdusche', h3: 'Sommerferien' },
    { w: 'Strand', h: 'Liegen', h2: 'Wellenrauschen', h3: 'Ferienwoche' },
    { w: 'See', h: 'Spiegelglatt', h2: 'Uferweg', h3: 'Badetag' },
    { w: 'Fluss', h: 'Strömung', h2: 'Mündung', h3: 'Hochwasser' },
    { w: 'Wald', h: 'Schattig', h2: 'Moosig', h3: 'Pilzsaison' },
    { w: 'Wiese', h: 'Blühend', h2: 'Mähen', h3: 'Picknickdecke' },
    { w: 'Berg', h: 'Gipfel', h2: 'Anstieg', h3: 'Wanderung' },
    { w: 'Tal', h: 'Eingeschnitten', h2: 'Neblig', h3: 'Talfahrt' },
    { w: 'Höhle', h: 'Tropfsteine', h2: 'Finster', h3: 'Führung' },
    { w: 'Insel', h: 'Umspült', h2: 'Einsam', h3: 'Fährverbindung' },
    { w: 'Wüste', h: 'Endlos', h2: 'Dürr', h3: 'Karawane' },
    { w: 'Gletscher', h: 'Knirschend', h2: 'Blaugrün', h3: 'Bergtour' },
    { w: 'Vulkan', h: 'Rauchend', h2: 'Glühend', h3: 'Ascheregen' },
    { w: 'Dorf', h: 'Überschaubar', h2: 'Nachbarschaftlich', h3: 'Erntedankfest' },
    { w: 'Stadt', h: 'Betriebsam', h2: 'Anonym', h3: 'Feierabendverkehr' },
    { w: 'Hauptstadt', h: 'Regierungssitz', h2: 'Botschaften', h3: 'Staatsbesuch' },
    { w: 'Altstadt', h: 'Kopfsteinpflaster', h2: 'Winklig', h3: 'Stadtführung' },
    { w: 'Fußgängerzone', h: 'Bummeln', h2: 'Straßenmusik', h3: 'Samstagnachmittag' },
    { w: 'Marktplatz', h: 'Brunnen', h2: 'Belebt', h3: 'Rathausuhr' },
    { w: 'Brücke', h: 'Überspannen', h2: 'Geländer', h3: 'Flussquerung' },
    { w: 'Tunnel', h: 'Röhrenförmig', h2: 'Widerhallend', h3: 'Autobahnfahrt' },
    { w: 'Autobahn', h: 'Tempolimit', h2: 'Dreispurig', h3: 'Stauwarnung' },
    { w: 'Kreuzung', h: 'Ampeln', h2: 'Abbiegen', h3: 'Berufsverkehr' },
    { w: 'Parkhaus', h: 'Beengt', h2: 'Spiralförmig', h3: 'Innenstadtbesuch' },
    { w: 'Hafen', h: 'Kräne', h2: 'Salzige Luft', h3: 'Containerschiff' },
    { w: 'Leuchtturm', h: 'Blinkend', h2: 'Geringelt', h3: 'Küstenwanderung' },
    { w: 'Deich', h: 'Aufgeschüttet', h2: 'Grasbewachsen', h3: 'Sturmflut' },
    { w: 'Schloss', h: 'Prunksäle', h2: 'Türmchen', h3: 'Besichtigung' },
    { w: 'Burg', h: 'Wehrhaft', h2: 'Zugbrücke', h3: 'Ritterfest' },
    { w: 'Ruine', h: 'Verfallen', h2: 'Efeubewachsen', h3: 'Wanderpause' },
    { w: 'Turm', h: 'Aussichtsplattform', h2: 'Wendeltreppe', h3: 'Postkartenmotiv' },
    { w: 'Denkmal', h: 'Sockel', h2: 'Bronzen', h3: 'Gedenktag' },
    { w: 'Garten', h: 'Beete', h2: 'Gießkanne', h3: 'Frühjahrsputz' },
    { w: 'Balkon', h: 'Schmal', h2: 'Blumenkästen', h3: 'Feierabendsonne' },
    { w: 'Keller', h: 'Kühl', h2: 'Muffig', h3: 'Einweckgläser' },
    { w: 'Dachboden', h: 'Verstaubt', h2: 'Gerümpel', h3: 'Umzugskisten' },
    { w: 'Garage', h: 'Zugestellt', h2: 'Rolltor', h3: 'Winterreifen' },
    { w: 'Wohnzimmer', h: 'Gemütlich', h2: 'Couchgarnitur', h3: 'Fernsehabend' },
    { w: 'Küche', h: 'Brutzeln', h2: 'Dunstabzug', h3: 'Sonntagsbraten' },
    { w: 'Badezimmer', h: 'Gefliest', h2: 'Beschlagen', h3: 'Morgenroutine' },
    { w: 'Flur', h: 'Garderobe', h2: 'Durchgang', h3: 'Schuhregal' },
    { w: 'Treppenhaus', h: 'Nachhallend', h2: 'Briefkästen', h3: 'Umzugstag' },
    { w: 'Aufzug', h: 'Ruckeln', h2: 'Knopfdruck', h3: 'Hochhausflur' },
    { w: 'Hochhaus', h: 'Vielstöckig', h2: 'Weitblick', h3: 'Stadtrand' },
    { w: 'Bauernhof', h: 'Weitläufig', h2: 'Traktor', h3: 'Erntezeit' },
    { w: 'Scheune', h: 'Strohballen', h2: 'Zugig', h3: 'Erntedank' },
    { w: 'Gefängnis', h: 'Vergittert', h2: 'Hofgang', h3: 'Besuchsraum' },
    { w: 'Polizeiwache', h: 'Anzeige', h2: 'Nachtschicht', h3: 'Fundsache' },
    { w: 'Feuerwache', h: 'Rutschstange', h2: 'Alarmbereit', h3: 'Einsatzfahrt' },
    { w: 'Eisdiele', h: 'Kugeln', h2: 'Waffelhörnchen', h3: 'Hitzewelle' },
    { w: 'Bowlingbahn', h: 'Krachend', h2: 'Leihschuhe', h3: 'Betriebsausflug' },
    { w: 'Zirkus', h: 'Manege', h2: 'Zeltkuppel', h3: 'Sommergastspiel' },
    { w: 'Wartezimmer', h: 'Zeitschriften', h2: 'Zäh', h3: 'Grippewelle' },
  ],
  'Everyday Objects': [
    { w: 'Schlüssel', h: 'Klimpern', h2: 'Gezackt', h3: 'Türschloss' },
    { w: 'Brille', h: 'Beschlagen', h2: 'Bügel', h3: 'Lesestunde' },
    { w: 'Uhr', h: 'Ticken', h2: 'Zeiger', h3: 'Wartesaal' },
    { w: 'Handy', h: 'Vibrieren', h2: 'Flach', h3: 'Bahnfahrt' },
    { w: 'Fernbedienung', h: 'Verschwunden', h2: 'Knöpfe', h3: 'Sofaritze' },
    { w: 'Fernseher', h: 'Flimmern', h2: 'Mattschwarz', h3: 'Abendprogramm' },
    { w: 'Laptop', h: 'Aufklappen', h2: 'Lüfter', h3: 'Homeoffice' },
    { w: 'Tastatur', h: 'Klappernd', h2: 'Rasterförmig', h3: 'Schreibtisch' },
    { w: 'Kopfhörer', h: 'Abschottend', h2: 'Kabelsalat', h3: 'Pendelfahrt' },
    { w: 'Ladekabel', h: 'Verknotet', h2: 'Unentbehrlich', h3: 'Reisetasche' },
    { w: 'Steckdose', h: 'Wandbündig', h2: 'Zweipolig', h3: 'Umzug' },
    { w: 'Glühbirne', h: 'Durchgebrannt', h2: 'Schraubgewinde', h3: 'Abendstunde' },
    { w: 'Taschenlampe', h: 'Bündelnd', h2: 'Batteriebetrieben', h3: 'Stromausfall' },
    { w: 'Kerze', h: 'Tropfend', h2: 'Flackernd', h3: 'Adventskranz' },
    { w: 'Streichholz', h: 'Aufflammen', h2: 'Hölzern', h3: 'Lagerfeuer' },
    { w: 'Feuerzeug', h: 'Klicken', h2: 'Nachfüllbar', h3: 'Hosentasche' },
    { w: 'Aschenbecher', h: 'Randvoll', h2: 'Gläsern', h3: 'Balkontür' },
    { w: 'Besen', h: 'Fegen', h2: 'Borstig', h3: 'Hausflur' },
    { w: 'Staubsauger', h: 'Brummend', h2: 'Saugend', h3: 'Samstagsputz' },
    { w: 'Eimer', h: 'Überschwappend', h2: 'Henkel', h3: 'Putzmittel' },
    { w: 'Lappen', h: 'Feucht', h2: 'Ausgewrungen', h3: 'Küchenzeile' },
    { w: 'Schwamm', h: 'Saugfähig', h2: 'Porös', h3: 'Spülbecken' },
    { w: 'Seife', h: 'Schäumend', h2: 'Glitschig', h3: 'Waschbecken' },
    { w: 'Handtuch', h: 'Flauschig', h2: 'Aufgehängt', h3: 'Duschkabine' },
    { w: 'Zahnbürste', h: 'Borstenreihe', h2: 'Abgenutzt', h3: 'Morgenritual' },
    { w: 'Zahnpasta', h: 'Ausgedrückt', h2: 'Minzig', h3: 'Badezimmerspiegel' },
    { w: 'Kamm', h: 'Feinzinkig', h2: 'Statisch', h3: 'Spiegelschrank' },
    { w: 'Rasierer', h: 'Scharfklingig', h2: 'Summend', h3: 'Morgeneile' },
    { w: 'Föhn', h: 'Lautstark', h2: 'Heißluft', h3: 'Morgenstress' },
    { w: 'Spiegel', h: 'Reflektierend', h2: 'Fleckig', h3: 'Anprobe' },
    { w: 'Schere', h: 'Zweischneidig', h2: 'Klemmend', h3: 'Bastelstunde' },
    { w: 'Klebstoff', h: 'Zäh', h2: 'Verbindend', h3: 'Basteltisch' },
    { w: 'Klebeband', h: 'Abrollen', h2: 'Reißfest', h3: 'Umzugskarton' },
    { w: 'Schnur', h: 'Verheddert', h2: 'Aufgewickelt', h3: 'Paketversand' },
    { w: 'Nadel', h: 'Spitz', h2: 'Winzig', h3: 'Knopfannähen' },
    { w: 'Faden', h: 'Reißend', h2: 'Dünn', h3: 'Nähkästchen' },
    { w: 'Knopf', h: 'Angenäht', h2: 'Rund', h3: 'Hemdkragen' },
    { w: 'Reißverschluss', h: 'Klemmt', h2: 'Gezahnt', h3: 'Jackentasche' },
    { w: 'Gürtel', h: 'Umschnallt', h2: 'Gelocht', h3: 'Hosenbund' },
    { w: 'Schuh', h: 'Eingelaufen', h2: 'Geschnürt', h3: 'Ladenanprobe' },
    { w: 'Socke', h: 'Verschollen', h2: 'Gestopft', h3: 'Waschtrommel' },
    { w: 'Hemd', h: 'Gebügelt', h2: 'Kragensteif', h3: 'Vorstellungsgespräch' },
    { w: 'Hose', h: 'Ausgebeult', h2: 'Beinlang', h3: 'Umkleidekabine' },
    { w: 'Jacke', h: 'Winddicht', h2: 'Zugeknöpft', h3: 'Novembertag' },
    { w: 'Mütze', h: 'Zugezogen', h2: 'Wollig', h3: 'Frostmorgen' },
    { w: 'Schal', h: 'Umwickelt', h2: 'Endlos', h3: 'Wintermarkt' },
    { w: 'Handschuh', h: 'Gefüttert', h2: 'Verloren', h3: 'Skipiste' },
    { w: 'Regenschirm', h: 'Aufgespannt', h2: 'Umgestülpt', h3: 'Aprilwetter' },
    { w: 'Rucksack', h: 'Vollgepackt', h2: 'Schultergurte', h3: 'Klassenfahrt' },
    { w: 'Koffer', h: 'Rollend', h2: 'Übergewichtig', h3: 'Abflughalle' },
    { w: 'Geldbeutel', h: 'Abgegriffen', h2: 'Prall', h3: 'Kassenschlange' },
    { w: 'Ausweis', h: 'Laminiert', h2: 'Amtlich', h3: 'Grenzkontrolle' },
    { w: 'Buch', h: 'Aufgeschlagen', h2: 'Eselsohren', h3: 'Lesesessel' },
    { w: 'Zeitung', h: 'Zerknittert', h2: 'Tagesaktuell', h3: 'Frühstückstisch' },
    { w: 'Heft', h: 'Liniert', h2: 'Dünnwandig', h3: 'Schulranzen' },
    { w: 'Stift', h: 'Angekaut', h2: 'Nachfüllbar', h3: 'Notizblock' },
    { w: 'Radiergummi', h: 'Abgerieben', h2: 'Krümelnd', h3: 'Matheheft' },
    { w: 'Lineal', h: 'Schnurgerade', h2: 'Durchsichtig', h3: 'Zeichenblock' },
    { w: 'Locher', h: 'Stanzend', h2: 'Schwergängig', h3: 'Aktenordner' },
    { w: 'Tacker', h: 'Klackend', h2: 'Nachladend', h3: 'Büroschrank' },
    { w: 'Briefumschlag', h: 'Zugeklebt', h2: 'Fensterlos', h3: 'Postkasten' },
    { w: 'Briefmarke', h: 'Gezähnt', h2: 'Angeleckt', h3: 'Postschalter' },
    { w: 'Postkarte', h: 'Beschrieben', h2: 'Steif', h3: 'Urlaubsgruß' },
    { w: 'Kalender', h: 'Durchgestrichen', h2: 'Blätternd', h3: 'Jahreswechsel' },
    { w: 'Wecker', h: 'Schrillend', h2: 'Unerbittlich', h3: 'Montagmorgen' },
    { w: 'Kissen', h: 'Aufgeschüttelt', h2: 'Weich', h3: 'Mittagsschlaf' },
    { w: 'Decke', h: 'Kuschelig', h2: 'Übergeworfen', h3: 'Sofaabend' },
    { w: 'Matratze', h: 'Durchgelegen', h2: 'Federnd', h3: 'Umzugstag' },
    { w: 'Gardine', h: 'Durchscheinend', h2: 'Gerafft', h3: 'Fensterfront' },
    { w: 'Teppich', h: 'Ausgetreten', h2: 'Fransig', h3: 'Wohnungsflur' },
    { w: 'Sessel', h: 'Durchgesessen', h2: 'Gepolstert', h3: 'Leseabend' },
    { w: 'Stuhl', h: 'Wackelig', h2: 'Gestapelt', h3: 'Esstisch' },
    { w: 'Tisch', h: 'Abgewischt', h2: 'Vierbeinig', h3: 'Abendessen' },
    { w: 'Schrank', h: 'Überfüllt', h2: 'Knarrend', h3: 'Kleidersortieren' },
    { w: 'Regal', h: 'Durchhängend', h2: 'Aufgereiht', h3: 'Bücherwand' },
    { w: 'Lampe', h: 'Gedimmt', h2: 'Schirmförmig', h3: 'Leseecke' },
    { w: 'Vase', h: 'Halsschmal', h2: 'Zerbrechlich', h3: 'Blumenstrauß' },
    { w: 'Topf', h: 'Übergekocht', h2: 'Gusseisern', h3: 'Herdplatte' },
    { w: 'Pfanne', h: 'Eingebrannt', h2: 'Beschichtet', h3: 'Rührei' },
    { w: 'Teller', h: 'Abgeräumt', h2: 'Gestapelt', h3: 'Spülmaschine' },
    { w: 'Tasse', h: 'Angeschlagen', h2: 'Dampfend', h3: 'Kaffeepause' },
    { w: 'Glas', h: 'Klirrend', h2: 'Randvoll', h3: 'Anstoßen' },
    { w: 'Flasche', h: 'Entkorkt', h2: 'Bauchig', h3: 'Kühlschranktür' },
    { w: 'Messer', h: 'Geschliffen', h2: 'Gezackt', h3: 'Schneidebrett' },
    { w: 'Gabel', h: 'Vierzinkig', h2: 'Klimpernd', h3: 'Gedeck' },
    { w: 'Löffel', h: 'Gewölbt', h2: 'Umrührend', h3: 'Suppenschüssel' },
    { w: 'Korkenzieher', h: 'Spiralig', h2: 'Kraftaufwand', h3: 'Feierabendrunde' },
    { w: 'Dosenöffner', h: 'Umlaufend', h2: 'Sperrig', h3: 'Vorratskammer' },
    { w: 'Wasserkocher', h: 'Rauschend', h2: 'Abschaltend', h3: 'Teezeit' },
    { w: 'Kühlschrank', h: 'Surrend', h2: 'Vollgestellt', h3: 'Wocheneinkauf' },
    { w: 'Waschmaschine', h: 'Schleudernd', h2: 'Rüttelnd', h3: 'Wäschetag' },
    { w: 'Bügeleisen', h: 'Zischend', h2: 'Schwer', h3: 'Hemdenstapel' },
    { w: 'Hammer', h: 'Zuschlagend', h2: 'Stielführend', h3: 'Bilderaufhängen' },
    { w: 'Nagel', h: 'Eingeschlagen', h2: 'Winzig', h3: 'Bilderrahmen' },
    { w: 'Schraube', h: 'Gedreht', h2: 'Gewinde', h3: 'Möbelaufbau' },
    { w: 'Schraubenzieher', h: 'Kreuzförmig', h2: 'Abrutschend', h3: 'Regalmontage' },
    { w: 'Zange', h: 'Greifend', h2: 'Gebogen', h3: 'Werkzeugkiste' },
    { w: 'Säge', h: 'Gezähnt', h2: 'Kreischend', h3: 'Brennholz' },
    { w: 'Leiter', h: 'Schwankend', h2: 'Sprossenreich', h3: 'Dachbodenluke' },
    { w: 'Rasenmäher', h: 'Knatternd', h2: 'Kreisend', h3: 'Samstagvormittag' },
  ],
  'Movies & TV': [
    { w: 'Titanic', h: 'Ozeanriese', h2: 'Geigen', h3: 'Rettungsboote' },
    { w: 'Avatar', h: 'Leuchtend', h2: 'Fremdplanet', h3: 'Lianen' },
    { w: 'Matrix', h: 'Auswählen', h2: 'Zeitlupe', h3: 'Pillenwahl' },
    { w: 'Jurassic Park', h: 'Krallen', h2: 'Urzeitlich', h3: 'Elektrozaun' },
    { w: 'Star Wars', h: 'Lichtschwerter', h2: 'Galaxie', h3: 'Droiden' },
    { w: 'Harry Potter', h: 'Zauberei', h2: 'Internat', h3: 'Stirnnarbe' },
    { w: 'Der Herr der Ringe', h: 'Wanderung', h2: 'Freundschaft', h3: 'Vulkanschlund' },
    { w: 'Der König der Löwen', h: 'Verrat', h2: 'Herde', h3: 'Felsvorsprung' },
    { w: 'Die Eiskönigin', h: 'Schwestern', h2: 'Frostig', h3: 'Mitsinglied' },
    { w: 'Shrek', h: 'Sumpfig', h2: 'Grummelig', h3: 'Märchenwelt' },
    { w: 'Toy Story', h: 'Spielzeug', h2: 'Treuherzig', h3: 'Cowboyhut' },
    { w: 'Der Pate', h: 'Familienmacht', h2: 'Verschwiegen', h3: 'Hochzeitsfeier' },
    { w: 'Pulp Fiction', h: 'Dialoge', h2: 'Durcheinander', h3: 'Aktenkoffer' },
    { w: 'Forrest Gump', h: 'Laufen', h2: 'Zufälle', h3: 'Parkbank' },
    { w: 'Fluch der Karibik', h: 'Seeräuber', h2: 'Schwankend', h3: 'Schatzkarte' },
    { w: 'Findet Nemo', h: 'Suchend', h2: 'Weitläufig', h3: 'Korallenriff' },
    { w: 'Minions', h: 'Kauderwelsch', h2: 'Knallgelb', h3: 'Bananenjagd' },
    { w: 'Der Grinch', h: 'Griesgrämig', h2: 'Miesepetrig', h3: 'Weihnachtsdorf' },
    { w: 'Das Dschungelbuch', h: 'Tanzbär', h2: 'Sorglos', h3: 'Kindergeburtstag' },
    { w: 'Pippi Langstrumpf', h: 'Eigensinnig', h2: 'Sommersprossen', h3: 'Kinderzimmer' },
    { w: 'Heidi', h: 'Bergsommer', h2: 'Heimweh', h3: 'Almhütte' },
    { w: 'Wickie', h: 'Listig', h2: 'Zeichentrick', h3: 'Wikingerschiff' },
    { w: 'Bibi Blocksberg', h: 'Hexerei', h2: 'Besenritt', h3: 'Hörspielkassette' },
    { w: 'Benjamin Blümchen', h: 'Rüsselrufe', h2: 'Gutmütig', h3: 'Nachmittagsprogramm' },
    { w: 'Die Drei Fragezeichen', h: 'Detektive', h2: 'Rätselhaft', h3: 'Hörspielserie' },
    { w: 'Löwenzahn', h: 'Naturwissen', h2: 'Erklärend', h3: 'Bauwagen' },
    { w: 'Die Sendung mit der Maus', h: 'Lehrreich', h2: 'Kindlich', h3: 'Sonntagvormittag' },
    { w: 'Sesamstraße', h: 'Puppenspiel', h2: 'Buchstaben', h3: 'Vorschulalter' },
    { w: 'Das Boot', h: 'Beklemmend', h2: 'Tauchfahrt', h3: 'Funkspruch' },
    { w: 'Der Schuh des Manitu', h: 'Klamauk', h2: 'Westernparodie', h3: 'Lagerfeuer' },
    { w: 'Good Bye Lenin', h: 'Wendezeit', h2: 'Vorgetäuscht', h3: 'Ostberlin' },
    { w: 'Das Leben der Anderen', h: 'Abhören', h2: 'Mitschnitt', h3: 'Tonband' },
    { w: 'Die Feuerzangenbowle', h: 'Schulstreiche', h2: 'Schwarzweiß', h3: 'Silvesterabend' },
    { w: 'Lola rennt', h: 'Hetzend', h2: 'Rothaarig', h3: 'Straßenlauf' },
    { w: 'Der Untergang', h: 'Bunker', h2: 'Endzeit', h3: 'Kriegsende' },
    { w: 'Sissi', h: 'Kaiserhof', h2: 'Romantisch', h3: 'Weihnachtsprogramm' },
    { w: 'Winnetou', h: 'Blutsbrüderschaft', h2: 'Prärie', h3: 'Sommerfestspiele' },
    { w: 'Fack ju Göhte', h: 'Schulkomödie', h2: 'Derb', h3: 'Klassenzimmer' },
    { w: 'Keinohrhasen', h: 'Liebeskomödie', h2: 'Kinderbuch', h3: 'Kinosommer' },
    { w: 'Tatort', h: 'Ermittler', h2: 'Feststehend', h3: 'Sonntagabend' },
    { w: 'Lindenstraße', h: 'Dauerläufer', h2: 'Nachbarschaft', h3: 'Vorabend' },
    { w: 'Ein Herz und eine Seele', h: 'Streitlustig', h2: 'Ruppig', h3: 'Wohnzimmerkrach' },
    { w: 'Dinner for One', h: 'Wiederholt', h2: 'Angeheitert', h3: 'Tigerfell' },
    { w: 'Stromberg', h: 'Büroalltag', h2: 'Peinlich', h3: 'Kaffeeküche' },
    { w: 'Türkisch für Anfänger', h: 'Patchworkfamilie', h2: 'Frech', h3: 'Vorabendserie' },
    { w: 'Dark', h: 'Zeitreise', h2: 'Düster', h3: 'Höhleneingang' },
    { w: 'Babylon Berlin', h: 'Zwanziger', h2: 'Ermittlung', h3: 'Tanzpalast' },
    { w: 'Das Traumschiff', h: 'Fernreise', h2: 'Kitschig', h3: 'Feiertagsabend' },
    { w: 'Raumschiff Enterprise', h: 'Weltraum', h2: 'Brückenkommando', h3: 'Beamvorgang' },
    { w: 'Wer wird Millionär', h: 'Quizshow', h2: 'Publikumsjoker', h3: 'Studiosessel' },
  ],
  'Football': [
    { w: 'Bayern München', h: 'Rekordmeister', h2: 'Übermächtig', h3: 'Südkurve' },
    { w: 'Borussia Dortmund', h: 'Gelbe Wand', h2: 'Stimmungsvoll', h3: 'Westfalenstadion' },
    { w: 'Schalke', h: 'Knappen', h2: 'Bergbauerbe', h3: 'Revierderby' },
    { w: 'Werder Bremen', h: 'Grünweiß', h2: 'Hanseatisch', h3: 'Weserstadion' },
    { w: 'Hamburger SV', h: 'Dinosaurier', h2: 'Abstiegsdrama', h3: 'Nordderby' },
    { w: 'Eintracht Frankfurt', h: 'Europapokalnächte', h2: 'Leidenschaftlich', h3: 'Bankenstadt' },
    { w: 'Borussia Mönchengladbach', h: 'Fohlenelf', h2: 'Siebziger', h3: 'Niederrhein' },
    { w: 'VfB Stuttgart', h: 'Brustring', h2: 'Schwäbisch', h3: 'Cannstatt' },
    { w: 'Bayer Leverkusen', h: 'Werkself', h2: 'Vizemeisterschaften', h3: 'Rheinland' },
    { w: 'RB Leipzig', h: 'Aufsteiger', h2: 'Umstritten', h3: 'Ostdeutschland' },
    { w: 'FC Köln', h: 'Geißbock', h2: 'Karnevalistisch', h3: 'Rheinufer' },
    { w: 'Hertha BSC', h: 'Hauptstadtklub', h2: 'Wechselhaft', h3: 'Olympiastadion' },
    { w: 'Union Berlin', h: 'Kiezverein', h2: 'Bescheiden', h3: 'Alte Försterei' },
    { w: 'St. Pauli', h: 'Totenkopf', h2: 'Alternativ', h3: 'Millerntor' },
    { w: 'Nürnberg', h: 'Traditionsreich', h2: 'Achterbahnfahrt', h3: 'Frankenland' },
    { w: 'Beckenbauer', h: 'Souverän', h2: 'Elegant', h3: 'Liberoposition' },
    { w: 'Müller', h: 'Torjäger', h2: 'Instinktsicher', h3: 'Strafraumecke' },
    { w: 'Klinsmann', h: 'Stürmerlegende', h2: 'Goldblond', h3: 'Sommermärchen' },
    { w: 'Matthäus', h: 'Antriebsstark', h2: 'Ausdauernd', h3: 'Weltmeisterjahr' },
    { w: 'Kahn', h: 'Torwarttitan', h2: 'Furchteinflößend', h3: 'Elfmeterkrimi' },
    { w: 'Neuer', h: 'Mitspielend', h2: 'Weitaufgerückt', h3: 'Handschuhe' },
    { w: 'Lahm', h: 'Beidfüßig', h2: 'Unauffällig', h3: 'Kapitänsbinde' },
    { w: 'Schweinsteiger', h: 'Kämpferisch', h2: 'Blutend', h3: 'Finalverlängerung' },
    { w: 'Özil', h: 'Spielmacher', h2: 'Zurückhaltend', h3: 'Vorlagenkönig' },
    { w: 'Klose', h: 'Bescheiden', h2: 'Abschlussstark', h3: 'Turnierform' },
    { w: 'Ballack', h: 'Kopfballstark', h2: 'Führungsspieler', h3: 'Vizeweltmeister' },
    { w: 'Rummenigge', h: 'Achtziger', h2: 'Flügelstürmer', h3: 'Europapokal' },
    { w: 'Netzer', h: 'Langhaarig', h2: 'Spielgestaltend', h3: 'Siebzigerjahre' },
    { w: 'Seeler', h: 'Bodenständig', h2: 'Volksnah', h3: 'Sechzigerjahre' },
    { w: 'Sammer', h: 'Vorstopper', h2: 'Wuselig', h3: 'Europameistertitel' },
    { w: 'Messi', h: 'Zauberhaft', h2: 'Kleingewachsen', h3: 'Ballführung' },
    { w: 'Ronaldo', h: 'Ehrgeizig', h2: 'Athletisch', h3: 'Sprungkraft' },
    { w: 'Maradona', h: 'Legendär', h2: 'Umjubelt', h3: 'Handtor' },
    { w: 'Pelé', h: 'Wegbereitend', h2: 'Ikonisch', h3: 'Sechzigerjahre' },
    { w: 'Zidane', h: 'Meisterhaft', h2: 'Gelassen', h3: 'Kopfstoß' },
    { w: 'Mbappé', h: 'Blitzschnell', h2: 'Blutjung', h3: 'Sprintduell' },
    { w: 'Haaland', h: 'Hochgewachsen', h2: 'Maschinenhaft', h3: 'Torquote' },
    { w: 'Cruyff', h: 'Wendig', h2: 'Vorausdenkend', h3: 'Siebzigerfußball' },
    { w: 'Elfmeter', h: 'Punktgenau', h2: 'Nervenprobe', h3: 'Entscheidungsmoment' },
    { w: 'Abseits', h: 'Millimeterarbeit', h2: 'Strittig', h3: 'Linienrichter' },
    { w: 'Rote Karte', h: 'Platzverweis', h2: 'Endgültig', h3: 'Unterzahl' },
    { w: 'Eckball', h: 'Hereingabe', h2: 'Gedränge', h3: 'Kopfballchance' },
    { w: 'Freistoß', h: 'Mauerstellung', h2: 'Anlaufweg', h3: 'Pfostenschuss' },
    { w: 'Tor', h: 'Jubel', h2: 'Erlösend', h3: 'Netzzappeln' },
    { w: 'Schiedsrichter', h: 'Unparteiisch', h2: 'Angefeindet', h3: 'Pfiffkonzert' },
    { w: 'Bundesliga', h: 'Achtzehn Vereine', h2: 'Wöchentlich', h3: 'Konferenzschaltung' },
    { w: 'Weltmeisterschaft', h: 'Vierjährlich', h2: 'Fiebernd', h3: 'Public Viewing' },
    { w: 'Pokalfinale', h: 'Endspiel', h2: 'Außenseiterchance', h3: 'Maifeiertag' },
    { w: 'Derby', h: 'Nachbarschaftsduell', h2: 'Aufgeheizt', h3: 'Polizeiaufgebot' },
    { w: 'Trikot', h: 'Getauscht', h2: 'Nummeriert', h3: 'Halbzeitpause' },
  ],
  'Super Heroes': [
    { w: 'Batman', h: 'Grüblerisch', h2: 'Vermögend', h3: 'Fledermaushöhle' },
    { w: 'Superman', h: 'Unverwundbar', h2: 'Idealistisch', h3: 'Roter Umhang' },
    { w: 'Spider-Man', h: 'Jugendlich', h2: 'Findig', h3: 'Netzschwingen' },
    { w: 'Iron Man', h: 'Erfinderisch', h2: 'Überheblich', h3: 'Brustreaktor' },
    { w: 'Wonder Woman', h: 'Königlich', h2: 'Kriegerisch', h3: 'Lassoschlinge' },
    { w: 'Black Panther', h: 'Edelmütig', h2: 'Verschlossen', h3: 'Thronpflicht' },
    { w: 'Deadpool', h: 'Spöttisch', h2: 'Chaotisch', h3: 'Roter Anzug' },
    { w: 'Hulk', h: 'Wutentbrannt', h2: 'Riesenhaft', h3: 'Zerrissenes Hemd' },
    { w: 'Thor', h: 'Donnernd', h2: 'Göttlich', h3: 'Streithammer' },
    { w: 'Captain America', h: 'Pflichtbewusst', h2: 'Altmodisch', h3: 'Rundschild' },
    { w: 'Black Widow', h: 'Spionage', h2: 'Akrobatisch', h3: 'Vergangenheit' },
    { w: 'Doctor Strange', h: 'Mystisch', h2: 'Hochmütig', h3: 'Zeitstein' },
    { w: 'Ant-Man', h: 'Schrumpfend', h2: 'Witzig', h3: 'Ameisenheer' },
    { w: 'Groot', h: 'Wortkarg', h2: 'Hölzern', h3: 'Astgeflecht' },
    { w: 'Rocket', h: 'Vorlaut', h2: 'Waffenvernarrt', h3: 'Waschbärgestalt' },
    { w: 'Star-Lord', h: 'Aufschneiderisch', h2: 'Musikverliebt', h3: 'Kassettenrekorder' },
    { w: 'Scarlet Witch', h: 'Machtvoll', h2: 'Trauernd', h3: 'Realitätsverzerrung' },
    { w: 'Loki', h: 'Hinterlistig', h2: 'Wandelbar', h3: 'Hörnerhelm' },
    { w: 'Thanos', h: 'Unerbittlich', h2: 'Gewaltig', h3: 'Fingerschnippen' },
    { w: 'Wolverine', h: 'Aufbrausend', h2: 'Unverwüstlich', h3: 'Krallenklingen' },
    { w: 'Flash', h: 'Rasend', h2: 'Aufgedreht', h3: 'Blitzsymbol' },
    { w: 'Aquaman', h: 'Meeresbeherrschend', h2: 'Bärtig', h3: 'Dreizack' },
    { w: 'Catwoman', h: 'Geschmeidig', h2: 'Diebisch', h3: 'Peitschenhieb' },
    { w: 'Joker', h: 'Wahnsinnig', h2: 'Grinsend', h3: 'Spielkarte' },
    { w: 'Harley Quinn', h: 'Sprunghaft', h2: 'Verspielt', h3: 'Baseballschläger' },
    { w: 'Venom', h: 'Schwarzglänzend', h2: 'Bedrohlich', h3: 'Symbiontenmasse' },
    { w: 'Green Goblin', h: 'Irrsinnig', h2: 'Zerstörerisch', h3: 'Kürbisbomben' },
    { w: 'Daredevil', h: 'Blind', h2: 'Furchtlos', h3: 'Hörsinn' },
    { w: 'Blade', h: 'Halbvampirisch', h2: 'Kühl', h3: 'Sonnenbrille' },
    { w: 'Hellboy', h: 'Rotäugig', h2: 'Brummig', h3: 'Steinfaust' },
    { w: 'Doctor Doom', h: 'Herrschsüchtig', h2: 'Größenwahnsinnig', h3: 'Eisenmaske' },
    { w: 'Mystique', h: 'Gestaltwandelnd', h2: 'Undurchschaubar', h3: 'Blauhäutig' },
    { w: 'Phantomias', h: 'Doppelleben', h2: 'Erfindungsreich', h3: 'Entenhausen' },
    { w: 'Perry Rhodan', h: 'Heftromanheld', h2: 'Unsterblich', h3: 'Sternenfahrt' },
    { w: 'Captain Future', h: 'Zukunftsheld', h2: 'Raumfahrend', h3: 'Titelmelodie' },
    { w: 'Son-Goku', h: 'Gutmütig', h2: 'Kampflustig', h3: 'Haarverwandlung' },
    { w: 'Sailor Moon', h: 'Schülerin', h2: 'Verwandlungsformel', h3: 'Mondzepter' },
    { w: 'Ruffy', h: 'Gummiartig', h2: 'Unbekümmert', h3: 'Strohhut' },
    { w: 'Naruto', h: 'Aufmüpfig', h2: 'Zielstrebig', h3: 'Stirnband' },
    { w: 'Saber Rider', h: 'Westernhaft', h2: 'Weltraumreitend', h3: 'Lasergewehr' },
    { w: 'He-Man', h: 'Muskelbepackt', h2: 'Schwertschwingend', h3: 'Zauberformel' },
    { w: 'Sigurd', h: 'Ritterlich', h2: 'Unbeugsam', h3: 'Schwarzweißheft' },
    { w: 'Nick Knatterton', h: 'Kombinierend', h2: 'Kariert', h3: 'Schlussfolgerung' },
    { w: 'Abrafaxe', h: 'Zeitreisend', h2: 'Dreiergespann', h3: 'Comicheft' },
    { w: 'Das Phantom', h: 'Maskiert', h2: 'Dschungelheld', h3: 'Totenkopfring' },
    { w: 'Zorro', h: 'Degenführend', h2: 'Schwarzgekleidet', h3: 'Zeichenspur' },
    { w: 'Asterix', h: 'Schlagfertig', h2: 'Kleinwüchsig', h3: 'Zaubertrank' },
    { w: 'Obelix', h: 'Hünenhaft', h2: 'Gutgelaunt', h3: 'Hinkelstein' },
    { w: 'Lucky Luke', h: 'Schnellziehend', h2: 'Einzelgängerisch', h3: 'Revolvergriff' },
    { w: 'Vegeta', h: 'Stolz', h2: 'Rivalisierend', h3: 'Prinzenhaltung' },
  ],
};
