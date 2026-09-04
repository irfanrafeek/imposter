// ============================================================
// THE BRAZILIAN PORTUGUESE WORD CATALOGUE
// ============================================================
// SKELETON. The seven categories exist so that the locale is registered,
// the checker runs, and the catalogue can be filled a category at a time
// (#212). An empty catalogue is an anticipated state, not a broken one:
// loadCatalog() falls back to English and says so in the console, and
// check-words reports short categories as warnings until --strict.
//
// Written, not translated from en.js or es.js. Parity with either is
// explicitly not a goal: a category that does not land at a Brazilian
// table is worth less than a shorter one that does.
//
// BRAZILIAN, NOT NEUTRAL, AND THAT IS THE DIFFERENCE FROM SPANISH (#208).
// es.js is neutral Spanish on purpose, because neutral Spanish is a real
// register that Latin American dubbing has used for decades. There is no
// equivalent register for Portuguese. Brazil is roughly 95% of Portuguese
// speakers, the splits with European Portuguese are sharper than anything
// inside Spanish, and a catalogue trying to serve both would serve
// neither. So this list commits to Brazil.
//
// Two failures to watch for, and the second is the sneaky one:
//
//   THE THING IS PORTUGUESE, NOT BRAZILIAN.  Francesinha, bacalhau a bras,
//   a pastel de nata as an everyday thing rather than a bakery import.
//   Obvious once you look for it, and the easier of the two to catch.
//
//   THE THING IS UNIVERSAL AND THE WORD IS NOT.  Comboio, autocarro,
//   telemovel, frigorifico, casa de banho. These are not wrong Portuguese;
//   they are another country's Portuguese, and they read as foreign at a
//   Brazilian table. Trem, onibus, celular, geladeira, banheiro.
//
// AND ONE THAT SPANISH DID NOT HAVE. Brazil is one country but it is not
// one vocabulary, so the neutral-Spanish problem returns inside a single
// market. Mandioca, aipim and macaxeira are the same root in three regions.
// Everyone at the table sees the same secret word and has to give a clue
// for it, so a word half of them do not know stops the round rather than
// colouring it. Prefer the term that travels the whole country, and when
// no term does, prefer a different word.
//
// THE GENDER TRAP, exactly as in Spanish. An adjective hint carries gender,
// and a gendered adjective beside a gendered noun narrows the answer
// sharply. The checker warns on any hint token ending in -o or -a, which
// catches plenty of innocent nouns too, so GENDER_REVIEWED.pt in
// scripts/check-words.mjs is the allowlist of the ones that have been read
// and cleared. Prefer hints that do not inflect. Note the check does not
// run at all for a locale with no entry in that table.
//
// THE CATEGORY IDS STAY ENGLISH AND ASCII. 'Food', not 'Comida'. An id is
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
