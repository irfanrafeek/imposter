# WORKLOG — Impostor Games

Project journal: what's being worked on, decisions made, and status. Newest entries first.
(Tickets are GitHub Issues on `irfanrafeek/imposter`. This file is the narrative record: what was decided and why, and what was verified before shipping.)

---

## 2026-08-29: Spanish ships (#139)

`/es/` and `/es/word/` are live. The word game is playable end to end in
Spanish: Spanish words, Spanish buttons, Spanish FAQ, Spanish structured data.
Everything #136, #137 and #138 built is finally switched on.

### Shipped, and what was checked

`v2026.08.29.1`, deployed 2026-08-29. Pushed, deployed and IndexNow-pinged as
three separate steps, in that order, with the ping scoped to the four paths a
crawler would see change: `/`, `/word/`, `/es/`, `/es/word/`. Dance and draw
changed only in asset paths, which no reader can see, so their `lastmod` did
not move and they were not submitted.

Verified over the wire on the preview host, never on the live domain, because
a page load there inflates the analytics counters:

- the stamp on all six pages, and `/shared/lang-switch.js`, `/shared/words/
  es.js` and both new manifests serving 200
- hreflang reciprocal on all four pages in the set, `x-default` on English
- the Spanish page downloads `es.js` and NOT `en.js`
- a real room created from `/es/word/` carries `meta.lang: "es"`
- **the cross-language dialog, live for the first time.** `/word/?join=<code>`
  on a Spanish room raised "This room is in Spanish", Continue landed on
  `/es/word/`, and the join completed into a Spanish lobby
- dance and draw unchanged: tokens resolving through the new root-absolute
  paths, no switcher, and the three newly-keyed strings rendering exactly as
  before
- no console errors anywhere; test room deleted and confirmed gone

The gate before the push: 71 tests, lint clean, `build:check` equivalent,
`check-words.mjs --strict` with zero warnings, `check-played.mjs` clean.

One pre-existing thing seen again and not touched: the hub still computes
`--radius-lg: 28px` against base.css's 26px. That is #142, filed already.

### The switcher, and where it deliberately is not

A dropdown: a globe pill showing the language you are reading, and a menu of
the rest. It started as a segmented row of two, which Irfan asked to change
before it shipped, and he was right about the reason: two languages fit side
by side and five do not, so the row would have had to be rebuilt as a menu the
moment a third arrived. This is the shape that survives the fourth language
with nobody revisiting it.

It is a `<details>` element with about twenty lines of CSS. That gives opening,
closing and keyboard focus for free, with no JavaScript, which matters for a
control sitting in the topbar of a page whose scripts have not loaded yet. It
is also already the site's disclosure element, since the FAQ is built from it,
so the chevron is the same treatment rotated the same way.
`shared/lang-switch.js` adds only two manners on top: close on an outside tap,
close on Escape and hand focus back to the pill. The menu works without it.
It uses `pointerdown` rather than `click`, so a drag that starts in the menu
and ends outside it does not close the menu out from under the link the finger
is still on.

Placement is per page and it is not symmetric. On the hub the switcher is the
LEFT-hand item, opposite the account button, which is where Irfan wanted it on
the landing page. On a game home screen it is the RIGHT-hand item, opposite
the back link. Either way it is the outer item on its side, and the menu
aligns to that same edge, so it cannot open off-screen. Checked at 320px:
no horizontal overflow on either page and the top bar stays one line.

It is built from `alternates`, the same list the hreflang block reads, so it
can never offer a page that was not actually built: a language appears there
the moment site.json lists it for that page, and not before. Draw and dance
have no Spanish page, so they have no switcher, which also means dance's
topbar keeps two items and needs no hamburger. The component emits its own
`<script>` tag, so adding the switcher to a fourth page is one macro call and
nothing else to remember.

It is absent from every screen inside a room, on purpose. The language belongs
to the room (#138), so a control that looks like it would change it, somewhere
it cannot, would be worse than no control at all.

The current language renders as a `<span>`, not a link, in the menu and in the
pill. It is a state indicator; making it an anchor to the page you are already
on adds a self-referencing link for a crawler to weigh and a tab stop that
does nothing.

### Four things that were quietly broken, and had to be fixed to ship

**Relative asset paths.** Every page loaded `../shared/base.css` and `app.js`.
From `/es/word/` those resolve to `/es/shared/` and `/es/word/app.js`, neither
of which exists, so the Spanish page would have rendered with no palette and
no game. All of them are root-absolute now. The hub's inline module script had
the same problem with six `./shared/*.js` import specifiers. Assets are not
duplicated per language: `/es/word/` loads the same `/word/app.js`, whose own
relative imports resolve against ITS url and were always fine.

**Three player-facing strings were hardcoded in the templates**, so they would
have rendered English on a Spanish page: `How to play` under the fold,
`Game Mode` in the lobby, and `You're the Impostor` on the card. `t()` cannot
catch these and neither can `throwOnUndefined`, because a literal is not a
missing key. They were found by stripping every nunjucks tag out of the
templates and reading what text was left, which is now the way to check.
The same literals were fixed in draw and dance: identical shared markup, and
the bug would simply have come back the day either gets a language.

**`shared/auth-ui.js` had no i18n at all.** The account button and its whole
sign-in flow, about 25 strings, were English literals. That is the one shared
module that renders on the hub, so `/es/` would have carried an English
"Sign in" at the top of an otherwise Spanish page. Its copy now lives in
`content/<lang>/shared.json` alongside chat's, which is where a shared
module's strings already belonged.

**The manifest.** `/es/word/` linked `/word/manifest.webmanifest`, whose
`start_url` is the English game, so installing the Spanish page to a home
screen would have opened the English one. There are Spanish manifests now and
the `<link>` moves with the language.

### What /es/ deliberately does NOT have

No guides block, no alt-games rows, no third card on the hub, and no FAQ
answer pointing at dance or draw. All of them would have sent a Spanish reader
to an English-only page. An earlier draft of the Spanish hub FAQ did point at
the other two games with "de momento solo en inglés" attached, and that was
cut: a warning is not a substitute for the page being readable. `/es/` grows a
card the day a game actually has Spanish, and its FAQ grows with it.

The Firebase setup screen stays English in every language, and there is a
comment saying so. It only appears on a clone with no config, its audience is
whoever is setting the project up, and it walks them through an English
console and an English README.

### The interface Spanish

Written, not translated, which was Irfan's requirement carried over from #137.
`Faltan 2 jugadores` rather than `Se necesitan 2 jugadores más para empezar`.
`No existe esa sala` rather than `Sala no encontrada`.

It was first written for SPAIN and then rewritten for Spanish speakers
EVERYWHERE, on Irfan's call, after he read the shipped draft. The product
direction is global, so the default should not be regional even if Spain is
today the largest single source of Spanish traffic. It is not, as it happens:
across the hub, word and draw pages, Latin America is 183 visits against
Spain's 85, roughly two to one, on a site that is still English-only. Bolivia,
Mexico, Colombia and Ecuador lead it.

Three rules came out of that rewrite, and they are in the header of
`src/content/es/shared.json` so the next language does not rediscover them:

  - **No `vosotros`.** Third person for anything descriptive, which is
    identical in every country (`todos juegan en una sola pantalla`), and the
    `ustedes` imperative only for real commands (`empiecen`, `decidan`).
    `tú` stays for one player: it is the informal singular everywhere.
  - **No vocabulary that splits.** `teléfono`, not `móvil` and not `celular`.
    `error` not `fallo`, `atrapar` not `pillar`, `agregar` not `añadir`.
  - **Simple past over present perfect.** `No se pudo enviar` reads normally
    everywhere; `No se ha podido enviar` marks the text as Spanish from Spain.

One thing worth recording because it cuts against the ticket's own rule: the
ticket said "imperatives for buttons", but Spanish software convention is the
INFINITIVE for utility buttons (`Cancelar`, `Cerrar`, `Enviar`, `Salir`) and
the imperative for personal calls to action. Following the rule literally
would have produced exactly the translated-sounding interface it was written
to prevent. So the tiles are `Crear` and `Unirse` with the voice in the
subtitles underneath, and `Elige`, `Comparte`, `Pulsa` appear where the copy
is actually speaking to someone.

**This still needs a native speaker to read it before #141 ships**, and now
ideally one from Latin America and one from Spain, since the whole point is
that it should sit badly with neither. No checker gates this.
`check-words.mjs` catches a gendered hint; nothing catches copy that is
correct and lifeless.

### The catalogue had the same problem, and worse consequences

The interface rewrite above would have been half a job. Underneath it sat 550
words and 1100 hints written deliberately for Spain in #137, and there the
argument is not the same argument. **In UI copy a Spain-ism is the wrong tone.
In the catalogue it is a dead round.** Everyone at the table sees the same
secret word and has to give a clue for it, so a word half of them do not know
stops the game rather than colouring it. A player in Bogota who draws
`Fregona` has a table with nothing to say.

Two failure modes, and the second is the one that reads fine and still breaks:

  - **The thing only exists in Spain.** Fabada, Salmorejo, Migas, Pisto,
    Torrijas, Polvorón, Ensaimada, Chiringuito, Trastero, Desván, Tinto de
    Verano. Obvious once you look for it.
  - **The thing is universal and the word is not.** Ordenador/computadora,
    nevera/refrigerador, gafas/lentes, patatas/papas, zumo/jugo,
    judías/frijoles, guisantes/maíz, piso/departamento, melocotón/durazno,
    bolígrafo/marcador, altavoz/parlante, cremallera/cierre, pila/batería.
    Where a word splits, the file now takes the form the most speakers use;
    where it splits three ways with no majority (fregona, altavoz) it picks a
    different object rather than pretending one form wins.

Two traps that were not vocabulary at all. **`Tortilla` is an omelette in
Spain and a flatbread in Mexico**, so the table would have given clues for two
different foods and then accused the honest players; that is a worse bug than
an unknown word, because it looks like someone bluffing. And **`Chaqueta` is
an ordinary jacket in Spain and vulgar slang in Mexico.**

Two categories were rebuilt rather than patched. **Cine y TV** had eighteen of
its first twenty entries as Spanish television (Verano Azul, Cuéntame, Aquí no
hay quien viva, Paquita Salas, Águila Roja). **Fútbol** had eight clubs, all
LaLiga, nothing from the Americas, and Spain's words for the game itself
(`penalti`, `fuera de juego`, `prórroga`). They now carry El Chavo del Ocho,
Betty la Fea, Narcos and El Juego del Calamar; Boca Juniors, River Plate,
Flamengo and Chivas; Neymar, Valderrama, Chicharito and Riquelme; and `penal`,
`autogol`, `tiempo extra`, `Copa América`.

108 entries changed in all, across all seven categories, plus about 60 hints
that named something only Spain would recognise. Sizes are unchanged: 550
words, 1100 hints, `check-words.mjs --strict` clean with zero warnings.

`check-words.mjs` did most of the finding. Its cross-category rule caught
every hint that had become another category's secret word (`Atún` ended up in
both Food and Animals, which the per-category played ledger would have dealt
twice), and the gender rule caught fourteen adjectives I introduced while
rewriting hints in a hurry, including `Crema: Blanca`, which is a feminine
adjective on a feminine noun and therefore an actual leak. Every reviewed
NOUN went on `GENDER_REVIEWED` rather than being argued with, which is what
that list is for.

Regional catalogues stay open. `loadCatalog()` already resolves `es-MX` and
`es-AR`; this file is the neutral default they would sit beside rather than
something they would have to replace.

### Two names, on purpose

The first draft called the game `Juego del Impostor de Palabras` in the prose
and `Impostor de Palabras` in the hero, which was not a decision, it was the
long name not fitting on two lines. Irfan spotted it and settled it the other
way round from the way I had proposed:

  - **`Impostor de Palabras` is the GAME'S NAME.** The hero, the hub card, the
    footer link, `game.word`, and `name` in the structured data. Short enough
    to sit in a button.
  - **`Juego del Impostor de Palabras` is the DESCRIPTIVE PHRASE.** The
    `<title>`, the description, the keywords, the FAQ questions and the body
    copy, plus `alternateName` in the structured data. It carries `juego del
    impostor`, which is the head term people actually type, and it is clearer
    the first time you meet it.

English does not have this split, because `Impostor Word Game` is already
short enough to be both.

### hreflang, and a new gate

Reciprocal sets in every head, `x-default` on the English page, and the same
sets in `sitemap.xml` as `xhtml:link` alternates.

The sitemap is hand-written, because it carries URLs the build knows nothing
about, and that is precisely the situation where two declarations of the same
thing drift apart. Google reads both and silently drops the pairing when they
disagree: no error, no warning, the Spanish page just never gets shown to
Spanish readers. `scripts/sitemap.test.mjs` now checks the sitemap against
what the build emits, both directions, and all four of its assertions were
broken on purpose to confirm they fire.

### Verified

71 tests pass, lint clean, `check-words --strict` and `check-played` pass, and
`build:check` reports all four English pages byte-equivalent apart from the
path rewrite, the version stamp and the switcher.

A full Spanish round was played across three local tabs: room created from
`/es/word/` with `meta.lang: "es"`, all seven categories showing Spanish
names, `Gazpacho` dealt from the Spanish catalogue with the hint
`Refrescante`, and `Fin de la ronda / EL IMPOSTOR ERA Bruno`. Both plural
branches appeared and were correct: `Faltan 2 jugadores` and
`Falta 1 jugador`.

The #138 dialog fired for the first time in its life. Opening
`/word/?join=<spanish room>` offered "This room is in Spanish", and Continue
landed on `/es/word/` with `lang="es"`, straight to the name screen, and
joined. `played:word:es` was created as its own key with the English history
untouched. Test rooms deleted and confirmed null.

---

## 2026-08-28: the room decides the language (#138), and the Spanish stops sounding translated (#137)

### One rule instead of two

The room's language is now the single source of truth for the whole
experience: the words dealt AND the interface around them.

    Spanish room  ->  Spanish words + Spanish UI
    English room  ->  English words + English UI

The ticket originally described a split, where the room picked the words and
the page picked the buttons. Irfan pushed back that it would make the game
more complex, and he was right for a reason worth writing down: everyone in
a room must share one secret word, so the split gave a Spanish player English
CONTENT behind Spanish BUTTONS and still no way to play in Spanish. It bought
an inconsistent screen and nothing else.

It was also the harder of the two to build. The interface language is baked
into the page at build time (#133), so "the room decides the UI" is a
redirect, not a runtime string-swapping system, and the forwarding mechanism
already existed for cross-game codes.

### What moves

`rooms-word/{code}/meta.lang`, written once at creation, never updated.

A room with no `meta.lang` is English. That is a fact rather than a default:
the field did not exist before this, and every room predating it was created
from an English-only build. It is what makes the deploy safe while old and
new clients are both live, and it has a test that was broken on purpose to
confirm it fires.

The check runs in `attemptCodeValidation`, which already reads `meta` before
anything is written, so cancelling leaves no trace and nobody joins then
leaves. `routeJoinCode()` goes through the same path, so QR scans and shared
links get it too.

### Why a dialog and not a toast

The existing cross-game forward is silent because it CORRECTS your input:
your code belonged to another game. This CHANGES your experience and you did
not ask for it, and someone who cannot read the other language needs to be
able to say no and ask for a room in theirs instead.

    This room is in Spanish
    The whole game will be in Spanish: the words and the buttons.
    Everyone in a room plays in the same language.
    [Cancel]  [Continue in Spanish]

It reuses the confirm sheet #146 built for quitting rather than adding a
second one with the same markup, which is how two dialogs drift apart. The
sheet's action became a callback, and cancel gained one too, because this
dialog offers a real choice where quitting only offers "never mind".

### The language map comes from the build

`data-paths` on the i18n block, generated from `page.locales` in site.json,
the same source as hreflang. The client cannot drift from the set of pages
that were actually built.

`alternates` gained a root-relative `path` for it. hreflang wants the
absolute URL, but a redirect must not carry a host: the same build runs on
localhost, on the web.app preview and on the live domain, and an absolute
URL would throw a local tester onto production and quietly inflate the live
analytics. There is a test asserting the join URL has no host in it.

### Two predictions that turned out wrong

Comments in `word/app.js` and `words/index.js` both said the catalogue would
have to start loading from the room's language once #138 landed. It does not,
and cannot need to: page language now always equals room language, because
anyone whose room disagrees is redirected before they join. Both comments
were corrected rather than left to mislead the next reader.

### The Spanish that read as machine output

Irfan asked whether the Spanish sounds natural. It did not, in a specific and
findable way, and it was the gender rule biting for the third time.

Avoiding a gendered adjective (`blando`, `largo`, `redondo`, `espeso`) by
reaching for its abstract noun (`blandura`, `largura`, `redondez`, `espesor`)
is grammatical and gender-safe and bookish. A catalogue full of those is
exactly what reads as translated. Nobody says `cremosidad`.

The escape hatch that had been under-used: INFINITIVE VERBS. They never
inflect and they are what people actually say.

    Batido      Cremosidad  ->  Sorber
    Cojín       Blandura    ->  Apoyar
    Plato       Redondez    ->  Fregar
    Sábana      Blancura    ->  Planchar
    Salmorejo   Espesor     ->  Untar
    Gorrión     Pequeñez    ->  Bandada

Twenty hints reworked. The 29 abstract nouns left are the ones a person
genuinely reaches for: Velocidad, Elegancia, Torpeza, Serenidad. The test is
whether you would say it out loud, not whether it is grammatical.

Three separate specifics: `Temblor` on Flan is an earthquake, and `Tembleque`
is what Spaniards call a wobbling flan. `Electricidad` on Anguila was simply
wrong, since electric eels are South American and the European eel is not
electric. `Tuilla` on David Villa is his home village, a deep cut nobody
outside Asturias would place, and a hint the impostor cannot use does
nothing.

Also audited for Latin American vocabulary, since the catalogue is written
for Spain. Clean throughout: patatas not papas, zumo not jugo, ordenador not
computadora, nevera not refrigerador, melocotón not durazno, judías not
frijoles. The two hits a naive scan flags, `carro` and `saco`, are correct
Spain usage in context (carro de la compra, and a scarecrow's sack).

### Deployed

v2026.08.28.5. Verified on the preview host, not the live domain:

- `meta.lang: "en"` written on a real room created live
- The feature is INERT: only English exists until #139, so `redirectFor()`
  can never return a destination and no dialog can fire
- The Spanish catalogue is still not downloaded by an English player
- Regression: a deep link `?join=CL4U` went straight to the name screen with
  no dialog, and a second tab joined the lobby normally
- No console errors on any page; test rooms H4X6, 39CC and CL4U deleted
- 67 tests, lint clean, build:check equivalent, `--strict` passes

### Worth knowing before #139

Irfan's naturalness concern was aimed at the INTERFACE, not the word list.
The interface Spanish does not exist yet; #139 writes it. The requirement is
recorded on that ticket in full, and the short version is: write the strings,
do not translate them. `Faltan 2 jugadores`, not `Se necesitan 2 jugadores
más para empezar`. `tú` never `usted`. Spain vocabulary, matching the
catalogue.

A native speaker from Spain should read the finished set before #141 ships.
This is the part no checker can gate: check-words.mjs catches a gendered
hint, but nothing catches copy that is correct and lifeless.

The switcher rule, decided with Irfan: it appears only where switching costs
nothing. The hub and the word game landing page, not inside a room, and not
on draw or dance while they have no translation.

---

## 2026-08-28: the Spanish words (#137)

> **Superseded by #139.** The catalogue was rewritten for Spanish speakers
> everywhere; 108 entries changed. See the #139 entry above.

550 words and 1100 hints in Spanish, written for a table in Spain rather than
translated. The catalogue is complete; no player can see it yet, because
there is no Spanish page until #139.

### Written, not translated

Cuéntame, Aquí no hay quien viva, Verano Azul and Torrente sit next to
Friends and Breaking Bad, which keep their English titles because that is
what Spain calls them. The ones Spain renamed are renamed: Parque Jurásico,
El Rey León, Lobezno, Masacre, Mujer Maravilla. Football is La Liga first and
the clubs go by their nicknames.

Parity with English was never required, but it landed on 550 anyway.

### The gender warning, and why it needed an allowlist

A Spanish adjective agrees with its noun, so `Cremosa` announces that the
hidden word is feminine and halves the impostor's search before anyone
speaks. English has no equivalent: `Creamy` says nothing about `Pizza`.

The tell is an -o/-a ending. The trouble is that plenty of NOUNS end that
way and a noun leaks nothing, so `Verano` is as safe as `Grande`. No ending
separates them without a dictionary. The check therefore warns on the ending
and takes an allowlist of words already read and judged, and that allowlist
is the point rather than a workaround: adding a word to it is a person
recording "I checked, this is a noun".

It found 22 real leaks across the seven categories, every one an adjective
agreeing with its own word: `Relleno` on Buñuelos, `Estofado` on Judías,
`Perdido` on Mando, `Vacío` on Espacio, `Recta` on Regla, `Calvo` on
Guardiola, `Rubio` on Fernando Torres, `Rojiblanco` on Atlético.

`Ártico` left the catalogue rather than joining the list. It is a genuine
adjective as well as a place, and the list means something.

### The drift a checker could not see

The first draft of Food came out weaker than English, and not in difficulty
but in KIND. English hints are overwhelmingly physical, describing what the
thing looks, feels or tastes like: Cheesy, Stacked, Round, Melted, Glazed.
Occasion words appear as the second hint, not as both. A third of mine were
occasion and setting, and ten entries had no physical hint at all.
`Paella: Domingo / Compartir` was close to unguessable.

The cause was the gender rule itself. Spanish sensory adjectives nearly all
inflect, so avoiding the leak drove me off adjectives and onto nouns, and
food nouns skew towards occasions. The fix for one problem had created
another.

The way out is physical NOUNS, concrete and gender-safe: Grano, Capas,
Grumo, Lámina, Pulpa, Mordisco, Espuma. 29 hints reworked so every entry
carries at least one physical hint. Context hints fell from 34% to 26%
against English's 18%, measured rather than guessed, and each entry keeps
one vague hint because the impostor sees only one at random and that variance
is what makes a round tense.

Twelve more were softened by hand for a different reason. Regional origin
NAMES the dish: `Valencia` on Paella or `Burgos` on Morcilla tells the
impostor exactly what to say, and since only they see the hint, an
identifying one makes them impossible to catch.

The whole rule, palette included, is written into the header of es.js so the
next locale does not rediscover it.

### 56 hints that pointed at another card

A hint that is itself a secret word in another category was a warning the
English catalogue never triggered. Spanish had 56, and they matter more than
they look, because the host can select several categories at once: a room
playing Food and Everyday Objects would have dealt `Gambas` with the hint
`Plancha` while Plancha was itself in the deck. All 56 repointed, so Spanish
now matches English at zero.

### A bug in the checker, found late

GENDER_REVIEWED has no entry for English, so looksGendered() ran with an
empty allowlist and flagged English hints: `Two-toned` on Zebra, `Retro` on
Back to the Future. Neither can leak anything, because English adjectives do
not agree with their nouns.

It survived several full runs because I had been reading the checker's output
through `tail`, and the English section scrolled past. The rule is now gated
to locales that opt in by having an entry in the table.

### The copy detector needed two thresholds

A single overlap limit failed on Super Heroes, and correctly so: Batman, Thor
and Loki are Batman, Thor and Loki in Spain. Common nouns and proper nouns
are not the same kind of thing.

    Food 3%   Animals 4%   Places 5%   Objects 0%     bar 10%
    Movies 16%   Football 20%   Heroes 40%            bar 60%

Both bars are documented with the measured figures next to them. The test is
a copy detector, not a style gauge: a translation would sit near 100%.

### Deployed

v2026.08.28.4. The only change to any generated page is the version stamp;
the rest is es.js, which nothing loads yet.

Verified on the preview host, not the live domain:

- 550 words served, accents intact over the wire (Cuéntame, Parque Jurásico)
- The word game requests en.js and NOT es.js. `spanishDownloaded: false`,
  which is #136 paying off in production: an English player fetches 8KB
  gzipped, not both catalogues
- A live English round dealt `Burrito` and appended it to the existing
  history under the unsuffixed `played:word` key. No `played:word:es` key
  was created, because the page is English
- No console errors; test room ZX5U deleted and confirmed null
- `check-words.mjs --strict`, the ship gate #141 will run, passes for Spanish

### Worth knowing before #138

Still true from #135: #138 is the next ticket that changes what is WRITTEN
rather than what is shown, so it does not get the free pass. Everything
since has been additive.

This deploy was deliberately kept separate from #138 for that reason. #137 is
inert in production, so if #138 has to be rolled back, 550 words of content
do not go with it.

---

## 2026-08-28: the word list becomes word lists (#136)

The last piece of plumbing before Spanish gets written. Nothing a player sees
changes; what changes is that the catalogue is now something a page CHOOSES
rather than something it inherits.

### One 30KB file, loaded by everybody

`www/shared/words.js` was a static import in both games, so every page load
downloaded 550 English words and their 1100 hints. Adding Spanish beside it
would have meant every player downloading both catalogues to use one of them,
and that scales the wrong way with each language after it.

It is now `www/shared/words/`: `en.js`, `es.js` and an `index.js` that exports
`loadCatalog(lang)`. The games await it once at module top, before the IIFE
runs, which is the whole reason nothing else in either file had to become
async. By the time any function is defined the catalogue is ordinary data.

`es.js` exists and is empty. It is the shelf; #137 puts the words on it.

### The round trip that would have been the price

A dynamic import does not start until the module is executing, where a static
import is discovered at parse. That is one round trip later, paid on every
page load, in exchange for bytes not everyone needed.

So the build now emits `<link rel="modulepreload">` for the catalogue that
page will ask for, driven by a `catalogue: true` flag on the page in
site.json. Measured locally: `en.js` starts at 10ms alongside `app.js`, where
`words/index.js` (a static import) starts at 33ms. The fetch is now EARLIER
than the static import it replaced, not later.

### The bug the ticket did not mention

The ticket asked for `createPlayedStore(game)` to take a catalogue, because it
imported `WORD_CATEGORIES` at module scope. True, but not the whole problem.

The played ledger is keyed by category id, and the ids are identical in every
locale. One shared `played:word` bucket would have put Spanish and English
words in the same `Food` list, and then two things go wrong. The cap evicts
one language's history to make room for the other's. And `recent()` drops
words the live catalogue no longer has, so every switch between languages
would silently bin the history it had just come from.

The ledger is per-language now. English keeps the unsuffixed `played:word`
key, so every device already carrying a history keeps it; only new languages
get `played:word:<lang>`. Verified on a device that already had six Food
words: they were still there after the change, and the round dealt during
testing appended `Animals / Panther` beside them rather than replacing them.

### Why the enye is exempt from the accent folding

The ticket said NFD normalize, strip combining marks, then strip. That is
right for accents: an accent is a stress mark on the same letter, so `Melon`
and `Melón` are one word and only one of them belongs in the catalogue.

It is wrong for `ñ`, which is a separate letter of the Spanish alphabet.
Folding it away makes `año` and `ano` collide and reports a duplicate that is
not one, which would block a legitimate word with a message pointing at the
wrong thing. So the decomposition is undone for that one combination before
the remaining marks are stripped.

The three constants are written as `\u` escapes rather than literal
characters, because the pattern has to be a DECOMPOSED enye to match what
NFD produces, and on screen a decomposed enye is indistinguishable from a
precomposed one. Any tool that normalised that file would have turned the
rule off silently, and the symptom would have been a wrong duplicate report
rather than a crash.

The English catalogue is pure ASCII. That was checked, not assumed, before
touching the fold, which is why the change to it carries no English risk.

### The checker knows about locales now

`check-words.mjs` takes a locale, or checks all of them. English is the
reference: its sizes are enforced exactly and an empty category is an error.
Another locale is written a category at a time and is short by definition
until it is finished, so a shortfall there is reported and does not fail.

`--strict` promotes those to errors. That is the gate to run before a locale
ships, and it is what #141 should use.

It also checks that every locale offers the SAME category ids, because those
ids are the cross-client value in `meta.categories`. A locale that renamed one
would not show less, it would break room joins.

### Proving the gates, and the one that did not work

Each new gate was made to fail before being trusted:

- dropping `'Football'` from `es.js` fails the test suite on the id-set check
- `check-words.mjs fr` exits 2 and names the locales that exist
- `--strict` on the empty Spanish catalogue exits 1 with seven errors

That last one did not work at first. An empty category hit the "not written
yet" branch and continued, so it never reached the size check that `--strict`
promotes, and the ship gate passed a completely empty catalogue in silence.
An empty category is now an error under `--strict` too, which is the right
reading: `--strict` asks "is this locale ready to ship", not "is this
catalogue sane".

### Where the tests live

`check-words.mjs` runs its checks on import, so nothing can import it to test
it. The folding moved to `scripts/words-lib.mjs` and is covered by a new
`scripts/words.test.mjs`, which `npm test` already globs and CI already runs.
Thirteen new tests, 52 total.

That split is deliberate. `check-words.mjs` is a CONTENT check, run when a
catalogue is edited, and it is not in CI. The invariants in `words.test.mjs`
are the ones that break a ROOM rather than a word list, so they belong in the
suite that runs on every push.

### Verified

- Word: a Pass the Phone round dealt from Animals and recorded
  `Animals / Panther` in the ledger, beside the six Food words already there
- Draw: a round dealt `Potato` and appended it to its five existing Food
  words without repeating any of them
- Both preload their catalogue, both load it, neither logs a console error
- `en.js` at 10ms vs `words/index.js` at 33ms, so the preload does its job
- 52 tests, lint clean, `build:check` equivalent on all four pages
- Test rooms JSX7 and G6BF deleted from the database and confirmed null

### Deployed

`v2026.08.28.3`, pushed as `119d717` and released the same day.

The one risk worth naming: `/shared/words.js` now 404s, because it moved. That
can only hurt a browser holding a cached `app.js` that still imports it, and
firebase.json sends `no-cache, no-store, must-revalidate` on the HTML, on
`app.js` and on the catalogue itself. Checked all three against the live
response headers rather than against the config. No client can be stranded.

Verified on the preview host, not the live domain:

- The three new files serve: `index.js` 4.6KB, `en.js` 29.5KB, `es.js` 1.7KB
- The preload sits on `/word/` and `/draw/` and on neither of the other two
- Over a real network the preload is worth more than it was locally: `en.js`
  starts at 348ms against `words/index.js` at 886ms
- A Pass the Phone round dealt `Soup` and appended it to the `Curry` left in
  that device's ledger by the #135 session. The unsuffixed English key was
  read and written by the new code, which is the backwards-compatibility
  claim tested rather than argued
- `played:word` and `played:draw` are the only ledger keys present. No
  suffixed key appeared, which is correct: English never gets one
- No console errors
- Test room RQA6 deleted and confirmed null, as were JSX7 and G6BF from the
  local session

No IndexNow ping. Nothing a reader or a crawler sees changed: the entire diff
to the four generated pages is the version stamp and one preload link.

### Worth knowing before #137

`loadCatalog()` falls back to English when the catalogue it loaded is entirely
empty, because a Spanish page dealing `undefined` as the secret word is worse
than a Spanish page dealing English words. That fallback stops firing the
moment `es.js` has anything in it.

A PARTIAL catalogue needs no such guard and does not get one: `pickWord()`
already drops ids this build has no words for, which is the seam #135 left.
So #137 can land one category at a time and each one works the day it lands.

Two Spanish traps are written into the header of `es.js` rather than left to
be rediscovered. Adjective hints carry gender, and a gendered adjective next
to a hidden noun halves the field before anyone speaks, so hints should not
inflect. And articles have to be in or out consistently, because `Playa` and
`La Playa` in one catalogue read as two different registers on the card.

### Still true from #135

#138 is the next ticket that changes what is WRITTEN rather than what is
shown, so it does not get the free pass #135 had. This one did not need it
either: no wire format changed, and old and new clients exchange identical
data.

---

## 2026-08-28: the backlog gets a shape, and the checks get run for us (#149)

Not a change to the game. This is about the 43 open tickets and the four checks
that guarded a release only when someone remembered to run them.

### The two epics were prose

#127 named its fourteen children in its body as a numbered list, and #77 named
its twelve the same way. Written down is not the same as recorded: nothing
rolled up, so "how far into the Spanish work am I" meant reading the body
against the closed list by eye, and the children sat in the open list as
fourteen more flat rows padding the count.

They are GitHub sub-issues now, which is the native parent and child link.
#128 to #141 hang off #127, and #78 to #89 off #77. Each epic carries a live
progress bar, and the children nest under it. #127 reads 8 of 14, #77 reads 3
of 12, and neither number was written by hand.

The GEO children went on in issue-number order first, which was wrong: that
epic is a twelve-step sequence and its numbering does not follow its issue
numbers. #85 is step 2, #86 is step 3, #79 is step 4. Reordered so the list
reads 1/12 through 12/12 as it was designed to.

### Fourteen of forty-three issues had a label, and thirteen of those were GEO

So there was nothing to filter on. Two dimensions now, because they answer
different questions and an issue needs both answered:

- `game:word`, `game:draw`, `game:dance`, `game:hub`, `game:shared`
- `type:bug`, `type:feature`, `type:chore`, `type:seo`, `type:i18n`

Plus `epic` for the four parents. Every open issue was backfilled, all
forty-four including this one, so `is:open label:game:draw` and
`is:open label:type:bug` are now real queries rather than empty ones.
`game:shared` carries the most by a distance, which is a fair description of a
site where one stylesheet and one build script feed three games.

The older `geo` and `chat` labels stay. They describe something the new axes do
not, and renaming them would break links from the issues that cite them.

### The checks run themselves

`.github/workflows/ci.yml` runs `npm run lint`, `npm test` and
`npm run build:check` on every push, cheapest first. Nothing else changed: the
same three commands, the same package.json scripts, just not dependent on
memory any more.

`build:check` is the one that earns the file. Every page under `www/` is
generated from `src/` and the output is committed, so a template edit whose
rendered result quietly drifted from the committed tree looks completely normal
in a diff and surfaces on the live site. That is precisely the failure a human
reviewer cannot catch and a machine catches every time.

`scripts/check-songs.mjs` is deliberately not in that workflow. It makes 382
calls to the iTunes Search API and takes about ten minutes because Apple
throttles around twenty a minute, and a red mark on it would mean Apple had a
bad morning, not that we broke something. It has its own weekly schedule in
`.github/workflows/songs.yml` instead, which is a better home than it had
before, which was nowhere. Previews get withdrawn silently: a query that played
for months stops returning a `previewUrl`, the round skips it, and today the
first sign is misses piling up in `analytics/music/errors/songMiss`. Weekly
means we hear about it before a player does. It fails only on BROKEN, a query
with no playable result at all. BRITTLE is reported and does not fail, because
whether to replace a one-result entry is a judgement call.

### Verified

- `npm run lint` clean, 39 tests pass, `npm run build:check` reports all pages
  equivalent, run locally before the workflow was written so a first red run
  could not be pre-existing state.
- `check-songs.mjs` imports nothing but `node:fs`, so the scheduled job skips
  `npm ci` and does not install a toolchain to make HTTP calls.
- Both epics read back through the API in the intended order.
- No open issue is left unlabelled.

### The song check earned its place on the first run

Dispatched manually rather than left untested until Monday, and it went red:
382 queries, 362 clean, 0 errored, **1 broken and 19 brittle**.

The broken one is `Onde Ondu Sari Mungaru Male` in the Kannada category, at
`www/dance/app.js:493`. No result carries a `previewUrl`, so `fetchPreview`
comes back empty and the round skips the song. Filed as #150. The song plainly
exists, so this is a query that stopped matching rather than a catalogue that
lost a track.

The 19 brittle are concentrated in Malayalam (11), Kannada (6) and Tamil (2),
which is what thinner Apple coverage of those catalogues looks like. They do not
fail the workflow, and that is the point: a check that goes red every week over
something we have decided not to change is a check we learn to ignore.

### Not bumped, and why

No version stamp, no deploy, no IndexNow ping. Nothing under `www/` or `src/`
was touched and nothing a player or a crawler sees has changed. Stamping a
release for two files that only GitHub reads would put a version in the record
that corresponds to no change on the site.

### Considered and left out

Milestones, because there are no release trains here to bucket: it is one
ticket per deploy, stamped and shipped. A Projects board, on the theory that
sub-issues and labels may make the issue list readable enough on their own, and
a board is a habit to keep up rather than a thing you set up once. Releases and
tags, secret scanning, Dependabot. All still available if the list above turns
out not to be enough.

`#22` and `#30` are epics open since 23 July with children under them. They
were labelled but not converted to sub-issues, because whether they are still
the plan is a question rather than a formatting exercise.

---

## 2026-08-28: the Game Master pill was the same pill (#148)

The loose end named at the bottom of #147. `.gm-banner` in `dance.css` was a
copy of `.imposter-banner` in `base.css`. Diffed declaration by declaration,
**eight of twelve were character-for-character identical** and the rest differed
only by hue: red at 8% against teal at 8%, red at 50% against teal at 50%,
`--accent-red` against `--accent-teal`. Its own comment said so, calling itself
"the imposter banner's neutral twin", which is a fair description of a component
and a poor description of a second copy of one.

So the shape, the padding, the radius, the type and the tracking now live once,
in a grouped selector, and each name carries only its three colour
declarations. `.gm-banner` moved into `base.css` to sit beside its twin. It is
dance-only, but keeping the two apart is precisely how they drifted, and there
is precedent: `.word-card .imposter-banner` is word and draw only and has always
lived there.

The Game Master pill also picked up the `.shown` contract from #147, and so did
the two `.small` lines under both pills, which had been carrying
`style="display:none;margin-top:8px"` in the markup. They share one
`.pill-subhint` class now, so a pill and its caption are driven the same way.

### Verified

One four-player DJ Mode round exercises every state at once, which is why it was
worth the setup: the two roles are mutually exclusive, so a single round shows
all four elements in both positions.

- **Ana, the DJ**: Game Master pill shown at 28px, its sub-hint shown and
  reading "Impostor: Cy", impostor pill hidden.
- **Cy, the impostor**: impostor pill and sub-hint shown, Game Master pill
  hidden, and a different track from the other three.
- **Bo and Di**: all four elements hidden at height 0.
- **No `style` attribute left on any of them**, on any of the four phones.

The GM pill's default flipped from visible to hidden, the same trap as #147, so
it was also compared against its own deleted rule rebuilt in the page:
**fourteen computed properties, zero differences**. Word's and draw's four
on-card badges still resolve to the light pill on the tint, so the
`.word-card` override still beats the new colour block.

No console errors on any of the four. `npm run lint` clean, 39 tests pass,
`npm run build:check` equivalent.

### Not in scope, and worth saying why

`style.display` is used widely across dance for ordinary one-off elements:
buttons, sections, dividers, the QR fallback. That is a normal pattern and not a
divergence between games. This was only about the pill component and the two
lines bound to it.

### Deployed

`v2026.08.28.2`. Verified on production by `curl` only: all four pages on the
new stamp, dance's markup free of inline `style=` on both pills and both
sub-hints, `base.css` carrying the grouped selector and `.gm-banner` beside its
twin, `dance.css` down to zero `.gm-banner` rules with `.pill-subhint` in their
place, and `dance/app.js` toggling `.shown` four times.

Then on `imposter-20b85.web.app`, gate confirmed `false` first: the deployed CSS
resolved all four elements to `display: none` by default and to the right pill
on `.shown`, red against teal differing in hue alone, and a real three-player
Imposter Challenge round put the pill and its sub-hint on Bo and nothing on the
other two.

**No `lastmod` bump and no IndexNow ping.** Two pills behind a room code.

---

## 2026-08-28: the badge hides itself (#147)

Last of the three divergences in the impostor badge. The pill looked the same
everywhere, but showing and hiding it was arranged three ways, because
`.imposter-banner` defaulted to `display: inline-flex` and so left every
consumer to hide it for itself.

Word and draw overrode the display inside `.word-card` and toggled `.shown`.
Dance carried `style="display:none"` in the markup and wrote `style.display`
from JavaScript. **That inline form is the one that mattered**: a style
attribute cannot be reached from CSS at all, so dance's badge sat outside the
design system in a way the other two did not, and the next change to how the
badge appears would have had to be made twice.

Now hidden is the component's own default and `.imposter-banner.shown` is the
single switch. `.word-card .imposter-banner` keeps only what is actually about
being on a card: the absolute pinning at 32px and the light-pill colours that
survive the red ground. It no longer repeats the hiding, and its `.shown`
duplicate is gone.

### Why this needed real testing rather than a glance

The change flips the default from visible to hidden. The failure mode is a badge
that never appears, in a game whose whole point is knowing you are the impostor,
and nothing about the diff would look wrong. So all five instances were checked
in a running game rather than reasoned about:

- **Dance, a real three-player round.** Bo drew the odd track and got the badge,
  `display: inline-flex`, 28px tall, with no style attribute on the element at
  all. Ana and Cy: `display: none`, height 0.
- **Word, a four-player Pass the Phone round.** Badge on the impostor's card
  only, still pinned at 32px.
- **Word's online plate**, all three of its states: hidden by default, shown by
  the class, and still hidden by `visibility` while `.plate-up.blanked` is set
  mid-swipe. That third one is the interesting case, because it is the rule that
  stops a half-turned card naming the impostor.
- **Draw, a three-player Pass the Phone round**, and draw's online card forced
  through both states: card height 277.5px either way, badge at 32px when shown.
- No console errors in any of the three games.
- `npm run lint` clean, 39 tests pass, `npm run build:check` equivalent.

### The badge is now genuinely one component

Three markup instances that are character-for-character identical, one CSS
default, one switch class, and the same `classList.toggle('shown', ...)` call in
all three games. Dance keeps its badge above a header rather than on a card,
which is context and not drift: that screen has no card to pin to.

Still on the inline-style pattern next to it: dance's Game Master pill and the
two sub-hints under both. They are dance-only, so they are not a divergence
between games, but they are the same habit.

### Deployed

`v2026.08.28.1`. Verified on production by `curl` only: all four pages on the
new stamp, zero inline `style="display:none"` on the badge in any of the three
games, `base.css` carrying one `.imposter-banner.shown` and one
`.word-card .imposter-banner` with the old duplicate gone, and `dance/app.js`
toggling the class.

Then played on `imposter-20b85.web.app`, gate confirmed `false` first: a real
three-player dance round, Bo drew the odd track and got the badge at 28px with
no style attribute, Ana and Cy hidden at height 0.

**No `lastmod` bump and no IndexNow ping.** A badge behind a room code; nothing
a crawler reads changed.

---

## 2026-08-27: one quit dialog, not two (#146)

Word and draw each had their own confirm sheet. Same purpose, same wording
shape, same `openQuitConfirm()` / `closeQuitConfirm()` function names, same
`#quit-modal-backdrop` and `.open` class, and yet two sets of markup and two
sets of CSS using three of the same class names for different things: draw's
`.confirm-body` was the sheet's padding container, word's was a paragraph of
text.

That collision had already shipped. `draw.css` loads after `base.css` and wins
where both set a property, which is what made it look safe. But
`.confirm-actions button` is a descendant selector at specificity (0,1,1) and
outranks the plain `.btn` on draw's buttons, and nothing in `draw.css` contests
it. Draw's Quit and Cancel had been rendering 10px shorter with smaller type
since the #144 deploy.

**Scoping word's rules under `.confirm-sheet` would have stopped the bleeding
and left the actual problem in place.** Two implementations of one dialog is the
defect; the specificity accident was only how it announced itself. So draw now
uses word's sheet exactly: same structure, same classes, same element ids, which
means `openQuitConfirm()` is now the same function in both games apart from the
strings it writes.

Measured on both pages with the dialog open, every property identical: sheet
340x190.6 with 24/22/20 padding and a 26px radius, title 21px, body 14px at
`--ink-soft`, both buttons 47px tall at 15px with a 999px radius, the
destructive one on `--accent-red`. Not "close enough" - the same numbers,
because it is now the same rule.

Two small improvements came with it. Draw's backdrop moves from a static
`aria-label` to `aria-labelledby="quit-modal-title"`, so the accessible name is
the heading the player actually sees, which differs for a host and a guest.
And four strings in `draw.json` that JavaScript immediately overwrote are gone.

### What did NOT change, deliberately

Draw's quit copy is still hardcoded English in `app.js`. Word's goes through
`t()`, because word has been through the i18n pass and draw has not: there is no
`runtime` block in `draw.json` to add keys to. Converting draw belongs to that
epic, not to this fix.

Draw also still lacks word's third case, the one-shared-phone wording for Pass
the Phone mode. In draw that branch currently reads as the host case, which is
approximately right but says "the room" to somebody who is not in one. Left
alone because it changes what players read, which deserves its own decision.

### Verified

Local dev server only, gate false.

- **A real three-player online round, both branches.** Bo (guest) got "Leave the
  game?" / "You will drop out of the round and your turns will be skipped." /
  "Leave", and leaving dropped Bo to home. Ana (host) got "Quit the game?" /
  "closes the room and ends the game for everyone" / "Quit", and quitting
  deleted the room and bounced Cy home too.
- **All three ways out of the dialog**: the Cancel button, Escape, and a click
  on the backdrop. All close it, none of them leave.
- The page loads with **no console errors**, which is the canary that matters
  here: all four renamed ids are looked up at module scope when the listeners
  are wired, so a typo would have thrown on load.
- Word's sheet measured identically, and `www/word/index.html` differs from its
  last build by the version stamp alone. Dance has no quit dialog.
- 320x568: sheet 280x211 centred, no horizontal overflow.
- `npm run lint` clean, 39 tests pass, `npm run build:check` equivalent.

### Deployed

`v2026.08.27.5`. Verified on production by `curl` only: all four pages on the
new stamp, draw carrying `confirm-sheet` and the four `quit-modal-*` ids, with
`confirm-text`, `id="quit-title"` and the old `.btn-secondary` button gone, and
`draw.css` down to zero `confirm-` rules. Word's markup unchanged.

Then played on `imposter-20b85.web.app`, gate confirmed `false` first: a Pass
the Phone round through to the drawing screen, Quit Game opened the shared sheet
with the host wording and a 47px button, and confirming closed the room and
returned to home. No console errors.

**No `lastmod` bump and no IndexNow ping.** A dialog behind a room code; nothing
a crawler reads changed.

---

## 2026-08-27: draw takes the same card (#145)

The badge move from #144, carried over to the draw game. Word's impostor pill
rides on the card; draw's still hung above it, on both of its card screens.

**This is consistency work, not a bug fix, and it is worth being precise about
that**, because the first draft of this entry claimed two defects that do not
survive checking:

- *"Pass the Phone leaked the badge a beat early."* Real but tiny. The badge
  became legible at 45 degrees of the swipe rather than 50. The person swiping
  is the person whose card it is. The old slot used `visibility: hidden`, not
  `display: none`, precisely so the card never moved, so there was no jump here
  either.
- *"The online card sat at two heights, which is a tell."* The jump was real.
  The tell was not: draw's online mode is one phone per player, so nobody else
  sees your card move. That argument was carried over from Pass the Phone
  without checking that it applied.

What the change actually buys is worth having on its own terms:

**One card, not two.** The badge is a single component used by all three games.
Before this, the two games that deal a card placed it differently, for no
reason other than word having been edited more recently. The next change to
that card is now made once.

**`.pass-banner-slot` is out of the shared stylesheet.** That is the rule that
nearly took draw down in #144, the one left behind carrying a do-not-delete
comment. Draw was the last thing using it. One less shared landmine, and one
less rule whose safety depends on somebody reading a comment.

Dance keeps its badge above a header rather than on a card, and that is not
drift: its screen has no card to pin to.

### The one non-obvious line

`#screen-card .word-card { position: relative; }` in `draw.css`, and it has to
be scoped to that screen. The badge is absolutely placed, so the card has to be
the thing it resolves against. A bare `.word-card { position: relative }` would
be the obvious way to write it and would be a bug: `draw.css` loads after
`base.css` and at equal specificity would win, which would take the Pass the
Phone face out of `.flip-face`'s `position: absolute` and collapse the turn
entirely. Same class, two cards, one of which is already positioned by
something else.

### Also converged: how the badge is shown

The online badge stopped being driven by an inline `style.display` and now
toggles `.shown`, which is what the CSS was already written for and what word
does. Dance still uses the inline form; that is the remaining divergence in this
component and is not fixed here.

### Scope, deliberately

Only the badge. The rest of #144 answers "has the round started?", and draw's
card screen already answers that by handing off to the drawing screen, which has
a turn pill and a per-turn countdown of its own. A five-second reveal, a
swipe-away card and a count-up clock would all be solutions to a question draw
does not ask.

### Verified

Local dev server only, so the analytics gate is false and nothing was counted.

- **A real three-player online draw round.** Ana held the hint and got the
  badge; Bo and Cy both got "Salad" and no badge. No inline style left on the
  element, `display: flex` against `none`, correct card tint on each.
- **A real three-player Pass the Phone round.** Badge on the impostor's card
  only, pinned inside `#flip-back` at exactly 32px, matching word. Sampled the
  swipe frame by frame: the badge turns on at the same frame the role text
  fills.
- **The card no longer changes height** between impostor and crewmate on
  `screen-card`: top 243px, height 277.5px, both ways.
- **Word is untouched**: a four-player Pass the Phone round put the badge on one
  card, at 32px, exactly as before.
- **Dance is untouched**: loads clean, no console errors, badge unchanged.
- 320x568: badge 209px inside a 272px card on both screens, no horizontal
  overflow.
- `npm run lint` clean, 39 tests pass, `npm run build:check` equivalent.

One `ERR_TIMED_OUT` appeared in the draw tab's console after the host quit and
the room was deleted. It is a socket teardown, not a page resource: every
request the page makes returned 200. Noting it rather than claiming it away.

### Still open, and deliberately not in this commit

#144 added `.confirm-sheet` / `.confirm-title` / `.confirm-body` /
`.confirm-actions` to the shared stylesheet for word's quit dialog. Draw already
had a quit dialog using three of those names for different things. `draw.css`
loads later and wins where both set a property, but `.confirm-actions button` is
a descendant selector and outranks the plain `.btn` on draw's buttons, which
nothing in `draw.css` contests. Measured: draw's Quit and Cancel buttons went
from 53.5px tall and 16px type to 44px and 15px. Shipped, live, and not
intentional.

Filed as #146. Scoping base.css's rules under `.confirm-sheet` would stop the
bleeding, but the real answer is the same one this entry is about: word and draw
have two separate implementations of one dialog, and they should have one.

### Deployed

`v2026.08.27.4`, 7 files. Verified on production by `curl` only, so no
JavaScript ran and no counter moved: all four pages on the new stamp, the draw
page carrying `id="pass-banner"` and `id="imposter-banner"` as the **first
child** of `#flip-back` and `#word-card` respectively, `pass-banner-slot` and
the dropped sub-line gone from both the page and `shared/base.css`, and
`#screen-card .word-card` present in `draw.css`.

Then played on `imposter-20b85.web.app`, with the analytics gate confirmed
`false` before anything else: a three-player Pass the Phone round put the badge
on the impostor's card only, inside the card at 32px, with the other two reading
"Grapes" and no badge. Host quit deleted the room. No console errors.

**No `lastmod` bump and no IndexNow ping.** Everything that changed sits behind
a room code, and the hero, how-to, FAQ and structured data a crawler reads are
untouched. Same call as #144 and #135.

**Live rooms straddling the deploy are safe.** Nothing new is written to the
database and nothing read from it changed. The badge is decided from
`meta.imposterIds`, which is what it was already reading.

---

## 2026-08-27: the word round says it has started (#144)

The online game screen dealt a card and then never changed again. No signal
that the reveal phase was over, no difference between "still reading my word"
and "playing", and no way off the screen at all until the host revealed. It now
counts itself down, turns the card over, says the round is live, and carries a
way out.

### The card turns instead of sitting there

Five seconds face up, counted at the foot of the card, then it turns face down
on its own. Turning it back is a **swipe**, not a tap.

The gesture is `wireFlipCard()`'s, reused verbatim, and the reason is worth
writing down: Pass the Phone's card **already ignores taps**. Its reveal fires
on a real drag, or on `click` with `detail === 0`, which is keyboard and
assistive tech rather than a thumb. That is exactly the property this screen
needed, because the card is large and a thumb resting on it must not put
somebody's word on screen. Same 45 degrees to fill, same 50 to commit, same
0.45s curve.

What is NOT reused is the square. `.flip-card`'s `aspect-ratio: 1 / 1` and its
`58vh` cap belong to the passed card; this one keeps the rectangle it has always
had. Hence `.flip-card.is-plate` and its own `.plate-up` / `.plate-down` faces
rather than `.flip-front` / `.flip-back`. **The face in flow is the word side**,
because it is the taller of the two and its height is what the pair has to be.

**Where this parts company with `blankBackFace()`.** The passed card empties its
back face while the card is turning, so a half-swipe can never show the word. It
can do that because that card is a fixed square. Here the word IS the card's
height, so emptying it would collapse the card mid-swipe. Same protection,
different mechanism: `.plate-up.blanked` hides the text with `visibility`, which
keeps the box. The badge blanks with it, since it names the role too.

### The badge moved onto the card, in both modes

`.pass-banner-slot` is gone. The badge is now a pinned pill inside `.word-card`
in the online game and in Pass the Phone alike, with the cream-on-red pill
restyled as a light pill on the tint.

This fixes something that was already slightly wrong. Above the card,
`fillBackFace()` turned the badge on at 45 degrees of the swipe, which is
**before** the card face that says the same thing is anywhere near visible. On
the card there is nothing to keep in step: it turns because it is part of what
turns.

**Pinned, not stacked.** In flow the pill would push the hint down by its own
height, on the impostor's card only, leaving one player's word sitting lower
than everyone else's on a taller card. Absolutely placed at the same 32px inset
as the countdown at the foot, both cards measure 282px and the word lands 135px
from the top of the card on both. The two internal gaps are not equal, 40px
above against 55px below, because a bordered pill is taller than a line of small
caps; the edge insets and the centred hint are the two alignments a reader
actually perceives, so those are the ones that were made exact.

The impostor sub-line, "You don't know the word — bluff with clues that fit your
hint", went with the slot. The card now carries everything the role has to say.

### The clock counts up, and zero is not where you would guess

`meta.startAt`, minus the five-second face-up window. Two things fall out of
that choice:

* Every phone reads the same elapsed time, and a reload shows the truth rather
  than restarting at zero. Deriving it from when THIS phone turned its card over
  would have put a player who swiped early on a different clock from everyone
  else.
* It reads `00:00` at the moment the status appears rather than `00:05`. A
  player who put their card away early simply sits at zero until the window they
  skipped is up.

Counting up, never down. No bar, no target, no colour change: the point is to
say the round is running, not that it is running out.

### A way out, and what it costs

Both playing screens now carry the lobby's own `.back-btn`, in the lobby's own
corner. It asks first, because `leaveRoom()` does two very different things:
a host **deletes the whole room**, anybody else removes only themselves, and on
a shared phone it ends the round for the group. Three bodies of copy in one
sheet: `.confirm-sheet`, inside the `.cat-modal-backdrop` every other modal here
already uses.

The Pass the Phone round screen got the same button. It was the other dead end,
and it is the mode that already armed the back trap, so its toast, "Tap Quit
Game to leave", was pointing at a button that did not exist. Now it does, on
both screens, and the trap is armed for online rounds too.

`disarmPassBackTrap()` now also pops the marker it pushed. Left on the stack,
the first back press after a round was spent popping it and appeared to do
nothing. Guarded on the marker being ours and on top, so it can never walk off
the page.

### Short phones cost a media query

Adding a quit button, a status block, a second instruction line and a caption to
a screen that already held a 278px card overflowed a 568px viewport, and the
thing under the fold was Reveal Impostor, the one control on the screen that
has to be reachable without scrolling. `@media (max-height: 700px)` takes the
card's vertical padding from 104px to 72px and tightens two gaps. The host's
button now ends at 510px of 568px.

The rule is one class deep on purpose, so it cannot reach the passed card, which
sets its own padding at `.flip-face.flip-back`, two classes deep.

### Verified

Three tabs on `localhost:8123`, a real room, three players, one round played
through to Round Over, then a four-player Pass the Phone round on top of it.

* The sequence, timed off a live round: 3-2-1 overlay, `Starting in 5` down to
  1, then covered + blanked + status shown + countdown hidden, on the tick.
* A tap: nothing. A 20px drag: springs back, still covered and still blanked. A
  real swipe: uncovers and unblanks. A swipe back: covers and re-blanks. Badge
  `visibility: hidden` while covered, `absolute` at exactly 32px from the card
  top.
* Impostor saw the badge and YOUR HINT, crewmates saw THE SECRET WORD, the two
  clocks agreed to the second across tabs.
* Host: "← Quit Game" + Reveal + caption. Player: "← Leave Room", no button, no
  caption. Confirm copy correct for host, player and shared phone, and Quit
  landed back on the home screen.
* Reveal Impostor still ends the round on every tab, the clock freezes, and the
  trap disarms.
* Pass the Phone: four cards swiped through, badge on the impostor's card only,
  round screen reached with "← Quit Game".
* No horizontal overflow on any of the eleven screens at 320px. `npm run lint`,
  `npm test` (39) and `npm run build:check` all clean.

### The shared stylesheet nearly took the draw game with it

Caught on a post-commit audit, before anything shipped. Moving word's badge onto
its card made `.pass-banner-slot` dead code **in word**, so the rule went. It is
not dead in **draw**, which still hangs its badge above the passed card and
still toggles `.shown` on that slot.

The failure mode was the worst available. The rule's whole job is
`visibility: hidden`; without it the slot never hides, so on a shared phone
every player would have read "You're the Impostor" above every card. Restored,
with a comment saying not to delete it until draw's badge moves too.

Audited the rest of the base.css diff the same way, selector by selector.
Everything else added is either a new class name nothing else uses
(`.plate-*`, `.game-status`, `.game-foot`, `.confirm-*`, `.card-countdown`,
`.live-dot`) or scoped so it cannot reach them: `.word-card .imposter-banner`
only matches a badge INSIDE the card, which draw and dance do not have, and
`.game-hint` is a class where draw and dance use `game-hint` as an **id**.
Re-ran draw's Pass the Phone afterwards: slot hidden for the two crewmates,
visible for the impostor, hidden again on the next card. Draw's 14 screens and
dance's 10 both clean of horizontal overflow.

Reduced motion was verified by reading the parsed CSSOM, where the media block
and all four plate rules are present. It was not verified by emulating the
preference, which this setup cannot do. The JS path is the passed card's, which ships.

The rooms this created (`LL2U`, `2ZHM`) were deleted from the RTDB afterwards.
Everything ran on `localhost`, so the analytics gate was false throughout and no
counter moved.

### Deployed

Pushed and deployed 2026-08-27, stamp `v2026.08.27.3`, 7 files.

Confirmed on the live domain by `curl` only, which runs no JavaScript and so
moves no counter: all four pages on the new stamp, the word page carrying the
plate, both quit buttons, the clock, the confirm sheet and the badge inside the
passed card, with `pass-banner-slot` and `imposter-subhint` gone from it and
**`pass-banner-slot` still present in draw**, which is the whole point of the
second commit.

Then confirmed by playing on `imposter-20b85.web.app`, where the hostname gate
reads false: `analyticsGate: false` checked before anything else. A word Pass
the Phone round dealt the badge to the impostor's card and nobody else's and
reached the round screen with its new Quit button, and a **draw** Pass the Phone
round showed the slot hidden at rest, hidden for both crewmates and visible only
for the impostor. Dance: ten screens, no horizontal overflow, banner still
`display: none`, no console errors. Both test rooms were deleted by the mode
switch's own `teardownRoom()`.

**Live rooms straddling this deploy are safe, and it is worth saying why.** The
caution recorded under #135 applies to anything that changes what is WRITTEN to
the room. This writes nothing new. The countdown, the turn, the clock and the
quit dialog are all client-side, and the clock reads `meta.startAt`, which was
already there. An old client and a new client in the same room exchange
byte-identical data; the old one simply does not have the new screen.

No `lastmod` bump and no IndexNow ping. What changed inside the game screens is
behind `display: none` and behind a room code; the hero, how-to, FAQ and
structured data a crawler actually reads are untouched. Same call as #135.

---

## 2026-08-27: category ids stop being category labels (#135)

The highest-risk ticket in #127, shipped on its own for that reason.

`'Food'` was doing four jobs at once. It was the key into `WORD_CATEGORIES`,
the value written to `meta.categories` and read by every other player in the
room, the key of the played-word ledger both on the room and in
`localStorage`, and the key of the lifetime counter at
`analytics/word/games/categories`. Three of those four are stored data with
months of history behind them, so the label could never be translated while
it was also the key.

It is now an **id**, and only an id. The two strings a player reads,
`category.<id>.name` and `.desc`, live in the runtime table #134 built. The
ids stay English and ASCII in every language, so **nothing about the stored
data changes**: same wire format, same ledger keys, same counters, no
migration, no split in the analytics history.

### The one real behaviour change

`activeCategories()` used to drop any id the local catalogue did not have and
fall back to Food. That was invisible and harmless while every client shipped
the same seven categories. It stops being harmless the moment a room can be
opened in another language (#138), where it would silently reset a Spanish
host's room to an English category.

So the lobby now shows what the room says, known id or not, and the guard
moved to `pickWord()` where it belongs: display is tolerant, dealing is not.
Verified by writing `['Comida', 'Animales']` into a live room's meta and
playing a full three-player round:

- all three clients showed **"Comida, Animales"** rather than resetting to Food
- the round still dealt a real word (`Bagel`), not `undefined`
- the played ledger recorded it under **`Food`**, the id that actually
  supplied the word, so the ledger stays coherent

### Why the analytics cannot drift

`trackRound()` is passed `deal.cat`, and `deal.cat` can only ever be a key of
`WORD_CATEGORIES`, because `pickWord()` builds the union from that object.
An unknown id therefore cannot reach a counter even in principle. That is a
structural guarantee rather than something to re-check after each deploy.

### The build refuses one more thing

Every id in `WORD_CATEGORIES` must have both display strings in every
locale's table. A missing one is invisible at runtime by design: `catName()`
falls back to the raw id, which reads as correct in English and as a bug in
Spanish. Verified by deleting `category.Football.desc` and watching the build
name it.

### Verified

- A full three-player online round, host and both joiners, through to the
  reveal. No console errors on any client.
- `rooms-word/<code>/meta` read mid-round: `categories` holds English ids.
- The picker renders all seven with correct ids, names and descriptions, and
  `dataset.cat` carries the id rather than the label.
- `build:check` clean on all four pages. The only HTML change is the string
  block; the lobby's default still renders "Food" because in English the name
  and the id are the same word.
- 39 tests pass, 3 of them new. The id list is frozen in one of them: renaming
  an id splits a counter and orphans two ledgers, so it should take a
  deliberate edit to a test to do it.

### Deployed

Pushed and deployed 2026-08-27, stamp `v2026.08.27.2`. Confirmed live on
`imposter-20b85.web.app` rather than the live domain, which would have
counted the visit: the picker renders all seven categories with the right
names and descriptions, the lobby's default still reads "Food", and the
plural lobby hint from #134 still reads "Need 2 more players". Test room
`SLU3` deleted afterwards.

No `lastmod` bump and no IndexNow ping: nothing a reader or a crawler sees
changed.

### Worth knowing before #136

A caution raised while planning this ticket turned out not to apply, and the
reason is worth keeping. The worry was that live rooms would straddle the
deploy and old and new clients would disagree. They cannot: the ids are the
same English words that were already on the wire, so an old client and a new
client exchange byte-identical data. **Any future change that alters what is
WRITTEN, rather than what is shown, does not get that free pass** and needs a
real compatibility plan. #138 (`meta.lang`) is the next one that does.

The three em dashes noted under #134 are still there, untouched, and still a
single edit to two JSON files whenever [#113] is picked up.

[#113]: https://github.com/irfanrafeek/imposter/issues/113

---

## 2026-08-27: the runtime strings become data (#134)

First ticket past the migration. Everything the word game *says* is now a
string table rather than a literal in the middle of the code, which is the
last piece the Spanish build needs before there is anything to translate.

**Where the strings live.** `src/content/<lang>/word.json` already held
`screens`, the text rendered into the page at build time (#133). It now also
holds `runtime`, the 68 strings `app.js` writes while a round is played, and
`src/content/<lang>/shared.json` holds the 13 belonging to the modules under
`www/shared/`. The build merges the two into one inert JSON block at the foot
of each page; `www/shared/i18n.js` parses it once and hands out `t()`,
`plural()` and `list()`.

Inline rather than a per-locale `.js` file on purpose: those strings are
needed by every player on every visit, so a separate file would buy a cache
entry in exchange for a round trip on a phone that is often on somebody
else's wifi, and it would need a network the native app does not have.

**Three things stopped being English-shaped.**

| was | now |
|---|---|
| `'Impostor' + (n > 1 ? 's' : '')` | `Intl.PluralRules`, one string per form |
| `names.join(', ') + ' and ' + last` | `Intl.ListFormat` |
| "The / Impostor / was" in three fixed spans | one string per plural form |

The reveal line is the one worth spelling out. It was an article, a noun and
a verb in three separate spans that `revealImposter()` filled in. Spanish has
to agree the article too ("El Impostor era" against "Los Impostores eran"),
which no arrangement of fixed spans can do, so the whole sentence is now one
string per form. It renders identically: `.reveal-line` is a flex row, and a
bare text run between two elements becomes an anonymous flex item, so the
10px gaps land exactly where they always did.

`Intl.ListFormat` gave a real scare. Fed a bare `en` it returns "Ann, Bob,
**and** Cara", and the site's copy has never used the Oxford comma. The block
now carries `data-lang="en-GB"` for the formatters, kept separate from the
page's `html lang`. There is a test that fails if that ever drifts back.

### The build now refuses two things

- **A key the JavaScript calls that is not in the bundle.** Verified by
  renaming one key in the JSON and watching `build:check` name both the file
  and the call site. Without it a renamed key stays invisible until a player
  reaches that screen, in a language nobody here reads.
- **An unescaped `<` in the shipped JSON.** A translated string containing
  `</script>` would otherwise end the block and spill the rest of the table
  into the page as markup.

### Verified

- A full Pass the Phone round played locally, four players, through every
  screen to the reveal: lobby statuses, plural counts, `Player N of 4`, the
  rename and remove labels, `Pass to Player 2`, `YOUR HINT`, `THE SECRET
  WORD`, `Quit Game`. Both reveal forms checked, the singular from a real
  round and the plural forced into the same element.
- All four pages load with **zero console errors**. Chat title, placeholder
  and its three aria-labels resolve through the shared table on the hub.
- `build:check` clean on all four pages. The only intended HTML change is the
  reveal line and the new block; nothing else moved.
- 36 tests pass, 17 of them new.

**Cost: 5.2KB across four pages** (word +3.9KB, the rest about 0.6KB each),
which is the string table itself. Still 10.3KB ahead of where #133 started.

### Noticed, not fixed

`card.hint-crew` carries a spaced em dash ("one clue word each ... don't make
it easy"). Same problem as
[#113](https://github.com/irfanrafeek/imposter/issues/113), different string.
Preserved verbatim, because #134 was not supposed to change visible copy.
`chat.opener` and `error.firebase-setup` carry one too. All three now sit in
the same two JSON files, so whenever #113 is picked up it is a single edit
rather than a hunt through three `app.js` files.

### Deployed

Pushed and deployed on 2026-08-27, stamp `v2026.08.27.1`. Verified on
`imposter-20b85.web.app` rather than the live domain, which would have
counted the visit: all four pages serve the block with `data-lang="en-GB"`
and the right key counts (81 on word, 13 elsewhere), `list()` returns "Ann,
Bob and Cara" with no Oxford comma, and the reveal screen was confirmed
visually at two impostors.

**No `lastmod` bump and no IndexNow ping.** Nothing a reader or a crawler
sees changed: no meta, no JSON-LD, no visible prose. The only HTML difference
on the word page sits inside the round-over screen, which is hidden until a
round ends.

---

## 2026-08-26: shipping the component work and the content extraction (#132, #133)

Second release of #127, covering #132 and #133. The migration phase is now
complete and live: all four pages are generated, eight components are
shared across them, and every user-facing string on a page is data.

**What a visitor gets: the same pages, 15.5KB lighter.**

| page | live before | now | saved |
|---|---|---|---|
| hub | 31,403 | 30,710 | 693 |
| word | 52,353 | 48,223 | 4,130 |
| draw | 57,793 | 50,362 | 7,431 |
| dance | 58,665 | 55,400 | 3,265 |

All of it is HTML comments that moved into `src/` (#133). HTML is served
`no-cache`, so that was being downloaded on every visit, and draw was
12.8% comment.

### Verified before shipping

- Content **identical to the deployed commit** on all four pages, comparing
  with comments stripped, whitespace collapsed and entities decoded.
- **JSON-LD deep-compared as parsed data against what is live.** Node counts
  and FAQ entry counts unchanged: hub 6 nodes and 9 questions, word 2 and 8,
  draw 2 and 6, dance 2 and 12.
- **Every screen at 320px on all three games**, 11 on word, 14 on draw, 10
  on dance: zero elements overflowing, no horizontal body scroll.
- **Zero stray template syntax** in any rendered page. Worth checking
  explicitly after #133 replaced 246 strings with expressions: a mistyped
  key would render as literal `{{ ... }}` or `undefined` in front of a
  player, and `throwOnUndefined` only catches the second kind.
- **Zero HTML comments** in output on all four pages, which is the #133
  policy holding.
- Hub tokens exact, including the deliberate `--radius-lg: 28px` override.
- No console errors anywhere. `npm run lint`, 19 gate tests and
  `check-words.mjs` clean.

### Deploy notes

`<lastmod>` not bumped, no IndexNow ping. Nothing a reader would notice
changed: the visible copy, the meta tags and the structured data are all
byte-equal to what was already live. Per `SEO.md`, bumping unchanged
content teaches the crawler to discount the field.

Post-deploy verification by `curl`, which runs no JS and moves no analytics
counter, plus a look on `imposter-20b85.web.app` where the hostname gate is
false.

---

## 2026-08-26: the screens become content, and the comments stop shipping (#133)

Sixth chunk of #127. The app screens' English copy now lives in the content
files: **71 strings for word, 97 for draw, 97 for dance**, keyed by screen,
so `lobby.im-ready` and `over.play-again` rather than an index. That is the
last thing standing between here and a translated page.

Output is unchanged apart from one deliberate difference, below.

### Comments now stay in src/ instead of shipping

Decided with the user. Every `<!-- -->` in a template became `{# #}`, which
nunjucks strips, so the reasoning stays in the repo where it helps whoever
edits next and stops being downloaded by every visitor.

| page | before | after | saved |
|---|---|---|---|
| hub | 31,403 | 30,710 | 693 |
| word | 52,353 | 48,223 | 4,130 |
| draw | **57,760** | **50,362** | **7,398** |
| dance | 58,612 | 55,400 | 3,212 |

Draw was 12.8% comments. HTML is served `no-cache`, so that was on every
visit. Nothing visible changed: comments are invisible to readers, and
standard content extraction strips them before any crawler or AI search
model sees the page, so this is not a GEO question either. `llms.txt` is
the channel for that and is untouched.

`scripts/build.mjs` now **fails the build** if a generated page contains an
HTML comment, so the policy cannot quietly rot. Verified by planting one
and watching it fail, rather than only by watching it pass.

### The safety net that should have existed two tickets ago

`build:check` ignores comments by design (#129), which means a deleted one
raises no alarm. In #132 draw's "Imposter spelling" note survived by luck.
122 comments across four pages is too many for luck, so a migration
assertion was written first: **every comment present in the last
all-hand-written state (`b1d0d16`) must still exist somewhere in `src/`,
in either syntax.** It runs against a git ref and prints what is missing.

It was run after the comment conversion, after each game's screen
extraction, and at the end. 122 checked, none lost, every time.

First run reported 3 lost, which was the checker's fault rather than the
migration's: a note moved into `site.json` is a JSON string carrying
literal `\n` escapes, and comparing that against the original comment's
real newlines never matches. JSON files are now parsed and their string
values flattened before the comparison.

### Four bugs in the extraction, all caught

The screens are 246 strings across three files, so this was done
mechanically. Every one of these was found by a check rather than by
reading the output.

**Granularity is the element, not the text node.** `<p>Choose <strong>Pass
the Phone</strong> mode</p>` is one string including its markup. Split into
three fragments it cannot be translated, because Spanish reorders the
sentence around the bold part.

**Not everything visible is language.** The first pass extracted the
countdown digit `3`, the emoji rating buttons, a `—` separator and the `X`
placeholder in the room-code boxes. Nothing to translate and every edit a
chance to break them. Now a string needs at least two Unicode letters. The
Setup Needed screen is skipped entirely: `FB_CONFIGURED` is true in
production so no player can reach it.

**A tolerant regex ate the page.** Matching had to tolerate a `{# #}`
sitting inside an element, so whitespace became `(?:\s|\{#[\s\S]*?#\})+`.
That backtracks: `[\s\S]*?` will run from one `{#` to a much later `#}`,
swallowing all the markup between. One 143-character unit matched
**19,856 characters** and replaced the entire home screen with the reveal
line. Fixed by tempering the body, `(?:(?!#\})[\s\S])*`, so a comment ends
at its own terminator, plus a guard that rejects any match longer than the
unit plus 800 characters. The same class of bug as the `*/` in
`tokens.css` (#128): a pattern that runs past where you assumed it stops.

**Short strings corrupt long ones.** `>Rounds<` occurs inside
`<span class="rounds-label"><span>2</span> <span>Rounds</span></span>`, and
replacing the short unit globally destroyed the long one before it was
reached. Units are now applied longest first.

### The fingerprint is only valid inside one browser session

Word came back `366:bb076d3e` against the `366:72e81e19` recorded in #131,
with the page byte-identical: `git diff 548eede a140251 -- www/word/index.html`
is empty, so nothing touched it between those tickets.

Chased properly rather than assumed. Element by element, tag, id, class and
leaf text: **0 of 366 differ.** All 22 computed properties per element:
**0 differ.** Then the pre-#133 page was measured in the same session and
also gave `bb076d3e`. So the page is fine and the recorded number is not
reproducible.

The cause is that `app.js` writes text into `#app` at boot, and what it
writes depends on environment: `localStorage` held
`firebase:previous_websocket_failure` from earlier testing.

**So a fingerprint recorded in one ticket cannot be compared against a
measurement in another.** Only a same-session before-and-after counts, via
stash. That invalidates the baselines written down in #128, #131 and #132
as cross-ticket references, though every comparison actually made in those
tickets was same-session and stands. This is the fourth time this measure
has misled; it is a difference detector, not a value to record.

Draw and dance did match their same-session baselines exactly, `400:b481c71e`
and `397:2c3d1129`.

### Verified

- **Against `git HEAD`, not the working tree.** `build:check` compares
  generated output to the file on disk, and after a build that file *is* the
  output, so the check passes trivially. Caught mid-ticket. The real
  comparison takes the committed page, strips its comments, normalises
  whitespace and entities: **identical on all four pages**.
- JSON-LD deep-compared as parsed data on all four: equal.
- 122 comments: none lost.
- `npm run lint`, 19 gate tests, and `check-words.mjs` all clean.

### Not done

- **The runtime strings in `app.js` are untouched** (#134), about 90 in the
  word game alone, including the three that need real fixes rather than
  lookups: the reveal sentence built from three DOM spans, the `+ 's'`
  plurals, and `' and '` in `nameList()`.
- **No game layout template.** With the content extracted it is now clear
  the three game pages differ in their screens far more than they agree, so
  a shared layout would be mostly `{% block %}`. Not worth it.

Stamp unchanged. Not deployed.

---

## 2026-08-26: draw and dance onto the shared components (#132)

Fifth chunk of #127, and the one that tests whether #131's components were
genuinely shared or just extracted from a sample of two. All four pages are
now generated: `src/pages/{hub,word,draw,dance}.njk` plus a content file
each.

**The answer is: shared, with exactly one new parameter.** Eight components
took two more consumers and needed `titleNote` added to `head`, for one
comment on one page. Everything else, `faq`, `howto`, `alt-games`,
`more-reading`, `more-games-cta`, `jsonld`, `clarity`, absorbed both games
without a change.

The strongest single piece of evidence came before any code was written.
Reducing each game's `<head>` to a tag skeleton (element type plus its
`name`/`property`/`rel`) gives **35 elements in identical order on all
three**. There was no structural difference to accommodate, only values.

### The trap in the comment exemption

`build:check` deliberately ignores HTML comments, because a migration
rewrites them and a gate that fails on every reworded comment is one you
stop reading (#129). The cost of that showed up here: **the head component
replaces a page's entire head, so any comment living in a hand-written head
disappears without failing anything.**

Draw carries one that matters. It explains that the `<title>` says
"Imposter" with an e deliberately, because nearly every real search query
uses that spelling while the brand name, og:title and body copy stay
"Impostor". That is a decision worth keeping next to the thing it explains,
and the migration would have silently deleted it.

It was caught by luck rather than by design. Dropping the comment left two
adjacent whitespace runs where there had been one, which the canonical form
reports as a real difference, so the gate failed at character 556. Had the
whitespace happened to collapse the same way, it would have passed as `ok`.

So the heads of all three games were audited directly for comments. Word
and dance carry only the Clarity banner, which the component emits itself.
Only draw had a second one, now in `site.json` as `titleNote`. The trap is
written into `head.njk` next to the fields that exist because of it: **audit
a page's comments before migrating it, not after.**

### All four pages have FAQ drift, and draw's costs it a question

The visible FAQ and the FAQPage structured data disagree on every page that
has both. Now measured across all four:

| page | visible | in JSON-LD | questions differ | answers differ |
|---|---|---|---|---|
| hub | 7 | 9 | yes, and reordered | n/a |
| word | 8 | 8 | 0 | 5 |
| draw | **7** | **6** | 0 | 6 |
| dance | 12 | 12 | 2 | 9 |

Draw's is the one with a cost attached: it shows readers seven questions
and tells crawlers about six. One question is not in its structured data at
all, which is a rich-result slot being left on the table for no reason
anyone chose.

All four preserved exactly via the `faq.structured` override, none unified.
#143 widened again, from a hub problem to a word problem to all four.
Everything without an override single-sources, so Spanish inherits none of
this.

### Verified

- `build:check` equivalent on all four pages.
- **Character-identical outside the JSON-LD** for draw and dance, collapsing
  whitespace and decoding entities: true for both. So every remaining byte
  difference is whitespace or entity encoding.
- **JSON-LD deep-compared as parsed data**, keys sorted, outside the gate.
  Draw 2 nodes to 2 with 6 FAQ entries; dance 2 to 2 with 12. Equal.
- **`#app` fingerprint**, the stable measure established in #131, hashing
  tag, id, class, leaf text, 17 colour and radius properties, and font and
  margin values. Measured on the generated page, then again with both files
  reverted via stash: draw `400:b481c71e` and dance `397:2c3d1129`,
  identical both ways, and each read twice per load to confirm it settles.
- Every screen activated at 320px: draw's **14** and dance's **10**, zero
  elements overflowing, no horizontal body scroll, the More games pill still
  scoped inside the home screen on both.
- Dance's `.home-topbar` intact with both children, back button and account
  slot. No console errors. `npm run lint` and 19 gate tests clean.

### Not done

- **The app screens are still literal English** on all three games. They are
  page copy and move to content files in #133.
- **No layout template.** Three game pages now share eight components but
  still each have their own page template. Whether they should `{% extends %}`
  a common game layout is a question worth answering with #133's content
  extraction in hand, since that is what will show how much of the page
  skeleton is really identical rather than merely similar.

Stamp unchanged at `v2026.08.26.1`, now taken from `site.json` on all four
pages. Not deployed yet, sitemap untouched, no ping.

---

## 2026-08-26: shipping the migration, and a correction to how it was measured (#128, #129, #130, #131)

Deploying the first four chunks of #127 together. Nothing a visitor can
see changes: the hub and the word game are generated from templates now,
and the other five pages only gained a `<link>` to the shared palette.

**Why deploy mid-epic rather than at the end.** `shared/tokens.css` is a
new file that every page depends on, and `base.css` and `page.css` no
longer carry a fallback palette, so if it fails to reach the server every
page renders with no colours. `firebase.json` also gained a `predeploy`
build hook that has never run for real. Two pieces of untested
infrastructure, and this is the only moment in the epic when the content
change alongside them is provably nil. Shipping it later would have
bundled them with the i18n rewrite, the category-key change and a new
dataset, so a broken palette would have had four suspects instead of one.

### A correction: the body-level fingerprint is not trustworthy on a game page

#128 recorded matching before-and-after fingerprints for `/draw/`
(`485:bbb5671a`) and `/dance/` (`536:e8e68791`) over the whole `<body>`.
Re-measuring today, with those two files byte-identical to when they were
taken, `/draw/` came back `485:b555e83a` and then `486:7f67be73`.

The cause is the same one found for the word game in #131: the chat
launcher mounts asynchronously, so a sample can land before or after it,
and at 485 nodes the DOM is mid-mount and the hash depends on exactly
which elements exist yet. `stats.html` hit this in #128 and was handled;
the game pages hit it too and were not. Those two numbers were single
samples of a flaky measure, and the check was weaker than the entry
claimed. The comparison itself was still apples to apples, since both
sides were sampled the same way, but it could have passed while hiding a
difference.

`#app` excludes the chat mount and is stable across reloads: `/draw/`
`400:422c7f3d`, `/dance/` 397 nodes, `/word/` `366:72e81e19`. Those are
the baselines worth keeping. The lesson generalises: **check a
fingerprint repeats on an unchanged build before trusting it to prove
anything.** It has now been the wrong tool three times.

### What was checked instead, and it is a better check

Every design token, read back from `getComputedStyle` on the document
element and compared against the value it is supposed to have:

| page | tokens checked | mismatches |
|---|---|---|
| `/word/` | 20 | 0 |
| `/draw/` | 20 | 0 |
| `/dance/` | 20 | 0 |
| `/party-games/` | 17 (incl. `--border-firm` and the type scale) | 0 |
| `/stats.html` | 12 (checked in #128) | 0 |

That is exact and does not move between reloads, which is everything the
fingerprint was standing in for on these pages.

### Also verified before shipping

- `npm run build:check` equivalent on both generated pages.
- All 11 word screens activated at **375px** and **320px**: zero elements
  overflowing the viewport, no horizontal body scroll, and the More games
  pill still scoped inside the home screen.
- `npm run lint` clean, 19 gate tests pass, `scripts/check-words.mjs`
  clean at 1100 hints.
- All seven pages and `/shared/tokens.css` serve 200, and every page
  carries exactly one `tokens.css` link tag.
- No console errors on any page.

### Deploy notes

`<lastmod>` not bumped and no IndexNow ping. Nothing a reader would
notice changed, and per `SEO.md` bumping unchanged content teaches the
crawler to discount the field.

There is no staging environment: `imposter-20b85.web.app` is the same
hosting site as `impostorgames.com`, so a deploy is always live. Post-deploy
verification is by `curl`, which runs no JS and therefore moves no
analytics counter.

---

## 2026-08-26: the word game onto templates, and the components become real (#131)

Fourth chunk of #127. `www/word/index.html` is now `src/pages/word.njk` plus
`src/content/en/word.json`, and the hero SVG is a partial. More
importantly, this is where the shared pieces stopped being "extracted from
the hub" and became components with a second consumer.

Eight of them: `head`, `faq`, `more-reading`, `clarity`, `jsonld`, `howto`,
`alt-games`, `more-games-cta`. The hub was refactored onto the first five
in the same commit, which is the only thing that proves they are shared;
`hub.njk` fell from 507 lines to 439 as a result.

### Measured before extracting, not guessed

The obvious failure mode here is inventing an abstraction from one example.
So before writing any macro, the repeating unit of each candidate block was
compared across all three games with the text stripped out:

| unit | word / draw / dance | distinct shapes |
|---|---|---|
| FAQ item | 8 / 7 / 12 | 1 |
| How-to step | 4 / 4 / 4 | 1 |
| alt-game row | 2 / 2 / 2 | 1 |
| more-reading item | 2 / 2 / 2 | 1 |

A first pass said these were all different, which was an artefact of
comparing whole blocks: the counts differ, and a FAQ answer sometimes
contains `<strong>`. Comparing the unit instead, every one collapses to a
single shape. The only real variation is content, plus whether a how-to
step body holds one paragraph or two, which is why `paras` is a list.

That makes the extraction informed rather than hopeful, and #132 is now a
test of a claim rather than a discovery exercise.

### Word has the same FAQ drift as the hub, and worse

The hub's visible and structured FAQ lists diverged in which questions they
ask (#143). Word's do not: all 8 questions match one for one. Five of the
eight **answers** are worded differently, and A8 is not a rewording at all,
the visible version explains that the name list is remembered for next time
and the structured version says nothing about it while describing a
different mode instead.

So word supplies `faq.structured` too, preserving both exactly. #143 was
widened from a hub problem to a both-pages problem.

Everything else single-sources: a page that omits `faq.structured` gets its
FAQPage generated from the visible list, which is what Spanish will do.

### Three mistakes worth recording

**The transform script parsed its own output.** It reads
`www/word/index.html`, and after one `npm run build` that file was the
generated page, not the original. The next run failed on a substring that
no longer existed. Restored from git and re-ran. Any of these one-off
migration scripts is only correct against a pristine source, and there is
no warning when it is not.

**Icon dimensions were guessed and wrong.** `site.json` needed width and
height for the alt-game icons. I wrote 432x332 for the word icon from
memory. The shipped pages say 288x288. Caught by grepping the three pages
instead of trusting the guess, which took ten seconds and would have been
a silently wrong `<img>` on two pages otherwise.

**The FAQ cut swallowed the next section**, because its end marker was
`</div>` followed by `</div>` and the real close is `</details>` followed by
`</div>`. It failed loudly two steps later.

### Verified

`build:check` passes on both pages, but that is my own gate on my own
output, so three independent checks as well.

1. **Character-level comparison outside the JSON-LD.** Collapse every
   whitespace run and decode HTML entities on both the old and new file:
   **identical on both pages**. So every remaining byte difference is
   whitespace or entity encoding, and there is no third category hiding.
2. **JSON-LD deep-compared as parsed data**, keys sorted, outside the gate.
   Word: 2 nodes to 2, VideoGame and FAQPage, 8 entries to 8, equal. Hub
   unchanged at 6 nodes and 9 entries.
3. **Computed-style fingerprint.** Hub still `115:de0153cb`, matching a
   baseline taken in #128 before any of this existed.

**The word fingerprint needed rebuilding, and the reason matters.** Taken
over the whole `<body>` it flips between 441 and 442 nodes across reloads
of an unchanged file, because the chat launcher mounts asynchronously
outside `#app` and sometimes lands after the sample. Same class of problem
as `stats.html` in #128. Scoped to `#app` it is stable at 366 across three
loads, so that is the measure: original `366:72e81e19`, generated
`366:72e81e19`. This version also hashes leaf text content, `font-family`,
`font-size`, `font-weight` and margins, so it is strictly stronger than the
#128 one.

Static element comparison as a cross-check: 462 elements in both files,
zero differences by tag, id and class.

### Two accepted byte changes

**`&` became `&amp;` in the Google Fonts URL**, on both pages, because the
value now goes through an autoescaping template. This is the correct HTML;
a raw `&` in an attribute is tolerated rather than valid. The attribute
decodes to the same URL and the gate sees them as equal, so it was verified
directly instead: 7 Literata faces load on both pages.

**`more-reading` indentation shifted by two spaces on the hub.** One macro
now serves two pages whose original indentation differed, and it cannot
match both. Left alone. Chasing that is exactly the cost the canonical-form
comparison exists to avoid.

### Not done

- **The 11 app screens are still literal English in the template.** They
  are page copy and move to the content file in #133. Splitting it keeps a
  gate failure findable: this ticket changed structure, #133 changes text.
- **Draw and dance are untouched** (#132), which is the real test of
  whether the four units above are shared or merely extracted.
- **No layout template for game pages yet.** There is one game. Deciding
  what a game page has in common from a sample of one is the mistake this
  ticket spent its first twenty minutes avoiding.

`npm run lint` and `npm test` clean, 19 tests. Stamp unchanged, both pages
now taking it from `site.json`. Not deployed, sitemap untouched, no ping.

---

## 2026-08-26: the hub becomes the first generated page (#130)

Third chunk of #127, and the first one that actually moves a page.
`www/index.html` is no longer hand-written: it is `src/pages/hub.njk`
plus `src/content/en/hub.json`, compiled by `scripts/build.mjs`.

The split is 507 lines of template against 311 lines of content. Most of
the template is the ~300 lines of inline CSS, which stays inline
deliberately: it is a landing page and that is a first-paint decision,
not an oversight.

**The template was derived, not retyped.** Two throwaway scripts did the
migration: one lifted the strings out of the shipped HTML into the
content file, the other rewrote the shipped HTML into a template by
targeted substitution, asserting that each thing it replaced occurred
exactly once. So the CSS and the bottom module script carried over
byte-for-byte rather than being copied by hand. Retyping 800 lines and
hoping is how a migration like this goes wrong.

### The gate earned its keep on the first run

It failed immediately, on the footer. The extractor's regex for the
footer links was not scoped to `<footer>`, and the first
`<a href="/dance/">Impostor Dance Game</a>` in the document is inside a
FAQ answer, not the footer. The generated page therefore listed Dance,
Dance, Word. The gate named the file and pointed at character 27381 with
both versions quoted, which took it from "something is wrong" to "this
exact link" in one read.

Worth noting what kind of bug that is. It is not a crash, not a console
error, and not visible in a screenshot of the top of the page. It is one
wrong href in a footer, which is precisely the class of thing a manual
"looks fine to me" pass ships.

### Verified

Three independent checks, because "my own gate says my own output is
fine" is not evidence on its own.

1. **`npm run build:check`**: equivalent.
2. **JSON-LD compared as data, outside the gate.** Both files parsed and
   deep-compared with sorted keys: 6 graph nodes to 6, the same
   Organization / WebSite / 3x VideoGame / FAQPage, 9 FAQ entries to 9,
   deep-equal true.
3. **The computed-style fingerprint from #128**, which is the strongest
   one available, because its baseline was taken before any of this
   existed. The hub read `115:de0153cb` then and reads `115:de0153cb`
   now: same node count, same colours, same radii, same shadows. Plus 3
   cards, 7 FAQ items, 17 links, 9 h2s, no console errors.

The byte diff is 203 lines, and all of it is explained: the JSON-LD is
re-emitted from parsed data so its formatting changes, and outside that
block there are exactly 8 changed lines, every one a whitespace run.
Blank lines between loop iterations are gone and the three footer links
now sit on separate lines. Both collapse identically in HTML.

Build confirmed deterministic: built twice, `cmp` clean.

### The FAQ is single-sourced, except here

The content model is one FAQ list, and the FAQPage structured data is
generated from it. The hub is the exception and has to be: its visible
list has **7** entries and its JSON-LD has **9**, they are worded
differently ("Is this the Imposter Dance Challenge from TikTok?" against
"Is this the Imposter Dance Challenge?"), and they are in a different
order. Unifying them would change what the page says, which is a content
decision, not a plumbing one.

So `faq.structured` is an optional override. The hub supplies it and
keeps both lists exactly as they ship today. Any page that omits it gets
its structured data derived from the visible list, which is what Spanish
will do, so the divergence stops here rather than being inherited.
Reconciling the hub's two lists is filed as **#143**.

### Deliberately not done

- **The bottom `<script type="module">` is still literal.** Its strings
  ("Talk to creator", the chat opener) are app strings, not page
  content, and they belong with the rest of the runtime strings in #134.
  Extracting them now would also have meant re-emitting a JS string
  literal, which the gate compares byte-for-byte inside `<script>`, for
  no gain.
- **No components extracted yet.** There is one consumer. The topbar,
  head and FAQ become macros in #131, when the word game gives them a
  second consumer and shows which parameters they actually need.
- **No hreflang, no language switcher, no `/es/`.** All #139. This
  ticket changes implementation only.

`www/index.html` is now build output. Editing it by hand will be
overwritten on the next build, and `firebase deploy` runs a build first.
Said explicitly at the top of `src/README.md`.

Stamp unchanged at `v2026.08.26.1`, and it now comes from `site.json`
rather than being typed into the page, so it is one value for every
generated page from here on. Not deployed. Sitemap untouched, no ping.

---

## 2026-08-26: a compiler for the pages (#129)

Second chunk of #127. This is the machinery only: `src/` and
`scripts/build.mjs` exist, nothing under `www/` has moved onto them yet,
and the build reports "no pages" if you run it. The hub is the first
real page, in #130.

A page becomes a template plus a content file, and a language becomes a
content file. `src/site.json` is the manifest: locales, and which pages
exist in which of them, which is what lets `/es/` launch with only the
word game while the English hub still lists three.

**Nunjucks and parse5, both devDependencies.** Nunjucks because
`{% extends %}`, `{% macro %}` and `{% include %}` are exactly page
inheritance, components with parameters, and a home for the 100-line
hero SVGs. Writing that by hand would have been a worse version of a
mature autoescaping library. parse5 because the gate below needs a real
HTML parser, not a pile of regexes. Neither ships to a browser.

`throwOnUndefined` is on. A missing string is a bug, not an empty space:
without it a typo renders the literal "undefined" into a shipped page,
and with two languages that is a question of when rather than whether.

### The gate, and why it is deliberately annoying

Moving a page onto a template must not change what it serves. "I looked
at it and it seemed fine" does not cover four pages of meta tags and two
blocks of structured data, so `npm run build:check` renders each page and
compares it to what is committed, on a canonical form:

- Runs of whitespace collapse to ONE space, never to nothing. Indentation
  stops mattering. A space between two inline tags still does, because
  `<span>a</span><span>b</span>` does not render like the spaced version.
- Attributes sort by name, so reordering is not a diff.
- JSON-LD is parsed and re-serialised with sorted keys, so structured
  data is compared as data rather than as formatting.
- HTML comments are allowed to differ.

The comment exemption is the one deliberate hole. During a migration the
comments genuinely do get rewritten, and a gate that fails on every
reworded comment is a gate you start ignoring, which is worse than not
having one. Comment-only differences are reported, not failed.

Everything else errs strict. It will flag whitespace appearing or
disappearing between two block elements, which is visually nothing. That
costs a template tweak. The opposite mistake ships a changed page and
nobody notices, so the asymmetry is the right way round.

### Verified

19 tests in `scripts/build.test.mjs`, run with the built-in runner, no
test framework added. Each rule is tested **in both directions**: for
every difference the gate ignores there is a test that it does not also
ignore the real difference sitting next to it. Attribute order is
ignored but an attribute value change is caught; JSON-LD key order is
ignored but a value change, a dropped entry and a reordered array are
all caught; dropping comments does not hide a text change beside them.

Unit tests only prove the comparison. The compiler had never actually
rendered anything, so it was also driven end to end once, on a throwaway
fixture page with a head, hreflang alternates, a FAQPage block and prose:

1. Build it. Output correct, and `Movies & TV` came through as
   `Movies &amp; TV`, matching how the real pages already write it.
2. `--check` on the untouched file: passes.
3. Reformat the committed copy by hand, changing indentation, reordering
   two attributes and reordering the JSON-LD keys: still passes.
4. Change `no sign-up` to `no signup`, one hyphen, inside a FAQ answer:
   fails, naming the file and pointing at character 872 with both
   versions quoted around it.

Exit codes checked separately, because the first attempt to read one
picked up `tail`'s status through a pipe rather than the build's. It is
1 on a real difference and 0 when equivalent, through both `node` and
`npm run`, which is what makes the deploy hook below actually block.

Recursive `fs.watch` confirmed to fire on this platform before claiming
`build:watch` works.

The fixture was deleted afterwards and `www/` is byte-untouched by this
commit, so no version stamps moved, no sitemap change, no ping.

### The deploy step changes

`firebase.json` gains `hosting.predeploy: ["npm run build"]`. A deploy
now regenerates `www/` from `src/` first, so it is not possible to ship
HTML that does not match its source. The cost is that a deploy needs
`node_modules` present: if it ever fails at that step, `npm ci`. Noted in
the file itself.

### Not done, and one thing worth knowing

No page is migrated. `npm run build` prints "no pages" and exits 0, by
design.

`npm audit` reports 10 vulnerabilities, and none of them are new. All ten
trace to `@capacitor/assets` and `@capacitor/cli` (`sharp`, `tar`,
`xcode`, `uuid`, `replace`), which are Android build tooling and predate
this ticket. Checked explicitly rather than assumed: zero findings
involve nunjucks or parse5. Not fixed here, because `npm audit fix
--force` on that tree risks the native app build for no benefit to a
devDependency that never reaches a browser.

---

## 2026-08-26: one palette, in one file (#128)

First chunk of the multi-language epic (#127), and deliberately the least
exciting one. No user-visible change at all, just the design tokens moving from
four hand-copied places into `shared/tokens.css`.

The four copies were `base.css`, `page.css`, the hub's inline `<style>` and
`stats.html`. Keeping them in step by hand did not work, and there is a clean
piece of evidence for that: the hub has been sitting on `--radius-lg: 28px`
against `base.css`'s `26px`, and nobody noticed. That is the whole argument for
this ticket. Two languages times four pages was about to make it worse.

**Seven pages, not four.** `page.css` is also loaded by `/party-games/` and
`/games-like-among-us/`, so the consumer list is `index.html`, the three games,
`stats.html`, and the two long-form pages. Each gets a `<link>` to
`tokens.css` ahead of its other stylesheets.

**A `<link>`, not an `@import`.** `@import` inside `base.css` would have touched
zero HTML files, which was tempting. It also costs a serial round trip: the
browser has to fetch and parse `base.css` before it discovers `tokens.css`
exists. That is a real delay before first paint on a phone, on a site that
already bothers to `preconnect` its fonts.

Strictly speaking the order does not matter for correctness. Custom properties
resolve at computed-value time, not parse time, so `chat.css` can use a token
declared in a stylesheet that loads after it. Tokens go first anyway because it
reads as the dependency it is.

**The drifts are preserved, not quietly corrected.** The hub keeps
`--radius-lg: 28px` as a one-line documented override. Fixing it changes how the
game cards look, which is a visual decision that deserves its own before/after
rather than being smuggled in under a plumbing change. Filed as **#142**.

Two sets of tokens stay local because they are genuinely local roles, not
palette: `page.css` keeps `--border-firm` and its long-form type scale, and
`stats.html` keeps `--accent-green` and `--accent-purple`, which exist to
separate series in a graph.

### The bug this nearly shipped with

The first draft of `tokens.css` documented the naming convention as
"`--bg-*/--card*` are surfaces". That string contains `*/`. It closed the
comment thirty lines early, the rest of the prose parsed as garbage CSS, and the
entire `:root` below it was dropped. Every page loaded with **no palette at
all**, and because `base.css` no longer carries a fallback copy, there was
nothing to fall back to.

It did not look catastrophic in a screenshot. It looked like a slightly-off page.
The fingerprint below is what actually caught it: the hub hashed `9f01c681` with
the broken file and `263b41bc` once fixed. `tokens.css` now carries an explicit
warning not to write a star followed by a slash anywhere in that comment.

### The footgun this introduces, stated plainly

`base.css` and `page.css` no longer define the palette. A new page that links
either one **without** linking `tokens.css` first renders with every `var()`
invalid. Both files now say so at the top. The build step in #129 will emit the
pair together, so this is a short-lived hazard, but it is real until then.

### Verified

Computed-style fingerprint over every element in `<body>`: tag, id, class, and
17 colour/radius/shadow properties, FNV-1a hashed. Captured on the current
branch, then again with the change stashed, on the same server and port.

| page | before | after |
|---|---|---|
| `/` | `115:de0153cb` | `115:de0153cb` |
| `/word/` | `442:1cea2443` | `442:1cea2443` |
| `/draw/` | `485:bbb5671a` | `485:bbb5671a` |
| `/dance/` | `536:e8e68791` | `536:e8e68791` |
| `/party-games/` | `112:5f8c8d99` | `112:5f8c8d99` |
| `/games-like-among-us/` | `119:8953c7dc` | `119:8953c7dc` |

Identical on all six, node count and hash.

**`stats.html` needs a different check, and the first version of this entry got
that wrong.** Its fingerprint flips between 457 and 458 nodes across reloads
with nothing changed, so a match there proves nothing. The cause is that the
page is almost entirely async: a snapshot taken once the analytics data had
actually arrived counted **3238** nodes against the 457 I had been comparing,
the extra 2781 being 315 `.rlabel` rows, 315 `.barwrap`, 300 `.bar` and so on.
The whole-page hash was measuring how fast Firebase answered.

What matters on that page is only whether its tokens still resolve to the same
values, so that is what was checked directly: all 12 that `stats.html` used to
declare inline (`--bg`, `--bg-soft`, `--card`, `--ink`, `--ink-soft`,
`--ink-faint`, `--accent-teal`, `--accent-orange`, `--accent-red`,
`--accent-green`, `--accent-purple`, `--line`) read back byte-identical to the
values it declared before. Zero mismatches.

Two measurement notes worth keeping, because the first version of this table was
wrong. **Walk `document.body`, not `document`.** The first run hashed every
element including `<head>`, so the new `<link>` I had just added counted as a
node and changed all seven hashes by construction. Every page read `n+1` and a
different hash, which looks exactly like a real regression. **And check the
fingerprint is stable before trusting it**: each page was hashed twice in a row
on an unchanged build first, to prove the number does not move on its own. It
does not, on any of the seven.

Also checked: every stylesheet was grepped for `var(--x)` used but not defined
locally, before any edit. Only `chat.css` came up, which borrows from the host
page by design and is documented as doing so. That is what made this safe: no
page was relying on a token being *absent*.

`npm run lint` clean. Screenshot of `/word/` at 800px, no console errors.
Diff is +24/-64 across nine files plus the new `tokens.css`.

### Not done

- Reconciling `--radius-lg` (#142).
- `--border-firm` promoting to a shared token. It has one consumer; a token with
  one consumer is a variable.
- Anything about `:focus-visible`. There are still five `outline: none`
  declarations in `base.css` with nothing restoring a focus ring, which is a
  live accessibility gap but not this ticket's.

Stamps bumped to `v2026.08.26.1` on all six pages that carry one. Not deployed
yet, since #128 is the first of fourteen chunks in #127 and ships with the epic.
Sitemap untouched, no IndexNow ping: nothing a reader would notice changed.

---

## 2026-08-25: a "More games" pill just past the fold, on all three games

Draw gets about 2 visits a day against dance's 129 and word's 157, and search
is not going to close that this quarter: the incumbents hold those queries with
better-matching domains, and the Search Console indexing request three days ago
got `/draw/` crawled, not ranked. The traffic that can be redirected is the
traffic already here, so each game now offers the other two a click past the
fold rather than only in the block under the FAQ.

### What was added

Identical markup on all three game pages, between the home fold and the How to
Play section:

```html
<div class="more-games-cta">
  <a class="pill-btn" href="/">More games</a>
</div>
```

and one rule in `base.css`, reusing the existing `.pill-btn`:

```css
.more-games-cta { text-align: center; margin-top: 56px; }
```

**An `<a>`, not a `<button>`.** It is real navigation, so an anchor gives a
crawlable internal link from each game page to the hub, plus middle-click and
open-in-new-tab, and it sidesteps the Android lost-tap class of bug entirely
because a native anchor does not depend on a JS click handler. `href="/"`
matches the `.back-btn` already on each page, so the native wrapper resolves it
the same way it already resolves that one.

`.pill-btn` needed `text-decoration: none` added, because until now it was only
ever used on a `<button>` and `base.css` has no global anchor reset. A no-op for
the existing feedback button.

### The 56px, which is the only non-obvious number here

`.home-fold` is `min-height: calc(100dvh - 120px)`, so the fold deliberately
reserves 120px of viewport below itself as a hint to scroll. How much of that
reserve is actually *visible* is `120px - the fold's own top offset`, and that
offset differs per game:

| game | fold top | visible below fold | clearance at 56px |
|---|---|---|---|
| dance | 82px | 38px | 18px |
| draw | 94px | 26px | 30px |
| word | 94px | 26px | 30px |

Dance is the tight one because its topbar sits 12px higher than the other two.
The first attempt used 28px, which cleared draw and word's 26px but not dance's
38px, so a sliver of the pill showed on dance at rest. 44px cleared it by only
6px. 56px gives every game real headroom.

The useful property: that clearance does not depend on viewport height. When
the min-height binds, both the fold bottom and the viewport bottom move
together, so the gap stays fixed. Measured on dance at 667, 812 and 956 tall and
the clearance was 18px at all three. Only the fold's top offset can change it,
so **anything that moves the topbar changes this number** and the pill should be
re-checked at rest.

### Verified

`npm run lint` clean. On localhost only, never the production hostname.

- **The pill does not leak.** Every `.screen` on each game activated in turn,
  14 on draw, 11 on word, 10 on dance, checking the pill is invisible on all of
  them but home. No leaks, and no horizontal overflow on any screen.
- Hidden at rest on all three at 320x700, 375x812 and 375x956; first element
  revealed on scroll.
- The link navigates to `/` and the hub renders its three game cards.
- Keyboard focusable. Computed background, font size, weight, padding and
  radius all identical to the "Got feedback?" pill.
- Hub untouched: it does not load `base.css` and is absent from the diff.

**A measurement trap worth remembering.** Resizing the viewport without
reloading leaves `100dvh` stale, so `.home-fold` keeps its old height and every
fold measurement is wrong. A 320x700 check reported the pill 434px *above* the
fold until the page was reloaded, at which point it read correctly. Reload after
every resize before trusting a dvh-dependent number. Separately, calling
`.focus()` on the link scrolls it into view, which silently invalidates any
`getBoundingClientRect()` taken afterwards.

**A pre-existing console error, not from this change.** The hub logs a failed
resource, a 400 or `ERR_CONNECTION_CLOSED` depending on run. It is Microsoft
Clarity's `j.clarity.ms/collect` beacon, which is on all four pages and is
absent from this diff. It fails identically on the already-deployed build.

Sitemap `lastmod` not bumped: this adds a navigation control, not content a
reader came for, and the pages' text and structured data are unchanged. No
IndexNow ping for the same reason.

Stamps: draw `v2026.08.25.17`, word `.13`, dance `.12`.

---

## 2026-08-25: home screen trimmed down, heroes to 75%

A visual pass across the hub and all three game home screens, requested as a
sequence of small size changes. No copy, markup or logic changed; this is
`base.css` plus the three per-game hero rules and the hub's inline block.

### The create/join cards

`.tile-stack` padding went `32px 20px` to `16px 20px 24px` and its internal gap
`16px` to `4px`, pulling the icon, title and subtitle into one tighter group
with the breathing room moved to the bottom edge.

The 186px cap went on the grid columns, not on the cards:

```css
.tile-grid {
  grid-template-columns: repeat(2, minmax(0, 186px));
  justify-content: center;
  gap: 14px;
}
```

A `max-width` on `.tile-stack` itself would have capped the card while leaving
the column at `1fr`, so the two cards would drift apart and the visible gap
would grow past 14px. Capping the column holds the gap at 14px and
`justify-content: center` centres the pair as a unit. `.tile-grid` is used only
for this pair on the three game pages, so nothing else moved.

The cap only engages above roughly a 440px viewport. The app column is capped
at 480px by a parent, so on a phone the cards stay fluid and look unchanged.

### Type

`.eyebrow` 20px to 18px, `.tile-stack .tile-title` 22px to 20px, and every
`.logo h1` 32px to 28px. The hub's own `.hero h1`, which is a separate inline
rule in `www/index.html` and the only `.hero h1` in the tree, went 32px to 28px
to match.

`.logo h1` is shared: it is also Round Over, Find the Impostor and word's Game
is on. The first pass scoped the size to `.home-fold .logo h1` to leave those
alone, then the scope was widened on request, so the declaration moved up to
the base rule and came back out of the `.home-fold` one, which is colour-only
again. Three headings did not move because they are not `.logo h1`: Lobby and
Room Created come from `.lobby-head-title h1` at 26px, and Setup Needed carries
an inline `style="font-size:24px"` on each of the three pages. All three were
already below 28px, so nothing was left oversized.

**Left for later, by choice:** those three inline Setup Needed styles are the
only remaining `.logo h1` size override. They are not redundant (24 is not 28)
but their reason for existing was to tame a 32px heading, and at a 28px base
the distinction barely reads. Either delete them or move them into `base.css`
as `#screen-needs-setup .logo h1`.

### The animated heroes, to 75%

| game | width | max-width |
|---|---|---|
| draw `.hero-drawer` | 150px to 112px | 64% to 48% |
| word `.hero-juggler` | 115px to 86px | 56% to 42% |
| dance `.hero-dancer` | 125px to 94px | 56% to 42% |

`max-width` stayed a percentage rather than becoming px. The two properties do
different jobs: `width` sets the intended size, `max-width` in % is the guard
against overflowing an unusually narrow container. A px `max-width` beside a px
`width` is either redundant or a second way of writing the width, and it drops
the overflow guard. The percentages were scaled by 0.75 as well so the figure
is 75% at every viewport, not only wide ones. Those guards are insurance rather
than layout: at 112px/48% draw's only bites below a ~233px container.

**Why no keyframe touched.** The keyframes translate in px, up to `152px` in
word's generated block. Those px sit inside the SVG, so they resolve in viewBox
user units rather than screen pixels and scale with the element. That also
means `scripts/build-word-hero.mjs` stays the source of truth for word and
re-running it will not clobber this: `.hero-juggler` is at word.css:42, well
above the generated keyframes starting at line 109. See the SVG animation notes
for why those keyframes must never be hand-edited.

### Verified

`npm run lint` clean. On localhost, never the production hostname:

- Every `.screen` on all three games activated in turn and measured: 14 screens
  on draw, 11 on word, 10 on dance. No horizontal overflow on any, at 375px or
  320px. Heading sizes as tabled above.
- Heroes measured at 112 / 86 / 94px with every animation reporting `running`:
  4 on draw, 8 on word, 6 on dance. The percentage cap does not engage at 375px
  or 320px on any of them.
- Cards at 320px: 129px each, gap 14px. At 1280px: 186px each, gap 14px, 23px
  slack either side, so the pair is centred.
- Hub at 320px: `.hero h1` 28px on one line, three game cards, no overflow.
- No console errors on any page.

**Sitemap deliberately not bumped.** `lastmod` marks content a reader would
notice as changed, and no text, markup or structured data moved here. Bumping
six `lastmod` values for a font-size pass is the churn the SEO checklist warns
against. No IndexNow ping for the same reason.

Stamps: hub `v2026.08.25.1`, draw `.14`, word `.10`, dance `.9`.

---

## 2026-08-25: The reveal screen counts, and spells, its impostors (#121, #106)

Two tickets on the same screen, so they went together.

### #121 The reveal was hardcoded to one impostor

`<span>The</span><span class="imp-pill">Imposter</span><span>was</span>` was
static markup that no JS ever touched, while `revealImposter()` joined however
many names it found. Two impostors read "The Imposter was Ann & Bob". It was
always wrong above one, but it needed 6 players before, and the wider tiers
(#122) dropped that to 5 and allow up to five impostors.

The noun and the verb now carry ids and are written from `imposters.length`.
Draw keeps its static markup on purpose: it deals exactly one, by design, and
if #123 ever changes that it will need this same treatment.

The name join went with it. `" & "` was written when a round had one impostor
and occasionally two; at five, "A & B & C & D & E" on one big serif line reads
as a formula rather than a sentence. A small `nameList()` in each game gives
"Ann", "Ann and Bob", "Ann, Bob and Cara". It lives in both files rather than in
`shared/`, the same way `showToast()` already does.

Dance had the same defect twice more, so both were fixed with it: the game
master's subhint in DJ Mode, which names who to watch, and the reveal's
"Impostor heard" track label sitting directly under "THE IMPOSTORS WERE".

### #106 Five strings spelled it with an "e"

The house rule, documented in `www/draw/index.html:14`, is that titles and
schema alternates lead with "Imposter" because that is what people search for,
while brand name and all body copy use "Impostor". Five body-copy strings in
word and dance carried the search spelling: two "Reveal Imposter" buttons, both
reveal pills, and dance's "Imposter heard".

Deliberately untouched, and re-checked after the edit: the three page titles,
the schema `alternateName` lists, the FAQ questions and prose that name the
alternate spelling on purpose, "Imposter Challenge" as the name of the viral
trend, and every code identifier (`isImposter`, `numImposters`, `imposterIds`),
which are internally consistent and would drag the Firebase schema along for no
user benefit.

### Verified

Word, Pass the Phone at 8 players, one round each at 1, 2 and 3 impostors:
"THE IMPOSTOR WAS Player 7", "THE IMPOSTORS WERE Host and Player 7", "THE
IMPOSTORS WERE Host, Player 5 and Player 6". Both reveal buttons read "Reveal
Impostor" and the tab title still reads "Imposter Word Game".

Dance, a real five-tab room, at 2 impostors then at 1: "THE IMPOSTORS WERE Ann
and Bob" over "IMPOSTORS HEARD", then "THE IMPOSTOR WAS Ann" over "IMPOSTOR
HEARD". The DJ Mode game-master subhint uses the same expression but was not
driven live, because reaching it means picking a song through the iTunes search.

`npm run lint` clean, all three modules pass `node --check`, rooms quit.

Re-run once more at the final commit, because word's rounds predated the dance
`imp-track-label` edit: two impostors, "THE IMPOSTORS WERE Host and
Bartholomewwww", button reading "Reveal Impostor". Draw loads clean and its
reveal line still reads "The Impostor was" from static markup, as intended.

Every id the JS reaches for was checked against its own HTML after the new ones
were added, and checked for duplicates: 92 refs in word, 135 in dance, 120 in
draw, none missing, none duplicated.

### Nothing crawlable moved

Worth stating, because the question came up. The `<title>` of all three games is
byte-identical to main, as are the meta descriptions, og and twitter tags, the
`h1`, the schema `alternateName` lists and every FAQ question and answer. The
five edited strings live inside `.screen` sections that are hidden until someone
is mid-round. The search spelling still appears 9 times in word and 29 in dance.
No CSS, no sitemap, no `llms.txt` in this branch, so no `lastmod` bump and no
IndexNow ping.

---

## 2026-08-25: Lobby batch shipped (#120, #122, #124, #126)

Four changes went out together. Each has its own entry below; this one records
the pre-ship check and what was deliberately left alone.

### Regression pass

The risk in this batch was never the lobby itself, it was what the lobby shares
with the rooms. So each game was driven for real rather than reasoned about.

**Dance**, the one whose markup moved most and whose stepper had not been
exercised: a five-player room across five tabs. The stepper appears at 5, plus
takes it to 2 and then disables at the tier cap. Switching to DJ Mode with those
same five players correctly drops the cap to 1 and hides the stepper, because
Host Picks counts dancers and the host is not one, and switching back restores
it. Find Your Squad hides both the impostor row and the divider above it, so the
card does not end on a rule with nothing under it. Starting a round with 2
impostors dealt exactly 2, to the two non-host players who should have had them.

**Word**: an eight-player Pass the Phone sitting at 2 impostors. Eight cards, two
impostor banners, reveal naming both, quit clean.

**Draw**: Pass the Phone through the cards to the canvas. No `is-my-turn`, no
green ring, "Done → Pass to Bartholomewwww", and the handover hint intact.

Every element id referenced from JS was checked against its own HTML, in all
three games, since this batch moved markup between cards: 90 ids in word, 132 in
dance, 120 in draw, none missing. `npm run lint` clean, all fourteen modules pass
`node --check`, no JS console errors. All rooms quit properly, so nothing was
left in the database.

### Documentation

`llms.txt` described a single impostor for all three games, which the new tiers
made wrong for word and dance. Each game now carries an Impostors line: the tier
table for word and dance, with dance's note that DJ Mode counts dancers, and for
draw the explicit statement that it is always exactly one and why.

### No sitemap bump, no IndexNow ping

Nothing a crawler reads changed. The whole batch is lobby structure behind a
room, plus comments and version stamps; no meta, no FAQ, no schema, no prose.
`llms.txt` did change but is not in the sitemap and IndexNow does not carry it,
so there is nothing to submit.

### Left open

- #121 the reveal card says "The Imposter was" however many there are. Now much
  easier to hit, since two impostors start at 5 players rather than 6.
- #123 draw has no impostor-count setting, so its row is read-only.
- #105 the room code overlaps the Lobby title at 320px in word and dance. Draw
  already fixes it and the block wants promoting into `base.css`. Filed again
  today as #125 before spotting the older ticket; #125 is closed as a duplicate
  and the detail moved onto #105.

---

## 2026-08-25: Players header puts the ready count on the right (#126)

The Players card header stacked its two lines, "PLAYERS" with the ready count
underneath. They now sit on one row, label left and count right, which is the
same label-left / value-right rhythm the settings card above already has.

The count keeps its quiet `.small` styling rather than borrowing the settings
rows' serif value. It reports something rather than sets it, and an 18px serif
"3 / 5 ready" would compete with the player names directly below it.

A shared `.players-head` class in `base.css` replaces the inline flex wrapper
each game carried its own copy of. Baseline alignment rather than centres,
because both children are text at different sizes. The two count lines are
mutually exclusive, `#lobby-ready-line` online and `#lobby-count-line` in Pass
the Phone, so the right-hand side is always a single line and there is no
stacking case to handle.

### Verified

All three lobbies. Draw in both modes, confirming the row reads "PLAYERS |
0 / 0 ready" online and "PLAYERS | 3 players" in Pass the Phone, with the
right edge landing exactly on the card's inner edge either way. At 320px with
the widest the line ever gets, "19 / 20 ready", there is still 92px of clear
space between the two and no horizontal overflow.

### Found while testing, not fixed

At 360px and under the room code chip overlaps the "Lobby" title in word and
dance. Draw already fixes this with a `flex-wrap` rule in its own stylesheet,
and its comment explains why: the code is a fixed 35px however small the
character gets, so wrapping costs one row of height on the narrowest phones
and nothing above 360px. The fix is to promote that block out of `draw.css`
into `base.css` so all three get it rather than copying it twice. Filed as
#125. Pre-existing and unrelated to this change, which touched nothing in the
lobby header.

---

## 2026-08-25: Impostor count moves into the settings card (#124)

The impostor count sat in the header of the Players card, tucked against the
ready line. That put a setting inside the card that reports who is in the room,
so it read as a fact about the roster rather than something the host chooses.
It now sits with the mode, the category and the rounds, where the rest of the
choices live.

Last row in all three games: after Category in word and dance, after Rounds in
draw. Mode stays first, because it is the one setting that decides what the
whole sitting is; the rest are adjustments, and impostor count is the last of
them.

### The badge became a control

The old pill was a 10px letterspaced uppercase badge, which was the right shape
for a corner of the Players card and the wrong one next to a live stepper. It
now takes the rounds control's geometry: 999px pill, 26px round buttons, 13px
sentence case, right-aligned on its row.

The amber is what stays. It is the colour of the "You're the Impostor" banner
and the impostor card, so the row still reads as being about the impostor
rather than as a second copy of the rounds stepper. Matching rounds exactly
would have been more uniform and would have said less.

Two details that only showed up on screen. `inline-flex` swallows the
whitespace between the count span and the word span, so "2 Impostors" rendered
as "2Impostors" until the label got an explicit gap. And a pill with no buttons
sits shorter than one with them, so the label carries a 26px floor, which is
the button height; draw's read-only row lines up with the rounds row above it
instead of sitting visibly small.

### Draw is read-only, for now

Draw deals exactly one impostor and has no stepper, so its row uses the
existing `.set-row.readonly` variant. The user asked for a real setting there
too, as a separate piece of work: #123, to follow this.

### Verified

All three lobbies at desktop width and at 320px.

At 320px the worst case, "5 Impostors" with both steppers, overhung the card by
7px. Fixed in the existing 360px media block by taking the pixels out of the
padding rather than the buttons, which are what a thumb aims at: the pill now
ends flush with the card's inner edge at exactly the same right edge as the
Category chevron and the Rounds pill, with the buttons still 26 by 26.

Dance's group modes hide the row and its divider together, so the card ends on
the music section with one rule and no dangling separator. Switching back
brings both rows back. A non-host in a real room sees the row with its value
and no steppers, the same way the rows above lose their chevrons.

### Noted, not fixed

Dance's one-time "create your own song groups" nudge is absolutely positioned
under the music row and now overlays the impostors row while it is showing. It
is tap-to-dismiss and shown once, and the mode nudge one row up already
overlays the music row in exactly the same way, so this is how these hints
behave rather than something this change broke.

---

## 2026-08-25: Wider impostor tiers in word and dance (#122)

The old cap was 3, and the impostor share thinned out badly as rooms grew:
2 of 6 is a third of the room, 3 of 20 is 15%. A full room played as a much
softer game than a small one, which is the opposite of what a crowd wants.

New tiers, chosen by the user:

| Players | Max impostors |
|---|---|
| 3-4 | 1 |
| 5-7 | 2 |
| 8-11 | 3 |
| 12-14 | 4 |
| 15-20 | 5 |

The share now sits between 25% and 40% across the whole 3-20 range instead of
falling away, and each tier opens at exactly a third.

The table as first written overlapped at 12 and 15, which appeared in two rows
each. Confirmed before building rather than guessed, because the reading changes
the game at two specific table sizes: the higher tier wins, so 12 players get 4
and 15 get 5.

`currentMaxImposters()` in both games. Dance keeps its own twist untouched, that
Host Picks counts dancers rather than room size, since the host can never be the
impostor there. Draw is unchanged: `NUM_IMPOSTERS = 1`, no control, because two
fakers on one shared canvas muddies the evidence rather than doubling it.

The default is still 1 everywhere, and the stepper is still hidden rather than
disabled when the max is 1. That threshold moved from 5 players to 4.

### Verified

Word Pass the Phone, roster driven from 3 up to 20 and back down, reading the
pill after every change. Stepper appears at exactly 5 and vanishes at 4. Ceiling
reached at 20 is 5 with the plus disabled, and the label switches to
"Impostors" at 2. Coming back down the auto-clamp fires on the right rows:
15 to 5, 14 to 4, 12 to 4, 11 to 3, 8 to 3, 7 to 2, 5 to 2, 4 to 1. A real
5-player round dealt exactly 2 impostors across the 5 cards. `npm run lint`
clean, no console errors, room quit so nothing was left behind.

### Found while testing, not fixed

The reveal card's "The Imposter was" is static markup in both games and is never
pluralised, so a two-impostor round reads "The Imposter was Host & Player 3".
Pre-existing, but it needed 6 players before and now needs 5, and at 5 impostors
the ampersand list will wrap badly on the one big serif line. Filed as #121
rather than folded in, since it is a copy change in two games and outside what
was asked for.

---

## 2026-08-25: No green canvas ring in Pass the Phone (#120)

The canvas sat inside a permanent teal ring for the whole of a Pass the Phone
sitting. It is meant to be a "the pen is yours" marker: `renderTurnBar()`
toggles `#draw-canvas.is-my-turn` on `mine`, and online that separates one
player from the others watching.

Locally it separates nobody. `takeLocalTurn()` hands `state.myId` to whoever
owns the slot, which is the trick that makes the whole mode work without a room
listener, and the side effect is that `mine` is true on every single turn. The
ring came on at the first card and stayed on until the reveal. A marker that is
always lit marks nothing, and it was competing with the turn pill, which does
name the drawer and does change.

One boolean:

```js
if (canvas) canvas.classList.toggle('is-my-turn', mine && !state.local);
```

Online is untouched, which was the thing worth checking rather than assuming,
since the class is shared with the room game.

### Verified

Three-player Pass the Phone sitting: no `is-my-turn`, computed `box-shadow` down
to the plain drop shadow, on the first turn and again after a handover, with the
pill correctly reading "Bartholomewwww's turn". Three-tab online room: the
drawer's own canvas still carries `is-my-turn` and the teal `0 0 0 1px` ring,
the two spectators carry `locked` and no ring. Room quit from all three tabs, so
nothing was left in the database. `npm run lint` clean, no console errors.

---

## 2026-08-25: Pass the Phone buttons name the next player (#118)

On a shared phone the drawing turn ended on a bare "Done", and the next thing
that has to happen is a physical handover. The button said nothing about who to
hand it to, so every turn finished with someone asking who was next while the
answer was already on screen in the turn pill. It now reads:

> Done → Pass to Sara

Derived in `updateDrawUI()` from `nextPresentTurn(currentTurn())` rather than
stored, so it follows a roster edit or a departed player with nothing extra to
keep in sync. Gated on `state.local`: online the button stays a plain "Done",
because no phone changes hands and the next drawer's own screen lights up by
itself. Naming them there would promise a pass that is not happening.

### The last turn, and which "last" it is

"At the end it can just be Done" had two readings, and one of them is a bug.
With the default 2 rounds the last player of round one still passes the phone,
into round two. Dropping the instruction there strands whoever is holding it.
So the plain "Done" is the final turn of the whole game only, which is exactly
`nextPresentTurn()` returning -1. `drawerAt(-1)` is undefined and the lookup
falls back to the short label on its own, so the case needs no separate branch.

This mirrors the pass card one screen earlier, where the last card reads "Start
Drawing" instead of naming a player.

### The pass card, one screen earlier

Added after the fact, having been offered and declined twice before the user
came back for it. The card screen's button read "Pass to Next Player" for every
player but the last; it now names them, so both handovers in a round are worded
the same way.

The name here is not the one on the card. The card belongs to whoever is
holding the phone, and the button is what they do when they have finished
looking, so it names `seq.ids[seq.idx + 1]`. Getting that backwards would have
told each player to pass the phone to themselves. Falls back to the old generic
wording if that player is missing from the roster, which is the same case the
skip at the top of `renderPassCard()` already handles.

No ellipsis needed on this one. It carries 60px less text than the Done button,
so at 320px the worst realistic case is 203px against a 224px budget. Only
something like fourteen capital Ws would wrap it, and the button sits at the
bottom of a screen with nothing below it whose height matters.

Word got the same change straight after, so the two stay in step. Its
`renderPassCard()` was line-for-line identical to draw's apart from "Start
Playing" and one comment word, and the markup carries a note saying the two
must not drift, so leaving it would have created exactly the divergence that
note warns about. After the change the two functions still differ only in that
button string and their comments; the code is identical.

Word has no counterpart to the Done button, because there is no drawing turn:
after the cards the group talks and someone taps Reveal. So the card screen is
the whole of it there, and the stamp goes to .25.1.

### The hint under the Done button

Was:

> Draw what was on your card. Everyone can see this screen, so it stays off it.

Now:

> Add your part to the drawing, then tap Done and pass the phone to the next player.

Two things this trades away, recorded because neither is visible in the diff.

The old line did a job beyond instruction: it explained why the word is not on
this screen. The reasoning in the comment above it still holds and is still why
nothing is printed there, but a player who has forgotten their card is now told
nothing about why the screen will not help them. A note to that effect sits with
the code.

The line also read "pass the phone to the next player" on the final turn, where
there is no next player and the button has already dropped to a plain "Done".
Fixed straight after, so the hint now varies on the same condition the button
does:

> Add the last part to the drawing, then tap Done to find the impostor.

It names the screen Done actually opens rather than saying the game is over,
because it is not: the arguing is still to come, and that is the best part.

This needed a call site as well as a string. `updatePlayControls()` was only
reached once per local sitting, from `beginLocalDrawing()`, so a hint that
changes per turn would never have been rewritten. Online the room listener
refreshes it on every snapshot; locally there is no listener, so
`takeLocalTurn()` now calls it alongside `updateDrawUI()`. Worth knowing for
anything else that gets added to that function: it is per-sitting, not
per-turn, unless called from there.

Same rendered height as the old copy, 31px over two lines at 320px, and no
horizontal overflow. Stamp draw .25.6.

### Pass the Phone now defaults to 2 rounds

`DEFAULT_LOCAL_ROUNDS` was 1, deliberately, with a comment explaining that on
one phone every turn is also a handover, so two rounds is twice the sitting
rather than twice the drawing. Raised to 2 at the user's request, matching the
room game.

The argument for the change: one round gives every player exactly one turn,
which is a thin game. The impostor barely has to commit to anything, and nobody
gets to answer what was drawn after them. The argument for 1 has not stopped
being true, so it is kept in the comment rather than deleted, for whoever
revisits this: five players at two rounds is ten turns and ten passes.

`DEFAULT_LOCAL_ROUNDS` stays its own constant even though it now equals
`DEFAULT_ROUNDS`. They are independent settings that happen to agree.

The visible page copy never stated the default, so nothing on `/draw/` changed
and there is no sitemap `lastmod` bump. `llms.txt` did state it ("one by default
in Pass the Phone") and was corrected. That is the separate AI channel, so no
ping and no search effect either way.

Verified: lobby opens on "2 Rounds" in Pass the Phone, and a full sitting runs
six turns across Round 1 / 2 and Round 2 / 2 before the Find the Impostor
screen. The stepper still reaches 1 and 5.

### Latent bug found while testing, filed as #119

`clampRounds()` returns `DEFAULT_ROUNDS` when `!v`, and `0` is falsy, so
stepping below the minimum lands on 2 rather than clamping to 1. Not reachable
by a player: the minus button carries `disabled` at `MIN_ROUNDS` and browsers
do not fire click on a disabled button. It showed up only because the test
driver dispatches synthetic click events, which bypass that. Left unfixed as
out of scope and filed as #119; the guard wants an explicit NaN check rather
than a truthiness test, and word and dance want checking for the same shape.

### Regression pass before shipping

The two functions this work touched, `updateDrawUI()` and
`updatePlayControls()`, are shared with the room game, so online was driven
end to end across three tabs rather than reasoned about: room created, two
players joined by code, both readied, host started.

All three clients on the play screen showed a plain "Done" with no "Pass to"
suffix, correctly disabled on the two who were not drawing. The private hint
line was intact in both forms: "The word is “Macaron”…" for the two players,
"You're the impostor. Your hint is “Pastel”…" for the third. Advancing a turn
moved the pen to the next player on every screen, with the label unchanged.
The room was quit properly afterwards so nothing was left behind.

Word's change is contained entirely inside `renderPassCard()`, which only runs
in Pass the Phone, so its room game is untouched by construction. Dance has no
files in the diff at all. `npm run lint` clean.

### The separator

`→` was the user's pick, made against two flagged objections: a spaced em
dash would have broken the house rule about " — " in copy, and `→`
already reads as a navigation affordance on the hub's game links. In-game the
only other arrows are the `←` back buttons, so the two surfaces do not meet.
Recorded here because the reasoning will not be obvious from the diff.

### Verified

Local Pass the Phone round on localhost, never the prod hostname, 3 players
across 2 rounds. All six turns walked in order:

| Turn | Drawer | Button |
|---|---|---|
| 1 | Test | Done → Pass to Bartholomewwww |
| 2 | Bartholomewwww | Done → Pass to Player 3 |
| 3 | Player 3 (last of round 1) | Done → Pass to Test |
| 4 | Test | Done → Pass to Bartholomewwww |
| 5 | Bartholomewwww | Done → Pass to Player 3 |
| 6 | Player 3 (final) | Done |

Turn 3 is the one that matters: the round rolls over and the phone still moves.
Turn 6 drops the suffix and lands on the Find the Impostor screen.

### Held to one line, and why not a name cap

A long name wrapped the button onto two lines at 320px, taking it from 53.5px to
73px and changing the footer height between turns. `.btn-done:disabled` already
exists precisely so the footer never changes height mid-round, so the wrap broke
a rule the file had already written down.

The obvious fix, capping name length, was measured and rejected. The budget is
pixels, not characters: "Christopher" at 11 characters is 215px and fits, while
"MOHAMMED" at 8 is 225px and does not. Guaranteeing any input would need a cap
of six characters. It would also miss rosters already saved, because
`loadRoster()` feeds names through `rosterFromNames()` without re-capping and
only `applyRosterName()` truncates, so the regular groups most likely to have a
saved roster would keep their long names. And it would change names everywhere
(lobby, turn strip, ink legend, online) to fix one button at one width.

So: `white-space: nowrap` plus an ellipsised span on the label. Deterministic,
adapts to the viewport instead of guessing, and the full name stays in the
button's text content, so screen readers still announce it in full.

The scale of the problem, measured rather than assumed: of 23 real names at
320px, 21 fit on one line. Only names past about 11 characters, or 8 in
capitals, reach the ellipsis, and at 375px even a maximum-length 14-character
name clears it with room to spare.

Verified at 320px across a full round: button height constant at 53.5px on every
turn, only the 14-character name clipped, final turn still a plain "Done". At
375px nothing clips at all.

### Housekeeping

Stamp draw .25.4. No sitemap `lastmod` bump: this is in-game UI behind a mode
selection, not page copy a crawler can see, so per the SEO.md rule it does not
qualify. Driving the create flow to reach the lobby left one orphaned room in
the production RTDB (room writes are never gated by hostname, only analytics
are); the next `scripts/purge-idle-rooms.mjs` run collects it.

---

## 2026-08-22: plainer answer to "What is the Impostor Draw Game?"

The first FAQ answer on /draw/ was written from the impostor's side and left
the reader to work out the shape of the game: "the impostor fakes their strokes
while working out the word, and everyone else tries to prove they know it
without making it obvious." Accurate, but it described the tension rather than
the rules, and it never said the round ends in a vote.

Rewritten to state the setup, the turn, and the ending in that order:

> A free online drawing party game for 3–20 players. Most players get the same
> secret word, while the impostor only gets a vague hint. Everyone takes turns
> drawing on a shared online canvas, including the impostor, who tries to blend
> in without knowing the secret word. At the end, everyone votes to find the
> impostor.

"Most players get the same secret word" replaces "everyone… except one", which
is one clause instead of two. "A shared online canvas" keeps the one detail
that makes this a drawing game rather than a guessing game. "Without knowing
the secret word" states the handicap outright, where the old copy only implied
it. The vote is named, because it is the payoff and it was missing.

Changed in both copies: the visible `<details>` and the FAQPage JSON-LD, which
had drifted apart in wording anyway. The JSON-LD keeps its own "3 to 20"
spelling; the visible copy keeps the en dash. Stamp draw .22.1, sitemap lastmod
to 2026-08-22 per the SEO.md checklist.

### Left alone deliberately

`VideoGame.description` still reads "Everyone gets the same secret word to draw
— except one impostor". It now frames the game differently from the FAQ
directly beneath it, and it carries an em dash against the house rule, but it
is short, it already names the vote, and it holds "built for remote play",
which is a phrase worth keeping. `llms.txt` has the same old framing in its
draw section. Both were reviewed and kept as they are.

Title, meta description, canonical and robots are untouched. Those are what
rank; this is body copy, so it is not expected to move anything on its own.

### Context

Raised while looking into a gap in Search Console data for /draw/. Nothing was
found wrong: no noindex, no `X-Robots-Tag`, correct canonical, page 200s, the
sitemap lists it, robots.txt allows every crawler, and the JSON-LD parses. The
gap is most likely reporting lag or ordinary fluctuation. This edit is a copy
improvement, not a fix for that.

Checked: JSON-LD parses with both nodes intact and 6 FAQ questions, renders on
localhost, no console errors, no horizontal overflow at 375px.

---

## 2026-08-20: stats Overview now shows country breakdowns

The Overview section of `stats.html` had "Hub visits by country" but no
aggregated country data across the three games. Added two panels:

- **Visits by country**: sums visit-country maps from music, word, and draw.
- **Games by country**: sums game-country maps from the same three sources,
  with the existing "host location" note.

Both respect the range selector (last N days, custom, all time) using the same
`sumMap` aggregation the per-game views already use. For all-time, reads the
top-level `visits.countries` / `games.countries`; for a date range, walks
`daily[day].countries` per source. The per-game views and all other Overview
panels are unchanged.

Only file touched: `www/stats.html` (skeleton + render logic, ~20 lines).

---

## 2026-08-20: every game page now links to the other two

Until now the only route between the three games was back out to the hub. A
player who arrived on /draw/ from a search never saw it, so the other two games
did not exist as far as they were concerned. Each game page now ends with a
"More games" block holding one row per other game: character icon, name, Play.

Added to all three, at the very bottom of the how-to section, under "More to
read". One CSS block in `shared/base.css`, one markup block per page, plus
`.alt-game` added to the selector list in `shared/press.js` so tap feedback
works. No JavaScript, no new assets: the rows are plain `<a href>`.

### Not the hub's cards

`.game-card` on the hub is a 380px illustration, a title, a blurb and a wide
Play button, sized to be the only thing on the screen. This sits under the FAQ
at the foot of a long page, so it is a row instead: the same parts at a tenth
of the height (90px, or 78px on a narrow phone). Reusing `.game-card` would
have meant unsetting most of it.

The Play pill is a `<span>` inside the link, not a `<button>`. A button nested
in an anchor is invalid, and it would swallow the tap the card wants.

### Short names, and where "Impostor" went

The rows read "Dance Game", not "Impostor Dance Game". Measured at 375px, the
full name wraps to two lines and the two cards break in different places
("Impostor / Dance Game" against "Impostor Draw / Game"), which reads as ragged.
The short name holds one line at every width down to 320 and drops the row from
97px to 78px.

That takes "Impostor" out of the link text, which is the main signal a crawler
reads about the page a link points at. Each card therefore carries
`aria-label="Play the Impostor Dance Game"`. It costs nothing visually, it is
the right thing for a screen reader hitting a link that says "Draw Game Play",
and it keeps the full name attached to the link.

The heading is "More games" for the same reason the names are short: against
the 38px `.howto-header h2` it was measured against, "More Impostor Games",
"You might also like" and "Try the other games" all wrapped to two lines, which
put a heavier heading on the page than two small rows deserve. "More games"
holds one line and reads as a sibling of "More to read" above it.

Then the section headings themselves came down from 38px to 28px, in the same
change. That is every heading in the how-to section on all three game pages:
How to Play, FAQ, More to read, More games. At 38px the heading outweighed
everything under it, most visibly here, where two 90px rows sat beneath a word
set nearly as tall as the icons beside it. The hub is untouched: it does not
load `base.css` and carries its own copy of these rules, which is a duplication
already on record. A longer heading would now fit on one line, but "More games"
stays, because the reason for it was never only the width.

### The icons are optically sized, not equally sized

The rows reuse the lobby blink characters, `/characterdance-blink.svg`,
`/draw-phone-blink.svg` and `/word-cards-blink.svg`. They are already drawn for
this: cropped viewBoxes, tuned for 56-60px, nothing animating but a blink on a
shared 11s cycle, so between blinks the browser does no work.

They are `<img>`, which keeps each one a separate document. That matters here
more than it does in the lobby: the word page has the juggler inlined with `wj-`
ids, and `word-cards-blink.svg` uses the same ids. Inlining these would put two
copies of those ids in one document.

Giving all three the same height makes them look different sizes, because they
fill their viewBoxes by different amounts. The block repeats the lobby's three
adjustments (draw capped on width, since its art is 441x326; dance 4px taller,
since that figure fills about 81% of its box against word's 95%). Repeated
rather than shared, because in the lobby those three live in three different
files, one per game, and every game page here shows two characters that are not
its own.

### 320px

At 320 the row has 82px left for the name once the well and the pill have taken
their share, and "Dance Game" needs 112. A `max-width: 360px` block trims the
well to 52px, the gaps to 10 and the name to 17px, which buys back 30px and
holds one line. Same trick `draw.css` already plays on the lobby header at this
width.

The names deliberately do **not** use a non-breaking space. With the short names
there is no "Impostor" prefix whose break needs controlling, and a plain space
means the failure mode at some future width is a second line rather than text
running under the Play button.

### Checked

`npm run lint` clean, no console errors, no horizontal overflow on any of the
three pages at 320 or 375, and the press state confirmed applying (shadow
flattens, pill scales to 0.96). Note when measuring this: reading
`getComputedStyle` immediately after adding `.is-pressed` returns the *old*
value, because the transition has not started yet. It reads as a dead rule and
is not one.

Not verified by tap: the Browser pane's click timed out, as it did during the
share screen work. The links are plain anchors to `/dance/`, `/draw/` and
`/word/`, all of which load, so there is no JavaScript path to be wrong.

All 35 screens across the three games were swept for horizontal overflow with
each one activated in turn. None. The hub and the two content pages are
untouched by both changes: neither loads `base.css`, and `.alt-game` exists
nowhere else, so widening the `press.js` selector matches nothing new there.

### Sitemap

`/dance/`, `/word/` and `/draw/` bumped to `2026-08-20` in this commit, per the
rule in SEO.md: bump for content a reader would notice, in the same commit as
the change. A new section with two links, and every section heading dropping
10px, is noticeable on all three. `/` and the two content pages were left alone
because nothing on them moved.

---

## 2026-08-18: the room-created screen becomes one card

The host share screen was three objects stacked up: a floating QR card, then a
row of four white code tiles, then a copy button, all on the page background.
Handing someone a room meant pointing at two separate white shapes. It is now a
single card holding the QR, the code and the copy button, which is the thing you
actually turn round to show a group.

Same change in all three games. The screens were byte-identical before this and
still are, apart from one deliberate difference noted below.

### What moved

`.share-hint` copy is now "Players can scan or enter the code to join." The old
string carried an em dash, which the house style bans, so that went with it. The
max-width went from 260px to 300px because the new sentence fits on one line at
300 and wrapped to two at 260, which cost 22px on a screen that had none spare.

The four `.code-box` tiles are gone; the code is plain Literata letters inside
the card. The join screen's tiles are untouched, because those are the unscoped
`.code-box` rule and only `#share-code-boxes .code-box` was removed. The letters
stay clickable to copy, so both copy affordances survive.

`#share-qr` moved from `.qr-card` to a new `.share-qr`. `.qr-card` carries its
own white fill, padding and shadow, which the lobby QR modal still needs and
which would have to be unset one by one inside a card that is already white.
Cheaper to add a bare class than to override six properties. The lobby modal was
left alone entirely, by decision.

### The centring, and the trap in it

The block now sits centred between the back button and the sticky action bar,
which needed the `<div style="flex:1;min-height:24px;">` spacer to go and
`.share-wrap` to become `flex: 1`.

It centres with auto margins on the first and last child, **not**
`justify-content: center`. That is not taste. Centred flex pushes overflow above
the scroll origin, so on a short phone the "Room Created!" title would scroll off
the top and be permanently unreachable. Auto margins split the free space
identically when there is room and collapse to zero when there is not, so a short
screen just scrolls. Measured on a 620px viewport: the title sits at +110px at
scroll top, ie fully visible, and the bottom is reachable at 138px of scroll.

The padding is `0 0 16px`, bottom only. It exists as the floor gap that keeps
the last line off the action bar once a short screen scrolls. One-sided padding
skews auto-margin centring in principle, but here it nearly cancels: the back
button's own 12px bottom margin offsets most of the 16px, leaving the content
2px high on dance, the only variant with room to spare. Measured, not assumed.

### Pass the Phone, and why dance has none

Word and draw end with an "or" rule and "Choose **Pass the Phone** mode to play
on one phone." Dance has neither, and not for copy reasons: dance has no Pass the
Phone mode at all. Its modes are Imposter Challenge, DJ Mode, Find Your Squad and
Partner Hunt. Only word and draw define `passphone`.

The line is static text. A tappable version was designed and dropped. Two facts
killed it. The room already exists by the time this screen is shown, so tapping
would have to delete the room whose QR is on display; and the room listener is
not attached until "Go to Lobby", so the screen cannot even tell whether anyone
has joined yet, which made a confirmation dialog fire on every tap for a case
that is nearly always empty. Nothing about the room lifecycle changed, and no new
analytics counter was added, because no new path exists.

### One measure, set once

The first cut gave four children four separate max-widths (300, 258, 300, 290),
which is the shape that drifts: nothing enforces that they agree, and the card
sitting 42px narrower than the text above it was already visible.

They are gone. `.share-wrap` carries `--share-measure: 300px` and is itself
capped and centred, so every child is bounded by the container rather than by
its own rule. The card, the "or" divider and the hints now share one edge, and
the width changes in one place. `width: 100%` alongside the cap keeps it
responsive: at a 320px viewport everything shrinks together to 272px with no
horizontal overflow.

The measure then settled at 240px, with the title at 26px and the hint's top
margin at 4px so it pairs tightly with the title as one heading block. The hint
wraps to two lines at that width, which is deliberate: the earlier 300px existed
to hold it on one line, and that is no longer the goal.

Removing the top padding was what paid for it. At 240px the extra hint line put
word and draw 6px over a 760px viewport; dropping `padding-top` returned 16px
and both fit again with room to spare.

### One shared value moved beyond this screen

`.sticky-actions` had `calc(10px + env(safe-area-inset-bottom))` as its bottom
padding; it is now 16px. That is the gap under the primary button, and the bar
is shared, so this moves **14 screens** across the three games rather than only
the share screen. Done globally on purpose: a share screen whose action button
sat differently from every other one would be the same drift this work has been
removing. The `env()` is untouched, so the iOS home indicator is still cleared.

The cost is that the bar grew 6px and ate into the content space, briefly leaving
word and draw with 2px of headroom. Tightening `.share-copy-btn` from
`11px 22px` to `8px 16px` paid it back: they are at 5px above and 21px below,
and the button is now 117x34 rather than 165x42. That rule is used only by the
three share screens, so unlike the bar it is genuinely local.

Worth knowing before the next change here: a 34px button is under the ~44px
usually wanted for a comfortable tap target, and it sits directly above the code
letters, which are themselves tappable to copy. Two small adjacent targets is
where mis-taps happen. Harmless in this case, since both do the same thing, but
if it needs topping up the fix is a transparent `::after` inset in the way
`.pill-btn` already does, which grows the hit area without touching the pill.

Headroom on a 760px viewport is now 5px for word and draw and about 64px for
dance. That is not much for the two bigger variants; anything further added to
this screen tips it into scrolling. The auto-margin centring degrades safely
when that happens, but it is no longer free.

### New token

`--line: #ece3d2`, for the divider hairline. `--border` is ink at 8% and simply
disappears at 1px. The value already exists in `stats.html` under exactly this
name, so this adopts a name `base.css` was missing rather than inventing one. It
is the same value as `--ring-icon-bg`; those stay separate tokens because they
answer to different roles, which is the call already recorded in the token
consolidation work.

Also removed a comment in `dance.css` describing `#share-code-boxes` rules that
had already been deleted, and the now-unused `.code-divider`.

### Verified

Local dev server only. The games gate analytics on hostname, so localhost writes
no counters; the three test rooms were real RTDB writes and were deleted by
leaving each room.

Real room created in each game: QR renders and encodes the live code, the code
matches, the card lays out as approved. Centring measured at 17px above and below
on word and draw and 64/68 on dance, none of them scrolling at 760px. The 620px
case scrolls with the title still reachable. Widths measured equal at 240px for
the wrap, card and divider, and equal at 272px with no overflow at a 320px
viewport.

One trap worth recording for anyone measuring this screen again: `.screen`
carries a 0.35s `screenIn` animation that starts at `translateY(8px)`, and a
backgrounded tab freezes it there. Every `scrollHeight` reading is then inflated
by up to 8px and the layout looks like it overflows when it does not. Neutralise
the animation before trusting any number. This produced a false 8px overflow on
dance during this work before it was caught.

Because `.sticky-actions` is shared, every screen carrying it was swept rather
than just the three that changed: all **31 screens** across the three games were
activated in turn and measured. All 14 sticky bars read 16px and sit flush to
the viewport, and no screen has horizontal overflow. The hub and stats pages
were checked and are genuinely unaffected: neither loads `shared/base.css` (the
two matches in `index.html` are comments, not links) and neither uses any of the
changed classes.

Final values on this screen, all in `shared/base.css`:

    --share-measure: 240px          one measure, bounds every child
    .share-title    font-size 26px
    .share-hint     margin 4px 0 0  pairs tightly with the title
    .share-wrap     padding 0 0 16px
    .share-copy-btn padding 8px 16px
    .sticky-actions padding-bottom calc(16px + safe-area)   SHARED, 14 screens Lobby QR modal confirmed unchanged
(`.qr-card` still 168px, white, 16px padding, own shadow). Join screen confirmed
unchanged (four 56x70 white Literata tiles). No console errors. `npm run lint`
clean.

Not verified: the clipboard write itself. Both handlers fire and reach
`copyRoomCode`, which is unmodified, but the browser blocks scripted clipboard
writes without a genuine tap, so it returns "Could not copy" under automation.
Worth a human tap before this goes out.

Stamps: word, draw and dance all v2026.08.18.1. The hub and stats pages are
untouched and keep theirs. Not deployed; push and deploy stay separate steps.

---

## 2026-08-17: telling search engines and AI that one phone is enough

Issues #110 and #108. Pass the Phone shipped on word on 08-05 and on draw on 08-17, and until now neither Google nor any AI engine had been told it exists. Roughly 10% of word rounds are already single-device, so this was the gap actually costing players.

### llms.txt was not just silent, it was wrong

Silence would have been the easy version. The file also asserted four things that are false in the mode, in the voice of the site's own reference document:

- **Shared facts: "Players: 3 to 20, each on their own device."** The worst of them, because it sits under a heading that reads as true of all three games.
- **draw: "each turn is capped at 45 seconds."** There is no timer locally. `meta.turnAt` stays null for the whole sitting, deliberately.
- **draw: "voting opens by itself."** There is no ballot locally.
- **draw: "the strokes appear live on every screen."** There is one screen.

Each of those is still true of the default mode, so none was deleted. They were attributed to the mode they belong to, and the Pass the Phone behaviour stated next to them. An engine quoting any single bullet now says something correct either way.

Both games gained a `Game modes:` bullet in the shape dance already had for DJ Mode and Find Your Squad, naming the modes exactly as the lobby shows them, so a player who reads the answer and opens the app sees the same words.

The summary blockquote at the top got a clause too. It is the most quotable line in the file and the one an engine is most likely to lift wholesale, so leaving the mode out of it would have undone much of the rest.

Added a Common questions entry phrased the way it actually gets asked, "Can we play with only one phone?", since that block is the part of the file shaped for retrieval. The room-codes answer now says codes only apply when everyone has their own phone.

Also fixed `The host taps "Reveal Imposter"` on the word line, which is body copy carrying the `e` spelling against the rule in `draw/index.html:14`. Same class as #106, different file, so it was fixed here rather than blurring that ticket's scope.

Dance is called out explicitly as the exception, because it cannot work this way: every player needs their own headphones.

### The draw FAQ had the same hole

Word gained a "Can I play on one device?" question in both its visible FAQ and its JSON-LD when its mode shipped. Draw got neither, and its "How many players do I need?" still answered with "everyone else joins from their own device", which is now only half true.

Draw now carries the question in both copies, and the players answer distinguishes the two modes. The answer is not word's, because the mode differs in ways a group notices: the phone goes round twice rather than once, there is no timer, the turn strip names whose go it is, and the ending is an argument and a Reveal rather than a ballot.

A pre-existing mismatch is worth recording rather than quietly fixing: draw's visible FAQ has 7 questions and its JSON-LD 6, because "What words come up?" was never in the structured data. That predates this work and belongs to #89, which owns reconciling the two across the site. Both copies got the new question, which is what #108 asked for.

### Verified

JSON-LD in both files parsed with `JSON.parse` and walked to confirm the FAQPage node and its question list, since a malformed block fails silently and takes the rich result with it. Visible and structured question lists printed side by side and compared by hand.

The new FAQ entry opens and renders, and the page has no horizontal overflow at 320px. Stamp: draw v2026.08.17.15. `llms.txt` has no stamp.

### #109, and fixing the reason it kept happening

`/draw/` sat at `2026-08-16` through the Pass the Phone launch on the 17th, the single biggest change that page has ever had, while `/` was correctly bumped to the 17th. Set to `2026-08-18`, which covers both that launch and today's FAQ work.

**Only `/draw/` moved.** Word and dance had their tap handling fixed and their version stamps bumped today, and their `lastmod` was deliberately left alone, because neither page's visible content changed. Bumping everything on every deploy is the same failure as never bumping it: a sitemap where the changed page reads stale and unchanged pages read fresh teaches the crawler to ignore the field, and Google is openly sceptical of `lastmod` on sites that get it wrong. Bing and IndexNow read it more literally, which is the ChatGPT Search path.

The ticket noted this had now been missed twice because updating it lived in nobody's checklist. `SEO.md` had a checklist for adding a **new game**, which is rare, and none for changing copy on a page that already exists, which is the common case. Added one: `lastmod` in the same commit as the change, deploy before ping, scope the ping to the paths that actually changed, and three things worth knowing that were previously only learned the hard way. That `llms.txt` is a separate channel carried by neither the sitemap nor IndexNow, so it needs no ping and will not move search. That Google ignores IndexNow and has to be asked separately. And that body copy alone rarely moves rankings, because `<title>` and the meta description are what rank, so a search goal needs a title change made alone and held 2-3 weeks.

Also corrected the stale page list in that section, which still named four pages when there are six.

### Shipped

Merged as `3d3c287`, pushed, deployed hosting only (3 files changed), then pinged. Verified the live bytes **before** the ping rather than after, since the ping is an instruction to come and look and is worth nothing if it arrives ahead of the content: draw at `v2026.08.17.15`, the new FAQ entry present in both the visible list and the JSON-LD, `llms.txt` carrying nine Pass the Phone mentions and the corrected "Reveal Impostor", the live sitemap reading `2026-08-18` for `/draw/`, and the IndexNow key file returning 200.

`node scripts/indexnow-ping.mjs /draw/` returned **HTTP 200, 1 URL submitted**. Scoped to the single page whose content changed rather than resubmitting the whole sitemap, which would have been five unchanged pages of noise.

Deliberately not submitted: `/llms.txt`, which is not a sitemap URL and is read by AI crawlers on their own schedule, not fetched off an IndexNow submission. Nothing to ping and nothing to wait for there.

**Still outstanding for Google:** IndexNow does not reach it. `/draw/` needs a manual URL Inspection and Request Indexing in Search Console if this should land in Google and AI Overviews rather than only the Bing-backed engines. Left for Irfan, since it is a console action.

Expect nothing in search from this. The change is body copy and structured data; `<title>` and the meta description are untouched and are what rank. Its value is AI retrieval, which is what #110 was about.

---

## 2026-08-17: two production bugs on the host's way into a room

Issues #114 and #115, branch `fix/stats-notes-and-funnel-caveat`. Both reported from the live site, both on the online path, both in all three games. Neither came from the Pass the Phone work, though the second one is the same platform bug that work already fought once.

### The host lobby flashed the player layout

Creating a room showed "I'm Ready" and "← Leave Room" for a beat before they became "Start Game" and "← Quit Game".

`renderLobby()` worked out who you are from the room snapshot alone, and the host arrives before the first snapshot does: `btn-share-continue` calls `attachRoomListener()` and then `enterLobby()` on the very next line, and `enterLobby()` renders synchronously before `go('lobby')`. So `state.players` was still empty for that paint, `me` was undefined, and the host was drawn as a player.

Measured it rather than guessed, with a MutationObserver on both buttons: the wrong layout painted at t=8ms and corrected at t=102ms. That is against a database in the same region on a wired connection, so the reported "less than a second" on mobile data is the same bug with a slower round trip.

`state.isHost` is set synchronously in `createRoom` and `joinRoom`, so it now carries the first paint and the snapshot takes over the moment it lands: `me ? me.isHost : state.isHost`. Checked the joiner too, in a second tab against the host's room, since the fallback has to be right in both directions: ready button visible and start hidden throughout, no flicker either way.

Worth noting it was never just the button. The back button flipped as well, which is why it read as the whole screen changing its mind.

### "Go to Lobby" ignored taps

Tapping it sometimes did nothing at all. The tile lit up under the thumb and the screen stayed put.

This is the Android tap-swallow from 08-05, on a button nobody had connected to it. A tap arriving while Chrome's gesture pipeline is still settling after a drag produces `pointerdown` and `pointerup` but never a `click`. The share screen scrolls, with the QR, the code and a copy button above the fold, so this button is routinely tapped straight after a scroll.

What makes it read as broken rather than unresponsive is `press.js`: it drives the pressed state from `pointerdown` for `.tile`, so the animation plays on every tap whether or not the click ever arrives. Feedback, and nothing else. Exactly what was reported.

Reproduced it before touching anything, by dispatching a tap with no click at all, and confirmed the host sat on the share screen while `is-pressed` went true mid-gesture.

The fix is the existing `wireTap`, applied where it should have been all along. Draw already had the helper, so one line. Word had the same logic sealed inside a `wirePassNext()` IIFE, so it got promoted to a real helper and now serves both buttons. Dance had none of it and got the whole thing.

That leaves three copies of `wireTap` and `swallowTapClick`, which is two too many. #116 tracks pulling them into `shared/tap.js`. Deliberately not done here: it would have meant refactoring the just-shipped Pass the Phone tap handling in the middle of a live fix.

The other online forward buttons (Create Room, Start Game, I'm Ready, Enter room) sit behind a plain `click` and have the same exposure. None is reported and each needs its own thought about double-firing, so they are named in #115 rather than swept in.

### Verified

`localhost:64290` only, never the production hostname, so no analytics moved. Room writes do reach the production database in either mode, so this run left five test rooms behind.

- Host first paint at t≈4-11ms already correct in all three games.
- Joiner correct and stable throughout, draw, second tab into a live room.
- Touch-only tap on "Go to Lobby" reaches the lobby in all three games.
- Regression on the button word's helper came from: a full pass sequence driven entirely by touch-only taps advances exactly one player per tap, 1 of 3 to 2 of 3 to 3 of 3 to the round screen.
- No console errors on any of the three after the change.

A purge dry run showed 1,007 orphaned rooms across the three trees against 6 active. Not run with `--delete`; that needs a decision, and the script cannot target single codes by design, so the test rooms age out with everything else.

Stamps: dance v2026.08.17.8, word v2026.08.17.10, draw v2026.08.17.14.

### Deployed

Merged to main as `3a5031d`, pushed, and deployed with `firebase deploy --only hosting`. Hosting only: `database.rules.json` was not touched, and deploying rules that had not changed would be a live security-config write nobody asked for. 7 files uploaded.

Verified against the deployed build rather than a local rebuild, using a route worth remembering: `https://imposter-20b85.web.app/<game>/` serves the identical bytes, and `analyticsEnabled()` is gated to the `impostorgames.com` hostnames, so the gate is false there and driving the real build moves no counters. Confirmed the two hosts matched on all three version stamps by `curl` before trusting it.

All three games on the live build: touch-only tap on "Go to Lobby" reaches the lobby, and the lobby paints the host layout once and never changes it (`paintChanges: 1`, first paint at t=8ms dance, 21ms draw, 83ms word). No console errors on any of them. The apex serves the same three stamps and the old click-only listener is gone from all three files.

The IndexNow ping was **not** run. It is the third manual step and nothing in this batch changes indexable content: these are two behaviour fixes plus an internal stats page. #109 is where the ping belongs, together with the stale `/draw/` `lastmod`, so that one submission matches one set of content changes.

Left behind: three rooms on the production RTDB from this verification (`2AQL` draw, `AZUM` word, `P49P` dance), plus five from the localhost run. The script cannot target individual codes by design, so these aged out with the rest in the purge below.

### Orphan purge, and a baseline worth keeping

Ran `node scripts/purge-idle-rooms.mjs --delete` on Irfan's go. **Removed 1,012 rooms, about 807 KB**, and kept the 4 that were inside the 15-minute cutoff. A dry run straight afterwards reported 0 to delete against 4 active, so the sweep was complete and nothing live was touched.

Split at the time of the purge:

| Tree | Deleted | Idle | Ghost | Corrupt |
|---|---|---|---|---|
| `rooms` (dance) | 528 | 480 | 46 | 2 (`E5SW`, `Y8XJ`) |
| `rooms-word` | 308 | 258 | 50 | 0 |
| `rooms-draw` | 176 | 160 | 16 | 0 |

The two corrupt rooms are the year-2286 `lastActivity` stamps, which no time-based rule can ever catch. They are gone.

**This is the number to measure regrowth against.** The tree is now effectively empty: 1 dance, 2 word, 1 draw, all live. Anything found later is accumulation since **2026-08-17**, which is what makes it a usable baseline for the orphan-regrowth question rather than just a tidy-up. The 112 ghost rooms across the three trees (players node, no meta) are the more interesting half, since those come from presence re-adding a player to a room whose meta was already deleted, and that is a live code path rather than an abandoned tab.

---

## 2026-08-17: two stats-page corrections after the draw deploy

Issues #112 and #111, branch `fix/stats-notes-and-funnel-caveat`. Both came out of the post-deploy audit, and neither is a tracking bug. The counters are right; what was wrong was what the page said about them.

**#112, the footnote that fell behind.** The notes block claimed Overview totals "sum Dance + Word". `COMBINED_SRC` has been `['music', 'word', 'draw']` since draw launched, so draw was in the total and the note said it was not. Worse, the very next line already said "Overview sums the three games", so the file contradicted itself eleven words apart. Checked against the live numbers before changing it: visits read 3,312 dance + 1,876 word + 838 draw against an Overview of 6,026, and games 4,668 + 2,443 + 703 against 7,814. Both sum exactly, so the note was the wrong half.

The HTML comment two lines up had the same rot, naming "Dance / Word / Hub" for what is now four sections. Rather than list them again and wait for the next game to make it stale a third time, it now points at `SECTIONS` as the authority and says outright that this is why it stopped listing them.

**#111, and the fix that moved.** The ticket said to add a Pass the Phone caveat to the room funnel on the stats page. While implementing it I checked where that funnel renders, and it does not. The page's panels are ratings, run length, group size, song groups, sign-in, visits, games, countries, modes, categories, items and song failures. `rooms/*` and `joins/*` are collected and only ever read in the Firebase Console. Adding the note as written would have annotated a panel nobody can see.

So the caveat went where the number is actually read. The analytics header comment in `draw/app.js` already carried the exception, that `rooms/created` fires for a Pass the Phone sitting because the mode picker lives in the lobby and reaching the lobby genuinely creates a room. `word/app.js` never got that paragraph, though word behaves identically and shipped the mode twelve days earlier. Both now carry it.

Reading the switch path to write that up turned up a second half nobody had recorded: `setMode` calls `createRoom` when you toggle *back* to online, and `createRoom` bumps `trackRoomCreated`. So an undecided host flipping the picker banks a fresh `created` each time. The honest summary is that `created` counts lobbies reached, not sittings played, and that is now what both comments say.

The stats page still gets one line, because someone wondering about room conversion opens it first and finds nothing: the funnel is collected but Console-only, plus the caveat and the toggle behaviour in brief.

Trimmed the new line once after seeing it at 320px, where it ran to eight centred lines. Dropped a spaced em dash out of it, and out of the pre-existing Ratings line in the same block while there. The block is now clean of them.

Verified on `localhost:64290` only, never the production hostname. `stats.html` reads analytics and writes none, so no counters moved. Notes block renders at 320px with no horizontal overflow, `scrollWidth` flat at 320. Two console errors in that tab were a stale buffer from an earlier draw page load; `stats.html` loads `shared/firebase.js`, `auth.js`, `auth-ui.js`, `chat.js` and `chat-support.js` and never touches `draw/app.js`.

Stamps: word v2026.08.17.9, draw v2026.08.17.13. `stats.html` has no stamp, being internal.

---

## 2026-08-17: Pass the Phone for the draw game

Epic #98, sub-issues #99–#104, branch `feat/draw-pass-the-phone`. The word game got Pass the Phone on 08-05; this brings the same mode to draw. Same assets, same visual design, same anti-peek rules on the card, and the mode picker, roster editor and back trap ported across largely unchanged.

The interesting half is what does not port.

### The phone goes round twice

The word game has nothing to do on the phone once the cards are dealt, so its round screen is a list of names and everybody talks. Draw has the canvas. So the sitting is two circuits: once for the cards, then once per drawing turn.

That second circuit has nothing to it. Done hands the pen straight to the next player, the pill changes to their name, and the phone goes across the table with the canvas already live. No screen in between and nothing to tap first.

It also has no clock. The first build put a handover screen in with a Start My Turn button, on the reasoning that a countdown started when the previous player tapped Done would burn down while the phone was still in the air. The simpler answer is that the countdown has no business existing here at all: online it is there so a player who closed their tab cannot stall the room forever, and nobody can vanish from a phone that is being handed round. So `meta.turnAt` stays null for the whole mode, the ticker never starts, and `renderTurnBar`'s existing `if (turnAt)` branch switches the timer, the tick and the urgency flash off by itself. The mute button is hidden too, since the tick was the only thing it muted.

Removing that screen cost one guard back. Online, Done stops being yours the instant the turn moves on. Locally the next drawer is the same device, so `canDraw()` goes true again immediately and a double tap would hand the pen straight past somebody, silently, with nobody the wiser until the reveal. A 350ms lockout covers it: long enough for a double tap, which lands inside 300ms, and no threat to a real second press, which needs the phone to change hands first. The first pass at this used 500ms and swallowed a legitimate tap in testing, which is how the number got measured rather than guessed.

Four smaller decisions, all of them about the difference between a private screen and a shared one:

**Turn order is the roster locally.** The room game shuffles it, and has to: the impostor is sliced off the front of a shuffle, so reusing that order would put them first every game. But a second independent shuffle is what fixes that, not the shuffle itself, and a shuffled order round a circle of people sitting together means someone announcing who is next before every single pass. Roster order sends the phone round the circle. It leaks nothing, because impostor selection never touches it.

**Rounds default to 1 locally, not 2.** Every turn is also a handover, so the same number is twice the sitting: five players at two rounds is ten turns and ten passes. The lobby stepper still goes to 5.

**The turn pill names the drawer.** Online it reads "Your turn" in green when the pen is yours. On a shared phone that is read by four people at once, and with no handover screen the pill is the only thing saying whose go it is. The name form already existed in `renderTurnBar` for spectators, so locally it is simply always used.

**The colours need a legend once drawing stops.** The turn strip is the only thing mapping ink to people, and it disappears with the play screen at exactly the moment the group starts asking whose line was whose. Both end screens now carry a list of players with their colour, in turn order so it reads in the order the picture was built. It is shaped like the online ballot but deliberately flatter, and deliberately not wearing the `.vote-row` class: `shared/press.js` targets that selector for tap feedback, so a row using it would light up under a thumb and do nothing, which reads as a vote that failed to register.

**No ballot.** A secret vote needs a screen each. Rounds over leads to a "Find the Impostor" screen carrying the finished drawing, which is the evidence the whole argument is about, and the group talks it out and taps Reveal. That is the dance game's ending, which exists for exactly this reason. The reveal screen's verdict, tally and ballot sections are hidden locally, since with no votes there is nothing to report and "They got away" would be a verdict on a vote nobody cast.

### The leak the test caught

The play screen prints the secret word at the foot of the canvas, "The word is Waffle", as a private reminder on your own phone. On a shared phone that line is face-up on the table for the whole group, and the impostor reads it the moment somebody else takes a turn. It would have handed away the entire game.

Nothing about the port introduced it; it is correct code that stops being correct when the screen stops being private, which is the whole hazard of this mode and the reason the word game's round screen is names and nothing else. Locally the line now reads "Draw what was on your card. Everyone can see this screen, so it stays off it." Players remember their card, the same as they would a physical one. `(You)` came off the turn strip for the same reason: `state.myId` is only ever whoever is holding the phone this turn.

### Done and Undo had the Pixel bug too

Building the flow with synthetic touch-only taps (pointerdown and pointerup, no `click`, which is what Android produces when the gesture pipeline swallows a tap) showed that **Done and Undo are tapped straight after drawing a stroke**, the same drag-then-tap sequence that lost taps on the word game's Pass button on 08-05. That is not new and not local-only: it has been live on the online draw path since the turn engine shipped, and simply was never reported.

So the word game's fix is generalised here into `wireTap(btn, fn)`, and every forward button in the mode goes through it: Pass to Next Player, Done, Undo and Reveal Impostor. None of them gets to be the odd one out that eats a tap. One addition over the original: it stamps a guard when it recognises a pointer tap and swallows the `click` that tap may still produce. The Pass button did not need that, because `advancePass()` shuts its own guard before returning, but Undo is not idempotent and one tap was removing two strokes.

### Verified

Served from `python3 scripts/dev-server.py` on localhost only, never the production hostname, so no analytics counters moved. Local mode writes nothing to Firebase at all: `state.roomCode` stays `null` and strokes never leave the `Map`.

- Full local sittings at three and four players: cards dealt correctly (the impostor got `YOUR HINT`, everyone else the word), back face blank between cards, the last card leading straight onto the live canvas, turns passing in roster order with the pill naming each player and no timer anywhere, ink colours per player on one canvas, reveal naming the right player and word, Play Again back to the lobby with the roster intact.
- A double tap on Done (two taps 120ms apart) advances exactly one player, not two.
- The ink legend on both end screens matches the turn strip's colours exactly, and its rows are inert `div`s rather than anything `press.js` will animate.
- The settings card at 246px for a host and 235px for a player, with the whole lobby (settings, roster, Add player, Start) fitting one 812px screen without scrolling. Category picker still opens for the host and stays shut for a player, whose chevrons and steppers are gone. Longest summary "Food, Animals +2" fits unclipped at both 375px and 320px.
- At the 20-player maximum the legend does not push Reveal or Play Again off screen: both stay pinned and visible unscrolled, with the list scrolling behind them. Checked down to a 320x568 viewport with a 13-character name, with no horizontal overflow and the colour dot still inside the row.
- Every Pass, Done, Undo and Reveal driven by touch taps carrying **no click at all**, which is the Android case the old handlers were blind to.
- Undo removes exactly one stroke, and is disabled at the start of a turn so nobody can erase the previous player's work.
- Round two opens on a genuinely empty canvas (0 non-transparent pixels).
- Back is trapped through the sitting; `history.length` flat at 3 across a back press.
- Roster: delete disabled at 3 players, add works, rename via the pencil sticks and re-renders.
- **A full pre-deploy pass on all three games**, with every button driven by the touch model above: draw's Pass the Phone over two rounds (cards, six turns in roster order, the round counter, rounds-over, reveal, Play Again, roster intact); word's Pass the Phone end to end; dance's lobby across Imposter Challenge, DJ Mode and Find Your Squad, with the pickers swapping in and the dividers flush in each. No console errors anywhere.
- **No online regression**, checked with a real 3-tab room played all the way through to the reveal: turn order still shuffled, `(You)` still present, the word hint still shown, strokes still syncing between clients, Done still advancing the turn, and the reveal still carrying its verdict, tally and ballot with the new legend correctly hidden.
- The word game's card still renders correctly after its CSS moved to `shared/base.css`, with `padding: 28px` and the `rotateY(180deg)` both intact.

### The settings card was over half the screen

Measured at 415px on a 375x812 phone, before the player list even started. Three settings, each with an uppercase heading, a full-size control and, for two of them, a line of prose underneath.

Three layouts were mocked up against the real stylesheets and measured rather than eyeballed. The one shipped keeps the game mode exactly as it was, with its heading and its full-size trigger, and turns category and rounds into single rows: what it is on the left, what it is set to on the right. **246px**, so 169px back.

The hierarchy is the point, not just the height. Mode is the decision that changes what the whole sitting is, and the only one of the three a host might not know exists. Category and rounds are adjustments made in passing, and they were each paying for a heading, a full-width control and a line explaining a rule the control already stated.

Two things fell out of it:

- **`.settings-compact` is gone.** It existed to collapse this card for players, who cannot change anything on it. The card is now that compact for everybody, so a player just loses the chevrons and the steppers and keeps the same shape.
- **`.readonly` finally does something.** The class was already being applied to the mode trigger for players and had no styles anywhere behind it, so a player saw a control that looked tappable and did nothing. It now drops the chevron and the tap affordance, and the category row's click handler grew the host guard it needs now that the row stays on screen for players.

At 320px, four categories summarise to "Food, Animals +2" and that does not fit beside a "CATEGORY" label — it would ellipsise away the "+2", which is the part saying how many were left out. A narrow-width media query tightens the label's tracking, the gaps and the card padding to buy back the 33px, and leaves everything at 361px and up alone.

### The lobby header, and tightening the mode block

Two follow-ons once the card was compact.

The draw lobby's header overlapped its own room code at 320px, by 64px. Pre-existing, confirmed against the branch baseline rather than assumed. The cause is that the shared `.lobby-head-icon` rule sizes by height alone, and this game's character is the widest of the three: 441x326 renders 76px across at 56px tall, pushing "Lobby" under the chip.

Capping the width to 56px fixes most of it, but `max-width` alone would have squashed the art, since the height stays pinned at 56px and the ratio is forced from 1.353 to 1.000. `object-fit: contain` letterboxes it instead. Draw-only, matching the note already in dance.css: word's icon is square so a shared cap would do nothing for it, and dance's 356x370 character would quietly narrow.

That still left 34px at 320px, because the overlap is structural rather than a sizing accident: the title needs 140px and the code chip plus its QR button another 167px, against 272px of usable width. No icon is small enough to close 35px. Below 361px the header now wraps, putting the code on its own line, which costs one row of height on the narrowest phones and nothing at 375px and up, where the two still sit side by side with 25px between them.

The mode block was then pulled in to sit with the rows rather than float above them: 6px under the heading instead of 12, and 10px beneath the trigger instead of 16. Both halves of that first gap had to be set, because adjacent margins collapse to the larger of the two and `.cat-label` carries a 12px `margin-bottom` of its own, so trimming only the trigger's `margin-top` would have changed nothing. Card down to **230px**, from 415px where this started.

### The same card, in all three games

The compact card was then taken to word and dance, and the shared parts moved into `shared/base.css` as `.settings-card`, `.mode-block`, `.set-row` and `.set-row-value`. Draw's private copies went with them, along with its `.setting-split`, which is just `.section-divider` under another name.

Word is a straight port: mode block, then the category as a row, and "Host picks the theme." dropped.

Dance needed thought, because its music section is not always one value. In DJ Mode the host picks two named tracks, and a title plus artist has nowhere to go on a right-aligned row — it would truncate exactly where it matters. So the row steps aside there and the two pickers keep their full width and their own heading.

Three things surfaced doing it:

- **`.mode-card` and `.mode-music-card` are flex columns with a 16px gap**, which pushed the rows away from the rules they are meant to sit flush against. Draw's card is a plain block, so this only appeared once word was converted. `.settings-card` now sets `gap: 0`.
- **Dance's `.compact` player card is gone**, the same as draw's `.settings-compact`. Both existed to collapse the card for players; the card is that compact for everyone now, so a player just loses the chevrons. In DJ Mode the player's row reads "Host's Choice" rather than naming the track, which is the one thing that variant was still carrying.
- **`.readonly` was only ever styled in dance.** Word and draw both applied the class to their mode trigger with nothing behind it anywhere, so a player saw a control that looked tappable and did nothing. The rule is shared now, and dance's copy deleted. `.cat-display` went with it: all three used it to show a player static text in place of the host's trigger, and the rows show the same value to both.

### Reveal Impostor sent people back to the lobby

Reported from a real phone: tapping Reveal Impostor showed press feedback and then landed on the lobby. "Very rarely the screen with the imposter name comes up."

`wireTap` acts on `pointerup`, so the screen changes before the browser gets round to dispatching the `click` for that same physical tap. The click then lands on whatever is under the finger by then. Reveal Impostor and Play Again both sit in the sticky bar at the foot of consecutive screens, so the click aimed at Reveal arrived on Play Again and restarted the round. Measured: the Reveal tap point at 375x812 is (188, 538), and Play Again on the screen that replaces it spans 492 to 546. A direct hit.

The per-button guard could never have caught it, because the click was landing on a *different button*. So a tap that has been acted on now swallows its click wherever it lands, on `document` in the capture phase, one-shot, within 500ms.

Instrumenting the whole flow showed a second instance of the same fault that nobody had reported: the "Start Drawing" tap on the last card was aiming its click at Done on the play screen, which would have skipped the first player's turn outright. Both are closed by the one fix.

Worth stating plainly, because it shaped how long this took to find: **every test up to this point used synthetic pointer events**, which never produce the trailing click at all, so the bug was invisible to the whole suite. The reproduction had to model what touch actually does, which is pointerdown, pointerup, then a click aimed at whatever `elementFromPoint` returns a beat later. The browser tool's real click and drag both timed out this session, so that model is now the standard for these buttons.

Verified after the fix: the Reveal tap's stray click is still aimed at Play Again and is now harmless; a deliberate Play Again tap afterwards still works; Undo still removes exactly one stroke; a keyboard click with `detail: 0` still advances the turn.

Word's reveal uses a plain `click` handler, so its action runs at click time and nothing trails it. But word's **Pass to Next Player** is pointerup-driven like draw's, and its last card leads to a screen whose Reveal button sits in the same region. Measured in situ: the Start Playing tap point clears that button by 7px at 812 tall and 14px at 600. It misses, so this was never a live bug, but 7px is not a margin to trust across real phones and the cost of it landing is the whole round revealed the instant the last card is passed. The same swallow is now in word.

### Known, not fixed: the lobby header at 320px

The draw lobby's header overlapped its own room code at 320px, and that was fixed here by wrapping the header below 361px. **Word and dance still do it**, by about 34px each. It is pre-existing in both, unrelated to Pass the Phone, and invisible at 375px and up. The fix is the same four lines of CSS moved from `draw.css` into `base.css`; it was left alone deliberately rather than reshaping two live games' headers in the same deploy as a new game mode.

### One trap left behind for next time

Moving `.flip-*` / `.pass-*` out of `word.css` into `shared/base.css` quietly broke the card, because both faces also carry a game-level class (`.card`, `.word-card`) defined in the per-game stylesheet, which loads *after* `base.css`. `.word-card`'s `padding: 104px 28px` started winning on the card's back face. Fixed by writing both faces with two class selectors (`.flip-face.flip-back`), which makes source order irrelevant, including inside the reduced-motion block, where the un-mirroring rule needs the same specificity to beat the `rotateY` above it.

**Deployed 2026-08-17**, hosting only: draw `v2026.08.17.12`, word `v2026.08.17.8`, dance `v2026.08.17.7`. Nothing in `database.rules.json` changed, so rules were not redeployed. Verified against production that all three stamps are live and that `swallowTapClick`, `startPassSequence` and `renderInkLegend` are in the served bundles, `.set-row` is in the served `base.css`, and `/icons/modes/passphone.webp` returns 200.

Note for reading the analytics: `/icons/**` carries a 7-day `max-age`, so a returning visitor may see the old mode thumbnails for up to a week. And unlike the word game's launch, no verification round was played on the production hostname, so the first `games/modes/passphone` under `analytics/draw` is a real player rather than a test.

---

## 2026-08-17: one line per card, so the hub says what the games are

Ticket #97. The three cards on the landing page were illustration, title, Play button. Every title starts with "Impostor", so the only thing distinguishing them above the fold was the artwork. The explanations existed, but in the `section.info` blocks below "About the games", which is a long scroll past all three cards, and which is written for search engines as much as for people. Someone choosing a game should not have to scroll past the choice to make it.

Each card now carries one line under the title.

### The verb is what tells them apart

The first draft had word and draw sharing a sentence, "Everyone gets the same word except the Impostor", which is true of both and therefore useless on either. Two of three cards claiming to be the same game is the exact confusion the line was added to remove.

The shipped copy keeps the parallel rhythm and lets the verb do the work:

- Dance: Everyone **dances** to the same song, except the impostor.
- Word: Everyone **describes** the same word, except the impostor.
- Draw: Everyone **draws** the same word, except the impostor.

Lowercase "impostor" mid-sentence, matching the body copy everywhere else. "Except the impostor" is a small simplification, since in word and draw the impostor does get a vague hint rather than nothing, but the meta description already says it this way and at six words the nuance is not worth the clause.

### It is a conversion change, not an SEO one

Worth being honest about in the record, because it is tempting to file this under SEO and then be disappointed. The home page already carries all three mechanics four times over: the meta description, the three `Game` schema `description` fields, the three `section.info` paragraphs, and the FAQ entry comparing the games. Twenty-four more words add no keyword the page does not already hold.

The one search signal that genuinely changes is anchor text. The whole card is a single `<a>`, so the line counts toward the anchor for `/dance/`, `/word/` and `/draw/`. Those anchors go from roughly "Impostor Dance Game Play" to that plus a natural sentence containing the game's actual mechanic. Longer anchors dilute slightly, relevant words help slightly, and the net here points the right way. Nothing else moves: title, meta description and schema are all untouched, which also means this does not disturb the change-once-hold-two-weeks discipline on `/`.

`lastmod` for `/` moved to 2026-08-17. Visible descriptive copy is the kind of change that field is meant to represent, unlike the version-stamp bumps that do not qualify. The other five entries read 2026-08-16 while git says all five files were last touched on the 17th; that one-day understatement is noise and was left alone rather than turned into a second edit.

### The aria-label had been hiding the titles

Each card carried `aria-label="Play the Impostor Dance Game"` and so on. `aria-label` on a link replaces everything inside it, so screen reader users were hearing that string and never the `<h2>`. The new line would have vanished the same way. All three labels are deleted: the card's own text is more descriptive than the label ever was. No search impact, since Google only falls back to `aria-label` for anchor text when a link has no readable text.

### Two details to know before changing this again

The gap under the `h2` moved below the blurb rather than being added to it. If the blurb is ever removed, that margin has to go back onto the `h2` or the Play button jumps up against the title.

Title and blurb are left-aligned inside a card that is still `text-align: center`, so the artwork above and the Play button below stay centred and only the text block moves. Three alignments in one card is unusual, and it works here because the left-aligned pair reads as a caption under the illustration. `--ink-soft` on white measures about 3.97:1, under the 4.5:1 that normal text wants. That is the token's existing behaviour everywhere secondary text appears on this site, so the blurb follows the convention rather than inventing a one-off colour. If the palette is ever revisited, this is one of the places that gets better.

### The card got shorter, not taller

The second pass shrank the title from 28px to 24px, tightened both text margins, took the artwork to 75% width and cut the card's bottom padding from 36px to 28px. Net effect on mobile is a card of 353px against 408px before any of this started, so the hub gained a description per game *and* got about 13% shorter. All three cards are now exactly the same height, which they were not before: at 28px two of the three titles wrapped to a second line and one did not.

24px is not the first number that was tried. 14px was, and it put the title *below* the blurb's 15px, so the description became the loudest thing in the card and the game's name read as small print under the artwork. Worth remembering the general shape of that: the blurb sets a floor for the title, not the other way round.

The uniform height survives every common phone width. At 360px the longest title, "Impostor Dance Game" at 249px, has 19px of room; at 320px all three wrap together, so the cards stay level. There is roughly an 8px band around 333 to 341px viewport width where dance wraps and the other two do not, and no real device sits in it.

The bottom padding is the one number here that is not free. At 28px the Play button sits 29px off the card's bottom edge while the artwork sits 24px off the top, so the card is very slightly bottom-heavy by design, which is what keeps the button from looking like it is falling out. Going much below 28px starts to read as a mistake rather than as tight.

The artwork change is mobile-only. `.art` keeps `max-width: 320px`, and on desktop the frame is wide enough that both 100% and 75% resolve past that cap, so the rendered width is 320px either way. Only narrow viewports, where the percentage lands under the cap, actually see a smaller illustration. Lowering the cap is the lever if desktop ever needs to shrink too.

This one is hub-only. `www/index.html` carries its own inline CSS and does not load `shared/base.css`, so there is no second copy of `.blurb` to keep in sync, unlike `.more-reading`.

### Verifying a hub deploy in a browser costs you a visit

Found while checking this one live. `www/index.html` calls `analytics.trackSession('imp_hub_sess')` on load, so pointing a real browser at `impostorgames.com` to eyeball a deploy increments `analytics/hub/visits` exactly as a stranger would. The rule we already had, never run a test *round* on prod, turns out to be the narrow version of a broader one: never *load* prod to check your own work.

So post-deploy verification of markup goes through `curl`, which runs no JavaScript and therefore fires no counter, and the visual check happens on localhost against the same file. That is how this deploy was verified: twelve routes for status, `curl` for the version stamp, the three blurbs, the absent `aria-label`s and the live `lastmod`, and localhost for the screenshots. Same applies to each game's own `visits` counter.

Shipped as merge `74bbefd`, `v2026.08.17.7`, 2 files uploaded. The game pages stayed at `v2026.08.17.3` and the two content pages at `v2026.08.16.3`, confirmed live, which is what you want to see: this change touched one page.

---

## 2026-08-17: the content links get a heading, because nobody was going to find them

Yesterday's `.more-reading` block shipped as one quiet 13.5px line in `--ink-faint`, and the comment in `base.css` justified it as "a footer note, not a call to action competing with Create and Join". Read again a day later, that reasoning does not survive contact with where the thing actually sits. It is below the FAQ, at the very bottom of the screen, past everything. There is nothing left down there to compete with. The links were quiet for no benefit, and a link nobody notices is worth roughly what no link is worth.

It now gets its own heading and reads as a sibling of the FAQ above it.

### Not a copy of the FAQ card

The obvious move was to reuse `.faq-item`, and it is wrong. That card's chevron rotates on `[open]`, which is a promise that tapping expands something in place. These links navigate away. Same visual, different behaviour, is how you teach people to distrust a control. The block is a plain `<ul>` instead: heading, then two links, nothing pretending to be a disclosure widget.

The heading reuses `.howto-header` outright, so "More to read" is set in the same 38px Literata as "FAQ" directly above it. `.more-reading-header` only carries the two margins.

### Headings differ per page on purpose

`/dance/`, `/word/` and `/draw/` say **More to read**. The hub says **Guides on Impostor Games**. Same block, different sentence, because the hub is a directory and a game page is somewhere you just finished reading. Forcing one string across both would have been tidier in the CSS and worse on the page.

On the hub this also moved the links out of the footer, where they had been crammed onto a third line under the game links, and into a real `section.info` above it. The footer is back to two lines.

### Two details worth keeping

**The tap target.** At 15.5px with 9px of vertical padding the link box measured 41px, under the 44px minimum, on pages that are almost entirely used on phones. 11px took it to 45px. Padding on the anchor rather than margin on the `<li>`, so the whole thing is hittable rather than just the glyphs. See the note at the end of this entry: the padding was later cut back and the box is now 35px.

**The hub restates the CSS.** `www/index.html` does not load `shared/base.css`, so `.more-reading` exists twice, once in each. That is the trade this page already makes for everything else it styles, and it is noted here so the next person to touch one remembers to touch the other.

Content pages were left alone. `/party-games/` and `/games-like-among-us/` already link to each other in body copy and in their own footers, and they run on `page.css`, so this block would have needed a third implementation to solve a problem they do not have.

### Then the prose stopped being centred, everywhere

Same day, second pass. Every long paragraph on the site was centre-aligned, which is the default a landing page drifts into and the wrong setting for anything longer than a line or two: centred text moves the left edge on every line, so the eye has to hunt for where the next one starts. At 432px of usable width the "What is the Imposter Dance Challenge?" paragraph runs to eleven lines with eleven different starting positions.

Now left-aligned on both surfaces. Game pages: `.howto-header` (which carries "How to Play", "FAQ" and "More to read"), `.howto-def`, and the guides list. Hub: `section.info h2`, `p.def`, the "Play the Impostor X Game" links, and the same list.

**What deliberately stayed centred**, because these are labels rather than reading: the "ABOUT THE GAMES" eyebrow, the "Create or Join the game" eyebrow, the hero title and its tagline, and `.howto-cta`, which is a standalone button and conventionally centred.

Checked before changing anything that `.howto-header` and `.howto-def` appear only inside `<section class="how-to-play">` on all three games. They do, so no game screen could be caught by this.

### The links are set as prose now

Was Inter 15.5px semibold with a faint underline, which read as navigation. Now Literata regular with the 2px teal underline that `page.css` gives body links on the content pages, so a link is set like the page it leads to. Horizontal padding dropped to zero so the text sits flush with the heading's left edge.

Shipped at **18px with 4px of vertical padding**, tightened from 17px and 11px on review. The tighter setting reads as a list inside an article rather than as spaced-out navigation, which is the right call for what this block is.

**The cost, recorded so it is not rediscovered as a mystery.** 4px takes the link box to 35px, under the 44px tap-target minimum, and the list `gap` of 2px leaves the two boxes nearly touching. A low tap on the first link can land on the second. Accepted deliberately for the typography. If it proves annoying in use, raising the `gap` to 8px separates them without touching the type; that is the fix to reach for, not more padding, which would undo the look.

Verified in the browser on all four pages at 375px and again on production after deploy: headings and links share a left edge at 24px, the eyebrows are still centred, and there are no console errors.

### IndexNow had not been pinged, for any of it

Worth recording because it went unnoticed across four deploys in one day. `scripts/indexnow-ping.mjs` is a **manual** step, documented in its own header as something to run right after `firebase deploy`. The key file at `www/bdb6e922c549db6b9fb7aee008298985.txt` only proves ownership to the API; it does not submit anything on its own. Nothing in the deploy path calls the script.

So while `/party-games/` and `/games-like-among-us/` had been live since 2026-08-16 and sat in the sitemap, Bing had never been told about either. Pinged on 2026-08-17: the two content pages, then `/` separately, all HTTP 200. The homepage submission is doing double duty, since a homepage re-crawl is also what prompts Bing to re-fetch site-level assets like the favicon, which is still showing as a generic globe in Bing results.

The favicon itself was checked and is not the problem: `/favicon.ico` serves as `image/x-icon` with `public, max-age=604800`, contains 16, 32 and 48px PNGs, is linked from all six pages, and fetches fine as bingbot. Nothing to fix in the repo. One genuine but separate observation: at the 16px a result actually renders, the icon is a pale cream character on a pale ground, so even once Bing picks it up it will read faint against a white SERP. That is a design ticket, not an indexing bug.

`SEO.md` already described the ping accurately. The gap was in the deploy habit, not the docs.

### If you change this block again, change it twice

`www/index.html` does not load `shared/base.css`. It carries its own inline `<style>`, so `.more-reading` exists in two places and they have to be edited together or the hub silently drifts from the game pages. This caught nothing this time only because it was known going in.

---

## 2026-08-16: /party-games/, and the game pages stop being dead ends

GEO 6/12 (#80). The awareness-stage question the audit showed us losing outright was "what are free online party games you can play with friends without downloading anything", and we lost it mechanically rather than on ranking: the sitemap held four URLs and all four were "here is a game, play it". Nothing to rank. This is the page that answers the question.

Second on the site to use `shared/page.css`, which is exactly what it was built for, so this took a fraction of the time #83 did. The ticket's Style section still said to build on `shared/base.css`; that predates the content-page split and is now wrong, since base.css sets `overflow: hidden`, `height: 100%` and `user-select: none` on html and body.

### A four-column table is not a two-column table with more columns

The comparison table here holds all three games, and dropping it in at the existing `min-width: 34rem` produced something unreadable. At 544px with a 34% row-label column, each data cell got roughly 120px, so "A first game, or a group sitting round a table" wrapped into six lines and the row grew to match. Technically it scrolled and technically nothing overflowed. It was still bad.

Two changes, and both were needed. A `table.cols-4` modifier takes min-width to 40rem and the row label down to 22%, and the cell copy was cut hard: "Groups who want something to look at" became "Something to look at", "Longest, set by the host at 1 to 5 rounds" became "Longest, 1 to 5 rounds". Tallest cell went from six lines to 73px. The lesson worth keeping is the copy one rather than the CSS one: a table is scanned, not read, and prose in a cell is a sign the fact belongs in a paragraph instead.

### Every game page had exactly one internal link, and now has three

This is the part with the widest blast radius, so it is worth being precise. `www/dance`, `www/word` and `www/draw` each carried a single `href="/"` back-button and nothing else. The three games did not link to each other, and after #83 shipped, `/games-like-among-us/` was reachable only from the hub footer.

Each game page now carries a `.more-reading` line under its FAQ, pointing at `/party-games/` and `/games-like-among-us/`. The rule lives in `shared/base.css` next to `.faq-item`, and it is deliberately quiet: 13.5px, `--ink-faint`, centred, sitting below the fold at the bottom of the home screen. It is a footer note, not a call to action competing with Create and Join. `Among&nbsp;Us` is bound here too, since at 375px the line otherwise orphans "Us".

Inserted by script against the anchor `</div>\n      </section>` that closes each FAQ list, with a guard that skipped any file where that anchor did not appear exactly once. All three matched once. Worth doing that way rather than by hand: the same edit applied three times by hand is where a stray paste ends up in the wrong screen.

Note this overlaps #84, which covers cross-linking and BreadcrumbList properly. What is here is game pages to content pages. Game-to-game linking and the schema are still #84's, and the `.more-reading` block is built to be extended rather than replaced.

### Link graph as it now stands

Home links to both content pages. Both content pages link to each other and to all three games. All three games link to both content pages and to the hub. `/games-like-among-us/` also gained an in-body link to `/party-games/`, which finally satisfies the condition #83 shipped without and which the home-footer link was standing in for.

Sitemap is at six URLs, `/party-games/` at priority 0.8 above the 0.7 of the comparison page. Both content pages are in `llms.txt`. Every page on the site now carries the same version stamp, `v2026.08.16.3`, which is unusual here and only happened because this touched all six.

FAQ was written visible-first again, and verified after the fact: seven questions and seven answers matching byte for byte across both surfaces, same as #83.

### Follow-up: the sitemap disagreed with the repo

Caught just after deploying. The two new URLs went in with the right `lastmod`, but the three game pages kept theirs from the last time their copy changed, 2026-08-10 for dance and word and 2026-08-12 for draw. They had in fact changed that day, so the sitemap was telling crawlers there was nothing new on the exact three pages that had just gained outbound links. Corrected all three to 2026-08-16.

Then the same mistake again, one deploy later: the home page had gained both content links in its footer and was still stamped 2026-07-28, three weeks stale. The first pass checked the three pages that had been discussed and not the one file that had changed in both commits. Corrected to 2026-08-16 with the rest.

Small, and worth writing down only for the rule behind it. `lastmod` is for meaningful change, and Google ignores the field entirely on sites that bump it for trivial edits, so the question was whether one new paragraph counts. It does here, because that paragraph is the new internal links and a re-crawl is precisely what they need. A whitespace or version-stamp change would not have, which is the line to hold next time.

No version stamp bump went with this one. Every page already reads `v2026.08.16.3`, and touching six HTML files to re-stamp them for a three-line change to a file users never see would have been worse than the inconsistency it fixed.

---

## 2026-08-16: the first page on this site that is not an app

`/games-like-among-us/` is GEO 9/12 (#83), and it targets the highest-intent prompt the audit showed us losing: someone wanting a game for six friends tonight, no accounts, no installs, something like Among Us but simpler. Every word of that describes what we built, and we lost it purely because no page of ours said so.

We briefly considered writing it as a "social deduction games" page instead, on the grounds that this is the correct genre name and does not age with one product's popularity. Decided against. "Social deduction" is what reviewers and designers call it; the person with six friends arriving types "games like Among Us". The compromise is that the page is titled and routed for the phrase people search, and written in social-deduction vocabulary throughout, so engines still learn the category label from the body. Broad category coverage belongs to `/party-games/` (#80) rather than here, and two pages competing over the same ground would only split the signal.

### It needed a stylesheet, because everything here is an app

All four existing pages are applications. `shared/base.css` reflects that: `overflow: hidden` and `height: 100%` on html and body, `user-select: none`, and a flex `#app` that fills the viewport. Every one of those is correct for a game screen and wrong for something you scroll and read, so the new page does not load it at all.

`www/shared/page.css` is standalone instead, repeating the design tokens rather than importing them. That is the same trade the home page already makes with its inline block, and it is the right one here: importing would have meant unpicking the app rules afterwards, which is more fragile than restating thirty lines of custom properties. Three more content pages are planned (#80, #81, #82), so this was worth building once properly rather than inlining four times and reconciling later.

Typography follows long-form reading practice rather than the app's UI scale. Literata carries the body, not just the headings, which is what it was designed for; Inter stays for the interface furniture, table headers, FAQ summaries, the game picker. Body is 20px at a 1.65 line height on a 42rem measure, which lands around 70 characters. Headings use `clamp()` rather than breakpoints so there is no width where the h1 sits awkwardly between two sizes, and heading margins are deliberately asymmetric, far from the section above and close to their own paragraph, because a heading belongs to what follows it.

### Two things caught in the browser rather than in review

**The h1 broke the product name.** At 375px, "Games like Among Us you can play in a browser" wrapped as "Games like Among / Us you can play", splitting Among Us across two lines. It reads as a typo. `text-wrap: balance` does not help, because balancing line lengths is not the same as keeping a noun phrase intact. Fixed with `Among&nbsp;Us`, the same technique used on the home page tagline for "No app" and "no account".

**The table caption was unreadable exactly where it mattered.** The comparison table sits in an `overflow-x: auto` box so a phone scrolls the table instead of the page. A `<caption>` inherits the table's `min-width`, so the source line stating where the Among Us figures came from was clipped mid-sentence on mobile. Moved out of the table into a sibling paragraph, tied back with `aria-describedby` so screen readers still associate it. Worth noting for the next content page: anything inside a horizontal scroll container inherits its width, captions included.

### Competitor claims were verified, not remembered

The ticket's hard rule is no fabricated claims about other games, and it matters more than usual here: once an engine has better sources than us, a page that misrepresented a competitor is actively harmful to how we get described. So the Among Us figures come from primary sources checked on the day. Player count 4 to 15 and cross-platform multiplayer from the official Steam store listing; free on iOS confirmed from the App Store listing's price field; $4.99 on Steam confirmed through Steam's own appdetails API.

The exact prices are deliberately **not** on the page. They go stale and a stale price is worse than none, so the table says "free on phones, paid on PC and consoles" and a dated source line sits underneath. The other games named (Spyfall, Fake Artist, Undercover, Werewolf) are described as formats rather than products, which avoids making claims about anybody's current release.

### The FAQ was built visible-first on purpose

The home page currently declares nine FAQ questions in its markup and shows seven, which is the open bug in #89 and a real risk to the rich result, since Google requires FAQ markup to describe content on the page. So here the visible `<details>` list came first and the JSON-LD was generated from it. Verified after the fact: six questions and six answers, matching byte for byte on both surfaces.

### The title breaks a house rule on purpose

Titles on this site lead with "Imposter" (e spelling), because that is what roughly 80% of real queries type. Applied here it produced "Games Like Imposter Among Us", which nobody says out loud, and at 64 characters it would have been clipped anyway. The rule exists to catch imposter queries, and the query this page is built for is "games like among us", so the rule does not apply. Title is now "3 Free Games Like Among Us, No Download | Impostor Games" at 56 characters, brand kept, and deliberately not identical to the h1.

The h1 gained a count and a price signal: "3 Free Games Like Among Us You Can Play in a Browser". Measured before and after at 375px, it is three lines and 111px tall either way, so the longer heading costs nothing. `Among&nbsp;Us` stays bound. One known soft spot: the phrasing can momentarily read as three *other* people's games rather than ours, which the answer box directly underneath resolves in a sentence.

Meta description reworked to open on the friction rather than the feature ("Looking for games like Among Us without the setup?"), while keeping the two facts that beat Among Us on its own terms: 3 to 20 players against its 4 to 15, and no download at all against a download on every platform. 151 characters. Worth restating, since it comes up every time: this affects the snippet and click-through only, not ranking.

### Not yet an orphan, but only just

The ticket's completion condition says the page should be linked from `/party-games/`, which does not exist yet. Rather than build #80 first, the page is linked from the home page footer for now, and the ticket condition has been relaxed to match. This matters more than it sounds: a page nothing links to indexes badly, and the site already has that problem everywhere (#84 exists because each game page carries exactly one internal link). When #80 lands, the `/party-games/` link gets added and this becomes a properly connected page rather than a footer entry.

Also added to `www/sitemap.xml` and to the Pages block in `www/llms.txt`. Deploy and both console indexing requests are still manual, and the change-once-hold-2-3-weeks rule applies from the day it goes live.

---

## 2026-08-16: itch.io was ranked first on a wrong premise

The off-site citation plan led with an itch.io listing, described as free, indexed hard by Google and Bing, and the highest single item on the list. Two of those three claims did not survive being checked, so the order in `GEO.md` and in the epic's first ticket has changed.

Fetching a live itch.io game page and reading the markup settles the ranking question. Every external link on it carries `rel="nofollow noopener"`, without exception: description body, sidebar links, author links. No PageRank reaches us from anywhere on that domain. "Indexed hard by Google" was true of itch.io's own pages and irrelevant to what we get out of them.

The cheap version of the target turns out not to exist either. The obvious plan, a listing page that points visitors at impostorgames.com, is covered by two of their quality guidelines, "Avoid only uploading keys or links to other stores" and "Prefer uploading your files directly to itch.io". Pages judged to detract from browsing get restricted, which in their wording means the page stays reachable by direct URL but is not shown on itch.io listings. A page nobody browses to is not a citation source. So itch.io means uploading a real playable build or skipping it.

The third problem is the one no amount of implementation fixes. itch.io browsing skews to one person on a desktop looking for something to play alone, and this is a 3-to-20-player game where everyone needs their own phone in the same room. The median visitor cannot play it even if the listing is perfect.

### It stays on the list, fifth, and stops gating the ticket

The citation value is still real, and an itch.io page is durable in a way a Reddit thread is not. What changed is the position and, more usefully, that a live itch.io listing is no longer one of the ticket's completion conditions. Gating the whole off-site effort on its most expensive item is what left the cheap wins sitting untouched.

LinkedIn is now first, on the grounds that it is already controlled, takes about five minutes, and is the blocker on the `sameAs` ticket, which has been waiting on nothing but the profile URL. Then Reddit, whose readers are at least people who might play, then the "alternatives" listicles that engines actually quote when asked for alternatives.

### What was worth writing down before it got re-derived

If we do build the itch listing, the research is now in the ticket rather than in a chat log. Upload draw rather than dance or word, because it needs no music API and no headphones and it screenshots well. The port is small: `www/draw/index.html` already references its CSS and JS relatively, so only about ten absolute paths need rewriting, all icons, manifest and images. Keep the existing canonical tag pointing at `https://impostorgames.com/draw/`, so the itch copy reads as a duplicate of ours and consolidates rather than competes. And `SHARE_BASE` at `www/draw/app.js:58` is already hardcoded to our domain, so a room started on itch.io hands out a QR and join link pointing at impostorgames.com. The shop window is theirs and the joiners are ours.

The trap worth remembering is that itch.io hosts its own copy and it does not change when we deploy. Both copies would talk to the same RTDB, so a stale itch build and a current site build can end up in one room together, and any change to round or protocol logic then breaks only for that mixed pairing. That is the argument for `scripts/build-itch.mjs` plus `butler push` over a hand-made zip, since the manual step is the one that gets skipped. A proper fix, a build-stamp check on load that prompts a refresh when the client is too old, would be separate work and its own ticket.

---

## 2026-08-14: the feedback form becomes a conversation

Players could always send a message. They could never get an answer. "Got feedback? Let us know" wrote one record into `feedback/{game}`, which is `.read: false`, so the only way to read it was the Firebase Console and there was nowhere for a reply to go. A bug report that needed one clarifying question was a dead end. This replaces that form with a two-way thread: a sticky button bottom right on the hub, the same quiet link on the three game home screens, and an inbox on the stats page.

### The stats page had no lock on it, and now it needs one

`www/stats.html` has never had any authentication. It carries `noindex, nofollow` and nothing else, so anyone who knows the URL can open it. That was fine for as long as it only read `analytics`, which is world-readable and holds nothing but counts. It stops being fine the moment the same page lists messages people wrote.

So the lock went into `database.rules.json`, not into the page. Reading `chats/` requires being signed in as the developer. The page does not check an email address anywhere; it asks for the data and renders the sign-in prompt if the database refuses. One source of truth for who may read messages, and it is the one that is actually enforced. Hiding a `<div>` behind an `onAuthChange` check would have protected nothing, because the data is one console call away on a page that anybody can load.

### A thread nobody signs in for

Anonymous auth is deliberately off, and putting a sign-in wall in front of a bug report would have ended the feature before it started. So a thread is addressed by a `crypto.randomUUID()` the browser keeps in `localStorage` and nowhere else. The rules grant read and write on `chats/$tid` to anyone holding the id. This is the same capability model as `rooms/$code`, with 122 bits instead of 4 characters.

`.read: true` on `$tid` is deliberate and needs to stay. Without it the visitor can never see the reply, which is the entire point. The comment above it in the rules file says so, because it looks exactly like the kind of thing a future reader tidies up.

**No email address is asked for, anywhere.** The old form had an optional "only if you'd like a reply" field, which existed because a one-way form had no other way to answer anybody. A thread does, so the field bought nothing and cost a piece of personal data to look after. It is not merely hidden: there is no input, no `localStorage` key, nothing written to `meta`, and `meta` is a closed whitelist in the rules, so a thread cannot hold an address even if a client tried to write one. That whitelist also stops anyone using someone else's thread id as free storage.

**What the rules deliberately do not defend against.** Someone holding a thread id can write `from: 'dev'` into their own thread. The only person fooled is them. They can also delete their own thread. Neither is worth code. What is blocked: a forged timestamp (`ts` must equal the server's `now`), a body over 1000 characters, and any key outside `meta` and `messages`. Rate limiting is not expressible in these rules at all, which is why the client carries a 3 second cooldown and a 30 per day cap, and why `purge-idle-rooms.mjs --chats` exists to sweep up whatever gets through.

**Read markers are asymmetric on purpose.** The visitor's lives in `localStorage`, because "have I seen this" is per device by definition and writing it to the database would be a round trip that buys nothing. The developer's lives in `meta/devSeenAt`, because the inbox gets opened from more than one machine.

### The greeting arrives, it is not already there

Opening the panel gives you a beat of empty thread, then typing dots, then the message: roughly 300ms to the dots and 950ms more to the bubble. The point is that a greeting sitting in the DOM before you opened anything reads as a sign, whereas one that turns up reads as a person.

**The greeting has a reserved slot rather than being appended late.** History can land from the database while the dots are still up, and a greeting appended after that would file itself underneath messages it is meant to introduce. So `.chat-opener-slot` goes into the list at mount time and stays empty until the greeting fills it, which fixes the order regardless of what wins the race.

**A thread with history skips the performance entirely.** Dots that "type" ahead of a conversation from last week would be a straightforward lie about what is happening, so the first delivery of any real message settles the greeting instantly. It also runs once per page load rather than once per open, because watching the same greeting be typed out a third time is exactly the tell that gives away that nobody is there.

**Messages that arrive while the panel is open animate; the backlog does not.** `firstBatch` marks the transport's first delivery as history, so opening a long thread does not become a wall of movement.

**Reduced motion gets the message and none of the theatre.** Both halves: the JS skips straight to the settled bubble, and the CSS cancels the animations. Implemented but not exercised, because the preview browser cannot be told to prefer reduced motion.

### Built as a transport, because room chat is next

`shared/chat.js` knows nothing about Firebase. It takes a `transport` with `subscribe`, `send`, `markSeen` and `close`, and a `me` value that decides which side of the thread a bubble sits on. `shared/chat-support.js` is the first implementation of that contract. Player to player chat inside a live room becomes a second one:

- path `rooms-{game}/{code}/chat/{pushId}` = `{ from: playerId, name, text, ts }`
- **no rules change**, because `rooms-draw/$code` is already `.read: true, .write: true`
- **no lifecycle work**, because the room's idle watchdog and this same purge script already delete the whole room subtree
- `me` becomes the local player id, and bubbles gain the name label the component already renders

What is left open for that build is product, not plumbing: which screens it appears on (chat during a round can leak who is floundering, whereas the vote screen is where the argument already happens), whether these games are moving toward remote play at all given all three are currently built around one group in one room, and moderation, which matters far more between strangers than in a thread with the developer.

### Two bugs found while building it

**A failed first send orphaned the thread.** `fresh` was computed as `!tid`, but the id is generated before the write and only persisted after it. So a first send that failed left an id in memory and nothing in `localStorage`; the retry then saw a truthy `tid`, concluded the thread was established, and never wrote the id down at all. Messages in the database that this browser could never find again. `fresh` now tracks whether the id has been *persisted*, not whether one exists. The generated id is reused on retry, so a flaky connection produces one thread rather than one per attempt.

**A failed send burned daily quota.** The counter incremented before the write. A write the database rejected costs no storage, so charging a dropped connection against someone's allowance punished the one case that is definitely not abuse. It now counts successes only.

### Rules deployed and the whole thing verified end to end

`firebase deploy --only database` on 2026-08-14. Hosting untouched, so nothing changed for anyone visiting the site: the live build still serves the old feedback form and contains no reference to `chats`.

**Nothing broke.** The diff against `main` was additions only, no existing rule modified, and eleven permission checks were run before and against after the deploy with identical results: rooms readable per code but denied at the tree root, all three room trees, analytics read and write, feedback write-only, users private. A copy of the previous rules was kept as a rollback and never needed.

**The round trip works.** A message sent through the real UI created the thread, persisted the id, counted quota and rendered. It appeared in the stats inbox with its unread dot, `1 new` badge and an `(1)` title prefix. A reply sent from the inbox arrived in the visitor's already-open panel **live, with no reload**, on the correct side and with the arrival animation. Opening the thread in the inbox cleared the badge through `meta/devSeenAt`.

**The validation rules were attacked, not just read.** Eight writes that should fail all failed: a client-supplied `ts`, a 1001 character body, `from: 'admin'`, an extra key on a message, an empty body, an email stashed in `meta`, junk stored under the thread root, and a thread id below the length floor. Both legitimate operations succeeded.

**Two behaviours that only show up in a real database.** Opening and closing the panel without sending leaves no thread, confirmed against a shallow read of `chats`. And the unread dot only proves anything when the reply lands while the visitor is genuinely gone: with the page open, the subscription marks messages seen as they render, so the test has to navigate away first, reply, then come back.

**One wrinkle found while cleaning up.** Deleting the test thread from the CLI left a fragment behind, because the inbox still had a live listener that rewrote `meta/devSeenAt` immediately after the delete. Close the inbox before deleting threads, or the delete races the read marker. Harmless, and the purge script sweeps up the remnant as an empty thread, but worth knowing before wondering why a deleted thread came back.

Related: a visitor whose thread was deleted still holds its id, so their next message recreates the thread without `meta/createdAt`. Nothing displays that field, so it costs nothing today.

Test data removed: the thread, and three probe values written into `rooms/ZZZZ`, `analytics/_probe` and `feedback/_probe`. `chats` is `null` and the purge dry run reports zero threads. Analytics counters never moved, because `analyticsEnabled()` is false off the production hostname.

### Post-launch: the keyboard gap on phones

Reported from a phone within an hour of launch: tapping the composer opened the keyboard, and a strip of the website showed through between the keyboard and the message box.

`position: fixed` anchors to the LAYOUT viewport, and opening a keyboard does not shrink that. Only the visual viewport shrinks. Safari then scrolls to reveal the focused input, which drags the whole fixed sheet upward and exposes the page in the strip it vacates. Nothing about the sheet was wrong; it was covering a viewport that no longer matched the screen.

The fix pins the backdrop to `window.visualViewport` while the panel is open, following its `resize` and `scroll` events, and hands the inline styles back to the stylesheet on close. On a desktop the two viewports are identical, so it writes the values the CSS already produced.

`inset: 0` has to be partly undone for this: setting width and height alone leaves `right` and `bottom` still pinned, and they fight the values being driven. Both go to `auto`.

**Verified as far as a desktop browser allows.** A software keyboard cannot be raised here, so the proxy was shrinking the window: the visual viewport going 835 to 420 fires the same `resize` event a keyboard does, and the backdrop tracked it exactly with zero gap below the composer. Whether a real iOS keyboard behaves identically is unproven, and the report came from a real phone, so it wants a real phone to confirm.

### Post-launch, second report: the gap was on the hub only, and a scrollbar

The keyboard gap survived the visual-viewport fix on Android. What settled it was asking for the same test on a game page, where it did not happen. The three game pages carry `interactive-widget=resizes-content` in their viewport meta and the hub never did, so on the hub Chrome left the layout viewport at full height and only shrank the visual one, which is exactly the condition the JS was left to compensate for. The flag makes the browser shrink the layout viewport itself and a fixed sheet simply fits. It is now on the hub and on `stats.html`, which opens the same sheet from the inbox.

Only `interactive-widget` was copied across, not the whole game-page meta: the games also set `maximum-scale=1.0, user-scalable=no`, and the hub is a content page that should stay pinch-zoomable.

The visual-viewport pinning in `chat.js` stays. It is what covers iOS, which ignores `interactive-widget` entirely. The two fixes address the same symptom on different browsers and neither replaces the other.

**The grey line beside the composer was a scrollbar**, on a single word of text. The field is `box-sizing: border-box` and `autoGrow()` handed `scrollHeight` back as the height, but `scrollHeight` covers content plus padding and not the border, leaving the field 2px short of its own content: `scrollHeight 42, clientHeight 40, overflowing true`. Desktop Chrome hides that behind overlay scrollbars, so it was invisible here and obvious on Android. Adding `offsetHeight - clientHeight` back fixes it, and a genuinely long message still scrolls at the 120px cap.

### The second pass: tabs, a pill, and the send icon

Everything below came after the first version worked end to end.

**Stats splits into Stats and Messages tabs**, with sign-in moved into the header beside Refresh (the shared account button the hub and games already mount). The tab bar renders only when signed in, so anyone else opening the URL sees what the page has always shown: numbers, and no hint an inbox exists. The choice is kept in the URL hash, so refreshing out of Messages does not drop you back on Stats.

**A bug the DOM check missed and a screenshot caught.** `.tabs` sets `display: flex`, which outranks the UA stylesheet's `[hidden] { display: none }`. The attribute was being set correctly and doing nothing, so the tab bar stayed visible while signed out. `hidden` is not reliable on anything with an explicit `display`; it needs a matching `[hidden]` rule. Worth remembering, because querying the DOM said it was hidden.

**The unread count is a filled pill**, not `(3)` in text. `min-width` equals the height so one digit is a true circle and longer counts grow sideways; past 99 it reads `99+`. The number also moves into the tab's `aria-label`, since a coloured circle means nothing to a screen reader.

**The send icon is filled and optically centred.** A right-pointing shape carries its mass in the wide tail with only a thin point reaching right, so it reads left of centre even when its bounding box does not: measured, the ink sat 2.66 units left in a 24 box. It cannot simply be shifted right, because the path already spans x=2..23 and anything past +1 has its tip clipped by the viewBox, which is why the larger nudges looked blunt rather than better. Scaling to 86% makes the room, then a translate does the centring. The applied correction is about two thirds of the measured offset, which is the usual range: full correction overshoots, because the eye tracks the point as well as the mass.

**The way in moved.** On the three games the quiet footer link is now a "Got feedback?" pill between the How to Play steps and the FAQ, styled as the hub's "New Game" flag. Two differences, because it is a control and not a badge: it is wired through `press.js` rather than `:active` alone, which mobile cancels the moment a finger drifts, and its hit area is grown past its visible size with an `::after`. The panel it opens is titled "Talk to creator".

### Things that will confuse someone later

**Two readers race over `devSeenAt`.** Deleting a thread while the inbox is open leaves a fragment behind: the inbox's live listener rewrites `meta/devSeenAt` immediately after the delete, and the thread appears to survive. Close the inbox first. The purge script sweeps the remnant as an empty thread either way.

**The unread badge only proves anything when nobody is reading.** While the inbox is open, opening a thread writes `devSeenAt`, so a second person testing in another window makes the count look broken when it is working exactly as specified. Check `meta` in the database before concluding the badge is wrong.

**Clearing `localStorage` mid-session does not start a new thread.** The transport reads the id once at construction, so it keeps writing to the old thread until the page reloads. Fine in reality, since storage gets cleared between page loads, but it will look like a bug in a test that clears storage on a live page.

**The preview browser serves stale ES modules.** A change to `shared/chat.js` appeared not to work at all while a cache-busted `fetch` of the same file showed the new source. A hard reload fixed it. Suspect the cache before the code when behaviour and source disagree.

### Odds and ends

**`.fb-field` and `.fb-title` outlived the form they were named for.** "fb" was short for feedback. The dance game's song picker and Song Group builder borrowed both classes, so they stay in `base.css` under a comment explaining the name is a leftover. `.fb-body`, `.fb-desc`, `.fb-label`, `.fb-send` and `textarea.fb-field` had no remaining users and are gone. Renaming the two survivors is a tidy-up of dance's markup, not part of this change.

**The emoji rating popup is untouched.** It still writes to `feedback/{game}`, and that node's rules are unchanged. It is a rating, not a conversation. Only its "Tell us more" link changed, and it now opens the chat panel.

**Chat CSS is one file, not two.** The hub does not load `base.css`, so the obvious move was a second copy inline. `shared/chat.css` linked from all four pages avoids that, and it only uses tokens that both the hub's inline `:root` and `base.css` define. Reach for one the hub lacks and it renders as an invalid value, which shows up as a black bubble rather than an error, so the file says so at the top.

**Chat counters sit in the inbox panel, not in a KPI tile.** Every tile in that grid is labelled with the chosen date range and these are all-time totals. The same number under a "last 30 days" heading would simply be wrong.

### Not done, and what is still unverified

**Everything except the hosting deploy is done and verified** (see the verification section above). What remains is `firebase deploy --only hosting`, which is what actually puts chat in front of visitors, and merging the branch.

Also left alone: the daily-round-trip cost of the inbox query, which pulls the full message body of up to 50 threads (if this ever gets busy the fix is to split `meta` into its own top-level node, not a bigger `limitToLast`); no notification of any kind beyond the badge and the title prefix, because there is no backend to send one; and the hub's inline `:root` is still a duplicate subset of `base.css`, which this change adds to rather than fixes.

---

## 2026-08-13: the three characters get smaller, centred, and a colour of their own

A tuning pass over the three home screens now that all of them have an animated character, plus a first shared token for the game names. No behaviour changed; this is layout and colour only.

**The characters shrank.** Word 150 to 115, dance 150 to 125, draw 175 to 150. They had each been sized alone, against the flat logo they replaced, and side by side they were louder than the page. The three numbers are not a single ratio because the three drawings fill their viewBoxes differently: the draw character shares its frame with an easel, so it needs more width to read at the same apparent size.

**Sizing the word hero means running the generator, not editing the CSS.** `www/word/word.css` is generated output. Changing `width` there gets silently overwritten the next time anyone runs the build; changing it in `scripts/build-word-hero.mjs` does nothing until the build is run. Both halves have to happen, in that order.

**And the generator's `--write` was broken from the day it shipped.** It locates the block it owns with two marker constants, and `END` was `'/* ---- The card every player sees'` while `word.css` actually says `/* The card every player sees` with no dashes. `indexOf` returned -1 every time and the script threw "refusing to guess". So the previous entry's instruction to re-run the generator pointed at something that could not run. Fixed. Re-verified: the regenerated file differs from the committed one by exactly the width line, and a second run is a no-op.

### The hero block is centred now, and the spacer is gone

The character and title used to hang from the top of `.home-fold` on a fixed `20px 0 36px` margin, with a `.home-fold-spacer` below them soaking up every pixel of slack. They now sit centred in the room between the topbar and the eyebrow:

```css
.home-fold > .logo { margin: auto 0; padding: 24px 24px 48px 24px; }
```

**The auto margins are the centring, and they only work because nothing else in the fold grows.** That is why `.home-fold-spacer` had to go rather than being left in place: a flex item with `flex: 1` consumes the free space during flex resolution, before auto margins ever get a chance at it, so the two mechanisms cannot coexist. Leaving the div behind with its flex neutralised would have meant an element that exists to do nothing, so it was removed from all three pages and its rule deleted.

**The bottom padding is deliberately heavier than the top.** It sits inside the centred box, which lifts the content 12px above true centre, where a heading block optically wants to be. It also keeps the title off the eyebrow on a short screen, where the auto margins collapse to zero and the padding is all that is left. Measured at 320x568: margins go to 0, and the floor holds at 36px above the character and 48px below the title with no overlap and no scrollbar.

**Scoped to `.home-fold >` on purpose.** `.logo` is not only the home hero. It is also the block on Game is on, Round Over, Setup Needed and the dance game's Find the Impostor. Those keep the original margins, verified by walking every screen in all three games.

### `--ink-warm`, the first token added since the system was extracted

```css
--ink-warm: #5c432c;
```

Placed in the `--ink` family rather than with the accents, because the families split by role: `--ink-*` is text, `--accent-*` is decorative hue. The existing ink modifiers are lightness steps (`soft`, `faint`) or context (`on-dark`), so `warm` reads as the hue variant without colliding with either. Applied through `.home-fold .logo h1`, so it colours the three game names and nothing else. Contrast against `--bg` is 8.64:1, past AAA with room to spare.

### Two things to know before touching this again

**The hub does not share the design system.** `www/index.html` carries its own `:root` block inline, a hand-copied subset of `base.css`: it has `--ink`, `--ink-soft`, `--ink-faint`, but not `--accent-orange`, `--accent-red`, `--accent-yellow`, `--radius`, `--ring-icon-bg` or `--ink-on-dark-soft`. Every token change therefore has to be made twice to stay in sync, and a new token does not reach the hub at all. This is why the hub's own "Impostor Games" title is still `--ink` while the three game names are brown.

**There are now two warm browns on the site.** `--ink-warm` is `#5c432c`; the hub's "New Game" pill hard-codes `#6b5334`, taken from the last entry of the draw game's `INK_COLORS` array in `www/draw/app.js`. They are never adjacent, so this is not a visible problem, but if they are ever unified the pill should move to the token rather than the reverse, since the token carries the heading role.

**Draw's character now clamps on narrow phones.** The 24px of horizontal padding on `.home-fold > .logo` narrows the box that `max-width: 64%` is a percentage of. Below roughly a 330px viewport the 150px width stops winning: at 320px the character renders 143px. Word and dance are immune, their `max-width: 56%` yielding 125px at that width, which is already at or above their pixel widths.

### Also in this pass

Hub spacing: the game-card art frame went from 18px of padding to 8px, and the card titles from `20px 0 24px` to `16px 0 20px`, giving the artwork more of the frame. The "New Game" pill still sits 12px inside the frame's top-right corner, because its offsets key off the card's 24px padding and not the frame's; it now overlaps the artwork's box but only empty background within it.

### Later the same day: the shadows finally match

The word and draw characters cast `#E29E49` at `fill-opacity="0.33"`, a warm amber; the dance character casts a solid `#E8E0D7`. Word and draw are now solid `#E8E0D7` too, so all three agree.

Dropping the opacity along with the hue is safe here and not a shortcut. The shadows sit directly on flat `--bg` with nothing behind them, so a translucent amber and the solid grey it composites to are the same pixels; keeping the alpha would only leave a second number that has to be right for the colour to look right.

Six files, because each character's artwork exists three times: the inlined hero in `word/index.html` and `draw/index.html`, the lobby icons `word-cards-blink.svg` and `draw-phone-blink.svg`, and the source drawings `Word.svg` and `Draw_phone.svg`. The source files are referenced by nothing (`Word.svg` appears only in a comment in `word.css`) but they are the master artwork, so letting them drift from what ships would mean the next person to regenerate an icon quietly reintroduces the amber.

**What confused this while diagnosing it:** the edit was already sitting unstaged in the working tree, so reading the files, and reading the local dev server, both showed all three already matching. Production did not. When a question is "why do these look different", the answer has to come from the deployed artefact or from `git show HEAD:`, not from the working copy.

**The shadows are still different sizes**, which is a separate thing and untouched: as a share of each character's width, dance is 60%, word 74%, and draw 91% (draw's is one two-lobed blob covering both the character and the easel). Same colour now, different footprint.

### Deliberately not done

- **The `.tile-icon` characters on Create and Join still cast amber shadows.** They are `host.webp` and `player.webp`, raster images, so matching them is a redraw and not a colour swap. This is visible: on every home screen the hero now casts grey while the two tile characters below it cast amber.
- **The hub title stays dark ink.** Colouring it means duplicating `--ink-warm` into the hub's inline `:root`, which deepens the copy-paste problem described above. The real fix is to make the hub load `base.css`, which is a bigger change than a colour tweak.
- `max-width` on the word and dance heroes is now dead code. At any viewport down to 320px their percentage resolves above their pixel width, so it can never clamp. Harmless, left in place because it becomes live again the moment either width goes back up.

---

## 2026-08-13: the word character learns to juggle

The word game's home screen was still the flat `logo-word.webp`, the last of the three on a static logo. It now has the same kind of animated character as dance and draw: a real three-card cascade that starts and ends holding all three cards.

**The pattern is a genuine cascade, not a set of poses.** The first attempt set a keyframe at each station and let the browser interpolate between them, which is why it read as cards teleporting rather than flying. Every throw is now sampled along a computed parabola, and the CSS timing function is `linear` so nothing bends the arc back out of shape afterwards. The keyframes are generated, not hand-written.

**Numbers that are not free choices.** A throw every beat, hands alternating, 1.85 beats in the air and 1.15 in a hand. That ratio decides where the two crossing cards meet: at 1.5 beats of flight they crossed at roughly (160, 155), low and off to the left, which does not read as juggling; 1.85 moves the crossing to about (171, 136), the upper middle of the chest. The floor is a dwell above 1 beat, because below that there are always exactly two cards in the air and one in hand, and the pose the character is *drawn* in — two held, one at the top of its arc — stops existing anywhere in the pattern.

**Six throws, because that is what closes the loop.** With three cards, six throws means each one goes out twice and comes back twice, so every card lands in the hand it started from. Five or seven end with the cards swapped and the resting pose subtly wrong. The opening and ending are not special-cased: the left hand throws twice before its first catch because it began holding two, and catches twice without throwing at the end because the run is over. No card is thrown just to reach a pose.

**A hand is two places, not one.** Cards are thrown from the inside of the hand and caught on the outside, 18 units apart, and the hand carries each one back inward while it holds it. With a single hand point, the card leaving and the card arriving sat 9 units apart on cards 70 units wide, and read as one smeared blob instead of a throw and a catch. The two arc apexes are also 28 apart rather than shared, so a rising card and a falling one are visibly on different paths where they cross.

**`Word.svg` is untouched.** The file still has the red card in the air. The resting pose — two cards fanned in the left hand, one in the right — is three plain CSS transforms sitting under the animation, and the keyframes begin and end on exactly those values. So there is nothing to fill forwards and nothing to hand over: with no JS, before anything animates, or under reduced motion, the character simply rests. The trade is that the still logo is now the character holding three cards rather than mid-juggle.

**It takes less room than the logo it replaced, not more.** The obvious viewBox reserves space up to the top of a thrown card, which made the hero 150×194 against the old logo's 160×160 and pushed the fold down 34px. Cropping the viewBox to the *resting* footprint and setting `overflow: visible` lets the throws spill 36px into the margin that is already there. Measured on the real page at 375×667: the fold got 18px shorter. At the top of a throw the nearest fixed element, the back link, is 60px clear horizontally.

**Weight.** 13.4KB of inline SVG and 15.3KB of CSS, 8.8KB gzipped together, replacing a 26.3KB webp and one HTTP request. Both are re-fetched every visit anyway, since `firebase.json` sets no-cache on everything.

**Two gates, matching dance and draw.** `.wj-run` loops forever; `.wj-once` plays a single cycle and is used when the visitor has asked for reduced motion, so nothing moves on its own but a deliberate tap still plays.

### Things that failed silently while building this

- **Rewinding a finished one-shot does nothing.** An early version played once and stopped. Once a CSS animation runs out its iterations and has no fill, it stops applying and Chrome drops it from `getAnimations()` altogether — so rewinding whatever is left restarts nothing and leaves the character frozen in its final pose, with no error. Restarting has to drop and re-add the class.
- **`void el.offsetWidth` does not force a reflow on an SVG element.** `offsetWidth` is an HTMLElement property and reads `undefined`, so the class removal and re-addition coalesce into one style recalc and the animation carries on from where it was. `getBoundingClientRect()` does force it. The draw hero hit the same trap from the other direction; the comment there is worth reading before touching either.
- **A part whose cycle is not a divisor of the run stops mid-cycle.** The body sway ran one cycle per two rounds, so it froze halfway through a lean while the next phase started from lean zero: a 1.4 degree snap at the handover. Any component animated on a different period from the thing it accompanies has this bug waiting in it.

### The lobby header, same day

Now `/word-cards-blink.svg`, replacing `logo-word.webp` at 34px, which completes the set: all three games have a blinking character in the lobby.

It holds the **resting pose** rather than juggling. At 56px, next to a list of players appearing in real time as each one joins, a juggling icon competes with the thing the room is actually meant to be watching. It is also the closer match to the old flat logo, which showed the character holding a fan of cards, not throwing one.

Separate file loaded as an `<img>`, for the same reason dance and draw are: SVG inside `<img>` is a separate document, so its `#wj-*` ids cannot collide with the hero's inlined on the same page. The three card transforms in it are the same numbers as the hero's in `word/word.css` — change one and you have to change the other, or the character holds its cards differently in the lobby than on the home screen.

**No size override needed**, unlike dance. `.lobby-head-icon` is 56px shared, and dance nudges itself to 60 with `.lobby-head-char` because its artwork is drawn with room around it: the dance figure fills about 81% of its viewBox height against 95% for this one. At 56px the word character already reads slightly larger than dance does at 60. The stale comment in `dance.css` that said the other two games "still use their flat webp logo" has been corrected.

`logo-word.webp` is now referenced nowhere in the word game. It stays in the repo only because deleting an image that has been live and indexed is a separate decision.

### Changing it later

**The keyframes in `www/word/word.css` are generated. Do not hand-edit them.** `scripts/build-word-hero.mjs` is what produces them:

```
node scripts/build-word-hero.mjs            # print
node scripts/build-word-hero.mjs --write    # rewrite the block in word.css
```

Verified byte-for-byte against what shipped, and `--write` is idempotent. Reach for it to change the tempo, the length of the still stretch, where the cards rest in the hands, or the shape of a throw. The card paths are parabolas sampled at eight points per throw; the numbers only hold together as a set, which is why editing them by hand goes wrong quietly.

It also prints the three resting-card transforms, because those appear a second time in `www/word-cards-blink.svg` and the two files must agree.

The checks inside it are not decoration. Each one caught a real mistake here: a hand quietly holding two cards mid-pattern, a card that does not end where it started, two throws in a row from the same hand. All of them look fine until you have watched the animation loop twenty times.

### Deliberately not done

- **The cycle is 12s to match dance and draw**, giving 4.19s of juggling and 7.81s still. The approved review page used 10s. The juggle itself is bit-identical; only the pause differs. Changing it is not a one-line edit, though: the pause is baked into the keyframe percentages, so `--wj-cycle` scales the tempo *and* the pause together. A different split means re-running the generator.
- `logo-word.webp` stays in the repo because the lobby header still uses it, but it is out of the image sitemap: a 34px decorative icon with an empty `alt` should not be advertised for image search.

### Noticed in passing

`logo-word.webp` is a 448×448 image that the HTML declared as `width="200" height="160"`. The browser reserved 160×128 before it loaded and reflowed to 160×160 once it arrived — a 32px layout shift on every cold load of the home screen, live today. Inlining the SVG removes it, since there is no image to wait for.

---

## 2026-08-13: one song was failing, and the reason was that it matched too well

**The signal.** `analytics/music/errors/songMiss` had exactly one entry in its entire history: `Jada Sushin Shyam`, 6 misses, all from `IN`. Nothing else in a 382-song pool has ever missed.

**It was not a dead song, and not region-locking.** The songs leaderboard is keyed by the *returned* track title, and `Jaada (From "Aavesham")` sits there with **58 successful plays**. So the query worked roughly 90% of the time. And the `IN` in the country breakdown is not evidence of a block: Malayalam is the top category by a wide margin (3020 plays against Tamil's 1599), so its players are overwhelmingly in India. The country field tells you who plays a song, not where it is unavailable.

**The actual cause: the query matched exactly one track.** The pool spelled it "Jada"; the song is "Jaada". Apple's fuzzy match still found it, but only barely, and `fetchPreview` takes the first result carrying a `previewUrl` out of `limit=5`. Every other entry sampled returned 2 to 5 candidates, so one track losing its preview costs nothing. This one had a single candidate and therefore no fallback: when that preview blinked out, the query missed outright. Six misses against 58 plays is about what a zero-redundancy query looks like.

**Replaced with `'Jaada Aavesham'`**, which returns two playable masters in both the US and IN storefronts. The chosen result is the Sreenath Bhasi single rather than the film master. That is a deliberate trade: `'Jaada Aavesham Sushin Shyam'` surfaces the film master but returns a single result again, which is the exact shape that caused the bug. Redundancy beats picking the preferred master.

**Everyone hits the US storefront**, which is worth writing down because it is invisible in the code. The app sends no `country` param and Apple defaults to US. Confirmed from the leaderboard, where the stored titles are all US-storefront variants (`Galatta`, `Illuminati`, `Pavizha Mazha (From "Athiran")`) with no Indian-storefront variants anywhere. So storefront differences are latent, not live.

**`scripts/check-songs.mjs` is the durable half of this.** Pool validation had been ad-hoc in-session until now. The script makes the same call `fetchPreview` makes and reports two states, and the second one is the point: **BROKEN** (no playable result) and **BRITTLE** (exactly one playable result, no fallback). Brittle is the state that had no name before this, and it is the state that actually bit us. `--country` and `--category` narrow it; it exits non-zero on BROKEN so it can gate a release.

**Full pool result: 382 entries, 0 broken, 21 brittle.** Concentrated in Malayalam (12), Kannada (7) and Tamil (2), which makes sense: those queries carry a movie name that the store title omits, so the match is narrow. All 21 currently return the *right* song, so they are a watch list, not a bug list. Rewriting them blind would risk trading a correct-but-fragile match for a robust wrong one. Left as a follow-up to be done query by query.

**The validator had a blind spot on its first run, caught before it produced a number worth trusting.** The entry regex matched only single-quoted lines, silently skipping six double-quoted entries. Those six are double-quoted *because* the title carries an apostrophe (`"Livin' on a Prayer Bon Jovi"`, `"Don't Stop Believin Journey"`, `"Sweet Child O' Mine Guns N' Roses"`). A pool validator that quietly skips entries is worse than none, so the fix accepts both quote styles. The true pool size is 382.

**One transient failure is expected per full run.** `Fortnight Taylor Swift` returned HTTP 404 four times running and then 5 playable results on an immediate manual retry. Apple throttles around 20 calls a minute and a throttled response is not always a 403. Treat a lone ERRORED row as noise and re-check it; treat a repeatable one as real.

### The brittle watch list, and the rules for working it

Deliberately **not** fixed in this pass: the payoff is small (one of 22 brittle entries has ever failed, and a miss costs one wasted attempt inside `pickPair`, not a broken round) and the risk of a careless fix is real. Regenerate this list any time with `node scripts/check-songs.mjs`.

**Two rules a reworded query must clear, or it stays as is:**

1. The first playable result is still the same song by the same artist.
2. The *fallback* results are the same song too. This is the one that is easy to miss and the whole reason the work cannot be scripted: if result #2 is a different track, rewording converts a visible miss into a silently wrong song, which is worse than the fragility being fixed.

**The counter-example that proves rule 1 bites.** `Chekele Avial` returns 1 result, Avial's own recording. Dropping the band name to `Chekele` returns 4, but the first is Ashish Zachariah's version. Broadening it would trade the right master for redundancy. Entries shaped like this are not fixable without deciding that any decent rendition is acceptable, which is a product call, not a technical one.

**The clean shape, for contrast.** `Onde Ondu Sari Mungaru Male` returns 1. Correcting the spelling and dropping the movie name to `Onde Ondu Saari` returns 5 with the same Kunal Ganjawala recording still first. Adding the artist instead (`Onde Ondu Sari Sonu Nigam`) returns 5 completely unrelated songs, so "add more words" is not a general remedy.

**Malayalam (12):** `Chekele Avial`, `Aadu Pambe Avial`, `Nada Nada Avial`, `Fish Rock Thaikkudam Bridge`, `Jaathikkathottam Thaneer Mathan Dinangal`, `Kudukku Love Action Drama`, `Nee Himamazhayayi Edakkad Battalion`, `Jimikki Kammal Velipadinte Pusthakam`, `Anuraagathin Velayil Thattathin Marayathu`, `Kattu Mooliyo Vineeth Sreenivasan`, `Lajjavathiye Jassie Gift`, `Karutha Penne Thenmavin Kombath`

**Kannada (7):** `Minchagi Neenu Baralu Gaalipata`, `Onde Ondu Sari Mungaru Male`, `Anisutide Mungaru Male`, `Ee Sanje Rangitaranga`, `Ondu Munjaavinali`, `Naguva Nayana Pallavi Anupallavi`, `Baa Baaro Rasika Ranadheera`

**Tamil (2):** `Aasa Kooda Sai Abhyankkar`, `Kannana Kanne Naanum Rowdy Dhaan`

**Also left alone on purpose: the stale analytics counter.** `analytics/music/errors/songMiss/Jada Sushin Shyam` still holds 6, and the stats panel is all-time, so it will keep showing a failure for a query that no longer exists in the pool. Deleting it is a production data write and was not authorised. If the panel ever looks confusing, that node is the reason.

**Latent, not live: storefront divergence.** Checked the Malayalam list against the IN storefront as well. `Pavizha Mazhe Athiran` returns nothing there, and 12 of 60 resolve to a different track. None of this affects players today because everyone hits US, but it is the thing to remember if a `country` param is ever added to `fetchPreview`.

## 2026-08-13: the same 32px drop, applied to the shared `.logo h1`

**What changed.** One line in `www/shared/base.css`: `.logo h1` from 36px to 32px. Yesterday's entry dropped the *home page* heading to 32px, but that edit lived in `www/index.html`'s inline `.hero h1`, so the three game pages kept 36px. This finishes the job. Version stamps on all three games move to `v2026.08.13.1`.

**`.logo h1` is shared by more screens than the game titles, which is the reason to measure rather than assume.** It styles the home heading of each game, plus the dance vote screen ("Find the Impostor"), the word pass-round screen ("Game is on"), and "Round Over" on all three. No per-game CSS or inline rule overrides it, so a one-line edit reaches all of them. `.share-title` and the `Lobby` heading sit outside `.logo` and are untouched.

**It fixed a wrap nobody had reported.** Measured at 320px, where the content box is 272px: "Find the Impostor" at 36px rendered on **two lines**, at 32px it renders on **one**, at 266.3px inside 272. Every other heading kept its line count, and the three game titles were already two lines by their authored `<br/>`. So the change is cosmetic everywhere except the dance vote screen, where it is a fix.

**The remaining headroom there is 5.7px, and that is worth remembering.** Thinner than the 33px the site title got yesterday. It survives because Literata is the widest font in the stack and the one that actually loads, so the fallbacks have more room, not less. If that heading's copy ever grows, this is the first place to re-measure.

**Version stamps are not cache-busters here, despite looking like one.** `firebase.json` sets `Cache-Control: no-cache, no-store, must-revalidate` on `**`, so `base.css` was never cached and a returning player picks up CSS changes without any stamp bump. The stamps are build markers, useful for confirming what is actually live after a deploy. Bumping them on a CSS-only change is convention, not a functional requirement.

## 2026-08-12: lead with "no app, no account" in llms.txt and above the fold

**Why.** A GEO audit and our own reading of it (see `GEO.md`, ticket #79) found the site describes its *mechanic* but not the *friction it removes*. AI engines described us as free, browser-based, impostor-style, social deduction. Missing: no install, no account, quick to start. Those are the words in the prompts we lose, like "what are free online party games you can play without downloading anything".

**The useful finding: the phrases were already there, just always in the tail.** `llms.txt` said "no app, no sign-up, no cost" but 148 characters in, after the mechanic. Every game description ends on it. So this was a reordering job, not a writing job, which is why it is small.

**`llms.txt` summary rewritten.** The opening blockquote now states how you actually start (one player opens the site, shares a 4-character room code or QR, friends join in under a minute) before it lists the games. Nothing was dropped: impostor, 3 to 20 players, phone browser, and all three game names survive.

**"impostor" deliberately kept in the lead noun phrase.** The first draft weakened it to "free online party games ... every game hides one impostor", chasing generic top-of-funnel phrasing. That is the wrong trade: impostor-comparison prompts are the ones we currently *win*, at position #1 or #2. Diluting the term we own to reach for terms we do not is how you lose both.

**Two additions to `llms.txt`.** A "time to first round" line under Shared facts, because time-to-play appeared nowhere on the site. And three new Common questions phrased as the awareness-stage prompts we lose verbatim, rather than in our own vocabulary: playing without downloading anything, a quick game for 6 friends with no accounts, and how room codes work.

**The home page tagline is now a plain statement of fact.** "Trust no one. ;)" is gone, replaced rather than joined by "Party games for up to 20. No app, no account. Play in your browser." The page previously went `<h1>` → joke → straight into the Play cards, with the first factual sentence buried far below under the dance heading. A visitor landing from search now learns what the site is and what it takes to start before scrolling.

**"Free" is deliberately not in that line.** It is the one word the final copy gives up, and it was a real trade: price is the strongest single signal for this category. It still appears in the `<title>`, the meta description, the FAQ and `llms.txt`, so nothing is lost for search or for AI extraction. Above the fold the line leans on friction ("no app, no account") instead of on price, on the judgement that a human already scanning a games page assumes browser games are free and is really asking what it will cost them in effort.

**Three drafts, and the last one is the smallest.** It began as a second `.sub` element under the tagline, which meant a joke and a fact stacked above the cards, one line too many. Collapsing it into `.tagline` removed a class, a CSS block and a stagger entry. Then the copy shortened again, which removed the last CSS change too. **The final `index.html` diff is two lines: the tagline text and the version stamp.** The `.hero .tagline` rule is untouched from before this work.

**`text-wrap: balance` was added and then taken back out.** The longer draft wrapped badly at 16px, three mobile lines at 271/308/104 with a stub at the end, and balance evened them to 247/239/196 at identical height. The final shorter copy wraps to two even lines on its own: measured at both 375px and 320px, balance and no-balance render byte-identically at 256/251. Since it now changes nothing, it is gone rather than left in as inert insurance, the same call the draw work made on `.lobby-head-char`. The `No&nbsp;app` and `no&nbsp;account` bindings are kept so those pairs never split.

**`.hero` margin tightened from 40px to 24px** alongside the copy change. Two lines of subtitle where there was one short joke needs less air under it, and the saved 16px goes to the cards.

**The h1 dropped 36px to 32px, and this quietly fixed a latent bug.** The intent was balance: a two-line subtitle under a 36px serif heading was top-heavy. But measuring it turned up something else. At 320px, the narrowest phone width worth supporting, "Impostor Games" at 36px in Literata rendered **274px wide inside 276px of available space: two pixels of headroom.** Any rendering variance would have wrapped the site name onto two lines. Checked against the fallback stack as well, and Literata is the widest of the three (Literata 274, Georgia 258, generic serif 232), so the font that actually loads was the worst case, not a theoretical one. At 32px the same measurement is 243 inside 276, so headroom goes from 2px to 33px.

**The fold was the thing that decided whether it shipped.** Measured at 375x812, not eyeballed. Two lines of tagline at 48px, the first dance card runs 212 to 635 with its Play button at 598, all comfortably above the 812 fold, and the second card starts at 659 so it still peeks in to signal scroll. Had the Play button gone under, the line was getting cut: getting people into a game beats a sentence about getting people into a game.

**One thing caught in review.** The first draft of the (then separate) `.sub` carried `opacity: 0.85`, which the `riseIn` animation's `forwards` fill would have overridden. It would have applied under `prefers-reduced-motion: reduce` and nowhere else, so the two motion paths would have rendered different greys. Removed rather than fought.

**Deliberately not touched: titles and meta descriptions.** Titles are tuned from real Search Console data and are performing. `/draw/`'s description was rewritten two days ago, and re-editing it now would break the change-once-hold-2-3-weeks rule recorded in `SEO.md` the first time following it was inconvenient. The home page was not part of the August tuning pass, which is what made it the safe surface to edit.

**Still open from #79's original scope:** the home page `FAQPage` JSON-LD. Checking it turned up a pre-existing mismatch. Nine questions in the structured data, seven visible in the `<details>` list, three of them JSON-LD only ("What is the Impostor Dance Game?", "What is the Impostor Word Game?", "Where can I play the Imposter Dance Challenge online?"), and one visible question absent from the markup. Google requires FAQ markup to describe visible content, so adding more JSON-LD-only entries would have made it worse. Split out to be done as its own reviewable change, adding each new question to *both* surfaces and reconciling the existing orphans.

## 2026-08-12: the draw home page gets the character, sketching

**What changed.** `/draw/` no longer opens on the flat `logo-draw.webp`. The hero is now the character drawing on a phone, inlined as SVG in `draw/index.html` and choreographed in `draw/draw.css`, with the same burst-then-rest rhythm and tap-to-replay as the dance hero. Source art is `www/Draw_phone.svg` (a revision of `Drawing_phone.svg`, which added the stand under the phone and redrew the free arm). `logo-draw.webp` is still a live asset: the lobby header icon uses it at 34px.

**The art revision cost nothing to absorb**, which is the useful fact. The second version is the first translated by roughly (-9, -9) with the stand added, so the hand group's pivot came out at 12.4% / 90.1% of its own fill-box in both. Because `transform-origin` is expressed against the group's fill-box rather than in user units, the CSS and the JS needed no edit at all: only the markup and the viewBox crop changed. Keep the origins in percentages and future art revisions stay cheap.

**Figma exports carry a clip-path wrapper and a `<defs>`.** Both were dropped on inlining. The clip is the full 450x450 canvas, so it clips nothing, and its generated id (`clip0_492_595`) would otherwise be a global id sharing the page's namespace.

**Three options were built and previewed before picking.** A drew the whole screen back in, stroke by stroke, with the stylus tip tracking the ink. C redrew only the near hill. B, the one shipped, never touches the screen at all: the hand makes four small strokes, the body rocks with them, three decaying strokes, then still.

**Why B is the cheap one, and it is not a small margin.** The arm's flat shoulder edge sits about **29 units** inside the body's right edge in the resting pose. B needs about 4 units of travel, so it fits with room to spare and **the artwork's geometry is untouched** — the only edits to the art were dropping the white background rect, cropping the viewBox, and adding four `<g>` wrappers. A needed 84 units to reach the far side of the screen, which meant adding a tab at the shoulder that lives permanently under the body. That is recorded here because it is the thing to know if A or C is ever revisited:

- The tab must run back along the **arm's own axis**, not straight left. The cut edge is diagonal, so a horizontal tab is only ~15 units thick and emerges from under the body as a thin stick the moment the arm reaches. Along the axis it keeps ~24, matching the arm.
- Even then, A stretches the visible arm to roughly double its resting length at full reach.

**The purple line is two strokes, not one.** The art authors it as a single path with two subpaths, and the stylus tip rests exactly on the first subpath's start point. For A and C the path has to be split into two elements so each stroke can be timed on its own; the shipped B leaves it as one path, as authored. The drawing does sit ahead of the character in document order so the stylus still covers that start point, as it does in the source.

**If A or C is ever built: measure path lengths, do not guess them.** A `stroke-dasharray` shorter than the path leaves the far end *showing* at full offset instead of hiding it, because the dash pattern wraps and the leftover tail lands back in a dash. The prototype guessed 43.4 for a path that `getTotalLength()` put at 45.73, and produced exactly that. Every dasharray and every hand keyframe in the prototype came from `getTotalLength()` / `getPointAtLength()` on the live element.

**Same two-gate structure as dance.** `.dw-run` loops forever and is applied on load; `.dw-once` runs a single cycle and is used under `prefers-reduced-motion`, so nothing moves on its own but a deliberate tap still earns one burst. The reduced-motion media query kills `.dw-run` only, never `.dw-once`. Rewinding uses `currentTime = 0` and not the `void el.offsetWidth` reflow trick, which silently does nothing on an SVGElement.

**The lobby header icon too.** `new www/draw-phone-blink.svg` replaces `logo-draw.webp` at the top of the lobby, the same move dance made with `characterdance-blink.svg`. The only thing that moves is a blink: two per 11s cycle at 2.1s and 6.8s, matching the dance lobby icon beat for beat so the two games read as one family. Uneven gaps on purpose (4.7s, then 6.3s); evenly spaced reads as a metronome. Nothing else animates, so between blinks the browser does no work at all. A sketching icon at 56px would compete with the player list, which is the thing the room is actually meant to be watching.

Two structural notes:

- **Loaded as an `<img>`, not inlined.** That keeps it a separate document, so its `#dw-eyes` cannot collide with the inlined hero's. Dance made the same call for the same reason (32 Figma ids in its case).
- **No per-game size override.** Dance needed `.lobby-head-char { height: 60px }` because its art carries padding the webp did not. This art is cropped tight and the phone gives it visual weight, so the shared `.lobby-head-icon` 56px is right as-is. Renders 75.8 x 56, against the old webp's 70 x 56, so the header row is unchanged in practice. A `.lobby-head-char` class was briefly added and then removed rather than left as a dead selector: dance.css is not loaded on this page, so it would have styled nothing.

**`logo-draw.webp` now has zero references anywhere in `www/`.** Left in place rather than deleted, matching `logo-dance.webp`, which has been an orphan since the dance hero landed.

**Which SVG is which, since there are now four in `www/`.** `Draw_phone.svg` is the source art and is referenced by nothing: the hero is a copy of it inlined into `draw/index.html`, so **edits to it do not reach the page on their own**. `draw-phone-blink.svg` is the shipped lobby icon and is a real request. The dance pair works the same way (`characterdance.svg` is used by the gameplay screen, `characterdance-blink.svg` by the lobby). Two earlier drafts, `draw.svg` (an easel instead of a phone) and `Drawing_phone.svg` (no stand under the phone), were deleted rather than left sitting in `www/`: `firebase.json` sets `hosting.public` to `www` with no ignore rules beyond `node_modules`, so **anything left in that folder ships to production whether git tracks it or not**.

**Sitemap.** Dropped the `logo-draw.webp` image entry from the `/draw/` URL, matching what `/dance/` already does since its hero was replaced, and bumped that URL's `lastmod` to 2026-08-12.

**Verified locally at mobile width.** Four animations live under `.dw-run`; `.dw-once` reports exactly 1 iteration; the reduced-motion selector was read back out of the CSSOM to confirm it names only `.dw-run`; every part computes to an identity matrix during the rest phase, so the browser stops repainting for 8.25s of each 12s cycle; `transform-origin: 12% 90%` was measured against the hand group's real fill-box (12.4% / 90.1%), not estimated. A real trusted tap fires the restart (8000ms to 0). Leaving the home screen drops the hero to zero live animations, since `.screen` without `.active` is `display: none`. The lobby icon was checked in a real room (`rooms-draw/KUUM`, created from localhost and deleted afterwards, confirmed `null` over REST) rather than by forcing the screen class, and the blink was sampled frame by frame in the standalone document: identity at 0s / 2.0s / 6.7s / 9.0s, squashing at 2.1s and 6.8s. No console errors.

Note the browser tool's `left_click` times out on the home page: the click lands, the helper just waits for a stability signal an infinite animation never gives. Driving the DOM directly (`el.click()`, dispatched `PointerEvent`) is the way to test this page.

---

## 2026-08-11: pill buttons everywhere, and a nudge on "I'm Ready"

**Two changes, same session.** All buttons went from an 18px radius to a full pill (`border-radius: 999px` on `.btn` in `shared/base.css`, one line, all three games). And the ready button now nudges itself to get noticed.

**The pill covers two class families, not one.** `.btn` handles Start Game, I'm Ready, Play Again and friends. But Create Room, Enter room and Go to Lobby are not buttons at all: they are `.tile.tile-action.tile-dark` (`#btn-go-lobby`, `#btn-join`, `#btn-share-continue`), a separate component that happens to sit in the same bottom slot. They needed their own `border-radius: 999px` on `.tile-action`. The `.tile-stack` cards on the home screen were deliberately left on `--radius-lg` (26px): they are tall two-line cards and a pill radius on them reads as a lozenge, not a button.

**The nudge.** A soft squash and stretch: squash down, spring tall, small counter-squash, settle. First run 1s after the lobby renders, then every 4.5s. Peak deformation is 2.8% (`scale(1.014, 0.972)` at the squash, `scale(0.991, 1.018)` at the stretch), picked from a three-way comparison as the quietest setting that still reads as motion.

Two details that are easy to get wrong if this is ever retuned:

- **Widths are derived as 1/&radic;height, not chosen.** Compressing without widening looks like a resize, not a squash. Note this ratio does *not* hold area exactly (it drifts ~2% across the move). Exact 2D area would be width = 1/height, which widens twice as much and reads much heavier.
- **`transform-origin: 50% 100%`**, so the squash presses into the surface instead of shrinking around the middle. At 2.8% this matters more than the amplitude does.

**Why a wrapper element and not the button.** `.btn:active` uses `transform: scale(0.95)` for its press feedback. A CSS animation on `transform` outranks that while it runs, so animating the button directly would make taps feel dead every 4.5s. The animation lives on `.ready-nudge`, a wrapper div; the button's own transform is untouched. Verified in all three games: zero animations on the button element itself.

**Why six loops and not infinite.** `setupPresence()` acquires a screen wake lock the moment you join a room (`word/app.js:421` and equivalents), so the lobby cannot sleep. An endless animation would run for the entire wait, which can be several minutes. Six loops is ~28s, then it stops dead at identity. Also dropped `will-change: transform` from the shipped rule: it pins a compositor layer for a button that sits still 74% of each cycle, and browsers promote automatically for the duration of a running transform animation anyway.

**Gating.** The `is-nudging` class is applied only when the player is visible and unready (`!isHost`, `!pass` in word, `!me.ready`). Ready state persists across rounds by design (see `fbReplay()`), so on round 2 the button already reads "I'm Not Ready" and correctly does not animate. `classList.toggle()` with an explicit flag is a no-op when unchanged, so room updates do not restart the animation.

**Hiding it hides the wrapper, not the button.** `.sticky-actions` is a flex column with `gap: 10px`. Leaving an empty wrapper in place for the host would have added a stray 10px gap, so the three `style.display` call sites now target `#ready-nudge`.

**Verified with real two-tab rooms in all three games**, since the ready button is hidden from the host and never renders on a solo page load: word `E8Q7`, dance `2W49`, draw `4YW4`, all deleted afterwards. Checked the animation runs while unready, stops on tapping Ready (transform back to `none`, zero live animations), restarts on un-readying, and ends on its own after six loops with the button back at its normal 53.5px. Host view confirmed at zero height with no animation. No console errors.

**Not touched:** `android/app/src/main/assets/public/index.html`, still a stale Capacitor artifact regenerated by `npx cap sync`.

Versions: dance/word/draw all → `v2026.08.11.3`.

---

## 2026-08-11: "I'm Ready" gets the dark primary button style

**What changed.** The lobby's ready button was pale mint (`.btn-accent`, `#c8e8d9`); it now uses the same dark `.btn-primary` as Start Game, in all three games. Confirmed the two render identically: both compute to `rgb(26, 37, 48)` on white text.

**Why it was one line of CSS and six of markup, not a colour swap.** `.btn-accent` had exactly one user in the whole repo — this button, in the three games. Repointing the rule would have left two class names for one appearance, so instead the button moved to `.btn-primary` (3 × `index.html`) along with the ready/not-ready toggle that re-adds the class (3 × `app.js`, `classList.toggle('btn-accent', !me.ready)` → `'btn-primary'`), and the now-unused `.btn-accent` rule was deleted from `shared/base.css`.

**The toggle is the part worth re-testing**, since the button swaps class on every tap: not ready → `btn btn-primary` (dark), ready → `btn btn-secondary` (white). Both directions verified live in a real two-tab room (`HF5R`, since the ready button is hidden from the host and never renders on a solo page load), then the room was deleted. Draw and dance checked too. No console errors.

**Not touched:** `android/app/src/main/assets/public/index.html` still carries the old `.btn-accent` — it is a stale Capacitor build artifact and gets regenerated by `npx cap sync`, so it was left alone rather than hand-patched.

Versions: dance/word/draw all → `v2026.08.11.1`.

---

## 2026-08-10: delete the dance game's dead vote code

**Why now.** Writing the new how-to copy, I put "vote for who you think the Impostor is" into dance step 4, because the code says the dance game has voting. It does not. There is a `state.votes`, a `beginVoting()` function and a screen whose id is literally `screen-vote`, and every one of them is a lie: the screen is a discussion prompt with a host-only Reveal button and nothing to tap. Dead code that misdescribes the app is worse than dead code that just sits there, and this particular lie nearly shipped wrong instructions to a live page.

**All five references, and what each did.**

| Line | What it was |
|---|---|
| 1214 | `votes: {}` in the state object |
| 1638 | `state.votes = data.votes \|\| {}` on every room update |
| 1719, 1790, 1870 | three `'votes': null` clears on round reset |

Nothing wrote a vote. `state.votes` was never read by any render or any branch. So the game pulled an always-empty node into a field nobody consumed, and three separate round paths carried a clear for data that could not exist.

**Checked the history before deleting, because clears can be load-bearing.** If some earlier version had written real votes, live rooms could still hold them and dropping the clears would leave stale data behind. It never did: `git log -S` finds the code arriving in `20b00a2` in exactly this read-and-clear-only shape, and no commit in the repo's history ever contained a write path (`castVote`, `votes/`, nothing). Also confirmed nothing outside the game reads it: no reference in `www/shared/`, `database.rules.json` or `firebase.json`, and `word/app.js` has zero mentions. Draw is the only game with real voting and was not touched.

**Verified with an actual four-player game, not a smoke test**, because all three deleted clears sit on write paths that only execute mid-round. Four browser tabs, one real room (`GT7K`) against the production RTDB, and the room JSON read back over REST at each step:

1. **Classic imposter round** (`fbStartGame`, one of the clears): three players, round dealt, `imposterIds` set to exactly one player, crewmate track "Saturn" and imposter track "Espresso" written as two distinct songs. The imposter's tab showed the banner. No `votes` key in the room.
2. **Reveal** named the right player, and the discussion screen showed "Find the Impostor" with a host-only Reveal, which is exactly what the corrected copy now describes.
3. **Replay** (the reset clear): phase back to `lobby`, `startAt`, `imposterIds`, `crewmateTrack` and `imposterTrack` all null. Nothing orphaned.
4. **Find Your Squad** (the group-mode clear, the third site): needed a fourth player to unlock; `mode: findSquad`, two group tracks, four players split 2/2 across groups 0 and 1, `imposterIds` correctly null, Reveal Groups worked.

`votes` absent from the room JSON at every stage, no console errors in any tab, `npm run lint` clean, and an explicit ESM parse of `app.js` passed. Test room deleted afterwards; local analytics never counts, since the counters are gated to the production hostname.

**Left alone deliberately.** `screen-vote` and `beginVoting()` still carry ballot names for a discussion screen. Renaming touches the HTML id, the CSS and the JS, so it is its own change rather than a rider on this one.

v2026.08.10.7. Dance only.

---

## 2026-08-10: how-to-play cut to four steps, all three games

**Why.** Irfan rewrote the copy. Dance and word were seven steps each, draw was five, and every step was a paragraph. Nobody reads seven paragraphs before a party game. New shape is four steps, one short line each, identical skeleton across all three: join, get your thing, do the thing, find the impostor.

**One edit per game covers both surfaces.** `openHowTo()` in each `app.js` does `document.querySelector('#how-to-play .howto-steps').cloneNode(true)` into the lobby popup. The landing-page list is the single source, so rewriting the `<ol>` updates the in-lobby popup for free. Verified by opening the popup on all three and diffing the headings against the page.

**No `HowTo` structured data to keep in sync.** Checked: the JSON-LD in all three is `VideoGame` + `FAQPage` only. The steps were never marked up as schema, so nothing drifted.

**What the SEO body copy lost, and where it survives.** The old steps carried keyword weight the new ones don't: the category list (K-pop, Bollywood, Tamil, Telugu, Kannada, Malayalam), "4-character code or QR code", "3 to 20 players". All of it still appears in the `howto-def` intro paragraph above the list, the FAQ below it, and the JSON-LD, so the page-level keyword coverage is intact. What is genuinely gone from the page body:

- **Dance: "Headphones on."** It was step 3 and it is now nowhere in the steps. The game does not work without them. Raised with Irfan, who called it fine: it survives in the intro paragraph ("every player wears headphones") and in a dedicated FAQ entry, so a reader still meets it, just not in the walkthrough.
- **Word: "Pass the Phone."** Both mentions were inside the steps. Irfan rewrote word's step 1 to carry it: "Get started" now splits into the two cases, online room vs one phone, so single-device mode is back on the page without restoring a whole step.

**Two things were wrong in the first draft and got fixed before merge.** Word and draw step 2 originally read "The Impostor gets a different word and a hint." The impostor gets **only** a hint. `word/app.js` `cardContent()` is `text: isImposter ? meta.imposterHint : meta.secretWord`, and draw deals the same way from `meta/imposterHint`; there is no second word anywhere in either game. Now reads "The Impostor only gets a hint." Dance step 2 was accurate throughout, since that game really does play a different track.

**`.step-body p + p` is new in `base.css`.** Word's step 1 is the first step in any game with two paragraphs, and `.step-body p` sets `margin: 0`, so the two lines butted together. Added a 6px top margin on adjacent paragraphs only. Checked first that all twelve step bodies across the three games had exactly one `<p>`, so the rule is purely additive and cannot move anything that already existed.

**The parallel skeleton hid a real mechanical difference, and a review of the steps against the code caught it.** Four steps in the same shape for all three games quietly asserted that all three play the same way. They do not:

- **Only draw has voting.** `fbCastVote` in `draw/app.js`, a real ballot screen, "Tap a name. You can change your mind until the reveal."
- **Word has no voting whatsoever.** `grep -i vote www/word/app.js` returns **zero hits**. The round ends with talk and a host-only Reveal button.
- **Dance has a screen *named* vote and no ballot on it.** `beginVoting()` sets a title, a subtitle and a host-only Reveal, then `go('vote')`. Non-hosts see "waiting for host to reveal impostor….". `state.votes` is read in the room listener but nothing in the UI ever writes it: vestigial.

So word and dance step 4 both told players to vote for a button that does not exist. Both now say discuss, then the host taps Reveal. Draw's step 4 was correct and is untouched.

**Three more corrections from the same pass.**

- **Word step 1 said "Playing together online?"** The word game is not online-vs-offline; both modes are same-room. The lobby toggle is *Everyone has a Phone* (default) vs *Pass the Phone*, and the clues are spoken out loud either way. Now reads "Everyone has a phone? / Only one phone?". Draw is the game that is genuinely remote-friendly.
- **Word step 3 had dropped "one word each"**, which is the entire constraint of the game. The in-app hint still carried it; the how-to did not. Restored.
- **Dance step 3 said the impostor should "stay in sync with everyone else."** They are hearing a different song, so there is nothing to sync to. Now "watch the others and fake it."

**Step 1 names the button, in all three.** "Join the room and get ready" became "Join the room and tap &ldquo;I&rsquo;m Ready.&rdquo;" in dance and draw. Word's step 1 is the two-case "Get started", so the same instruction went on the *first* line only: "Everyone has a phone? Join the same room and tap &ldquo;I&rsquo;m Ready.&rdquo;" That split is correct rather than incidental. Pass the Phone has no ready-up at all, so putting it on the second line would have sent shared-phone groups looking for a button they never see. Written as `&ldquo;/&rsquo;/&rdquo;` entities to match how Irfan typed it; note the rest of the steps use straight ASCII apostrophes ("you're the Impostor"), so the list is now typographically mixed. Left as-is rather than normalising unasked.

**Verified.** All three landing sections and all three lobby popups render exactly four steps, with the popup text asserted equal to the page text rather than eyeballed; step 1 renders U+201C / U+2019 / U+201D and the live `#btn-ready` label really is "I'm Ready", so the copy names a button that exists; word's step 1 shows two paragraphs in both surfaces at a computed 6px gap; draw and dance cards unchanged at 114px on the single-paragraph steps; dance hero still attaches its 6 animations; no console errors on any page; `npm run lint` clean.

v2026.08.10.5 for dance and word, v2026.08.10.4 for draw (draw took only the step-2 correction and the shared `base.css` rule).

---

## 2026-08-06: the lobby header gets the character too, blinking

**Why.** After the hero swap, `logo-dance.webp` survived in exactly one place: the lobby header icon. Two different mascots for the same game, one screen apart. Irfan asked for the character there as well.

**It renders at 60px, not 34px.** The markup carries `width="34" height="34"`, but those are intrinsic-size hints; `base.css` sizes `.lobby-head-icon` at 56px. That's enough room for the character to hold up, and side by side it reads *better* than the logo at that size, because the webp's music notes collapse into specks while the big eyes and orange cups stay legible. Nudged to 60px because the character carries a shadow ellipse and padding the webp doesn't, so at an identical height the figure itself reads smaller.

**The size override is dance-scoped on purpose.** `.lobby-head-icon` is shared: word and draw use it for their own logos. Changing 56px in `base.css` would have resized all three lobbies. New `.lobby-head-char` modifier in `dance.css` instead. Verified after: word lobby icon still renders at exactly 56px.

**Both obvious cheap approaches fail, and it's worth writing down why.**

1. **Cannot inline a second copy.** The hero is already inlined in that same document with all 32 Figma ids. A second inline copy duplicates every one of them in a single document: invalid, and a landmine for anything doing `querySelector('#dc-body')`.
2. **Cannot `<use href="#Group_24">` to reference the hero artwork**, which would otherwise cost zero bytes. When the lobby is showing, `#screen-home` is `display: none`, and a `<use>` pointing into a `display: none` subtree renders **nothing**. The icon would vanish exactly when it's needed. This one is easy to reach for and fails only at runtime, on the screen you weren't looking at.

So: a separate file, `characterdance-blink.svg`, loaded as an `<img>`. Separate document, so the ids cannot clash with the inlined hero. 7.7 KB raw, 3.2 KB gzipped, cached once.

**Blink only, Irfan's call.** The lobby already has players appearing in real time and confetti firing on each join. A dancing icon at 60px competes with the thing the room is actually meant to be watching. Two blinks per 11s cycle at 2.1s and 6.8s, gaps of 4.7s then 6.3s: uneven on purpose, because one blink per cycle or two evenly spaced reads as a metronome. Verified there is exactly **one** animation in the whole document and every other part reports `animation: none`, so between blinks the browser does no work at all.

**`logo-dance.webp` is now unreferenced but kept.** 26 KB, nothing requests it, and any old external link still resolves. Deleting it buys tidiness and risks 404s for zero gain.

**Verified.** Lobby icon renders 57.7x60 from `/characterdance-blink.svg`; hero on the home screen still attaches 6 animations and still restarts on tap (8000 to 0); `dc-body`, `dc-eyes` and `Group_26` each appear exactly once in the dance document; word lobby unchanged at 56px. `npm run lint` clean.

v2026.08.06.2. Dance only.

---

## 2026-08-06: dance landing hero dances in bursts, and answers a tap

**Why.** The hero was a static `logo-dance.webp`. The gameplay dancer had personality; the landing page did not. Irfan asked for the same character up top, but calmer.

**Two rounds of tuning before the shape was right.** First cut was continuous-but-subtle: a 14s cycle with a blink, a wave, and a single 1.5deg weight shift. The frozen-frame contact sheet killed it. **1.5deg is genuinely invisible on a shape this round**, which is worse than no movement: it costs frames and reads as nothing. Raised to 2.5deg, then Irfan called it, correctly: the interesting version is the gameplay dancer's energy, not a gentler loop. Final shape is **dance in bursts, then rest**.

**The cycle, 12s** (`--dc-burst`): two full beats at the gameplay dancer's amplitude (0 to 3.0s), a wind-down at 3deg then 2.2deg then 1.1deg landing square on the rest pose (3.0 to 4.5s), then completely still to 12s with blinks at 6.2s and 9.4s.

**The wind-down is not decoration.** Cutting a dance at a timer freezes the body mid-bounce, which reads as the animation breaking rather than the character finishing. Three decaying bounces cost 1.5s and fix it. The blinks are deliberately unevenly spaced; even spacing reads as a metronome.

**The rest is free.** Rest pose is 0 on every part, so the 7.5s hold produces no repaints at all. Cost is the 4.5s of motion, not the cycle. If it ever feels busy, raise `--dc-burst` rather than cutting the choreography.

**Tap-to-dance forced the hero out of `<img>` and into the document.** SVG inside `<img>` is sandboxed: no scripts, no pointer events to the shapes, no external CSS. Checked first whether inlining was safe, since the artwork carries 32 Figma-generated ids (`Group_26`, `Vector_4`, `Rectangle_30`): **zero collisions** against `dance/index.html`, `dance.css`, `base.css` and `app.js`. The gameplay dancer stays an `<img>` and is untouched, so its ids live in a separate document and cannot clash.

**One bug caught in testing that would have shipped silently.** The standard restart idiom is `el.classList.remove(c); void el.offsetWidth; el.classList.add(c)`. **It does nothing on an SVG.** `offsetWidth` is an `HTMLElement` property and reads `undefined` on an `SVGElement`, so no layout is forced, the class swap coalesces into one style recalc, and the animation carries on from wherever it was. Measured: `currentTime` 27733 before the tap, 27733 after. No error, no console warning, tap simply dead. Driving the Web Animations API instead (`getAnimations({subtree:true})`, set `currentTime = 0`, `play()`) restarts all six deterministically: 23587 to 0. Commented at the call site so nobody simplifies it back.

**Reduced motion gets two gates, not one.** `.dc-run` loops forever and is killed outright by the media query, so nothing moves on its own. `.dc-once` runs the cycle a single time and is deliberately **not** killed: it is only ever applied by a tap, and a tap is the visitor asking for the animation. Irfan's call, and the right one.

**Deliberately not a tab stop.** `role="img"` keeps the accessible name, `tabIndex` stays -1. Making it focusable would put a decorative element ahead of Create and Join in the tab order. No pointer cursor either, since that promises a link that isn't there.

**Sitemap.** `/dance/` listed `logo-dance.webp` as an indexable image. Google Images does not index SVG, so that entry could not survive the swap intact. Dropped it, kept `og-dance.jpg` (1200x630), which was carrying that page anyway; a 200x160 logo was never going to rank. `logo-dance.webp` stayed as the lobby header icon at the time; superseded same day by the entry above, which replaced that too.

**Weight went down.** Hero was 26.6 KB of WebP. Inline SVG is roughly 4 KB gzipped, and it costs one fewer request since it renders with the HTML instead of after a second fetch, which matters for something above the fold.

**Verified on the real page** at 375x812: 6 animations attached, `dc-run` on load, a real click (not a synthetic event) restarts from 20958 to 0, reduced-motion block confirmed to target only `.dc-run` so the `.dc-once` tap path survives, all six `hb*` keyframes present in the CSSOM, no console errors, and the fold still fits logo, title, Create, Join and How to play without scrolling. `npm run lint` clean. Word and draw untouched; `characterdance.svg` byte-identical.

v2026.08.06.1. Dance only.

---

## 2026-08-05: `npm run lint`, a name-checker with exactly one rule

Follow-up to the round timer regression below. That bug and its twin were both undeclared names, both invisible to a syntax check, and both silent in the browser console. Now wired in permanently: `eslint` and `globals` as devDependencies, `eslint.config.mjs` at the root, `npm run lint` over `www` and `scripts`.

**One rule, `no-undef`, and nothing else.** No formatting, no style opinions. The point is that a clean run is meaningful and a red run is never noise someone learns to scroll past. Three config blocks: browser globals for `www/**/*.js`, node globals for `scripts/**/*.mjs`, and `www/shared/qrcode.js` ignored as a vendored minified library whose UMD wrapper trips the rule by design.

**Proved it can fail before trusting it.** Reintroduced both regressions and confirmed the exact two errors came back, then restored and confirmed clean and byte-identical to the deployed file. A check that cannot fail is worth nothing.

Documented under "Checking your names before you ship" in README, with the reason it exists, since the value is entirely in running it after refactors that move code between functions.

---

## 2026-08-05: dance round timer was dead in production for two weeks

**Found by accident.** While checking the new dancer on a laptop the progress bar looked like it never filled. It wasn't the preview harness: `startPlayback`'s round timer was throwing `ReferenceError: meta is not defined` at app.js:3687 on every 200ms tick. Caught 6 throws in 1.2s with an error listener on a live three-player room, `now - startAt` at 83s on a 30s round with phase still `playing`.

**A refactor regression.** Before `9ca098f` (extract JS module into app.js, 2026-07-23) the function opened with `const meta = state.meta;`. The extraction dropped it. Live for roughly two weeks.

**It cost more than the progress bar.** Everything in that callback was dead: the clock stayed at 0:00, the bar never moved, and `fbStartVoting()` never fired, so **rounds never auto-advanced to voting**. The host had to press End Round every time or the room sat there. It hid for two weeks because the music was fine: `startRoundAudio` declares its own local `meta`, so the audio seeks and plays correctly next to a frozen clock.

**Fixing it exposed a second one of the same kind.** With the timer alive, the code after it ran for the first time and threw `groupMode is not defined` at 3705. `roundRole()` already returns `groupMode`; `startPlayback` just failed to destructure it. Impact was narrower (the game hint kept its stale text, wrong in group and GM modes) because it is the last statement in the function.

**Swept for more rather than guessing.** Ran eslint `no-undef` over all three game apps and the shared modules with browser globals declared. Against the committed file it reported exactly these two and nothing else; against the fixed file it is clean (the only remaining hit is `ResizeObserver` in draw, a real global missing from the throwaway config). **Worth wiring a `no-undef` pass into the workflow**: both bugs were invisible to a syntax check and neither surfaced in the console, since an uncaught throw inside `setInterval` just silently kills that tick.

**Verified on a live three-player round** (`CWM6`, real song): clock 0:03 → 0:30 monotonic, fill 11.4% → 100%, zero errors, and all three clients auto-advanced to the vote screen at 30s without anyone touching End Round.

---

## 2026-08-05: dance gameplay screen, character dancer replaces the stick figure

**Why.** The gameplay screen ran a six-line stick figure inside a dark navy disc. A proper character was drawn in Figma (`characterdance.svg`), so the screen now has something with personality on it.

**Figma's animated SVG export is broken, and the artwork was never the problem.** Dropping the exported `<style>` block rendered the character perfectly. The export puts `offset-path` plus `transform-box: view-box` and `transform-origin: 0 0` on four elements that already carry their own `transform` attribute (`#Vector_4`, `#Vector_5`, `#Vector_6`, `#Group_21`). `view-box` re-anchors each one to the viewBox origin, throwing away where it actually sat, so in Chrome the ear cups and headband tear off the head. Two other export artefacts: the four `<animate>` tags animate constant values (`319; 319; 319; …`) and do nothing, and 32KB of the 36KB file was keyframe blocks stepping at 1.25% intervals.

**So the animation is hand-written, and every keyframe drives a wrapper `<g>` that has no transform of its own.** That is the rule that keeps the thing from coming apart: the artwork's own positioning is never overridden. Six animations at a 1.5s cycle, exposed as `--dc-beat` so the whole dance retimes from one property if the file is ever inlined. **36KB down to 9.9KB, 3.7KB gzipped.**

**The CSS is wrapped in `CDATA`.** SVG is XML, so a literal `<` anywhere in a `<style>` block opens a tag. A `<g>` inside a code comment failed the whole document to a parser error. CDATA immunises it against `<`, `>` and `&` for good.

**Feet planted, by request.** Legs live in a static `#dc-legs` group outside `#dc-body` and never animate, and the body has no vertical travel. It grooves in place, pivoting off the point where the legs meet it. Arms swing (their lift sign differs per side, since they are drawn behind the body and the naive signs tuck them out of sight), headphones counter-rotate for weight, one blink every third cycle.

**Delivered as `<img src>`, not inlined.** The animation lives in the file, so there is nothing to reach in and drive from the page. Keeps `index.html` small and caches separately. Inlining is a one-line change if the dancer ever needs to react to game state, for example a tint for the imposter.

**Screen relaid out.** `.pulse-ring` is now `.dancer-stage`: no disc, no backdrop, no `pulseRing` scale. It takes the space left between the header and the progress bar and centres the character in it, which pushes the progress bar down against the End Round button and the hint. Dancer up from 168px to 200px now that nothing frames it. Visualizer bars recoloured from `--accent-teal` to `rgba(9, 19, 20, 0.16)`, a subdued grey, and the gap to the progress bar cut from 38px to 6px so the two read as one block. Teal is still on screen as the progress fill.

**The character shadow is `#E8E0D7`**, a flat warm tone rather than a translucent one. It was briefly matched to the bars at `rgba(9, 19, 20, 0.16)`; the bars kept that value and now render `#D4D3CF`, slightly cooler and darker than the shadow. Left deliberately: an exact match at `#E8E0D7` sits a hair off the `#FBF8F3` background and the bars would all but disappear.

**Kept the visualizer.** Removing it would have centred the dancer better (31px off true screen centre instead of 104px), but the bars are the only thing on that screen that responds to the audio. Both layouts were built and compared side by side under a simulated round before choosing.

**Verified in preview** by stepping the loop frame by frame at 0, 375 and 750ms with nothing detaching at any point; stylesheet parses with all six animations live and the reduced-motion query intact; `#dc-legs` confirmed outside `#dc-body`; no console errors; `git status` clean of the word and draw games. Version stamped `v2026.08.05.1`.

---

## 2026-08-05: stats page — Range picker dropdown (Clarity-style)

**Why.** Six fixed chips (7 / 14 / 30 / 90 / All / Custom) covered common cases and forced Custom for everything in between; wanting 45 days meant two date pickers. A single dropdown handles it: presets for one-tap, a number field for anything else, dates for a specific window. Same pattern Microsoft Clarity uses, familiar to anyone who has seen an analytics dashboard.

**Shape.** One bar, two groups: `View ▼` · `Range: [Last 30 days ▾]`. Trigger reads the current selection; popover has five radios — Today · Yesterday · Last [__] days · Custom (expands date pickers) · All time — and an Apply button.

**Apply behaviour, deliberately mixed.** Today, Yesterday and All time commit the moment their radio is clicked; Last N and Custom wait for Apply or Enter. Presets are single-value so nothing to "finish" typing; Last and Custom carry inputs that would leak partial values if they auto-applied on radio change. Focusing the number field auto-selects the Last radio; focusing a date auto-selects Custom; both save a click when the user goes straight for the input.

**URL persistence.** `?days=45`, `?days=all`, `?from=…&to=…` all round-trip; the default 30 leaves the URL clean. `?from`/`?to` win over `?days`. Today and Yesterday are encoded as `from=to=<that day's key>` (no `preset=` param) — the URL is honest about the days it represents, and `rangeTriggerLabel()` rehydrates them as "Today" / "Yesterday" only when `from` and `to` both match the current day. Tomorrow the same URL will show its literal date, which is the truthful thing to do for a bookmark.

**Dismissal.** Click outside or Escape closes the popover without committing. Trigger click toggles.

**No version stamp on stats.html** — the version pill only lives on the game apps (checked before shipping). Bump theirs, not the stats page.

**Verified in preview** against prod data: Yesterday (one click → URL `?from=…&to=…`, label "Yesterday"), Last 7 (radio + input + Apply → URL `?days=7`), Custom range (radios + two dates → URL `?from=…&to=…`), All time (one click → URL `?days=all`), click-outside close without commit, URL round-trip on reload including the Yesterday shorthand. No console errors.

---

## 2026-08-04: Pass the Phone, one device for the whole group (word)

**Why.** The word game has always needed a phone each, and the FAQ said so flatly. That rules out the case people actually ask about: a table of friends where half have flat batteries, or nobody wants to type a room code. A single shared phone that goes round the group covers it with no network at all.

**It is a mode, not a second game.** The picker sits in the lobby and reuses the dance game's components, so the two games look the same doing the same thing. **Everyone has a Phone** stays the default because it is the better experience and the one most groups want; **Pass the Phone** is the alternative. Reaching the lobby necessarily creates a room, so switching modes deletes it, listener detached first or the null-handler fires and sends the host home with a "Room closed" toast.

**The whole mode runs in the tab.** No room, no listener, no presence, no idle watchdog. What makes that cheap is building `state.players` and `state.meta` in exactly the shape the room listener produces, so every screen downstream works unchanged. `showCard()` needed **zero** changes to read a local room: handing over the phone is literally `state.myId = <that player>`. `state.roomCode` stays null throughout as a second line of defence, since every Firebase call site already guards on it.

The mode itself lives on `state.mode`, not in `meta`, because switching to Pass the Phone deletes the room and there is no meta left to hold it. It resets with the sitting.

**Nobody is the host once you are round a table.** Local players carry `isHost` and `isMe` false, so every roster row can be renamed and deleted, no row wears a Host tag or a YOU pill, and the reveal shows a bare name. Fixed a `joinedAt` collision on the way: rows were numbered by the player count, so deleting one from the middle and adding another gave the new row an existing sort key.

**Privacy is the whole ticket.** On separate devices your card is on your own phone; here it is on everyone's, so it is entirely a UI guarantee. Four rules hold it up. The card's back face stays empty until a swipe passes 45 degrees and empties again if the swipe is abandoned, so the word only reaches the DOM once someone has committed to the gesture that reveals it, and a face turned under 90 degrees is pointing away anyway. Tapping does nothing; only a swipe, or a keyboard activation, which is a click carrying `detail === 0`. A turned card cannot be turned back, since swiping both ways would let whoever picks the phone up next replay the last card. And back is trapped for the sitting, because a swipe that moved one screen would land straight on the card just handed over.

Verified by stepping through four players: each card correct and private, the back face empty between them, back trapped on every screen with a message saying which button moves forward, and a reload mid-sequence landing on the home screen rather than resuming into somebody else's card. **The gesture still wants a pass on a real phone**, which is the one thing a desktop browser cannot judge.

**The round cannot be a card.** Online, everyone keeps their own card up for the whole round. On one phone the thing goes on the table and whatever is on it is visible to all, so the round screen is names and nothing else: no word, no hint, nothing marking the impostor. Play Again returns to the lobby rather than dealing on the spot, because between rounds is when a group swaps a category or adds someone who has just turned up, and the lobby is the only place those controls exist.

**Analytics: a new dimension, and a deliberate silence.** `games/modes/{online,passphone}` with the usual daily copy, plus `games/players/<n>` lifetime so the typical single-device group size is visible. `trackRun` fires in both modes, since it only needs the group size.

The room funnel stays **silent** for these rounds and that is not a gap. There is no room and nobody joins, so firing `rooms/*` or `joins/*` would count rooms that were never created and joins that never happened, which is exactly what would corrupt the funnel gaps shipped on 08-03. Recorded in the README next to the funnel itself, because the obvious future "fix" is to wire them up. Read any `games/*` number against the mode split rather than assuming online play. The stats page now shows Games by mode for the word game too, seeded per section so both modes appear even at zero.

Same privacy model as everything else: counters only, no identifiers, and **player names never leave the device** in either mode.

**A real phone found two things a desktop never would.** Renames were opening while scrolling: the roster buttons fired on `pointerdown`, which on touch is the instant a finger lands, and the whole row was a click target for editing besides. The controls are recognised as taps now, meaning down and up on the same control without wandering, dropped the moment the browser fires `pointercancel` to claim the gesture for panning, delegated to the list because these actions rebuild it. Icons got a 44px hit area, the smallest a fingertip reliably lands on, invisible until pressed.

Pass to Next Player sometimes wanted two taps. Three plausible contributors, all fixed: the button had no press feedback at all, because an id selector setting a transform outranks `.btn.is-pressed`, so the scale that acknowledges every other button never reached the one players tap most; that same transform slid it 6px over 300ms, a moving target in exactly the window a thumb arrives in; and iOS Safari ignores `user-scalable=no`, so double-tap-to-zoom stays live and can eat a tap that follows another gesture, which `touch-action: manipulation` settles. The double tap itself cannot be reproduced on a desktop browser, so that one is a fix aimed at causes rather than a confirmed repro. Both README-documented, because both look like tidy-up candidates to anyone who has not held the phone.

**Housekeeping.** Real mode art replaced the placeholders, converted to webp at q82: 66KB and 63KB of PNG became 10KB and 9KB, and the 189KB round illustration became 26KB, with alpha verified by decoding back and reading a corner pixel. Originals went to `design/`, where this repo already keeps the sources. Note that `/icons/**` is served with a 7-day `max-age`, so returning visitors may see the old thumbnails for up to a week after deploy. Home, how-to and FAQ copy no longer claim the game needs a phone each. A `scripts/dev-server.py` now serves `www/` with caching disabled, after a stale stylesheet from `python3 -m http.server` cost an afternoon of chasing a design bug that did not exist.

**Deployed 2026-08-05**, `v2026.08.05.1`, hosting only. Rules were untouched, so no `--only database` deploy. IndexNow pinged, since the FAQ and how-to copy changed.

Counters to read against, taken minutes before the release: `games/total` 3216, `games/modes` and `games/players` both absent, `rooms` at created 21 / joined2 11 / reachedMin 10 / allReady 10 / started 9. The first online round should add `games/modes/online` **and** a `rooms/started`; the first passed round should add `games/modes/passphone` and a `games/players/<n>` and leave every `rooms/*` number exactly where it is. That second half is the assertion worth checking, because it is the one thing localhost could never exercise: `analyticsEnabled()` short-circuits the whole of `trackRound` off production, so no amount of local testing proves what the counters do.

Checked on the live site straight after: one passed round took `games/total` to 3217, wrote `games/modes/passphone` 1 and `games/players/3` 1, and left `rooms/started` at 9, which is the behaviour that could not be tested before deploy. It also moved `rooms/created` 21 → 22, which is correct and worth knowing: the mode picker lives in the lobby, so reaching it creates a real room that is then deleted at the switch. Everyone who switches adds a `created` with no `started` behind it, and the created-to-started gap carries them. The README now says so, since "the funnel is silent" was too broad a claim.

Note that `/icons/**` carries a 7-day `max-age`, so a returning visitor may keep the placeholder mode thumbnails for up to a week. Nothing to fix, just don't read it as a failed deploy.

**Post-deploy: the double tap was real, and it was Android.** Reported again from a Pixel 9 in Chrome, and this time with the detail that made it findable: tapping Pass to Next Player quickly after the swipe lights the button up but does not advance, while the same build on an iPhone is fine. That splits the two halves of a tap. Press feedback comes from `pointerdown`, which is generated from touch events; the action came from `click`, which on Blink is generated from the *gesture* pipeline, and a tap arriving there while the swipe that preceded it is still settling gets swallowed. Feedback yes, action no, and a second tap a beat later works, which is exactly the shape of the complaint. WebKit does not arbitrate gestures the same way, hence a clean iPhone.

Fixed by recognising the tap from the pointer events themselves, the same recogniser the roster controls got, with `click` left wired for keyboard and assistive tech. Both paths can fire and only one lands: `advancePass()` sets `passSwapping` or clears `passSeq` before returning, so whichever arrives second finds the guard shut. The button also captures its pointer, so a release still reaches it if the card's flip projects over it on a short screen, which it can: measured mid-flip, a 364px card renders 23px taller than its layout box, against a 45px gap at 412x700.

Verified with the three cases that matter: a touch tap carrying **no click at all** now advances, which is the Android case and the one the old handler could not see; a drag off the button still does nothing, and a clean tap afterwards works; and a tap followed by its own click advances exactly one card, not two. The guards are untouched, so the button is still inert before the card is turned and tapping the card still reveals nothing. The earlier `touch-action` and press-feedback work stays, since it was right for its own reasons, but this is the fix for what people were actually hitting.

---

## 2026-08-04: the song downloads during the countdown (dance)

**Why.** Chasing the causes of the audio failures fixed earlier today turned up a
structural one rather than a network one. Two measurements framed it: an iTunes preview
is **1,089,990 bytes**, and `cache-control: public, max-age=31536000` with no signed
expiry, so URL rot is a slow trickle over weeks and not a real suspect. Size and timing
were.

The host wrote both track URLs into the room *at the same moment* it set the phase to
`countdown`, so every client had the URL for the full four seconds of the 3-2-1. But
`audio.src` was only assigned inside `startPlayback`, which `tick()` calls when the
countdown reaches zero. `preload="auto"` on the element looked like it should cover
this and cannot: preload has nothing to act on until there is a source. So every phone
in the room started pulling a megabyte **at the same instant**, with the round clock
already running, over whatever single wifi the party is on.

**What changed.** `runCountdown` now calls `preloadRoundAudio`, and `startPlayback` only
seeks and plays. Load and play became two halves that talk through `audioLoad.status`,
so whichever finishes last starts the music. Measured on a real round: `src` assigned at
+0ms, `canplay` at +82ms, and by the time the countdown hid at +4327ms the buffer held
**the whole 30 seconds**. Before, that download began at +4327ms with an empty buffer.

**The part worth keeping.** A preload failure is cheap in a way a playback failure never
was, because nothing is running, so the loader retries once and the player never knows.
Verified: a sabotaged first load errored at +10ms, retried at +11ms, was playable at
+202ms and started with the round at +4326ms, with the overlay never shown. A failure
that survives the retry is held back and surfaced **at zero, not during the countdown**,
because an overlay appearing over the 3-2-1 would tell the room something is wrong with
that player. Verified: detected at +12ms, shown at +3903ms, exactly when the countdown
hid.

Only the download moved. The track name and the impostor banner stay at zero, or the
countdown would give the round away.

**Honest limit.** This is not a guaranteed four seconds for everyone. Clients enter the
countdown when their listener sees the phase change, so a player on a poor connection
gets the phase late and gets less of the window. It helps the people who need it least,
most. It is still strictly better than the zero head start everyone had before.

Verified across three tabs on real rooms over three consecutive rounds: normal round,
self-healing preload failure, permanent preload failure, and an uninstrumented player
that played all three cleanly. No console errors. Test room deleted.

---

## 2026-08-04: song load failures stop being silent (dance)

**Why.** Checking whether the 08-03 iTunes failures explained the round collapse showed
they did not: 12 that day, against 39 on 07-28 and 48 on 08-01, both high-round days.
So the spike was not a spike. What it did show is that fetch failures run at 15 to 50 a
day, every day, and the handling around them was poor in three separate ways.

**A player could be left in silence with nothing on screen.** `startPlayback` set
`audio.src` and waited on `canplay` with no `error` listener and no timeout. Apple drops
old preview URLs and a phone that blips off wifi mid-load never fires `canplay`, so that
player watched the 30-second timer run down hearing nothing, unable to say so without
outing themselves as the impostor. Nor could we see it happening: every counter we had
was host side. Now there is an `error` listener, a 9-second watchdog under it, a
`trackError('audio_load_failed')`, and a retry overlay. The tap re-runs the load and
re-seeks to the shared `startAt`, so a recovered player drops back in **in sync** rather
than starting the song from zero. Verified: a sabotaged URL produced the overlay, and
the tap resumed at `currentTime` 14s of a round already 14s old.

**Start could hang more or less forever.** Every picker walked its whole shuffled pool
calling `fetchPreview`, each miss costing up to the 6s abort timeout, with no cap, and
then `fbStartGame` retried the entire sweep. Pools run to hundreds of songs. Bounded now
by whichever of two limits trips first: 12 attempts catches a fast-failing network, a
15s deadline catches a slow one. The silent retry is also skipped when the first sweep
took longer than 4s, because a slow failure is not the transient blip the retry was
written for and doubling the wait helps nobody. Measured against a hanging API: 3
requests and 21 seconds, where before it was unbounded.

**The error message blamed the wrong thing.** "Check your connection" sends a host off
to fight their own wifi when Apple's API is what failed. Split into an offline message
and a service message off `navigator.onLine`, with matching `song_load_offline` and
`song_load_failed` labels, since one fixes itself and the other shows up across
unrelated rooms at once.

**A pre-existing bug this surfaced.** `fbStartGame` wrote `start-hint` directly, but that
line time-shares with the rotating "keep your screen on" tip. So "Loading songs…" was
painted over within seconds, and the tip then flipped back to the *stale* pre-Start
status. It now goes through `setLobbyStatus` with the rotation stood down for the
duration, and the hint progresses (3.5s "Still loading songs…", 9s "The music service is
slow right now") so a wait no longer reads as a freeze. That matters more than it
sounds: a host who reloads to escape a frozen button drops out of the room and loses the
lobby they just spent two minutes filling.

**Not done, deliberately.** Prefetching songs during the idle lobby would make Start
near-instant and immune to a blip at the worst moment, but it changes when we hit
Apple's API. Left as a follow-up until we see whether the above is enough.

Verified locally across three tabs on real rooms: hanging API, offline, healthy round,
sabotaged audio, and the retry tap. No console errors. Test rooms deleted. Analytics
does not fire from localhost, so none of this touched the live counters.

**How bad was it really.** Worth writing down, because the raw failure tally is
misleading and someone will read it again. Lifetime: **146** `songFetch` request
failures against **9** `song_load_failed`, so 137 of them were absorbed by the picker
moving to another song and no host ever saw them. 07-28 is the clean illustration: 39
failed requests, zero blocked hosts. Against 1,492 rounds over the nine days with data
that is roughly 5% of requests failing but only ~0.6% of rounds blocked. The retry loop
was already doing its job. This work is about the tail, not the average.

The 0.6% is a **floor, not the truth**, and that is the real reason for the audio fix:
the silent-stuck-player case had no counter at all, so it is missing from every number
above. `errors/audio_load_failed` starts measuring it from this deploy. Read it around
the same time as the room funnel.

**Shipped 2026-08-04.** Merged to main as `98f9b0c`, deployed with
`firebase deploy --only hosting` (database rules unchanged, so no `--only database`).
Verified live: `dance/app.js` and `dance/index.html` SHA-identical to the repo, version
stamp reading `v2026.08.04.2`, 16 matches for the new symbols on the production file.
Word, draw, shared and the hub are untouched by this change. Closes #69.

---

## 2026-08-04: room funnel analytics, the missing middle

**Why.** On 2026-08-03 traffic was normal (271 visits) but rounds collapsed to 67,
against 212 the day before and 298 on the comparable Monday. Investigating it showed
the app was fine: production was byte-identical to the repo, error counters were at
noise level, and the whole create → lobby → start path worked when driven by hand.
But it was impossible to say *why* from the data, because visits and rounds were the
only two numbers we had. "Nobody creates a room" and "rooms fill up but never start"
look identical from the outside and need opposite fixes. This entry closes that gap.

**The design decision that matters.** Every stage is a **high-water mark**, recorded
the moment a room reaches it, host side, once per room. Nothing is counted on the way
out. Most sittings end with a closed tab, which runs no code, so an exit-time counter
would have under-counted exactly the case worth measuring. It also means the four
abandonment reasons need no counters of their own: they are the gaps between adjacent
stages.

New under `analytics/<game>/` (lifetime plus a `daily/<YYYY-MM-DD>/` copy, same
fire-and-forget model as every other counter):

- `rooms/created` → `joined2` → `reachedMin` → `allReady` → `started`, cumulative.
  The gaps read as: nobody joined / not enough people / never readied up / host never
  pressed Start.
- `rooms/startFailed`, an event rather than a stage, because a host can hit it and
  then retry successfully. Worth watching: on 08-03 there were 12 iTunes fetch
  failures against only 30 dance rounds.
- `joins/{code,link,qr,crossgame}` and `joinFail/{notFound,inProgress,full}`.

**Hook placement, two things worth remembering.** `trackRoomStage('started')` sits
inside each game's own `trackRound`, not in `fbStartGame`, because every successful
start path already funnels through that one call and the two can therefore never
drift. And `trackJoinFail` had to go in `attemptCodeValidation`, not just `joinRoom`:
validation is the real gate and returns before `joinRoom` is ever reached, so hooking
only `joinRoom` would have left the counter reading near-zero while real users failed
constantly. Both sites are instrumented; they are mutually exclusive, so no double
count. A cross-game redirect is deliberately not counted as a failure.

QR deep links now carry `&s=qr` so a scan can be told apart from a pasted link, which
are otherwise the same URL.

**Verified** on the local preview with three tabs: full dance flow (create → QR deep
link join → manual join → ready → start → reveal → quit), word and draw create-to-
lobby, and the bogus-code path (cross-game lookup runs, then "No room found"). Zero
console errors in all three tabs, all test rooms deleted afterwards, and
`analytics/*/rooms|joins|joinFail` confirmed still absent, proving the localhost gate
keeps trial runs out of the live counters. Counter *values* can only be confirmed
after deploy, since analytics is production-only by design.

Version stamps: dance and word v2026.08.02.1 → v2026.08.04.1, draw v2026.08.03.2 →
v2026.08.04.1. Branch `feat/room-funnel-analytics`, issue #60.

**Shipped.** Merged to main and deployed with `firebase deploy --only hosting`
(hosting only, deliberately: `database.rules.json` is unchanged and a full `firebase
deploy` would have re-pushed the rules for no reason). All seven touched files verified
SHA-identical on impostorgames.com afterwards, all three version stamps reading
v2026.08.04.1 live.

**Verified on production**, which is the only place these counters run. Created a real
room, then joined it through a QR-style deep link from a second browser:

    rooms  {"created":1,"joined2":1,"daily":{"2026-08-03":{"created":1,"joined2":1}}}
    joins  {"qr":1,"daily":{"2026-08-03":{"qr":1}}}

That confirms the whole chain: the host-side bump, the once-per-room dedupe, the daily
mirror, and the `s=qr` marker resolving to `qr` rather than `link`. `reachedMin`,
`allReady` and `started` correctly stayed absent with only two players and nobody ready.
Test room deleted afterwards.

**Those three increments are mine, not real users.** The first `created`, `joined2` and
`joins/qr` each need one subtracted when reading the earliest data. Left in place rather
than deleted: `analytics` is world-writable, so a delete could have raced a real user's
room in the same minute, and a documented +1 is safer than a destructive fix. Also noted
in README.

Note the UTC day boundary. Deployed at ~19:25 UTC on 08-03, which is 00:55 IST on 08-04,
so the first counters landed in the `2026-08-03` bucket. The boundary falls at 05:30 IST,
the deadest hour for the ~80% Indian audience, so late-night sittings stay whole inside
one bucket.

Follow-ups filed rather than done: **#61** stats-page panels, deliberately deferred until
~2026-08-11 so they can be laid out against a week of real data including a weekend
instead of zeros; **#62** cap the per-day song list, then range-scope the stats fetch
(95% of each day's `games/daily` record is song titles, ~3.2 KB/day, and `stats.html`
pulls the whole 158 KB tree on every load).

---

## 2026-08-03: final screen shows the drawing + ink in the ballot

Two additions to the draw game's Game Over screen; draw only.

- **The finished drawing now appears on the final screen**, in a new "The drawing"
  section below "Who voted whom", reusing the vote screen's `.vote-thumb-wrap` /
  `.vote-thumb` and a new `#over-canvas`. `revealImposter` paints it with the same
  `paintThumb('over-canvas', 220)` helper the vote screen uses, called after
  `go('over')` so the thumb has a laid-out parent to measure. Safe because nothing
  clears `strokes` between the vote and the reveal (`resetCanvasState` only runs at
  the start of a round).
- **"Who voted whom" now carries each player's ink colour.** A `pdot` sits after the
  voter's name and after the target's name, matching the vote list and tally. The
  voter's name + dot were wrapped in the flex slot (new `.ballot-name`) so the dot
  hugs the name while the arrows still line up down the column.

Verified on the final screen in the mobile preview: drawing renders below the
ballot, ballot rows show voter→target with both ink dots, arrows aligned, tally
unchanged, no console errors. Draw version stamp v2026.08.03.1 → v2026.08.03.2.
No push/deploy yet.

---

## 2026-08-03: draw play-screen layout, more breathing room

Reworked the drawing screen so the canvas dominates and the chrome gets out of
its way. Draw game only; word and dance untouched.

- **Turn pill moved into the top bar**, next to the mute button (`.topbar-right`),
  replacing the old centred `.turn-head` row. It keeps every state (`Name’s turn`
  while watching, green `Your turn` on your go, countdown inside). Verified a long
  drawer name ellipsis-clips instead of shoving the mute button off-screen, and
  scoped `.play-topbar .back-btn { flex:none; white-space:nowrap }` so "← Leave" /
  "← Quit Game" never wraps to two lines.
- **Turn strip (pchips) moved below the canvas**, inside `.canvas-wrap` which is now
  a column holding canvas then chips, centred in the leftover height
  (`justify-content: center`, set during review). The slack splits evenly above the
  canvas and below the chips: the breathing space the change is after.
- **Green 1px canvas edge on the drawer's own screen only**, via
  `#draw-canvas.is-my-turn` (a `0 0 0 1px` ring shadow, no reflow), toggled from the
  same `mine` flag as the green pill in `renderTurnBar`.
- **Round number tucked inside the canvas**, bottom-left, subtle `--ink-soft`,
  now formatted `Round X / Y` (was just `Round X`).
- `sizeCanvas` now reserves the strip's height (`strip.offsetHeight + 10`) so the
  square is never sized over the chips.

Verified in the mobile preview (375-wide): drawer view (green edge + green pill),
watcher view (clay pill, no edge), long-name header, no console errors. Draw
version stamp v2026.08.02.1 → v2026.08.03.1. No push/deploy yet.

---

## 2026-08-03: homepage title now names all three games (SEO)

The homepage `<title>` only listed Dance and Word, so the Draw game had no
exact-match phrase in the strongest on-page SEO signal. Rewrote it to name all
three games as full phrases:

- Before: `Impostor Dance Game & Impostor Word Game — free party games | Impostor Games`
- After: `Impostor Dance Game | Impostor Word Game | Impostor Draw Game`

Why: prompted by a Search Console check where "impostor draw game" returned the
Word page and homepage with "Missing: draw" (the `/draw/` page is discovered via
sitemap but not yet indexed; Request Indexing submitted separately). The new title
gives "Impostor Draw Game" as a contiguous exact phrase. Dropped the "free party
games" tail because it is already saturated elsewhere: the meta description ("Free
multiplayer online impostor party games..."), 27 "party game" / 25 "free" body
mentions, and all three subpage titles already carry Free + Party Game. ~61 chars,
fits Google's display width with thin pipe separators. Brand suffix dropped since
the domain shows above the title in results. Draw page verified indexable (no
noindex, self-canonical, no X-Robots-Tag). Homepage version stamp v2026.07.29.1 →
v2026.08.03.1. No push/deploy yet.

---

## 2026-08-02: Anonymous auth switched back off, closed out

The testing window opened for #57 is over: the provider is disabled again in the
Firebase Console, as the #57 entry below said it should be.

Confirmed nothing depended on it. `signInAnonymously` is never called anywhere in
`www/`; `database.rules.json` requires `auth != null` only under `users/$uid`, and
rooms are a no-auth design; the one `user.isAnonymous` reference in
`www/shared/auth.js` is a defensive guard in `recordAccountOnce()` so an anonymous
session could never be counted as a registered account. Checked on production:
no console errors, the sign-in modal still offers exactly Google and email link,
and the guest host path reaches the name/Create Room screen with no auth prompt.

Provider settings are **console-only, not version-controlled**, unlike the DB
rules. Worth remembering when reasoning about what a deploy can and cannot change.

Standing rule, restated: signed-in code paths cannot be driven end to end without
the user re-enabling a provider session, which is why `groups/created/signedIn`
and `groups/migrated/total` are verified by reading the code. Ask rather than
enabling Anonymous auth, and if it is enabled for a testing window, switch it off
afterwards.

---

## 2026-08-02: run-length panels now honour the stats range (#59)

`www/shared/analytics.js`, `www/stats.html`, version stamps on dance, word and
draw (all three call `trackRun`). Hub is untouched: it has no rounds, so no runs.

### The problem

"How long groups play" and "Groups by size" sat under the range chips on
`/stats.html` and ignored them completely. Both read `analytics/<game>/runs`,
which only ever existed as a lifetime tree. The panels said "all time" in small
grey text, which nobody reads next to a live range selector, so the numbers just
looked stuck.

### Why there was no per-day tree to begin with

`trackRun` is self-correcting, and that is what blocked it. There is no reliable
"the group finished" event, people just close the tab. So on round N it writes
`+1` to bucket N and takes back the `-1` it wrote to N-1 last time. That makes
`runs/<size>/<n>` read as "runs that ended at exactly n rounds" without needing
an end event at all.

Stamp that with the *current* day and a group playing across midnight writes its
`+1` to today and its `-1` to yesterday: yesterday stays permanently inflated,
today goes negative. The original comment ruled per-day out for this reason.

### The fix: stamp the day the run started

`runDay` is now frozen at round 1, exactly as `runSize` already was, and every
write for the rest of the run is addressed to it:

```
runs/daily/<dayRunStarted>/<size>/<rounds>
```

The take-back always lands in the bucket that received the matching `+1`, so it
can never cross a day boundary and never goes negative. A daily bucket reads as
**"runs that started that day, at their full length"**, which is the semantic a
date range should have anyway: a Friday-night session that ran past midnight
belongs to Friday, not split across two days.

`runsFor()` in `stats.html` now takes `(key, days, isAll)` and either sums the
daily buckets or reads the lifetime tree. It skips the `daily` and `meta`
children when walking sizes, since both live under `runs` alongside the size
keys.

### The old data, and why it is only a footnote

Runs recorded before this shipped have no date information anywhere. They are one
merged block, so they cannot be backfilled without inventing dates, and they
cannot be folded into a range either: a "last 30 days" window overlaps the block
only partly, and you cannot split a merged total. Including it overcounts,
dropping it undercounts.

So it is a **label, not a data source**. `runs/meta/{from,to}` records the window
the legacy block covers, written once per namespace from the CLI:

```
from 2026-07-30   run tracking started (commit be68531)
to   2026-08-02   per-day counting started (this deploy)
```

When the selected range reaches back past `meta.to`, the panel says so instead of
quietly under-reporting. The gap turned out to be about three days, since run
tracking itself is only a few days old.

`meta.to` is preferred for that note, falling back to the oldest day actually
present in `runs/daily`, so the note still works if the stamp is ever missing.

### Cost

Negligible, and worth stating because it doubles the write count for runs. The
entire runs history at the time of writing was **861 bytes**; the whole analytics
tree was 155 KB. A day only stores the buckets it actually touched, so across all
three games this is roughly 0.3 KB/day, about 100 KB/year against a 1 GB free
tier.

### Testing

Verified against the live analytics snapshot with a temporary `window.__T` hook
in `stats.html` (removed before commit, zero matches on production):

- Lifetime read unchanged at 30 groups with a seeded `daily` and `meta` in place,
  proving neither child leaks into the size walk.
- A seeded two-day range returned 6 groups, 83% played again, median 2 rounds,
  with per-size averages, and the same numbers on Overview (which sums the three
  games).
- The legacy note appears on a 30-day range and disappears on "all time".
- No console errors.

Daily numbers start empty on deploy day and fill in from there. The default view
is 30 days, so both panels read near-empty at first. That is the daily record
having no past, not lost data: "all time" still shows everything.

---

## 2026-08-01: song-group analytics, creation plus the sign-in funnel (#58)

`www/dance/app.js`, `www/dance/index.html` (v2026.08.01.9), `www/stats.html`.
No `database.rules.json` change (`analytics` is already writable) and no new
dependency: everything rides on the existing `bumpAnalytics()` kit in
`www/shared/analytics.js`.

### What it answers

Two questions, and the second is the one that matters. How many people build a
song group, and which of the three sign-in prompts from #57 actually converts.
Without the second half the guest flow is a guess: we would know groups get
built but not whether moving the ask to the loss moment did anything.

### The counters

Everything lands under `analytics/music/groups`, written twice per event, once
as a lifetime total and once into `groups/daily/<YYYY-MM-DD>/<same path>`, so
the stats page can show a conversion rate for any range rather than only an
all-time one.

```
created/{total,guest,signedIn}   a new group was saved
creators                         tabs that created at least one
edited/total                     an existing group was re-saved
migrated/total                   a guest group landed in an account
prompt/{shown,signin,guest}      the "Group Created!" fork
lose/{shown,signin,quit,stay}    the "Lose your song group?" prompt
builderLink                      the in-builder sign-in link
```

Both prompts balance: `prompt/shown` = `signin` + `guest`, and `lose/shown` =
`signin` + `quit` + `stay`. Dismissing "Group Created!" is folded into `guest`
because it is the same decision (the group already works either way, the dialog
only decides whether it outlives the session). Dismissing the lose prompt is
its own outcome, `stay`: the host neither signed in nor gave the group up, they
went back to playing.

### Counting people without an identifier

We cannot. Storing one would cost the cookie-free model that lets this run with
no consent banner, so `created/total` counts events and one host making two
groups reads as two. `creators` sits next to it as the honest approximation: a
`sessionStorage` flag bumped once per browser tab, the same trick `trackSession`
already uses for visits. The flag deliberately outlives `clearSessionGroups()`,
because the tab still created a group even after the host leaves the room.

Nothing identifying is stored. Group names and the songs inside them are never
written, matching the flat `userGroup` label the play side already uses.

### The double-count that had to be designed out

The redirect sign-in path builds a group that was never a guest group. The host
taps the builder's sign-in link, the page reloads, `consumeGroupDraft()` adopts
the stashed draft as a session group, and `migrateSessionGroups()` immediately
saves it to the account. Counted naively that one group is both a creation and
a rescued guest group.

So `saveSessionGroup()` now carries a `fromDraft` flag, `consumeGroupDraft()`
counts the creation itself (as `signedIn`, which is what the host is by then),
and the migration skips `migrated/total` for those records. The flag lives on
the record rather than in a variable so it survives a migration the group cap
defers to a later sign-in.

The same reasoning covers the builder: saving a session group while signed in
is a migration, not a creation, since the guest save already counted it.

### Stats page

A "Song groups" pair of panels in the Dance section: creations per day with a
`created · sessions · guest / signed in` summary, and a "Where hosts sign in"
funnel listing each prompt with its show count and its sign-in rate.

The funnel rows are in flow order, not sorted by size. Sorting would bury a
prompt that fires constantly and never converts, which is exactly the row worth
seeing.

### Gotcha worth keeping

`.barwrap` flexes the bar track into whatever space the trailing text leaves,
so a longer suffix on one row silently shortens that row's bar. The first cut
had "24% signed in" next to a bare "taps", which made the 4-tap row render a
wider bar than the 29-show row. The suffixes are uniform now, and the wording
moved into the panel hint.

### Testing

Local writes nothing (`analyticsEnabled()` is production-only), so verification
ran with a temporary dry-run hook in `shared/analytics.js` that logged the
payload instead of writing it, then was reverted. Every guest path was driven
in the browser and asserted on the logged payload:

- create a group: `created/total` + `created/guest` + `creators`, then `prompt/shown`
- a second creation in the same tab: no second `creators` bump
- edit and re-save: `edited/total` only, no creation, no prompt
- the fork: Continue as Guest and Escape both give `prompt/guest`
- the lose prompt: three shows, one each of `signin`, `quit`, `stay`
- builder link: `builderLink`

`created/signedIn` and `migrated/total` were verified by reading the code, not
driven: they need a real account, and anonymous auth is being switched back off
after the #57 testing.

The stats panels were checked against a seeded snapshot (also temporary, also
reverted) for both a 30-day range and all-time, and against the real empty
production tree, which renders the empty state cleanly.

---

## 2026-08-01: song groups open to guests, sign-in moves to save time (#57)

`www/dance/app.js`, `www/dance/index.html` (v2026.08.01.8), `www/dance/dance.css`,
`www/shared/base.css`, `www/shared/auth-ui.js`, `www/success.webp` (new),
`assets/success.png` (source, outside the deploy dir). No `database.rules.json`
or analytics changes.

### The change

The sign-in wall moved from "Create a song group" to "keep this group". Before,
tapping Create opened the sign-in modal, so hosts were asked to pay before they
had felt any value. Now the builder opens for everyone and the account question
arrives at the moment it means something: they have a group and are about to
lose it.

The guest tier is deliberately real but temporary. A guest group plays a full
game, because the songs ride in the room meta (`meta.groupSongs`), so no client
ever reads the host's account to play. What a guest cannot do is keep it.

### Guest-group lifecycle

Guest groups live in `sessionStorage` under `imp_dance_sessgroups`, with a
matching `imp_dance_groupdraft` for a build in progress. They survive a reload
(including the sign-in redirect round trip) but **end with the room**:
`leaveRoom()` calls `clearSessionGroups()`, and since Quit Game, Leave Room,
Exit Room and the involuntary "Room closed" path all funnel through it, every
exit clears the same way. A mid-room refresh keeps the group, which is the
point: only a deliberate exit ends the sitting.

That deliberately closes the loophole where a guest could re-host all evening
and never need an account. Groups belong to the sitting; the account is the
only way to have one outlast it.

### The three conversion points

1. **In the builder**: "Sign in to save and use anytime." under Save, for
   hosts who already know they want it. Stashes the draft before opening the
   modal so the WebView redirect (which reloads the page) can't lose it; the
   popup path keeps the builder open underneath and drops the stash on
   completion. Any normal builder close clears the stash, so a later sign-in
   can't resurrect a stale copy.
2. **On save**: the "Group Created!" sheet: **Sign in & Save** (*Save it to
   your account and use it anytime.*) or **Continue as Guest** (*Available only
   during this session.*). Copy is locked; do not paraphrase it.
3. **On the way out**: "Lose your song group? / Signing in keeps it for next
   time." with **Sign in & Save** and **Quit anyway**, shown only to a
   signed-out host with something unsaved. The strongest of the three, since
   the loss is imminent and concrete.

Dismissing the leave prompt means "not now": the host stays in the room with
the group intact. Signing in from it saves the group and leaves them in the
lobby rather than resuming the exit. An earlier version auto-left once the save
finished, but that flag could go stale (tap Sign in & Save, dismiss the modal,
sign in later from the header, get booted out of a live room), so quitting
stays a deliberate second tap.

### Migration on sign-in

`migrateSessionGroups()` runs on any sign-in and adopts session groups into
`users/<uid>/danceGroups`, respecting the 2-group cap that saved and session
groups share. Overflow stays session-only with a toast rather than being
dropped. If a migrated group is the room's current source, the room meta is
repointed to the new key so a game in progress follows the saved copy.
`consumeGroupDraft()` covers the redirect case, adopting a stashed draft after
the page reloads mid-sign-in.

Guest-group rounds keep counting under the existing `userGroup` label. No song
titles are ever logged, so the analytics stay aggregate and cookie-free.

### Design

The "Group Created!" sheet uses the mascot success art: `assets/success.png`
converted with `cwebp -q 85 -alpha_q 100` to `www/success.webp`, 169 KB down to
27.6 KB (84% smaller), in line with the site's other webp art. Rendered at
120px with explicit width/height so it cannot shift layout. The PNG source
lives outside `www/` so it stops shipping with every deploy.

Both sheets share a shape, so the styles are `.choice-*` (`choice-sheet`,
`choice-head`, `choice-title`, `choice-sub`, `choice-note`, `choice-secondary`)
with only the illustration dialog-specific. Sheet spacing is grouped: the gap
from heading block to buttons is declared once on `.choice-head`, and the top
space lives entirely in the container's padding, so neither value is split
across two rules.

In the picker, session groups carry an "on this session" tag. The
minimum-songs hint moved onto the count line under the search box, reading
"3 songs | Add at least 4 songs"; while searching that line shows the result
count only, and with nothing picked it hides entirely.

### Modal height now follows the device

The sheet shell was already `max-height: 85vh`, but the builder could never use
it: `.group-mid` was pinned to `max-height: 300px` inside a non-flex body, so a
tall phone showed exactly as many songs as a short one. The body is now a flex
column and the list is `flex: 1; min-height: 0` with no cap, so it absorbs
whatever height is left.

The inset is a fixed 20px on all four sides, held in two custom properties on
`.cat-modal-backdrop` that both its padding and the sheet's max-height read, so
the pair cannot drift. `max(20px, env(safe-area-inset-*))` keeps the sheet off
the notch and home indicator in the native shell, which 85vh used to clear by
accident.

**`max-height: 100%` does not work here.** Against a flex container it computes
to the content height and silently does nothing (measured: 566.95px on a 667px
viewport). The cap is `calc(100dvh - insets)` with a `100vh` line first as a
fallback; `dvh` also stops mobile browser chrome from clipping the sheet.

Measured with a 12-result list, 20px gap top and bottom throughout: 4 rows at
667px, 6 at 844px, 8 at 932px, 10 at 1200px. All 20 modals across dance, word
and draw were checked for overflow; none. Short landscape (380px) degrades to a
cramped but fully scrollable list with the footer still reachable, judged
acceptable for a portrait party game. Adding a minimum row height there would
push the footer out of reach.

### Fixes made along the way

- **Stacked-modal Escape.** With the sign-in modal over the builder, Escape
  closed both and discarded the draft. It now closes only the topmost layer.
- **Picker double highlight** (pre-existing). With a group as the source,
  `meta.categories` is null and `activeCategories()` falls back to
  `DEFAULT_CATEGORY`, so a built-in row rendered selected alongside the group
  and two rows looked active. `renderCategoryModal` now takes an empty
  committed list when `groupSourceActive()`.

### Testing

Verified in the local preview: builder opens signed-out, all three prompts use
the locked copy, a guest group plays as the room source, edits save quietly,
the draft stash writes and clears correctly, and quitting clears groups so a
new room starts empty.

The migration path was exercised end to end with Anonymous auth temporarily
enabled (it is not gated on `isAnonymous`, so it drives the real code path):

- Guest group moved into `users/<uid>/danceGroups`, session copy cleared, and
  the live room meta repointed from the `sess-` id to the real key.
- Cap branch: account holding 1 with two guests pending, exactly one migrated
  and one stayed session-only.
- Redirect recovery: a stashed draft was adopted and saved after a reload.

Test user and data deleted afterwards. `analytics/hub/accounts` stayed null,
confirming anonymous users never reach the counter (`recordAccountOnce()` skips
them and the analytics gate blocks non-production hosts anyway). Anonymous auth
switched back off after testing.

### Gotchas worth remembering

- **Stale JS locally.** `python3 -m http.server` sends no cache headers, and a
  module resolves to the same URL however the page is cache-busted, so the
  browser will happily re-run a stale `app.js`. Restart the preview on a fresh
  port when a JS change appears to have no effect. Production and preview
  channels are unaffected: `firebase.json` sets `no-cache, no-store,
  must-revalidate`.
- Preview channel URLs need adding to Firebase Auth authorized domains before
  Google sign-in works on them; anonymous sign-in does not, which makes it the
  cheaper way to test migration logic.

### Follow-ups

- #36 branding of the auth domain is still open and still visible on the
  consent screen.
- Anonymous auth should stay disabled outside testing windows.
---

## 2026-07-30: cross-game lookup ignores abandoned rooms

`www/shared/roomlookup.js` only.
Version stamps `dance v2026.07.30.3`, `word v2026.07.30.4`, `draw v2026.07.30.4`.

The cross-game lookup shipped earlier today prefers a room in `lobby` phase,
which is exactly the state abandoned rooms are stuck in. At the time of writing
1,502 orphans were sitting in `lobby`, so a mistyped code could forward a player
into a room that had been empty for weeks. Worse than the flat "No room found"
it replaced, because at least that told the truth.

Now a cross-game hit has to be alive as well as present: the same `IDLE_MS`
cutoff the games themselves use, so we only forward players to a room the
receiving game would still let them into.

Costs nothing. The lookup already fetched `/meta` and only read `phase` off it;
`lastActivity` was sitting in the same snapshot unused.

An unreadable stamp gets the benefit of the doubt and counts as alive. Rooms are
written with `serverTimestamp()`, so the likeliest cause of a stamp we cannot
parse is a room created seconds ago, which is the last thing to reject.

Rooms left with a stray `players` node and no `meta` never reach this check at
all: the lookup reads `/meta`, so they fail the existence test first. Worth
confirming rather than assuming, since it is the difference between this filter
being necessary and being sufficient.

Note the debt: `IDLE_MS` now exists in four places, the three `app.js` files and
here. Consolidating it into one shared constant is a small follow-up worth doing
before it drifts.

Verified with an A/B on a single room, which is the test that actually proves
the filter rather than something else: created a real Word room, backdated its
`lastActivity` to 20 minutes, typed the code on the Dance page and got "No room
found with that code" with no forward. Reset the same room's `lastActivity` to
now, retyped the same code, and it forwarded to the Word game's nickname screen.
Only the timestamp changed between the two runs. No console errors.

---

## 2026-07-30: cleared 2,176 abandoned rooms, added a purge script

New `scripts/purge-idle-rooms.mjs`. No app code changed, no version bump.

The database had 2,257 rooms in it, the oldest from 21 June, and only one was
alive. Each game already closes its own room after `IDLE_MS` of inactivity, but
that watchdog is a `setInterval` living inside the page: it can only fire while
somebody still has the tab open. When the last person closes their tab the room
is orphaned with nobody left to clean it up. `createRoom` reclaims a code only
if a new room happens to roll that exact string, which at well under 1%
occupancy of the 32^4 code space is close to never. So they accumulate forever.

Storage was never the problem. 1.1 MB against the free tier's 1 GB is 0.1%, and
2,257 rooms is 0.2% of the code space. The reason to care was the cross-game
lookup shipped earlier the same day: it prefers a `lobby`-phase hit, and 1,502
of those orphans were sitting in `lobby`, so a mistyped code could forward a
player into a ghost room.

The script is the missing enforcer: the same rule the games already apply, run
by something that does not depend on a browser tab. Dry run is the default.

Three kinds of dead room, each deleted for its own stated reason:

- **idle**, past the cutoff. This is the games' own rule, so a room the script
  removes is one the in-app watchdog would already have removed had anyone been
  present to run it. That is the argument for why it cannot destroy a room the
  app itself considers alive.
- **ghost**, a `players` node with no `meta`. Worth writing down because the
  first reading was wrong: these are not rooms caught mid-creation. `createRoom`
  writes meta and players in a single atomic `set()`, so the state is only
  reachable *afterwards*, when the presence system re-adds a player to a room
  whose meta was already deleted. Both `joinRoom` and `attemptCodeValidation`
  require `.meta`, so such a room is unjoinable and invisible by construction.
- **corrupt**, a stamp more than an hour in the future. Two rooms were stamped
  for the year 2286, presumably a client writing a raw `9999999999999` rather
  than `serverTimestamp()`. These matter more than their count suggests: no
  time-based rule will ever catch them, so without this case they are immortal.

Deliberately kept at 15 minutes rather than a larger safety margin. The margin
would have implied the purge is a looser second rule, when it is the same rule
with a different enforcer. Confirmed against the data: 15 minutes and 1 hour
selected identical sets, because nothing lives in that band when the watchdog
works.

Both timestamps are `serverTimestamp()` in all three games, so a client with a
wrong clock cannot make a fresh room look ancient and get it purged.

Verified before deleting anything: created a live room and re-ran the dry run,
which reported `keep (active) 1` with the delete count unchanged, proving the
cutoff protects a real room. After the run the live control room was still
present and counts had gone 1,565 → 41, 663 → 38, 29 → 4, with room data down
from 976 KB to 8 KB.

Not addressed, and the bigger prize: **67% of the orphans (1,502) were rooms
created and then abandoned before anyone joined**, someone tapping Create,
seeing the code, and closing the tab. The tempting fix is an `onDisconnect` that
drops the room when the host's socket dies, but the host's socket dies exactly
when they switch apps to paste the code into WhatsApp. That would delete rooms
at the precise moment the host is inviting people. Needs a real design, not a
patch.

Automating the purge was left open on purpose. Firebase scheduled functions need
the Blaze plan; a GitHub Action avoids that but needs a service-account key
stored as a secret. Neither is worth deciding until we have seen how fast the
pile actually regrows.

---

## 2026-07-30: a room code now works from any game's page

New `www/shared/roomlookup.js`, plus an import and a six-line hook in each of
`www/{dance,word,draw}/app.js`.
Version stamps `dance v2026.07.30.2`, `word v2026.07.30.3`, `draw v2026.07.30.3`.

The three games keep rooms in separate trees (`rooms`, `rooms-word`,
`rooms-draw`) so they can hand out the same 4-char code without colliding. The
side effect was that a player standing on the wrong game's page got a flat "No
room found with that code" for a code that was perfectly valid one page over.
Nobody reads that message and thinks "wrong game"; they think the code is
broken. Same for a QR scanned while a different game's tab happened to be open.

Now, when a game's own tree comes up empty, it checks the other two before
giving up. On a hit it shows "That code is a Word Game room. Taking you there…"
and forwards to `/word/?join=CODE`, which is the deep-link parameter every game
already handles, so the receiving page needed no new code.

Decisions:

- **Lookup on the miss path, not a global room index.** An index
  (`roomIndex/{code} → game`) would be one read instead of two and would make
  codes globally unique for free, but rooms are deleted from several places in
  each game (host leaves, the onDisconnect cleanup, the idle watchdog). Every
  one of those would have to remember to delete the index entry, and a single
  miss leaves a stale pointer that confidently sends players to a room that no
  longer exists. That is a worse failure than an honest error, in exchange for
  saving one read on a path that rarely fires. Not worth the consistency
  surface.
- **Costs nothing on the happy path.** The extra reads only run after the local
  lookup has already failed, so a correct code never pays for this. The two go
  out together via `Promise.all`, so it is one round-trip, and they read
  `/meta` rather than the whole room.
- **Cannot hijack a valid join.** The cross-game search is only reachable once
  the current game's own tree has returned nothing, so a real local room always
  wins. Codes can legitimately live in two other trees at once; in that case we
  prefer the one still in `lobby` phase and otherwise take the first.
- **No pre-check of phase or capacity before forwarding.** The target game runs
  its own validation and reports "Game already in progress" or "Room is full".
  One source of truth, less code, and the player lands on the correct page to
  retry rather than being told no on the wrong one.
- **Same-origin path, never the canonical URL.** `/word/…` rather than
  `https://impostorgames.com/word/…`, so a preview channel, a laptop on the
  LAN, and the native app (Capacitor serves `www/` from `https://localhost`)
  all keep the player inside the build they are already running.
- **One hop, enforced.** The forward adds `&via=<fromGame>`, read at module
  import time before the deep-link handler strips the query string. A loop was
  already near-impossible since forwarding requires a positive hit, but this
  rules it out rather than leaving it to timing.

Falls out for free: the hub forwards any legacy `?join=` to `/dance/`
(`www/index.html`), a holdover from when dance was the only game. Those links
now get bounced onward to whichever game actually owns the code.

No database rules change. Each `rooms*/$code` was already `.read: true`, so a
Word page could always read a Draw room's meta; nothing new is exposed.

Verified against live rooms on the local server, deleting both test rooms
afterwards: Word code typed on the Dance page forwarded and joined for real
(the player appeared in `rooms-word/<code>/players`); Draw code forwarded
correctly from both the Word and Dance pages; an unknown code still showed "No
room found with that code" with no forward; a room flipped to `playing` still
forwarded, with the Draw page correctly reporting "Game already in progress";
and arriving at `/dance/?join=<wordCode>&via=word` did not bounce back, proving
the hop guard. No console errors on any page.

---

## 2026-07-30: run-length analytics, how long a group actually plays

`www/shared/analytics.js`, plus two lines each in `www/{word,dance,draw}/app.js`.
Version stamps `dance v2026.07.30.1`, `word v2026.07.30.2`, `draw v2026.07.30.2`.

We could already see that rounds happened, but not whether a group plays once
and leaves or settles in for ten. That gap showed up while looking into a dip on
2026-07-29: sessions held steady while rounds fell, and there was no way to tell
whether groups were playing shorter or fewer groups were playing at all. This
adds the missing dimension.

The hard part is that there is no reliable "the group finished" event. People
close the tab, so a final "group of 5 played 5 rounds" record can never be
written. The fix is to re-bucket as the run goes: on round N we add to the N
bucket and take back the N-1 written last time. At any moment
`runs/<size>/<n>` reads as "groups whose run ended at exactly n rounds", and it
corrects itself when the group plays on. `bumpAnalytics` already forwards its
values to `increment()`, so negative amounts worked with no change to the helper.

New counters, both lifetime:
- `analytics/<game>/runs/<size>/<rounds>` the run-length histogram.
- `analytics/<game>/games/size/<size>` rounds played, by group size.

Decisions:
- **Lifetime, never per-day.** A group still playing at midnight would add to
  tomorrow and take back from yesterday, driving the older day negative. Chosen
  deliberately over a daily split.
- **Size frozen at the run's first round.** Players drift in and out, and a
  take-back aimed at a different size bucket would corrupt two buckets at once.
- **Tails bucketed** at `12plus` for size and `20plus` for rounds, keeping the
  tree small and readable. Once clamped the bucket stops moving, so the write is
  skipped entirely rather than doing +1 and -1 on the same key, which would
  cancel out and lose the run.
- **A run is one host's sitting.** There is no host migration and ids are not
  persisted, so a host who reloads can no longer start rounds. An in-memory
  counter reset in `leaveRoom()` matches a real run exactly, with no room writes.

Draw counts a *game* (one press of Start), not its individual drawing turns, so
the number stays comparable across all three games.

Privacy model unchanged: aggregate counters only, no room codes, no ids, no
per-group records.

Verified: `node --check` on all four files; a simulation of the bucketing against
a ledger of 13 groups (including a 25-round run, a 19 vs 20 boundary pair, and a
size-14 group) reproduced the exact expected histogram, left no bucket negative,
and accounted for all 106 rounds in `games/size`.

### Stats page display

`www/stats.html` gains two panels, in Overview and in each game's view:

- **How long groups play** — the run-length histogram, ordered by round count
  rather than by size, with the headline in the panel title: total groups, the
  share that played more than once, and the median run. That share is the
  engagement number the page could not answer before.
- **Groups by size** — groups per starting size, with the average run length
  beside each. This is what answers "do bigger groups play longer".

Both deliberately **ignore the range chips** and read all time, because `runs/*`
has no per-day node by design. The panel hints and the footer say so, since
every other panel on the page does respect the range. Overview sums the three
games, which means a group that plays Word and then Dance counts twice; there
are no user ids to link them by and none are wanted. Same caveat already applies
to the page's other combined totals.

Verified in the browser: empty state renders "No runs recorded yet." in all four
views against live data; with a seeded fixture, Word read 81 groups / 60% played
again / median 2 rounds, and the per-size averages (size 3 → 1.7, size 5 → 4.9)
match hand calculation, including a 20+ run counted as 20. Overview summed to
119 groups across the three games. Bucket ordering puts `20plus` and `12plus`
last rather than sorting them as strings. The fixture was removed afterwards and
its absence re-confirmed in the page.

---

## 2026-07-30: words and hints for a global audience (word + draw)

`www/shared/words.js`, version stamps `word v2026.07.30.1`, `draw v2026.07.30.1`.
`words.js` is shared, so the word game and the drawable subset both pick this up.

The catalogue is meant to be played by people anywhere, in normal English. The
secret words were mostly fine, but a review turned up two problems worth fixing:
a handful of words whose *name* is rare even though the thing is common, and a
larger set of hints that were hard for the wrong reason. The rule we kept: a
hint may be vague or tricky (that is the game), but the hint word itself has to
be one ordinary English speakers actually use. Difficulty comes from vagueness,
not vocabulary.

Words swapped for globally-recognised ones (name too regional or obscure):
- Everyday Objects: `Colander` to `Balloon` (many fluent speakers don't know the
  name, and it also has to be *drawn*).
- Places: `Laundromat` to `Balcony` (American term; the place barely exists in
  much of the world).
- Movies & TV: `Doraemon` to `Mickey Mouse` (huge in Asia, near-zero elsewhere).
- Animals: `Armadillo`, `Anteater`, `Meerkat` to `Ladybug`, `Grasshopper`,
  `Firefly`, keeping the deliberate 100-per-category count (enforced by
  `scripts/check-words.mjs`).

Regional foods (`Biryani`, `Dosa`, `Idli`, `Jalebi`, `Gulab Jamun`, `Chai`,
`Pho`, `Gyoza`, `Kimchi`) were deliberately kept: a big part of the audience is
Asia, and food names travel.

59 hints reworded across all seven categories, in three groups:
- Invented words that aren't really English (`Kernelled`, `Aisled`, `Jugged`,
  `Willpowered`, `Souvenired`, `Pincered`, ...).
- Trap words where a common word is read in its uncommon sense (`Minute` for
  tiny, `Live` for powered, `Sheer`, `Blistering`).
- Real but rare, literary vocabulary (`Quadrennial`, `Monosyllabic`, `Russet`,
  `Opulent`, `Cavernous`, `Perforated`, `Swashbuckling`, ...).

Each replacement stays one or two common words, never names the secret word,
and passes `scripts/check-words.mjs` (no cross-category duplicates, no shared
stems, both hints distinct, counts intact). `Manchester United`'s `Storied` was
caught during verification and changed to `Historic` to match the same fix made
to `Ruins`. No game logic touched; `pickHint` and the dealing flow are unchanged.

---

## 2026-07-29: buttons feel the tap (all games + hub)

`www/shared/press.js` (new), `www/shared/base.css`, `www/draw/draw.css`,
`www/{dance,word,draw}/index.html`, `www/index.html`, version stamps
`hub v2026.07.29.1`, `dance v2026.07.29.1`, `word v2026.07.29.1`,
`draw v2026.07.29.4`.

Taps felt dead on phones. Two causes: `base.css` zeroes the native tap flash
(`-webkit-tap-highlight-color: transparent` on `*`), and the only feedback
left was `.btn:active { scale(0.97) }`, which is barely visible and, worse,
unreliable on touch. Mobile browsers cancel `:active` the instant a finger
drifts a pixel (guessing you meant to scroll), so a quick tap often shows
nothing.

Fix, shipped hub-wide since `base.css` is shared:

- New `www/shared/press.js`, a plain script loaded by all three games before
  `app.js`. One delegated `pointerdown`/`pointerup`/`pointercancel` listener
  toggles an `.is-pressed` class on `.btn`, `.tile`, `.vote-row`. Because we
  drive the state ourselves, feedback fires instantly and consistently on both
  mouse and touch, and it covers buttons rendered later. A `pointermove` guard
  drops the visual if the finger slides off before lifting.
- `base.css`: `.btn` and `.tile` now animate off both `:active` and
  `.is-pressed`. Press-in is a quick 0.06s dip (`.btn` scale 0.95 plus a soft
  shadow and 0.97 brightness; `.tile` scale 0.965); release springs back on a
  0.22s `cubic-bezier(0.34, 1.56, 0.64, 1)` so it pops rather than snaps.
- `draw.css`: `.vote-row` gets the same treatment (scale 0.97, spring release).
- `prefers-reduced-motion` guard drops the scaling for those users but keeps
  the non-motion feedback (shadow and brightness), so a press still registers.

The landing page (`www/index.html`, stamp `v2026.07.29.1`) is self-contained
and shares neither `base.css` nor `press.js`, so it was handled alongside. Its
`SELECTOR` in `press.js` was extended to include `.game-card`, and the hub now
loads `press.js`. Catch on the cards: their entrance animation uses `forwards`
fill, which pins the card's `transform` — the existing `:active { scale(0.99) }`
never actually rendered, and neither would any new scale. So the card presses
via a property the animation leaves alone: its shadow flattens from the raised
`0 2px 12px` to a tight `0 1px 5px` (settles into the page), and the inner
`.play-btn` (no animation on it) does the visible click — `scale(0.96)` plus a
0.9 brightness dip, spring release on the same `cubic-bezier`. Reduced-motion
drops the pill's scale. The dead hover-lift caused by the same `forwards` fill
was left as-is (out of scope for this pass).

Verified on the preview across all three games and the hub: `press.js` loads with no
console errors, the class toggles on press and clears on release, and computed
styles confirm the target transforms when rendered (`.btn` scale 0.95, `.tile`
0.965). Note: reading a `.btn`'s transform while its screen is `display:none`
returns `none` in Chromium (un-rendered elements resolve transform to none),
which is a measurement artifact, not a miss. Screenshot of the draw home shows
the Create tile in its pressed state. Not deployed.

---

## 2026-07-29: draw vote screen names the action

`www/draw/index.html`, `www/draw/draw.css`, version stamp `v2026.07.29.3`.

The vote screen asks "Who was the impostor?" at the top, then shows the
drawing, then the ballot. By the time the eye reaches the rows the question is
a screen away and the rows are just a list of names. A serif line, **"Vote for
the Impostor."**, now sits directly above the first row, 32px below the
drawing and 12px above the ballot so it reads as a label for the rows rather
than a caption for the picture. The list points at it with
`aria-labelledby`.

Also in this session, but by hand rather than by me: the play screen was
respaced. The header and the strip tightened up (`.turn-round` 15px to 12px,
turn pill top margin 8px to 4px, `.play-stage` and `.turn-strip` gaps 8px to
6px, `.pchip` padding trimmed, `.pdot` 13px to 12px, the `.sound-btn` bottom
margin dropped) while `.screen-play`'s gap opened up from 10px to 24px, so the
three bands of the screen breathe and everything inside each band sits closer
together. Net effect on the canvas is a wash, and the header comment about an
exact 8px gap was updated to stop naming a number.

Checked with a real three-player round on the preview: at 375x812 and 375x667
the canvas, Done button and word hint all fit with no scroll. At 375x600 the
screen does overflow into a scroll, but that is not new, the same thing
happens at the old 10px gap. The canvas only shrinks to the smaller of the
wrap's width and height, and on a very short viewport the wrap stops shrinking
before the canvas does. Left alone.

---

## 2026-07-29: draw lobby settings card collapses for players

`www/draw/index.html`, `www/draw/draw.css`, `www/draw/app.js`, version stamp
`v2026.07.29.2`.

The lobby settings card was built for the host: word category on top, a
hairline, then the drawing-rounds stepper, each with a hint line underneath.
Players get none of the controls, so on their screen the same card was four
lines of read-only text taking a third of the phone and pushing the player
list (the thing they actually watch) down.

For players it now renders as one row: **WORD CATEGORY** with the chosen
category in serif on the left, the round count as a teal pill on the right.
The hairline, the "Drawing Rounds" heading and both hint lines are gone. Card
height drops from roughly 210px to 91px on a 375px viewport.

**Host view is untouched** - same stepper, same hints, same hairline.

How it works: `renderLobby()` toggles a single `.settings-compact` class on
the card for non-hosts, and the CSS does the rest (flex row, hidden heading
and hints, stack spacing zeroed). No markup is moved or duplicated, so the two
layouts can't drift apart. The pill loses its heading in this layout, so it
carries an `aria-label` ("3 drawing rounds") for screen readers.

Verified with two local tabs on a real room: player card matches the target
design, host card unchanged, the pill updates live when the host changes the
count, singular "1 Round" reads correctly, and a maximum-length category
summary wraps without colliding with the pill. No console errors. Analytics
untouched (localhost is not counted).

---

## 2026-07-29: draw page title leads with "Imposter"

Branch `seo/draw-title`. One line in `www/draw/index.html`, plus the version
stamp (`v2026.07.29.1`).

The three game titles had drifted apart:

```
/dance/  Imposter Dance Game | ...     <- misspelling
/word/   Imposter Word Game | ...      <- misspelling
/draw/   Impostor Draw Game | ...      <- correct spelling
```

Search Console shows essentially every real query uses **Imposter**, which is
why dance and word already lead with it. Draw was the odd one out, and since
it was a day old with no rankings to lose, switching it was free upside rather
than a risk. Raised twice during the draw build and left undecided; decided
now.

**Only the `<title>` changed.** The `<h1>`, `og:title`, `twitter:title`,
schema `name` and all body copy stay "Impostor". The schema already carried
`alternateName: ["Imposter Draw Game", ...]`, so the misspelling was declared
there anyway. A comment above the tag explains this so nobody "fixes" the typo
later.

**The hub title was deliberately left alone**, even though it does not mention
the draw game at all. It is already 80 characters against roughly 60 that
display, so adding Draw would push it past the cut or force out wording that
currently earns clicks.

### On getting the new game picked up

Audited the whole surface live, and everything else was already in place:
robots.txt explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
PerplexityBot and Google-Extended and declares the sitemap; `/draw/` is in the
sitemap with a current lastmod; canonical is self-referencing; og:url and
og:image resolve; five crawlable `<a href="/draw/">` anchors from the hub.

Two things worth remembering:

- **IndexNow does not reach Google.** `scripts/indexnow-ping.mjs` posts to
  `api.indexnow.org`, which feeds Bing, Yandex, Seznam and Naver. Google
  declined to participate. The only lever for Google is Search Console URL
  Inspection → Request Indexing, which is a manual, logged-in action.
- **llms.txt is speculative.** No major AI provider has committed to consuming
  it. Keep it, it costs nothing, but the robots.txt allowances and ordinary
  crawlability are what actually do the work. ChatGPT is in better shape than
  Google here, because ChatGPT Search leans on Bing plus OAI-SearchBot and
  both are covered.

---

## 2026-07-28: stats per-day average now divides by the game's own lifetime

Branch `fix/stats-per-day-average`. Closes #50. `www/stats.html` only, no game
code touched.

`nDays` came from `lastNDays(RANGE)`, which always returns the full range
length. So every game's total was divided by 30 on the default view, whether
or not the game existed for those 30 days. Draw launched today and read **0.7
games per day** off 22 real games.

It was never a draw-only problem. Measured against live data:

| Game | First day | Real days | Total | Was | Now |
|---|---|---|---|---|---|
| Draw | 28 Jul | 1 | 22 | 0.7 | 22 |
| Word | 8 Jul | 21 | 3,023 | 100.8 | 144 |
| Dance | 7 Jul | 22 | 6,039 | 201.3 | 275 |

Word was understated by 43% and dance by 27%. The same dilution hit visits and
every per-game view, not just the Overview cards.

**The denominator is now the days in the selected range on or after that
source's first recorded day.** First-recorded-day is used as the launch date
because it maintains itself; a hardcoded table would be a second source of
truth and would count pre-analytics days as real zeros.

**Days with no activity still count.** A quiet Tuesday is a genuine zero, and
skipping it would flatter a game played on 3 days out of 30 into looking as
busy as one played daily. This also fixed `rangeDays('all')`, which enumerated
only days that *had* data, so zero days silently vanished from the denominator
and from the chart. It now spans first day to today continuously.

Each source divides by its own lifetime, so `avg()` takes the daily map the
total came from rather than closing over a single shared `nDays`.

The card shows `over N days` **only when the source is younger than the
range**, so a big number off one day of data explains itself while a mature
game in a 7-day view stays uncluttered.

### Verification

Against live production analytics, all six figures match hand calculation
(6039/22, 3023/21, 22/1, 4435/22, 9084/22, 8093/22). Across ranges:

- **7 days**: dance and word show no note (they cover the whole window),
  draw shows `over 1 day`
- **90 days**: all three noted, values unchanged from 30 days because that is
  their entire lifetime
- **All time**: dance has no note (it defines the span), word `over 21 days`,
  draw `over 1 day`
- `?view=draw` section correct too, so this is not Overview-only

No console errors. `stats.html` has no version stamp to bump; it is a private
dashboard, not a game page.

**Self-inflicted, worth recording.** A throwaway `perl -0pi` substitution I
ran with `2>/dev/null` used `$1` for a group that captured the whole match,
nesting the markup inside its own `id` attribute on three lines. The symptom
was subtle: dance rendered, then the combined loop threw on a null element and
word, draw and hub silently stayed at `–`. Caught only because the browser
check compared every card, not just the one being fixed.

---

## 2026-07-28: word catalogue to 550, two hints per word, cross-room memory

Branch `feat/word-catalogue-v2`. Closes #47, #48, #49. Word and draw only;
dance untouched.

Groups are playing 40+ rounds and reported words coming round again.

**The diagnosis first, because it changed the fix.** Words already never
repeat inside a room: `meta/played` records every word dealt and `pickWord()`
draws only from what's left. So the repeats were not a bug in that logic. They
came from two places:

- **a new room starts with a blank ledger**, so round 1 can deal the word the
  group had an hour ago
- **a single category was only 50 words**, so by round 40 the room is scraping
  the last ten, which feels repetitive even when nothing has actually repeated

Three changes, one per cause plus one for variety.

**1. Catalogue 300 → 550 (#47).** Food, Animals, Places and Everyday Objects
went 50 → 100. Movies & TV and Football deliberately stayed at 50: past that
they drift into names most rooms won't recognise, and an unrecognised word
stalls a round. New **Super Heroes** category, 50 entries, drawable so both
games get it. Draw's pool went 150 → 350.

Super Heroes forced a decision. Movies & TV already held Spider-Man, Batman,
Superman, Iron Man, Wonder Woman, Black Panther and Deadpool. Leaving them
there and repeating them under Super Heroes would have been a real bug, not
untidiness: **the played ledger is keyed by category**, so the same word in
two categories can be dealt twice to a room that picked both. The seven
characters moved to Super Heroes and Movies & TV was backfilled with seven
film titles (The Godfather, Forrest Gump, Up, Wall-E, Rocky, Jaws, Back to the
Future) to hold it at 50. Joker and Avengers stayed put as film titles.

**This is a deliberate exception, confirmed with the user.** The brief was to
add no words to Movies & TV. Holding the count at 50 does not satisfy that:
seven entries in it are genuinely new. The alternatives were shrinking Movies
& TV to 43, or reverting it and leaving Super Heroes without Batman,
Spider-Man, Superman, Iron Man, Wonder Woman, Black Panther and Deadpool. The
swap was reviewed against both and kept. Do not "fix" it back.

Drawability drove the new Food and Animals entries toward things with a clear
silhouette (fruit, vegetables, distinct creatures) and away from dishes that
all sketch as a bowl of stuff. In draw everyone knows the word, so a word
nobody can draw distinctly means crewmates cannot prove they know it.

**2. Two hints per word, one shown at random (#48).** Every entry gained `h2`,
and `pickHint(entry)` in `shared/words.js` returns one of the two per round.
Shared rather than duplicated in each game so both deal hints identically and
the missing-`h2` fallback lives in one place. The impostor still sees exactly
one hint, so no balance change, but a word that does come back plays
differently and nobody learns that "Cheesy means Pizza".

**3. Cross-room memory on the host device (#49).** `shared/played.js` keeps
what this device has dealt in localStorage and hands it to `pickWord()` as a
second exclusion list.

Two design points worth keeping:

- **It is not written to the room.** The first attempt seeded `meta/played` at
  room creation. That would have put up to ~420 keys in meta from round zero,
  and since `onValue` re-sends the whole room snapshot on every change, every
  player would re-download it each time somebody tapped Ready. Filtering
  host-side costs nothing on the wire; the host is the only client that picks
  words anyway.
- **`reset` still means one thing only: the room is out of words.** Running
  dry on device history alone just drops the preference and falls back to
  room-only memory. Without that two-tier fallback a long night would wipe a
  ledger that still had words in it, causing the exact repetition this is
  meant to prevent.

History is capped at 60% of each category. At 100% the device would eventually
exclude everything and the feature would quietly stop doing anything; the cap
keeps at least 40% of every category genuinely fresh. Per game (`played:word`,
`played:draw`) because drawing a word you said out loud last night is a
different experience, not a repeat. No identifiers and not a cookie, so the
cookie-free claim is unaffected.

### Verification

Two new scripts, both run clean:

- `scripts/check-words.mjs` enforces the catalogue rules: category sizes,
  missing fields, `h` equal to `h2`, hints containing the word or sharing a
  stem with it, hints that are a category name, hint word count, and the one
  that actually matters, **duplicate words across categories**. It caught two
  real errors on the first run (`Spring Roll` hinted "Rolled", `Orca` hinted
  "Black-and-white", three words) and two hints that were themselves secret
  words elsewhere ("Frozen"). All four fixed.
- `scripts/check-played.mjs` covers the store: recording, the 60% cap keeping
  the most recent, `clear()`, dropping words the catalogue no longer has, four
  shapes of corrupt localStorage, and localStorage throwing outright. It also
  simulates two rooms and asserts the second reuses none of the first's words,
  printing what a blank-ledger room would have reused for contrast.

Live, on the local server with three tabs in a real room:

- all seven categories render in the word picker, four in draw (Places, Movies
  & TV and Football correctly absent)
- Super Heroes dealt real words and `pickHint` served Loki's second hint,
  proving `h2` is reachable
- localStorage recorded each word, and the 60% cap fired live: a hand-seeded
  45-word history was trimmed to 30 on the next round
- **the exclusion test.** With 30 of the 50 Super Heroes hidden in device
  history, six consecutive rounds all came from the other 20, none from the
  hidden 30. If the history were being ignored that is roughly a 1-in-400
  coincidence.
- draw and dance both load with no console errors; dance was not touched

**One thing worth knowing for the next person.** Mid-testing the word page
went completely blank: the browser had cached the old `shared/words.js`, so
the fresh `app.js` threw `does not provide an export named 'pickHint'` and no
screen ever activated. That is a local-server artifact only. `firebase.json`
sends `no-cache, no-store, must-revalidate` for everything except
`/icons/**`, `/favicon.ico` and `/avatars/**`, so production cannot serve a
stale module against a fresh one. Checked before assuming.

### Also in this branch

- Word FAQ "What word categories are there?" now has a schema answer that is
  **byte-identical to its visible twin**, verified by decoding both. They had
  drifted apart ("Six categories at launch:" vs "Six at launch —"), which
  invalidates the rich result. Pre-existing, fixed while editing the copy.
- `llms.txt` corrected: it claimed draw used all six categories. It uses the
  drawable four.
- Version stamps: word `v2026.07.28.2`, draw `v2026.07.28.6`.

---

## 2026-07-28: README rewritten as a project document

Branch `docs/readme-rewrite`. Docs only, no behaviour change.

The README had stopped being true somewhere around the word game shipping. It
described a one-game, single-file project called "Imposter Music Game", and
three of its instructions actively failed:

- "Open `index.html` in a browser" — there is no root `index.html`; the site
  is `www/`
- "Paste into `index.html`" for the Firebase config — it lives in
  `www/shared/firebase.js`
- the rules block showed only `rooms`, so pasting it would have broken the
  word game, draw game, analytics, sign-in and feedback in one go

Also stale: "single HTML file" (9 modules now), "60s timer" (`ROUND_SECONDS`
is 30), `CATEGORIES` located in `index.html` (it is in `dance/app.js`), and a
known limitation reading "No voting UI ... would be ~50 lines" when draw ships
a full vote, auto-close, ballot and verdict.

Rewritten around what someone actually needs: the three games in a table, the
`www/` layout, the local-server command, and the fact that matters most when
touching the code — **each game owns its own room namespace** (`rooms`,
`rooms-word`, `rooms-draw`), which is why all three can issue the same 4-char
code without colliding. Added the real six-key rules description, the split
hosting/database deploys, preview channels, the IndexNow step, the analytics
production gate, and links to WORKLOG, ANDROID and NATIVE_APP_NOTES, none of
which were referenced before.

Every path in the file was checked to exist, every factual claim re-read from
the source, and the quickstart command was run to confirm it serves the hub,
`/draw/` and `/shared/base.css`. Kept clear of spaced em dashes per house
style.

---

## 2026-07-28: Stats page reads the draw game — #46

Branch `feat/draw-stats`. **Not deployed.** The last piece of #46.

The counters themselves were already built during the game work, identical to
the word game's: `trackSession()` on load, `trackRound()` writing
`games/total`, `games/categories/*`, `games/words/*`, the daily rollups and
`games/countries/*`. Only the dashboard was missing.

Five edits to `www/stats.html`:

- `draw` option in the view selector, and added to the `VIEW` allowlist so
  `?view=draw` survives a refresh
- a `SECTIONS` entry using `itemsKey: 'words'`, since draw writes the same
  per-round leaderboard shape the word game does
- `COMBINED_SRC` from `['music','word']` to `['music','word','draw']`
- **a hand-written `drawKpi` card.** The per-game cards in the overview are
  literal HTML while the fill logic loops `COMBINED_SRC`, so adding draw to
  that array without adding the card would have thrown on a null element.
  This was the only non-obvious part of the change.
- footer note and the load comment, which both said "music/word/hub"

No read change needed: `load()` already fetches the whole `analytics` node, so
`DATA.draw` arrives on its own.

Verified against production data by writing sample counters to
`analytics/draw`, reloading, and confirming the Draw section rendered (40
visits, 12 games, "Noodles 5" on the words leaderboard, country and category
panels present) and that the combined KPI moved from 9,005 to 9,021 —
5,998 + 3,011 + 12. Sample counters deleted afterwards and the node confirmed
back to null.

---

## 2026-07-28: Draw card promoted to second, with a self-retiring New flag

Branch `feat/impostor-draw`. **Not deployed.** Hub v2026.07.28.4.

- **Card order is now Dance, Draw, Word.** The block moved verbatim; the
  stagger animation is keyed on `nth-child`, so draw inherited the 0.38s delay
  and needed no CSS change.
- **"✨ New Game" pill** pinned to the draw card's top-right corner, teal
  rather than the Play button's near-black so it reads as a label and not as a
  second call to action. `a.game-card` gained `position: relative` to anchor
  it. The card's `aria-label` picked up ", new" because an `aria-label` on the
  link replaces its inner text, so the badge would otherwise be silent to a
  screen reader.
- **It retires itself after 3 weeks.** The date lives in one place,
  `data-new-until` on the element, and four lines at the end of the hub's
  module script remove any element whose date has passed. Written into the
  markup rather than injected, so it degrades to simply staying visible if the
  script never runs.

**`data-new-until` is provisional at `2026-08-18`.** The user asked for three
weeks from deploy day, and deploy day is not set, so this must be reset to
`deploy + 21 days` when production actually ships.

Verified on localhost: order reads Dance / Draw / Word, pill sits 15px in from
the card's top-right, and the retirement logic was replayed against four
dates — shown on 17 and 18 Aug, hidden on 19 Aug and 20 Sep.

---

## 2026-07-28: Hub + llms.txt learn about the third game (additive only)

Branch `feat/impostor-draw`. **Not deployed.** Hub v2026.07.28.1. The draw
game's own page was already SEO-complete; the hub and `llms.txt` were still
two-game documents. Draw had **one** inbound link from the hub and appeared
nowhere in its structured data.

Constraint from the user: **do not risk the traffic dance and word already
earn.** Everything here is therefore additive or a factual correction. No
ranking copy was rewritten.

**Deliberately not touched.** The hub `<title>` stays byte-for-byte identical.
It is the strongest on-page signal for the terms that currently earn traffic,
it is already 80 characters against Google's ~60 of display, and adding a
third game name would push the existing two further out of view for no gain:
`/draw/` has its own title and schema and is the page that should rank for
drawing terms. The `og:title` and `twitter:title` are untouched for the same
reason, as are all eight existing FAQ answers and both existing explainer
blocks.

**Added:** a third `VideoGame` entry in the hub's JSON-LD; a "What is the
Impostor Draw Game?" explainer section; a matching FAQ entry in both the
visible list and the schema; a footer link; drawing terms in the `keywords`
meta (cosmetic, Google ignores the tag); a full `## Impostor Draw Game`
section in `llms.txt` plus its Common-questions and Pages entries.

**Corrected**, because a three-game site claiming two is a visible error:
the meta description (311 chars of two-game copy down to 143 covering three),
the `og:` and `twitter:` descriptions, "both games" in four places, and
"difference between the two games" which now compares three. None of these
carry target keywords; meta descriptions are not a ranking factor.

Inbound hub links to `/draw/` went **1 → 5**, which is the change most likely
to actually get the page crawled and ranked. Hub `lastmod` bumped to invite a
recrawl.

**Known and left alone:** five hub FAQ schema questions have no identical
`<summary>` twin. Most are covered by the `<h2>` explainer blocks, which
satisfies Google's "content must be visible" rule, and the rest predate this
work. Fixing them means editing the exact dance and word copy that earns the
traffic, so it wants its own ticket and its own before/after measurement.

---

## 2026-07-28: Impostor Draw Game — renamed to match its siblings

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.5.

"Impostor Draw" is now "Impostor Draw Game", matching Impostor Dance Game and
Impostor Word Game. Sixteen occurrences across `<title>`, OG and Twitter
titles, the OG image alt, the VideoGame schema name, both FAQ schema entries
that carried the name, the meta description, the `<h1>`, the how-to intro, the
visible FAQ summary, the logo alt text, the hub card heading and its
aria-label, and the web manifest.

Details worth recording:

- **`short_name` is "Draw Game", not "Impostor Draw Game".** It is the label
  under a home-screen icon, where long names get truncated. The word game uses
  "Word Game" for the same reason.
- **"Impostor Draw" survives as an `alternateName`** alongside a new "Imposter
  Draw Game", so the shorter form and the common misspelling both still match.
- **Two FAQ schema/visible mismatches fixed while here**, both pre-existing:
  the remote-play question and "Is it free?" vs "Is it free to play?". Every
  schema question now has an identical visible twin, which is how the word
  game is built and what Google checks against.
- **The `<title>` keeps the correct "Impostor" spelling.** Dance and word both
  lead their title tags with the misspelling "Imposter" to catch that search
  traffic. Left as-is because it was not asked for and changing a title tag
  moves rankings; the misspelling is already covered in the keywords meta and
  the alternateName list.

Schema and manifest JSON both re-parsed clean.

---

## 2026-07-28: Impostor Draw — stop advertising a chat we don't have

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.4.

The "Discuss in chat" how-to step is gone and the list renumbered 1-5. Chat
(#44) was deferred, so it comes back when the feature does.

The step was the visible half of it. Chat was claimed in **eight** places on
the page, including the meta description, the OG and Twitter descriptions, the
VideoGame schema description, and the FAQ answer in both its visible and
structured-data copies. All are now accurate. The two copies of the "Can I
play remotely?" answer were edited together on purpose: Google cross-checks
FAQ structured data against what a visitor can actually see, and a mismatch
loses the rich result.

Wording changes were kept minimal so the page's keyword density is unchanged.
Schema JSON re-parsed clean after editing.

Verified on localhost: five steps numbered 1-5 ending on "Vote and reveal",
and the word "chat" no longer appears anywhere in the rendered page.

---

## 2026-07-28: Impostor Draw — its own artwork at last

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.2. The game
stops borrowing the word game's pictures.

Three PNGs supplied, converted to match what dance and word already use rather
than inventing a new convention:

| source | output | why |
|---|---|---|
| `game-draw.png` 702×413 | `game-draw.webp` 468×275, 20K | same size as `game-*.webp` |
| `logo-draw.png` 503×503 | `logo-draw.webp` 448×448, 28K | same size as `logo-*.webp` |
| `og-draw.png` 1200×630 | `og-draw.jpg` 1200×630, 80K | **JPG, not WebP** |

**The OG image stays JPG on purpose.** WebP support among link-preview
scrapers is still patchy, and a preview that fails is worse than one that is
40K larger. Both existing games use `og-*.jpg` for the same reason. Everything
that renders in a browser is WebP.

Alpha is preserved on both WebP files, matching `game-word.webp` and
`logo-word.webp`.

Wired up: hub card art (`www/index.html`), the game's home logo and lobby head
icon, `og:image` / `twitter:image` / the schema `image`, and a sitemap entry
for `/draw/` that previously had no images at all.

Source PNGs moved to `design/draw-art/` alongside `design/mode-icons/`. They
were sitting in `www/`, which Firebase deploys wholesale, so ~900K of unused
originals would have shipped.

Verified on localhost: all three cards load their own art at 468×275, both
logo slots resolve to `logo-draw.webp` at 448×448 and render undistorted at
160×160, and all three OG references point at `og-draw.jpg`.

---

## 2026-07-28: Impostor Draw — one payoff screen, held breath before it

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.28.1. Phase order
is `lobby → countdown → card → playing → vote → reveal → over`.

- **The ballot moved to the final screen.** "Who voted whom" is no longer its
  own screen: it now sits under the vote counts on the round-over screen, so
  the whole payoff is one scroll. Order is verdict, impostor card, word, Votes,
  Who voted whom, on the reasoning that you want how it ended, then by how
  much, then exactly who did it.
- **The five-second ballot screen became a three-second held breath.** The
  `tally` phase is renamed `reveal` (`meta/tallyAt` → `meta/revealAt`,
  `TALLY_MS` → `REVEAL_MS = 3000`) and the screen now carries nothing but
  "And the Impostor is…" over a 3-2-1. Deliberately empty: anything readable
  there would get read instead of felt.
- **Play Again is sticky.** With six players the screen is 1240px against an
  812px viewport, so the action pair uses the shared `.sticky-actions` and
  pins to the bottom edge at every scroll position. `.tally` lost its own
  `margin-top` now that `.over-section` owns the spacing.

Verified in room `C3D9` (six players, deleted after): last vote landed and the
countdown ran 3-2-1 then the final screen at ~4s; final screen showed both
labelled sections with six ballot rows and three tally rows; Play Again stayed
pinned at scroll 0/200/400 and at the bottom; replay cleared `cardAt`,
`revealAt`, votes and strokes; a second round ran the pre-roll unaided. No
console errors.

---

## 2026-07-27: Impostor Draw — the round runs itself now

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.9. Phase order
is `lobby → countdown → card → playing → vote → tally → over`.

- **The word card starts the drawing.** No more host button: the card holds
  for 5 seconds behind its own countdown and then opens the canvas. The 3-2-1
  stays, so the pre-roll is about 9 seconds in total.
- **The vote closes itself.** The moment every present player has picked, the
  room moves to a new ballot screen showing who voted for whom, counts down 5
  seconds and names the impostor. Players who have left are not counted as
  owing a vote, so a closed tab can't hold the room up.
- **The host's Reveal button survives** as the override for a player who is
  present but unresponsive, and now leads to the same ballot screen rather
  than skipping it. Anyone who hasn't voted shows as "Did not vote", which is
  only reachable through that button.
- **New `phaseGuard` + phase clock.** `cardAt` and `tallyAt` are deadlines in
  meta, so every client counts down to the same instant; only the host writes
  the phase change, guarded by `<phase>:<deadline>` so a 250ms ticker can't
  fire the same write twice. Guard clears on every phase change.
- **Canvas shadow fixed.** `.canvas-wrap` was `overflow: hidden`, which sliced
  the drop shadow off flush at the canvas edges (the canvas is exactly as wide
  as its wrapper). Now `overflow: clip` with `overflow-clip-margin: 30px`: the
  shadow gets room, the resize-frame scrollbar guard still holds, and browsers
  without the property degrade to the old behaviour.

Verified in room `ZPWH` (deleted after): pre-roll timed at 3-2-1 then 5-4-3-2-1
then playing at ~9.5s with `turnAt` set; three of four votes changed nothing
and the fourth opened the ballot immediately; ballot counted 5 down to 1 then
revealed; host override reached the ballot with two "Did not vote" rows; replay
cleared `cardAt`, `tallyAt`, votes and strokes, and a second round ran the
whole pre-roll again unaided. Shadow measured with 30px of clip margin on all
sides and no horizontal overflow. No console errors.

---

## 2026-07-27: Impostor Draw — QR follows the serving host

Branch `feat/impostor-draw`. Draw v2026.07.27.8. Prep for preview-channel
testing.

`SHARE_BASE` was pinned to `https://impostorgames.com/draw`, which is correct
in the native app (a Capacitor WebView's `https://localhost` origin is no use
to a friend) but wrong everywhere else: on a preview channel or a laptop on
the LAN the QR led to production, i.e. to a different build, and right now to
a path that is not deployed at all. It now falls back to `location.origin` and
only uses the canonical URL under Capacitor or a non-http(s) protocol. On
production `location.origin` *is* impostorgames.com, so nothing changes there.

Verified on localhost: QR encodes `http://localhost:8123/draw/?join=MAYF`.
Room deleted after.

---

## 2026-07-27: Impostor Draw — ballot redesign, winner's emoji, turn clock

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.7.

- **Ballot rows redesigned** to the supplied mockup: animal avatar, name in
  bold, then the player's ink as a dot *after* the name, with a ticked "Voted"
  tag pushed to the far edge. The dot moved because you look for who it is
  first and what colour they drew in second. Rows are taller (66px), rounder
  and further apart; the picked row is a green border on a pale green fill
  rather than teal, so a pick reads as a choice rather than a status. The
  "Voted" tag went from teal to grey for the same reason. Title up to 30px,
  host's footer trimmed to just the count since the button is right there.
  `playerMemo` now carries `av` as well as name and ink, so a player who left
  still has a face on the ballot.
- **Party popper for the winner only.** The verdict headline is shared, but
  the impostor wins exactly when the room loses, so the emoji is decided per
  player: `caught ? !amImpostor : amImpostor`. All four combinations checked.
- **Turn clock, synthesised.** A tick a second for the whole of your turn,
  alternating 1180 Hz and 880 Hz because a single repeated pitch sounds like a
  fault rather than a countdown. WebAudio oscillator with a 45ms decay, no
  asset to fetch and nothing to fail offline. The AudioContext is built on the
  first `pointerdown` anywhere, since browsers will not start audio without a
  gesture. A mute toggle sits opposite the Leave button on the play screen and
  persists in `localStorage` under `draw:muted`; four phones in one room is
  four clocks, and one of them will want out.

Ballot logic is unchanged: your own name is still off the list, as decided in
#45. The mockup showing four rows was read as a five-player room.

Verified in room `ZQBV` (deleted after): 5 ticks in 5 seconds on my turn with
alternating pitch, silence on everyone else's turn, silence while muted, sound
back on unmute. Verdict emoji correct for room-wins / impostor-escapes /
impostor-caught / room-wrong. No console errors.

---

## 2026-07-27: Impostor Draw — layout tightening, no more discuss phase

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.6. Three changes
off the back of playtest feedback.

- **Lobby settings share one card.** Word Category and Drawing Rounds were two
  cards; they are set once, together, before anyone plays, and splitting them
  only pushed the player list off the fold. New `.setting-split` hairline
  between them, bled to the card edges with `margin: 18px -22px` so it reads as
  a divider rather than a stripe.
- **Turn chips and canvas are one block.** New `.play-stage` wrapper holds the
  strip and the canvas 8px apart. `.canvas-wrap` also switched from
  `align-items: center` to `flex-start`: on a phone the canvas is limited by
  width, so centring left ~50px of dead cream between the chips and the drawing
  they label. The slack now falls below the canvas, above Done.
- **The discuss phase is gone.** Phase order is now
  `lobby → countdown → card → playing → vote → over`. When the last turn is
  taken, `fbAdvanceTurn` writes `phase: 'vote'` and clears `votes` in one
  room-level update instead of parking everyone on the play screen behind a
  host-only Start Voting button. A 2s full-screen card, "Time to find the
  Impostor.", covers the handover; the vote screen is built and live underneath
  it the whole time, so the ballot is ready the instant it lifts.

**This reverses the #45 decision that the host paces the way into the vote.**
The play screen had nothing left to offer once drawing was over, and the button
only stalled the conversation. `fbStartVote()` and `#btn-start-vote` are
deleted; the host still controls the reveal, which is the decision that
actually matters.

Verified in room `64F4` (deleted after): merged card renders with a full-width
divider, chips sit exactly 8px above a 327px canvas, expiring the final turn
auto-opened the vote with the overlay up at ~3s and down at ~5s, thumbnail
carried the stroke, "Caught!" verdict and tally correct, replay cleared votes,
strokes, order and turn. No console errors.

---

## 2026-07-27: Impostor Draw — in-app vote, tally and verdict — #45

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.5. Closes the
loop: a round can now be finished inside the app. Phase order is
`lobby → countdown → card → playing → discuss → vote → over`.

- **The host opens the vote.** Once every turn is spent the play screen swaps
  Done for a host-only **Start Voting**, which moves the whole room to its own
  vote screen. Nobody drifts into voting while others are still arguing.
- **The drawing comes with it.** The vote screen carries a thumbnail of the
  finished canvas, because the drawing is the entire argument. `redraw()` was
  split into `paintStrokes(ctx, size)` so the same normalised strokes render
  into any square context; `paintThumb()` is the one-off version.
- **Votes** live at `votes/<voterId> = <targetId>`. Everyone votes, impostor
  included. Your own name is not in the list, so a self-vote is impossible
  rather than merely discouraged. Picks are changeable until the reveal.
- **"Voted", never "voted for".** Each row shows whether that player has cast
  something, plus an "N of M voted" line. It tells the host whether the reveal
  is fair yet without leaking a single choice.
- **Players who have left stay on the ballot**, dimmed and labelled "(left)".
  If the impostor rage-quits, the room still has to be able to pin it on them.
- **Reveal is available at any time**, as decided: waiting on someone who has
  wandered off would strand the room. It shows a verdict, then the tally, then
  the unmask and the word. **The room only wins by pinning it on the impostor
  outright** — a tie at the top means the room never agreed, so the impostor
  walks. Copy: "Caught!" / "They got away", with the sub-line saying which of
  wrong-player, split-vote or nobody-voted it was.
- **Tally shows only players who drew a vote.** A column of zeroes tells
  nobody anything and pushes the buttons off a phone screen.
- **`.pdot` promoted out of `.pchip`.** Caught in review: the vote and tally
  rows asked for a colour dot and silently got a 0px element, because the rule
  was scoped to the turn strip.
- **Known, and consistent with the rest of the codebase:** votes are readable
  in the raw room JSON while voting is open, exactly as `secretWord` already
  is. Hiding them properly needs per-child rules, which is a bigger change
  than this game currently justifies.
- **Verified** against live RTDB (rooms 5R7L and 6NC2, both deleted after):
  Start Voting appears only for the host and only at `discuss`; the thumbnail
  paints; own name absent from the ballot; changing a pick moves the ring and
  keeps one vote in the DB; "Voted" tags and the counter track other players
  live; a player removed mid-vote stays votable as "(left)"; caught, split and
  nobody-voted all produce the right verdict and tally; replay clears votes,
  strokes, order and turn; and with `hostId` temporarily handed to another
  player, this client correctly loses Reveal, gets "Waiting for the host to
  reveal…", and can still vote. Zero console errors.

---

## 2026-07-27: Impostor Draw — word screen, redesigned canvas screen, quit guard

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.4. Reshapes the
round around the revised flow and the supplied mockups.

- **New `card` phase between the countdown and the canvas.** Everyone lands on
  the same big word card the word game uses, and stays there until the host
  presses **Start Drawing**. `fbStartGame` no longer flips straight to
  `playing`; it flips to `card` and writes `turnAt: null`, so the first
  drawer's 45 seconds start when the host says go rather than while the room is
  still reading. Phase order is now
  `lobby → countdown → card → playing → discuss → over`.
- **Canvas screen rebuilt to the mockups.** Round number, then a single pill
  carrying the drawer's name and the countdown; the pill turns green and reads
  "Your turn" when the pen is yours. It is the only green on the screen, so it
  reads without anyone reading the words. Below it, a sideways-scrolling strip
  of the whole turn order in each player's ink, the live one ringed in teal.
  Undo moved onto the canvas as a corner button. Done is now full-width and
  always present, greyed when it isn't your turn, so the footer never changes
  height mid-round.
- **The word lives under the Done button now**, quietly, instead of in a chip at
  the top: the word for everyone, the vague hint for the impostor. It has to
  stay to hand all game without competing with the drawing.
- **Host loses the mid-game escape hatch.** "End Round Early" and the
  host-triggered "Reveal Impostor" are both gone; the only way out of a round is
  to quit. **The consequence, chosen deliberately: the `discuss` phase is
  currently a dead end** until the vote lands in #45, which is now the next
  piece of work rather than an option.
- **Leaving mid-game asks first.** The host's back button closes the room for
  everyone and a player's leaves a hole in the turn order. Both were one stray
  thumb away, so both now go through a confirm whose copy says which one it is.
- **`playerMemo`** keeps the last known name and ink for every player id. A
  disconnected player is removed from `players/` immediately, so without it a
  departed player's turn chip had nothing to label itself with. Also fixes the
  reveal showing "—" when the impostor left before the reveal (noted on #45).
- **Verified** against live RTDB (rooms YASG and UP85, both deleted after):
  countdown holds Start Drawing disabled and releases it on the phase flip;
  `turnAt` absent while the room reads its card; pen handoff turns the pill
  green and moves the ring; a stroke drawn on your own turn persists with all 9
  points; Done rolls Round 1 → Round 2; a player removed mid-game keeps their
  slot as a faded chip; the last slot lands on `discuss` with the timer cleared
  and the pill collapsed; the strip auto-centres the live chip at 7 players;
  timer goes red at ≤10s (`rgb(208, 74, 47)`); the quit confirm cancels clean
  and, on confirm, deletes the room; zero console errors.
- **Known gap, not new:** if the host's tab dies without leaving, the room now
  sits on the card screen with nobody able to press Start Drawing. Previously it
  would at least have auto-started. The 15-minute idle watchdog still closes it.
  Worth a host-handover ticket at some point.

---

## 2026-07-27: Impostor Draw — turn engine — #43

Branch `feat/impostor-draw`. **Not deployed.** Draw v2026.07.27.3. The canvas
stops being a free-for-all: one pen at a time, in a published order.

- **Data model:** `meta/order` is the public turn order (array of player ids),
  `meta/turn` is a slot counter that only ever goes up, `meta/turnAt` is the
  deadline for the current slot. The drawer is `order[turn % order.length]`
  and the round is `turn / order.length`. **Counting slots rather than
  tracking a pointer** is what makes skipping a departed player trivial: their
  slot is simply spent, and no bookkeeping has to agree about who is left.
- **Turn order gets its own shuffle.** The first draft reused the shuffle the
  impostor was sliced off the front of, which would have put the impostor
  first in the order every single game. The order is public, so that hands the
  room the answer. Two independent shuffles now; a 60k-deal simulation of the
  fixed code puts the impostor at 20.2/20.1/20.1/19.7/20.0% across the five
  slots of a 5-player game.
- **Three things can pass the pen** and they race deliberately: the drawer's
  Done button, the drawer's own 45s expiry, and a host-only watchdog that
  fires `TURN_GRACE_MS` (4s) after a dead deadline or after the drawer
  disappears. `fbAdvanceTurn(fromTurn)` no-ops if the room has already moved
  past `fromTurn`, and an `advanceGuard` stops the 250ms ticker re-firing the
  same write while the echo is in flight. Only the host runs the watchdog, so
  a stalled turn can never be passed twice by two different spectators.
- **The grace period is not cosmetic.** Without it a two-second tunnel would
  cost a player their whole turn. During it the bar reads "Passing…" rather
  than a stale name.
- **Undo is scoped to the current turn.** `myStrokeIds` resets on every turn
  change, so a player coming round again in round 2 cannot rub out their round
  1 work. A stroke still under the finger when the turn is taken away is
  finished properly (`forceEndStroke`) rather than abandoned half-written.
- New `discuss` phase: rounds done, canvas locked for everyone, chat open,
  host-only button. #45 puts the vote in front of that button.

**Verified in preview** (room NQ47, live RTDB, deleted after): a non-drawer's
pointer writes nothing; host watchdog passed a dead turn and stamped a fresh
45s; Done advanced and rolled Round 1/2 to 2/2; a drawer removed mid-turn was
skipped after the grace with "Passing…" shown meanwhile; the last slot moved
the room to `discuss` with `turnAt` cleared; replay wiped order/turn/turnAt
and the strokes; a second game dealt an independent order. Drawer-side expiry
advanced 5ms after the deadline (not 4s, so it was the drawer's own path, not
the watchdog) and the in-flight 7-point stroke persisted complete. Timer turns
red at 10s. Turn bar fits one line at 375px. Zero console errors.

Testing note: a first attempt at the expiry test looked like a lost stroke.
It wasn't — the real 45s clock had run out during the gap between two tool
calls, so the pointerdown landed when it was no longer my turn. Any test that
straddles a live deadline has to run inside a single eval.

## 2026-07-27: Impostor Draw — flow decisions revised (no code yet)

Design revision agreed before starting #43. No code changed; #43 and #45 were
rewritten to match. Recorded here because it supersedes decisions locked the
day before.

- **Drawing is strictly turn by turn.** Only the active player's pointer does
  anything; everyone else watches the strokes arrive live. The play screen
  names who is drawing now and who is next. This is what #43 puts behind
  `canDraw()`, which today returns true for everyone during `playing`.
- **45s turn timer stays**, as an auto-pass safety net behind the Done button.
  A remote game has no one in the room to nudge an AFK player, so the round has
  to be able to move on by itself.
- **Vote and reveal are host-driven** (supersedes the earlier "everyone votes
  as soon as the rounds end"). When the rounds finish the canvas locks and the
  room sits in discussion with chat open; only the host sees **Vote**, which
  opens voting for everyone including the impostor. Only the host sees
  **Reveal**, and it is available **at any time**, deliberately not gated on
  all votes being in, so one disconnected player can never freeze the room.
  Ties still get no revote: show the tally, reveal, done.
- Unchanged: 1 impostor, the hint is the word's own vague hint and never the
  category (the category is already on screen in the lobby), rounds set in the
  lobby and defaulting to 2, minimum 3 players, undo, one shared square canvas.

## 2026-07-27: Impostor Draw — shared canvas, live strokes, colours, undo — #42

Branch `feat/impostor-draw`. **Not deployed.** Turn order is still #43, so for
this phase the canvas is open to every player while the round is live — that
keeps the phase testable on its own, and `canDraw()` is the single hook #43
replaces.

- **Data model:** `rooms-draw/<code>/strokes/<pushId> = { by, c, p:[x0,y0,…] }`,
  coordinates normalised to integers 0..1000. Normalised points **plus a square
  canvas** are what make a phone and a laptop render the same picture; raw
  pixels would not survive the aspect-ratio difference. The canvas is sized to
  the largest square that fits, so the drawing area is as big as the screen
  allows without ever distorting.
- **Sync uses `onChildAdded/Changed/Removed`, deliberately NOT `onValue`** on
  the strokes node: onValue re-sends every stroke in the room on every point
  flush, which is exactly the wrong shape for live drawing. In-progress strokes
  flush every 90ms; points closer than 4 units are dropped and a stroke is
  capped at 400 points.
- **Ink colours** (`INK_COLORS`, 8) are assigned at join like the avatar
  (first unused wins) and stored on the player record as `c`, so a colour never
  changes when someone else leaves. `refreshPresence` had to be updated to
  re-write `c`, otherwise a reconnect would silently drop it.
- **Undo** removes only my own strokes, one at a time, only while I may draw
  and never mid-stroke. Verified it leaves other players' strokes untouched.
- Round start and replay both write `strokes: null`, so every round begins on a
  blank canvas (verified by pixel-scanning the canvas: 0 painted pixels).

**Two real bugs found and fixed while testing:**
1. The `ResizeObserver` was created without keeping a reference. An
   unreferenced RO can be garbage-collected, which silently stops the canvas
   following the window. Now held in `canvasRO`.
2. Relying on RO/`resize` at all is fragile — mobile browsers skip `resize`
   when the URL bar slides away, and **neither RO nor resize fires at all in
   the headless preview browser** (verified: a freshly created RO received zero
   callbacks, not even its initial one). Added `startCanvasFitWatch()`, a 500ms
   poll that runs only while a round is on screen and re-fits the canvas if the
   container has changed. Cheap, and it makes correct sizing independent of any
   event firing.

**Verified in preview** (rooms S96M / 3TKW / YBUX, live RTDB, all deleted
after): strokes persist to RTDB with the right author, colour and point count;
a remote player's stroke renders live in their own colour; undo removes only
mine and disables itself when empty; canvas is square and fits at 375px and at
desktop width, and follows its container down to 212px and back; replay wipes
the canvas. Zero console errors. Draw v2026.07.27.2.

Note on the test harness: long `setTimeout` chains inside a single preview eval
time out at 30s, which once left a stroke mid-flight and blocked the next
pointerdown (`live` was still set). Keep verification evals short.

## 2026-07-27: Impostor Draw — third game, scaffold + rooms + lobby — #39/#40/#41

Start of the third game: turn-based drawing on one shared canvas, remote-first.
Branch `feat/impostor-draw`. Design decisions are locked in the epic (#39) and
were agreed 2026-07-26. **Hosting not deployed yet; database rules ARE deployed.**

- **#40 `www/shared/words.js`:** the word game's 6 categories / 300 entries
  hoisted out of `word/app.js` into a shared ES module. Draw imports the same
  file, so words and hints have one home.
- **#41 `www/draw/`** (`index.html` + `draw.css` + `app.js`) built on the shared
  modules from #26/#27. Room create/join with code + QR, presence,
  onDisconnect cleanup, 15-min idle watchdog, lobby with animal avatars,
  ready-up, FLIP/confetti roster animations. Draw-specific lobby: **rounds
  stepper** (default 2, clamped 1-5, host-only, synced via `meta/rounds`) and a
  **fixed single impostor** (static pill, no stepper). Categories limited to
  the three drawable ones (Food, Animals, Everyday Objects) — Places, Movies &
  TV and Football are sayable but not sketchable in one turn.
- **Impostor clue = the word's own vague hint** (Popcorn → "Buttery"), exactly
  like the word game. I first built this as the CATEGORY and was corrected: the
  host's category pick is displayed to every player in the lobby, so handing the
  impostor the category tells them nothing they don't already know.
  `meta/imposterHint` holds `entry.h`.
- **Room namespace `rooms-draw/`**, so all three games can hand out the same
  4-char code without colliding. Required a matching node in
  `database.rules.json` (same per-room open shape as `rooms`/`rooms-word`) —
  **without it every room create fails with "Permission denied"**. Deployed
  with `firebase deploy --only database` after the user approved.
- **`www/shared/qrcode.js` (new):** qrcode-generator v1.4.4 was a 20KB
  byte-identical inline `<script>` in BOTH games' HTML. Hoisted to one vendored
  classic script (not a module — it sets `window.qrcode`, and it must stay a
  plain `<script src>` so it's defined before the deferred module runs). Draw
  uses it instead of adding a third copy.
- Hub gained a third game card (+ nth-child(3) animation delay), sitemap entry
  added. Orphaned comments left behind in `word.css`/`dance.css` by the #26
  split were stripped (word.css 163 → 47 lines).
- **Placeholder art**: draw reuses the word game's logo/hub/OG images. Real
  artwork is an open item before launch.

**Verified in preview** (room KX6B, live RTDB, torn down after): create → QR →
lobby; rounds stepper clamps at 1 and 5 with singular/plural label; category
sheet lists exactly 3, single-pick and multi-select both commit; start gating
correct at 1 and 3 players; round deals `secretWord` from the chosen union with
the played-ledger entry; exactly one impostor; crewmate card shows the word,
impostor card shows only the word's hint (Popcorn → "Buttery", verified against
the catalog and confirmed it is not a category name; red tint + banner); reveal shows the
impostor and the word; replay returns to lobby with rounds intact; quit deletes
the room. Zero console errors. Word game re-verified after the QR extraction
(room EFBZ, QR rendered from the shared file). Versions: draw v2026.07.27.1.

Still to come per the epic: canvas + live strokes (#42), roles/turn engine with
the 45s timer (#43), chat (#44), vote (#45), analytics + stats (#46).

---

## 2026-07-27: Shared base.css — 262 identical rules de-duped — #26

Phase 4 of the modularize epic (#22), second prerequisite for Impostor Draw
(#39). Same branch as #27 (`refactor/shared-firebase-analytics`); **no deploy
yet**.

- **`www/shared/base.css` (new, 1,697 lines):** every top-level rule and
  at-block (keyframes, media queries) that was byte-for-byte identical
  (whitespace-normalized) in `dance.css` and `word.css`, extracted in
  dance.css order. 262 blocks. Both games link it BEFORE their own file, so
  game-specific rules keep overriding. Drifted near-duplicates were NOT
  folded in this pass (kept the change purely mechanical + provable).
- **Result:** `dance.css` 2,168 → 890 lines; `word.css` 1,584 → 163 lines.
  A design change is now a one-file edit, and Impostor Draw starts from
  `base.css` + a small `draw.css`.
- **Verification method (worth reusing):** computed-style fingerprint. Before
  the split, hash `getComputedStyle` (element + ::before/::after, all
  properties) for every DOM node on each game's page; re-hash after and diff.
  Word: 358 nodes, 0 real diffs. Dance: 514 nodes, 0 real diffs. The single
  differing node on each page was the `anchorBob` bobbing arrow in the
  How-to-play button, whose computed transform is time-varying (it hashed
  differently on every sample, including two "before" samples). Zero console
  errors; screenshot spot-check clean. Versions: dance/word v2026.07.27.1.

---

## 2026-07-26: Shared firebase.js + analytics.js (de-dupe, no-build) — #27

Phase 5 of the modularize epic (#22), done first as the foundation for the third
game, Impostor Draw (#39). Branch `refactor/shared-firebase-analytics`. All
verified in preview (see below); **no deploy yet**.

- **`www/shared/firebase.js` (new):** single source for `FIREBASE_CONFIG`,
  `FB_CONFIGURED`, and the `app` + `db` singletons (getApps guard, try/catch:
  `db` stays null on failure and every caller already guards `!db`). Pinned SDK
  10.12.0 everywhere; stats.html previously floated on 10.12.2 and was aligned,
  because mixing SDK versions creates parallel module instances whose handles
  reject each other.
- **`www/shared/analytics.js` (new):** `analyticsEnabled()` production gate,
  `safeKey`, `todayKey`, shared coarse-geo cache (`peekGeo`/`rememberGeo`/
  `fetchGeo`, localStorage `imp_geo`), and `createAnalytics(game)` returning
  `{ bumpAnalytics, trackError, installGlobalErrorTracking, trackSession,
  bumpFbPrompt }` bound to `analytics/<game>`. Paths and throttles are
  byte-identical to the old copies; no schema change.
- **Consumers cut over:** `dance/app.js` and `word/app.js` (config + init +
  analytics blocks deleted; game-specific `trackRound`, `trackSongMiss`,
  `trackSongFetch` stay local and now read country via `peekGeo()`);
  `www/index.html` hub visit tracking is now `createAnalytics('hub')
  .trackSession('imp_hub_sess')` (hub keeps its own session key = separate
  funnel entry, and gains the geo fallback provider + cache the games had);
  `stats.html` imports `db` from the shared module; `shared/auth.js` drops its
  config copy and imports `app`.
- **Behaviour preserved on purpose:** games still share the `imp_sess` session
  key (dance→word in one tab counts one visit, historical behaviour); global
  error listeners are opt-in per page (`installGlobalErrorTracking()`), hub
  stays listener-free as before.
- **Verified in preview:** all 5 JS files + both inline HTML modules pass
  `node --check`; hub, dance, word, stats load with zero console errors; live
  room created + lobby synced + quit in BOTH games against prod RTDB (rooms
  ephemeral); stats renders live prod KPIs on SDK 10.12.0;
  `analyticsEnabled()` confirmed false on localhost. Versions: dance/word/hub
  v2026.07.26.1 (stats has no stamp, internal page).

---

## 2026-07-24: Stats page — Total games played + Accounts created (BUILT, not yet deployed) — #37/#38

Two additions to `www/stats.html` Overview, plus sign-in instrumentation. Verified in
preview MCP against live prod analytics (public `.read`); no console errors. **Not
committed or deployed** — awaiting go-ahead. #38 shows 0 until `auth.js` ships (the
counter only writes from production).

- **#37 Total games played (KPI):** re-added the combined games KPI the Overview had
  dropped. Teal `.kpi.games` card, ids `all-g-total/today/avg`, range-aware (already
  filled by `renderSection`'s combined path). Verified 30d = 7,804 = Dance 5,266 +
  Word 2,538; 7d = 2,192.
- **#38 Accounts created (KPI + instrumentation):** new purple `.kpi.accounts` card
  (`--accent-purple #7c6bd0`, ids `all-acct-total/today/range`), all-time cumulative,
  reads `analytics/hub/accounts`. **Instrumentation** in `www/shared/auth.js`:
  module-level `onAuthStateChanged` → `recordAccountOnce()` stamps
  `users/<uid>/createdAt` on first sight (own node, allowed by rules) then bumps
  `analytics/hub/accounts/{total, daily/<day>/count}`. Counts each account ONCE
  (unique accounts, not logins); skips anonymous users; **production-only** gate
  (`acctAnalyticsEnabled()` mirrors the games' localhost/preview exclusion) so dev
  never inflates it. No PII — just a count. `analytics` node is already
  `.read/.write: true`, so no rule change needed.
- **Overview KPI layout** is now 3 + 2 + 2: row1 = Total visits / Total games /
  Total ratings; row2 = Dance games / Word games; row3 = Hub visits / Accounts
  created. Stacks single-column below 640px (existing media query).
- stats.html has no version stamp (internal `noindex` page); none added.

---

## 2026-07-24: Song Groups launch-readiness batch (SHIPPED) — #30/#33

Final pass before taking Song Groups + host sign-in live. Shipped together with the
Phase A/B commits on `feat/song-groups`. **Final versions: dance v2026.07.24.13,
hub v2026.07.24.3.** Database `users/<uid>` rules were already live. Everything below
was verified in the preview MCP with real Anonymous-auth sessions + iTunes search;
all test rooms/groups/anon accounts cleaned up; no console errors.

**Quick reference — Song Groups final shape:**
- Group = `{ id, name, createdAt, songs: [{title, artist, trackId}] }` at RTDB
  `users/<uid>/danceGroups/<id>`. Selected group rides in room `meta` as
  `sourceType:'group'`, `groupId`, `groupName`, `groupSongs`; re-resolved by
  `trackId` at play time. Analytics logged under `userGroup` (never song titles).
- Constants (`www/dance/app.js`): `GROUP_MIN_SONGS = 4`, `GROUP_MAX_SONGS = 50`,
  `GROUP_MAX_GROUPS = 2`. Name optional → auto `nextGroupName()` = lowest free
  "Song Group N". Sign-in gates ONLY group create/load; hosting/joining/playing
  stay login-free. Sign-in methods: Google popup (+redirect fallback) + email link.
- Terminology (locked): built-in curated sets = "Music category"; user-created
  sets = "Song group". Avoid "song category".

Launch-readiness pass on the auth surface (dance v2026.07.24.5):

- **Delete account** (client-only, no Cloud Functions — works on Spark). New
  `deleteAccount()` in `shared/auth.js`: removes everything the user owns under
  `users/<uid>` (RTDB `remove()`, allowed by the owner rules) **first**, then
  deletes the Firebase Auth user. Handles `auth/requires-recent-login` by
  re-authing Google inline via popup and retrying; email-link users who need
  re-auth get a `needs-resignin` message ("sign out and sign in again, then
  delete") — `remove()` is idempotent so the retry just finishes the account
  delete. Wired into the account menu as a red "Delete account" item that opens a
  simple confirm dialog (Cancel / red Delete) in `shared/auth-ui.js`. Required
  for Google/Apple platform policy + GDPR/CCPA erasure before launch.
- **Sign-in button restyled to a ghost/text button** matching the "← All games"
  back link. Made the shared `.imp-auth-account` style ghost (transparent, no
  border, ink-soft, 15px/500) so the hub and dance landing pages show an
  identical Sign in affordance (was a pill on the hub).
- **Account dropdown overflow fixed:** `.imp-auth-menu` now anchors
  `top:calc(100% + 6px); right:0` with `max-width:calc(100vw - 32px)` so it opens
  down-left from the button and never crops off-screen (was overflowing the right
  edge at every width). Fixes the hub menu too since it's shared.
- **Google "G" logo** added to the "Continue with Google" button, left-aligned.
- **Default music category** changed from "80s Hits" to "TikTok and Reels"
  (`DEFAULT_CATEGORY` + the hardcoded initial trigger label in index.html).

(Interim: briefly hid the dance Sign in button via a `hideWhenSignedOut` option,
then reverted per Irfan — the dance and hub landing pages should look the same,
both showing the ghost Sign in button. Option removed; final state is dance
v2026.07.24.7 / hub v2026.07.24.1.)

- **Cap of 2 song groups per host** (dance v2026.07.24.8): `GROUP_MAX_GROUPS = 2`.
  At the cap the "+ Create a song group" row is replaced by a subtle note
  ("You can keep up to 2 song groups. Edit or delete one to add another.");
  `openGroupBuilder`/`saveBuilderGroup` guard new-group creation as a safety net
  (toast). Editing/deleting existing groups is unaffected.
- **One-time "create song groups" lobby tooltip** (dance v2026.07.24.8): dark
  pill anchored under the Music Category trigger — "✨ Now you can create your own
  song groups." Host-only, shown once per device (`imp_dance_grouphint`
  localStorage flag) until a 2026-12-01 cutoff, mirroring the existing mode-hint
  pattern; dismissed when the category picker opens. Added `position:relative` to
  `.music-section` so the absolute tooltip anchors correctly (like `.mode-section`).
- **Never show both lobby hints at once** (dance v2026.07.24.11): the two "what's
  new" nudges (Find Your Squad mode vs. song groups) no longer overlap. Lobby entry
  runs `if (!maybeShowGroupHint()) maybeShowModeHint()` — the song-group hint takes
  priority; `maybeShowGroupHint()` now returns whether it displayed, and the mode
  hint only shows on a later visit once the group hint has been seen. Verified:
  first lobby visit → group hint only; second visit → mode hint only.

Verified in preview: tooltip shows on first lobby arrival (flag then set);
create row hides at 2 groups + note shows; create row returns after deleting one.
Test groups + anon account cleaned up; no console errors.

- **Group name is now optional** (dance v2026.07.24.9): Save enables on ≥4 songs
  alone; a blank name is auto-filled on save with the lowest free "Song Group N"
  (`nextGroupName()` scans existing names, skips the one being edited). Placeholder
  changed "Add group name" → "Group name (optional)". Verified: blank save →
  "Song Group 1", second → "Song Group 2", and after deleting #1 a new blank group
  reclaims "Song Group 1" (not 3).
- **Cap of 50 songs per group** (dance v2026.07.24.10): `GROUP_MAX_SONGS = 50`,
  enforced in `addBuilderSong` (toast "Up to 50 songs per group", add ignored).
  Keeps the room `meta` payload (all group songs ride in meta at play time) sane.
  Verified: accumulating ~90 search results caps the selected list at exactly 50;
  over-cap add toasts and no-ops; a full 50-song group saves fine.

**Verified end-to-end** with an Anonymous session: wrote a test group under
`users/<uid>/danceGroups`, ran `deleteAccount()` → data removed, auth user
deleted (`currentUser` null), account button reverted to "Sign in", no console
errors. Confirm dialog + menu item + menu positioning checked in preview
(desktop + mobile). Still uncommitted on `feat/song-groups`.

- **Subtle privacy notice at sign-in** (dance v2026.07.24.12 / hub v2026.07.24.2):
  one muted line in the shared sign-in modal — "We only store your email and the
  song groups you create. You can delete your account anytime." Transparency at
  the point of collection before launch, without waiting on the full privacy page.
  Interim until #35 ships, at which point it becomes a link to the policy.

**Follow-up (separate ticket):** privacy-policy page update covering stored
identity (email/name) + song groups and how to delete them. Deferred per Irfan.
An interim plain-language notice now lives in the sign-in modal (see above).

---

## 2026-07-23: Song-load failure tracking + stats panel (dance) — #29

Added telemetry so we can see which pool songs the iTunes preview API fails on
and replace them, instead of finding out mid-game. Two parts, dance-only (the
word game has no songs):

**Counter (`dance/app.js`).** In `fetchPreview`, a genuine miss (Apple returned
no playable preview for a pool query) now calls `trackSongMiss(query)`, logging
the song plus the player's country under
`analytics/music/errors/songMiss/<song>/{count, countries/<cc>}`. Reading it:
one country = region-locked, many = the song is gone from the store. This catches
what the offline pool validator can't — songs that rot after shipping or fail
only in certain storefronts. Network/timeout/bad-response failures aren't a
song's fault, so they go to a plain `errors/songFetch/net` tally (+ daily) via
`trackSongFetch('net')` rather than blaming a title. Throttled ≤1 bump / 10s /
song; prod-only through the existing `bumpAnalytics` gate; never throws into
gameplay. Country comes from the already-cached `lastGeo.cc` (no extra lookup);
`ZZ` when not yet resolved. Free-text host searches are deliberately not tracked
— arbitrary terms aren't a fixable pool entry.

**Stats panel (`stats.html`).** New "Songs failing to load" panel in the Dance
section (`hasSongFails` flag): each row shows the song, a bar for the miss count,
and the country flags where it failed, so region-locked vs dead reads at a glance.
The panel header shows the network-failure tally. All-time by design (no per-day
node kept for song misses), so it ignores the range selector; a caption notes
this. New `renderSongFails()` helper; reuses the existing `.row`/`flag()`
machinery plus a small `.hint`/`.flags` style.

**RTDB schema written (all under `analytics/music/`):**
- `errors/songMiss/<safeKey(query)>/count` — total misses for that pool query.
- `errors/songMiss/<safeKey(query)>/countries/<ISO cc>` — per-country breakdown
  (`ZZ` = country not yet resolved). One cc = region-locked; many = song is gone.
- `errors/songFetch/net` and `errors/songFetch/daily/<YYYY-MM-DD>/net` — Apple
  unreachable / timeout / bad-response tally, not attributed to any song.

The stats page reads these straight off the existing full-`analytics` snapshot
(`DATA.music.errors.*`); no new DB read and no rules change (`analytics` is
already `.read:true`). Write↔read key contract checked by hand — they match.

**Testing note for future refs:** analytics is production-gated on purpose
(`analyticsEnabled()` = true only on impostorgames.com / native app; false on
localhost AND `*.web.app` preview channels), so the actual RTDB write CANNOT be
exercised anywhere but live prod. Local verification therefore covered only the
non-write surface: dance page loads with no console errors, stats panel wires up
and renders correctly (empty state + injected sample rows with flags/bars via
DOM inspection), word game untouched (`git diff`). The write path reuses the
same proven `bumpAnalytics` plumbing as every other counter — only the paths and
two call sites are new. **First-deploy check:** trigger one known-failing song on
the live site (or wait for organic misses) and confirm a `songMiss` node appears
in the RTDB console / stats panel; a stray test entry can be deleted from the
console. Until that check runs, treat the end-to-end write as unconfirmed.

Decisions (from discussion): ship the counter now for real data before deciding
on any provider swap; keep a Deezer fallback in reserve, not built yet; skip the
"middleman" fetch refactor until the data shows it's warranted. Version stamp
v2026.07.23.3 → .4. Not deployed — pending review.

---

## 2026-07-23: Song Groups — design pass on the builder + picker (Phase B)

Reworked the Song Groups UI to a supplied design (dance v2026.07.23.7):
- **Signed-out uses the same "+ Create a song group" row** as signed-in (dropped
  the separate CTA); tapping it while signed out opens the sign-in popup.
- **Saved-group rows show an edit pencil**, not a delete ✕. The pencil opens the
  group in the builder. Tapping the row still selects it. **Delete moved into the
  builder** as a trash button (deletes when editing, discards the draft when new).
- **Rebuilt the builder popup**: search on top (magnifier + clear), one middle area
  that shows search results ("N songs") while typing and the picked-songs list when
  the box is empty, group name near the bottom, then Save + trash. 4-song minimum
  kept with a subtle "Add at least 4 songs" hint (Save disabled until name + 4).

Verified in preview with a real (anonymous) session: signed-out Create row opens
sign-in; builder search/add/remove + results↔selected toggle + count + clear all
work; Save gating + hint correct; save → group shows with pencil and auto-selects;
pencil → edit mode (name + songs prefilled); trash → deletes from RTDB and falls
back to the default category. No console errors. Test data cleaned up.

---

## 2026-07-23: Song Groups — create / save / reuse (epic #30, Phase B)

The payoff that makes signing in worthwhile: a host can build their own named set
of songs and reuse it in every mode except DJ. Sign-in is the *only* gate — it sits
at "create a song group" (and at loading saved groups); hosting, joining, and
playing with built-in categories stay fully login-free.

- **Storage:** RTDB `users/<uid>/danceGroups/<id>` with per-user rules added to
  `database.rules.json` (`auth.uid === $uid` for read + write). A group is
  `{ name, createdAt, songs:[{title, artist, trackId}] }`.
- **Builder** (new modal): reuses the DJ-mode iTunes search (`searchItunes`) — pick
  real previewable tracks, name the group, save. Enforces a 4-song minimum.
- **Picker:** a "My Groups" section at the top of the category modal (every mode
  except DJ). Signed out → "Sign in to create your own song group" CTA. Signed in →
  the host's groups + "Create". Selecting one sets the room's song source.
- **Play-time:** the chosen group's songs ride in the room `meta`
  (`sourceType:'group'`, `groupSongs`, `groupId/Name`) so all clients sync;
  re-resolved by **trackId** at play (iTunes preview URLs rot). New group-aware
  pickers mirror `pickPair`/`pickDistinctSongs` with a synthetic `__group__`
  category, so the played-ledger and round-start flow are otherwise untouched.
- **Analytics:** group rounds count under a single `userGroup` label; never logs
  user-entered song titles (`trackRound` now skips a null song).
- Firebase init already made idempotent in Phase A, so importing auth is safe.

Verified in preview (everything not behind real auth): no console errors, no
regressions — the category picker still lists all built-in categories and the
signed-out CTA opens the sign-in modal; the game stays ungated (create + join with
no prompt). Builder mechanics fully exercised: iTunes search returns results, tap
to add/remove, live count + 4-song-minimum gating on Save, `+`/`✓` indicators.
Dance v2026.07.23.6.

**Verified end-to-end (2026-07-23)** with a real signed-in session (Anonymous auth
enabled temporarily for testing): account state recognised → "My Groups" shows
Create; built + **saved** a group to `users/<uid>/danceGroups` (RTDB write allowed
by the new rules); loaded it back into My Groups; **selected** it → room meta
`sourceType:'group'` + trigger shows the group name in the lobby; switching to a
built-in category cleanly clears the group; play-time **re-resolution by trackId**
works (iTunes lookup returns a fresh preview); and **rules isolation confirmed** —
reading/writing another uid's groups is PERMISSION_DENIED. Test room + group cleaned
up afterward. Database rules already deployed. Remaining: disable Anonymous auth,
then merge + deploy hosting to go live.

---

## 2026-07-23: Auth foundation — hub-level sign-in (Song Groups epic, Phase A)

First slice of the sign-in + Song Groups epic (#30). Goal framing: build a base of
logged-in users whose reason to have an account is creating song groups and reusing
them across gatherings. **The game stays fully login-free** — this phase only adds
the ability to sign in; it gates nothing (the account wall arrives in Phase B, only
at "create a song group").

- New shared, DOM-free auth module **`www/shared/auth.js`**: Google popup (redirect
  fallback for WebViews) + passwordless email magic-link, `browserLocalPersistence`,
  `onAuthChange`/`currentUser`/`signOut`, and load-time completion of
  magic-link/redirect sign-ins. Reuses the existing public `FIREBASE_CONFIG`.
- New **`www/shared/auth-ui.js`**: injects a drop-in sign-in modal (styled with the
  site's CSS tokens) + a managed account button (`mountAccountButton`) — no markup
  duplicated across pages.
- Wired into **dance** (account button in a new home top bar) and the **hub**
  (top-right). Firebase init made idempotent in both (`getApps()?getApp():init`) so
  importing auth never double-inits — this also protects the hub's production
  analytics init.
- Providers (Google + Email link) still need enabling in the Firebase Console
  (owner action) before real sign-in works end to end.

Verified in preview: `auth.js`/`auth-ui.js`/`firebase-auth.js` load 200, no console
errors, no double-init. Account button shows "Sign in"; modal opens (Google +
email) and closes; **Create still advances to setup with no auth prompt** (game
ungated); guests unaffected. Hub analytics gate still holds on localhost
(`imp_hub_sess` stays null). Versions: dance v2026.07.23.4 → .5, hub .1 → .2.

---

## 2026-07-23: Refactor — split word into index.html + word.css + app.js (Phase 3)

Applied the same no-build split to the word game (#25). Moved the ~1,580-line
`<style>` block into `word/word.css` and the ~2,000-line app
`<script type="module">` into `word/app.js`; the vendored qrcode-generator
classic script stays inline. `word/index.html` is now **560 lines of pure
markup**, down from 4,143. Pure move, no rule/logic changes.

Verified in preview: renders identical (`.btn-primary` navy + Inter), `word.css`
and `app.js` load 200, Create advances home→setup (event wiring intact), no
console errors, analytics gate still holds on localhost (no RTDB writes).
Version stamp v2026.07.23.1 → .2. Pure code reorg, no IndexNow ping.

Both games are now structurally clean and split the same way. Nothing shared
yet (deliberate) — de-dupe comes next: Phase 4 shared `base.css` for the 268
identical CSS rules (#26), Phase 5 shared `firebase.js` + `analytics.js` (#27).

---

## 2026-07-23: Refactor — split dance into index.html + dance.css + app.js (Phases 1-2)

Kicked off the no-build modularization epic (#22) so the growing games stay
maintainable as new modes and features land. Native browser features only:
external stylesheet + `<script type="module" src>`. No bundler, no framework;
relative paths keep web + Capacitor working.

**Phase 1 (#23).** Moved the ~2,080-line `<style>` block out of
`dance/index.html` into `dance/dance.css`. Pure move, no rule changes.

**Phase 2 (#24).** Moved the ~3,140-line app `<script type="module">` out into
`dance/app.js`. The vendored qrcode-generator classic script stays inline (runs
before the module, so its global is still reachable). `index.html` is now
**717 lines of pure markup**, down from 5,942.

Verified each phase in the local preview: renders pixel-identical, `dance.css`
and `app.js` load 200, Create advances home→setup (event wiring intact), no
console errors, and the analytics production gate still holds on localhost (no
RTDB analytics writes). Version stamp v2026.07.23.1 → .2 (Phase 1) → .3
(Phase 2). Pure code reorg, no content change, so no IndexNow ping.

Remaining phases (still open under #22): Phase 3 word split (#25), Phase 4
shared `base.css` de-duping the 268 identical CSS rules (#26), Phase 5 shared
`firebase.js` + `analytics.js` (#27), Phase 6 dance `app.js` → `modes/*.js`
(#28). Not yet merged to main / deployed — awaiting go-ahead.

---

## 2026-07-23: Analytics — production-only gate + scrubbed Find Your Squad test rounds (dance)

Two related things, both about keeping the live counters honest.

**Cleanup.** The Find Your Squad launch-day testing (all on the preview channel,
2026-07-22) had inflated the live analytics. Backed the 74 test rounds out of
every counter they touched, by direct RTDB edit (no code/deploy):
`games/modes/findSquad` 75→1, `games/daily/2026-07-22/modes/findSquad` 74→0,
`games/total` 5195→5121, `games/daily/2026-07-22/count` 173→99,
`games/countries/IN` 4275→4201, `games/daily/2026-07-22/countries/IN` 145→71.
Country rows assume all 74 were IN (host location) — an inference, not stored
data, since analytics keep no IP or per-round record. Find Your Squad now reads
1 real round (2026-07-23). Partner Hunt interest counter (3) left as-is.

**Root cause + fix.** Preview-channel links share the same Firebase config /
`analytics` bucket as production and the code had no origin gate, so every test
run polluted live numbers. Added `analyticsEnabled()`: writes only when
`location.hostname` is impostorgames.com / www, OR `window.Capacitor` is present
(native app). Preview channels (*.web.app), localhost, 127.0.0.1, file:// now
write nothing. Applied across ALL three surfaces that write analytics:
- Dance (`www/dance/index.html`): `bumpAnalytics`, `bumpFbPrompt`, early-return
  in `trackSession` / `trackRound` (also skips the geo fetch off-prod).
- Word (`www/word/index.html`): same four paths. → v2026.07.23.1.
- Home hub (`www/index.html`): gated the inline `trackHubVisit` (writes
  `analytics/hub`). → v2026.07.23.1.
Dance version → v2026.07.23.1. Verified each on localhost: loads made zero RTDB
analytics writes (dance findSquad counter held at 1; hub `imp_hub_sess` guard
never set, proving early-return). No indexable content changed, so no IndexNow
ping.

## 2026-07-22: "New game mode" lobby nudge (dance)

One-time tooltip pointing at the lobby mode picker: "✨ New game mode is here.
Give it a try!". Same pattern as the multi-select `.cat-hint` — host-only,
shown once per device (localStorage `imp_dance_modehint`), with a cutoff
(`MODE_HINT_UNTIL` = 2026-10-01) so it stops nudging newcomers later. Dismisses
on tap or when the picker opens. Version → v2026.07.22.2. No indexable content
changed, so no IndexNow ping.

## 2026-07-22: Dance mode-picker redesign + Find Your Squad mode + Partner Hunt teaser

Reworked the dance game's mode system from two modes to a four-card picker, and
shipped one new playable mode. Version stamp → v2026.07.22.1. Dance page only;
word game untouched. Tickets: #17, #18, #19 (Partner Hunt full build deferred to
#20).

Design / rename (#18):
- Renamed the UI label of the original `category` mode "Shuffle Party" →
  **Imposter Challenge**. Internal mode id stays `category`, so existing rooms
  and all `games/modes/category` analytics keep working untouched. Copy sweep of
  the old name across the dance page meta description, VideoGame + FAQ JSON-LD,
  visible how-to/FAQ text, `llms.txt`, and the stats page mode labels.
- Mode picker modal now renders four cards (Imposter Challenge, DJ Mode, Find
  Your Squad, Partner Hunt) with per-mode line-art icons.

Find Your Squad (#17):
- New selectable mode `findSquad`. No impostor and no game master — the **host
  dances too** (confirmed with user). Players split into **two teams**, each
  team gets its **own clearly-distinct song** (user chose distinct over
  similar-sounding); everyone dances and tries to find the others on their
  track.
- Shared group-mode data model: `meta/groupTracks` (array of {title,artist,url},
  one per group) + `meta/groups` ({playerId: groupIndex}). `isGroupMode()`
  gate; `numGroups()` → 2 for Find Your Squad. New `pickDistinctSongs()` helper
  mirrors `pickPair`. No `imposterIds`, no played-ledger bookkeeping in group
  modes.
- Results are **host-reveal only** (user chose this over per-player guessing):
  the reveal screen lists each team's members + song. Discussion phase copy
  adjusted; host hits reveal.
- Lobby: group modes reuse the category picker (songs come from categories),
  impostor stepper hidden, host tag shows "Host", **minimum 4 players** (so
  there are always two teams of ≥2). Analytics `trackRound` gains
  `findSquad`/`partnerHunt` under `games/modes/*`.

Partner Hunt — coming-soon teaser (#19), full build deferred (#20):
- Partner Hunt appears in the picker as a **non-selectable "Coming soon"** card
  with a **🙋 I want this sooner** button. The round logic is pre-scaffolded
  (dormant) but the card can never be selected, so the mode is not playable yet.
  The card content dims to 0.5 opacity while the interest button stays full.
- The button is a **cookie-free demand counter** (user confirmed counter over a
  feedback record): first tap per device flips a localStorage flag and bumps
  `analytics/music/interest/partnerHunt` (+ `interest/daily/<day>/partnerHunt`),
  then the button locks to "🎉 You're on the list". Read the total in the
  Firebase console to gauge demand before building the full mode (#20).

Design iterations (post-build, with user):
- Mode icons are now **mascot illustrations** (imposter/dj/squad/partner),
  converted to WebP (~9–15 KB each, `www/icons/modes/`; 465px source PNGs kept in
  `design/`, outside `www/` so they don't deploy). Picker spacing reworked: 24px
  list padding (scoped to `#mode-modal-list`, not the shared `.cat-modal-list`),
  80px card icons.
- `.cat-row` vs `.mode-row` padding separated: `.cat-row` stays app-consistent
  (18/56/18/24, shared with word), `.mode-row` owns `16/16/16/12 !important`
  (dance-only; needed because `.cat-row` is declared later and would otherwise win).
- Players now see the game mode (read-only) in the lobby via a **compact,
  label-less card** (no "GAME MODE"/"MUSIC CATEGORY" titles, 34px icon, note +
  category). DJ Mode shows "host's choice" instead of the exact song.
- Reveal redesigned into squad cards: "🎉 The Reveal!" + subtitle, viewer's squad
  first as teal "YOUR SQUAD", the other as red "THE OTHER SQUAD", avatar member
  chips with a "YOU" tag, and the song at the **bottom** (neutral text,
  squad-coloured note icon).
- Mode descriptions reworded to the original mockup copy; word game
  `.cat-row-title` margin-bottom 4→8px (kept in sync with dance).

Status: field-tested by the user across 4+ phones (real Find Your Squad round +
grouped reveal worked), version v2026.07.22.1, **deployed to production**
(firebase hosting) and IndexNow-pinged for /dance/.

## 2026-07-21: In-app How-to-play popup + "Ready up" step (both games)

Added a "How to play" button in the lobby, right-aligned on the same row as the
Leave Room / Quit Game back button (wrapped both in a new `.lobby-topbar` flex
row, space-between). Ghost styling reuses the existing `.back-btn`. Tapping it
opens a popup built on the shared `.cat-modal` shell (same as the QR / category
modals). The popup shows the how-to steps only; its open handler clones the
landing page's `.howto-steps` list into the modal body, so there is a single
source of truth per file (no duplicated step markup) and the popup can never
drift from the landing page.

Also added a new dedicated "Ready up" step to the how-to steps (landing +
popup): "Each player taps the I'm Ready button in the lobby. Once everyone has
tapped it, the host can start the round." Copy names the actual button. Dance:
new step 4 (Pick a vibe -> 5, Dance -> 6, Catch -> 7); Word: new step 3 (Draw
-> 4 ... Reveal -> 7).

- Scope: lobby only. Reuse discussion (shared components across the two games)
  deferred - staying with two self-contained files for now.
- Verified in local preview (both games): topbar space-between, popup opens with
  all 7 cloned steps incl. "Ready up", Esc / backdrop / × close, no console errors.
- Version stamp -> v2026.07.21.5 (both games).

---

## 2026-07-21: How-to-play step 2 copy - mention QR join (both games)

Reworded the "Create or join a room" step to call out the QR path on both
sides: "One person creates a room and shares the 4-character code or QR code.
Everyone else joins by entering the code or scanning the QR." Accurate today
(the shared QR is a join deep-link, scannable with any phone camera); does not
depend on the in-app scanner still parked in #15. Copy-only, no logic.

- Version stamp -> v2026.07.21.4 (both games).

---

## 2026-07-21: Fix Room Code screen jitter while typing (both games)

Owner reported the join Room Code screen "blinking" / shifting while typing the
4-character code. Root cause: the code boxes are vertically centered by flex
spacers (flex:1 above, flex:2 below) inside a height:100% scroll container, and
every keystroke auto-advances focus to the next box. On mobile each programmatic
.focus() makes the browser scroll the newly-focused box into view above the
keyboard, nudging the un-anchored centered layout on every keystroke -> the
jitter. Not a regression from the lobby-animation work (different screen).

- Fix: pass `{ preventScroll: true }` to all five code-box .focus() calls
  (auto-advance, backspace, ArrowLeft, ArrowRight, paste). Focus still moves
  between boxes as before; the browser just stops scrolling on each move.
- Cleanup found in the same spot: there were two global `.code-box` /
  `.code-boxes` rule sets. The second (intended for the host share screen,
  56x70) was overriding the join inputs, and the "intended" join size (72x72)
  would actually overflow small phones. Scoped the share rules to
  `#share-code-boxes` and set the join rules explicitly to the size that was
  already rendering (56x70, gap 10, font 32). Net: identical pixels, but the
  join inputs no longer inherit the share screen's display:flex + cursor:pointer
  (they're now correctly display:block / cursor:text).
- Verified in mobile preview: join boxes 56x70, no horizontal overflow; share
  boxes still 56x70 flex-centered; no console errors.
- Version stamp -> v2026.07.21.3 (both games).

---

## 2026-07-21: Smooth lobby join/leave animation (both games)

Joins already animated (pop-in + confetti), but leaves jumped: the player list
rebuilds with `list.innerHTML = ''` on every RTDB snapshot, so a departing
player's row was simply gone from the next rebuild and everyone below snapped
up. Same jolt when someone auto-locked their phone and presence dropped them.
Fixed with two CSS-only techniques, no framework (Framer Motion is React-only;
the app is vanilla single-file). Decision confirmed with owner: no dependency.

- Rows now carry `data-pid` so renders can be diffed by player id.
- Leave: before the rebuild wipes the list, any row whose player is no longer
  present is cloned into a fixed-position `.player-ghost` on `<body>` (the same
  escape-the-rebuild trick the confetti uses) that fades + slides out via a new
  `row-out` keyframe. The real row still gets rebuilt away underneath it.
- FLIP: rows that survive the rebuild are snapped back to their pre-rebuild
  position (First rect captured before wipe) then released to glide to the new
  layout, so the gap closes smoothly. Rows that didn't move (dy < 1px) and
  freshly-joined rows (which own the pop-in) are skipped.
- Rejoin symmetry: when a player ghosts out, their id is dropped from
  `lobbySeen` so a return (e.g. screen back on after presence dropped them)
  replays the pop-in entrance instead of blinking in. `burstFired` is kept, so
  a reconnect gets the gentle pop-in but not a fresh confetti salvo (confetti
  stays reserved for genuine first joins, and won't spam on flaky networks).
- All new motion is gated behind `prefers-reduced-motion: reduce` (ghost +
  FLIP both skipped), matching the existing join-animation guard.
- Verified on local preview: both pages load with zero console errors; ghost
  spawns and runs `row-out` (opacity ~0.33 at 120ms), survivor below the
  leaver inverts to translateY(76px) then glides to identity, row above the
  leaver correctly untouched.
- Version stamp -> v2026.07.21.2 (both games).

---

## 2026-08-10: Fix Bing URL-Inspection issues on draw page

Bing Webmaster Tools reported `/draw/` as "Indexed successfully" but flagged 3
SEO issues. Fixed the two low-effort/real ones on the draw page only; skipped
the third by design.

- Meta description was 264 chars (Bing truncates ~160). Rewrote to 159 chars,
  dropped the em dash, and worked in stronger keywords ("Imposter Artist",
  "drawing game", "shared canvas") plus a Draw/guess/vote call to action:
  "Imposter Artist drawing game: everyone draws the same word on a shared
  canvas, except the impostor. Draw, guess, vote! Free online party game for
  3–20 players." (Descriptions aren't a ranking factor; this is for snippet
  keyword-bolding + click-through.)
- Added alt text to the two landing tile icons that had empty alt: `/host.webp`
  -> "Create a game", `/player.webp` -> "Join a game" (Bing "missing alt"
  notice, 2 instances).
- Skipped "More than one h1 tag" (5 instances): the SPA has one h1 per screen
  and only one shows at a time; Google treats multiple h1 as fine, and a fix
  would touch shared base.css across all three games for near-zero benefit.
- Scope kept to the draw page per owner; dance/word share the same tile images
  and h1 pattern but were left untouched this round.
- Version stamp -> v2026.08.10.1 (draw).

---

## 2026-07-20: SEO title/description tune from first Search Console data

First GSC keyword data (55 queries) showed the dance page earning nearly all
clicks while word-game queries got impressions but zero clicks, and searchers
overwhelmingly typing "imposter" (e) while our titles led with "Impostor" (o).
Tuned titles to match real query language. Head-only changes, no UI or logic.

- Word title: "Impostor Word Game — free online imposter word party game" ->
  "Imposter Word Game | Find the Impostor | Free Online Party Game" (searcher
  spelling first, mirrors "find the imposter word game" queries, both
  spellings still covered).
- Dance title: "Impostor Dance Game — free headphones party game" ->
  "Imposter Dance Game | Free Headphones Party Game". Kept "headphones"
  over "online"/"who is the imposter" since headphones queries had the most
  impressions after "dance". 
- Dance meta description now opens with "Who is the imposter?" (e spelling)
  per owner, so app-alternative searchers see the exact phrase bolded in the
  snippet; category list + DJ Mode keyword coverage kept.
- Home page, canonicals, structured data, OG/Twitter tags untouched (already
  in place from earlier SEO work). Decision: change once, then hold 2-3 weeks
  and read GSC (avg position + CTR) before iterating.
- Version stamp -> v2026.07.20.1 (both games).

---

## 2026-07-19: Compact lobby header (both games)

The lobby header was a tall centered stack: back button, a big 36px "Game
Lobby" heading, then the room code chip + QR button on a separate row below.
It pushed the game-mode/category card too far down. Reworked into one compact
row so the lobby content starts higher.

- New `.lobby-head` flex row replaces the lobby's centered `.logo` block: game
  icon + "Lobby" on the left, room code chip + QR button pushed right
  (`justify-content: space-between`), `16px 0` margins.
- Icon reuses each game's landing-screen logo at 56px: `/logo-dance.webp` for
  dance, `/logo-word.webp` for word. Both intrinsics are square (448x448).
- Heading shortened "Game Lobby" -> "Lobby", 36px -> 26px, left-aligned.
- Code chip + QR button backgrounds made transparent (`#fff` -> `none`) so they
  read as outlined pills on the cream page. Both classes are lobby-only, so no
  other screen is affected.
- Back button label kept as "Leave Room" (unchanged) per owner.
- Scoped to a lobby-only class; the home screen's `.logo` styles are untouched,
  so no other screen shifts. Verified both games in the mobile preview; header
  renders on one row with each game's own icon, no console errors.
- Version stamp -> v2026.07.19.3 (both games).

---

## 2026-07-19: Keep players in-game with Screen Wake Lock + rotating hint (SHIPPED)

Ticket #14. When a phone auto-locks in the lobby (player taps Ready, then waits
while the host gathers everyone) the socket drops and presence can bump them.
The lobby wait is the risk window; during the round the screen is active. Both
games.

- Screen Wake Lock API keeps the phone awake for the whole room session, so for
  most players the screen simply never sleeps. Acquired in `setupPresence()`
  (covers host-create and join), re-acquired on `visibilitychange` -> visible
  (the lock auto-releases when hidden/locked), released in `leaveRoom()`. Fails
  silently where unsupported. Supported on Chrome/Android and iOS Safari 16.4+.
- Fallback for the minority without a working lock: the single `#start-hint`
  line time-shares between the live status and the tip "Keep your screen on to
  stay in the game" on a 6s status / 4s tip cadence with a 250ms fade. No second
  line, so the sticky footer never grows. Rotation runs only when the lock is
  unavailable or denied, and only while the lobby is on screen.
- Kept as one line (not a permanent second line) at the user's request, so the
  message costs zero space for the majority whose wake lock works.
- Tip copy has no emoji: a leading 📱 rendered a taller line box (17px vs
  15.5px) than the status text, which grew the sticky button component's height
  each time the tip rotated in. Dropping it equalizes the line height so the
  container stays fixed. Measured before/after in preview.
- Verified in preview, both games: granted lock (stubbed resolve) -> static
  hint, no rotation; denied/unsupported (stubbed reject) -> rotates as designed,
  status stays live as players join. Confirmed the automation Chrome denies the
  real `wakeLock.request` (NotAllowedError), which is why the fallback engaged
  there. No console errors. Stamps bumped to v2026.07.19.2.
- Post-deploy check (owner, live on HTTPS): confirm the screen actually stays
  awake in the lobby on a Pixel 9 / Chrome and re-acquires after a lock/unlock.
  (Wake Lock needs a secure origin, so this can only be verified on the live
  site, not over LAN http.)

## 2026-07-18: One-time "multi-select" discovery hint (READY, NOT PUSHED)

Ticket #16. Existing hosts keep single-tapping a category out of habit and
would never notice the new Select pill, so a small one-time nudge points it
out. Both games.

- A tooltip bubble ("✨ Now you can select multiple categories") points up at
  the Select pill the first time the picker opens in default mode. Non-blocking;
  dismisses on any interaction (Select tap, row tap, close/backdrop/Escape).
- Shows once per device via localStorage (`imp_dance_mshint` / `imp_word_mshint`,
  distinct keys so a player of only one game still sees it). The flag is set the
  moment it is shown, guaranteeing exactly one appearance.
- Auto-expires: `MS_HINT_UNTIL = Date.UTC(2026, 7, 1)` (2026-08-01, ~2 weeks
  out). After that it never shows, since the tip is useless to users who arrive
  after multi-select is old news. Also suppressed when the sheet opens straight
  into Select mode (a multi-category room, host already knows).
- Verified in preview for both games: shows on first open with the right copy,
  sets the flag, hides on Select tap, and does not reappear on reopen. Stamps
  bumped to v2026.07.18.5.

## 2026-07-18: Name all song groups in dance-game SEO (READY, NOT PUSHED)

Ticket #15. The dance game's SEO copy still listed only the original four
groups (today's pop, 80s/90s, TikTok, Bollywood). Updated every category
mention to name the full supported set so the newer international and Indian
audiences can find us. Serves the same international-growth goal as the new
categories.

- Updated five spots in `www/dance/index.html`: the `<meta name="description">`,
  the SoftwareApplication schema description, the "What kind of music does it
  use?" FAQ answer (JSON-LD), and the two visible copies (how-to step and the
  on-page FAQ). All now list today's pop, 80s and 90s, TikTok and Reels, K-pop,
  Latin, Bollywood, Tamil, Telugu, Kannada, and Malayalam, and mention that
  categories can be combined (ties in the new multi-select).
- Rewrote the two visible lines to drop the em dashes while I was in there.
- Left og:/twitter: descriptions as-is (short social blurbs; genre stuffing
  would hurt them).
- Verified: all JSON-LD still parses; every group name renders in the page
  body; meta description carries the full list; no console errors. Stamp
  bumped to v2026.07.18.3.

## 2026-07-18: Multi-select categories in both games (READY, NOT PUSHED)

Ticket #14. The host can now pick several categories at once; a round draws
from their union. Requested by Irfan to serve mixed international groups (a
party with K-pop and Bollywood fans no longer has to choose one). Built in
both the dance game and the word game with identical UX.

- **Picker UX (iPhone Photos pattern, Irfan's design):** the picker keeps the
  production single-tap behaviour by default — tap a row, it applies that one
  category and closes, no rings, no Done bar. A "Select" pill in the header
  turns each row into a checkbox (tick rings + a sticky "Done" bar) for choosing
  several at once; the pill becomes "Cancel" while selecting and drops back to
  default without applying. A room that already spans 2+ categories opens
  straight into Select mode so the host sees the full set. At least one category
  must stay selected (tapping the last one off is ignored). Done commits;
  Cancel / X / backdrop / Escape discard. (Considered and rejected an always-on
  multi-select with no mode; Irfan preferred preserving the zero-friction single
  tap as the default.)
- **Data model:** new `meta.categories` array. `activeCategories()` falls back
  to the legacy single `meta.category`, then `DEFAULT_CATEGORY`, and filters out
  names no longer in the catalog so a stale pick can't empty the pool. On commit
  we write both `categories` and `category` (= first pick) for back-compat with
  any reader mid-deploy. A default-mode single tap writes a one-element array,
  collapsing any prior multi-selection.
- **Pool + dedupe:** `pickPair` (dance) and `pickWord` (word) now build the
  union of selected categories, each candidate tagged with its source category.
  The played ledger stays keyed per category, so anti-repeat works across the
  mix; on exhaustion we wipe the played buckets for the selected categories and
  reseed. Lazy iTunes fetch is unchanged, so pool size has no runtime cost (no
  cap needed).
- **Display:** lobby trigger and player-side view show a compact summary
  ("K-Pop, Bollywood +1") for host and players alike.
- Only `www/dance/index.html` and `www/word/index.html` touched. Stamps both
  bumped to v2026.07.18.2.
- Verified in preview as a live host in both games: default single-tap applies +
  closes; Select enters multi mode (rings + Done, pill -> Cancel); Done commits
  and persists to Firebase; reopening a multi room auto-enters Select with the
  set restored; Cancel discards edits; min-one guard holds; no console errors.

## 2026-07-17: Four new song categories for international reach (SHIPPED, commit 6938318)

Ticket #13. Grow the international audience by adding four dance-game song
categories, all validated against the iTunes Search API. Under **International**:
**K-Pop** and **Latin Hits**. Under **Indian**: **Telugu** and **Kannada**
(Irfan's explicit asks). 30 songs each, dance/party-leaning, mixing current
trending hits with evergreen crowd-pleasers.

- Only `www/dance/index.html` touched (the word game has no song pools). Added
  the four arrays to `CATEGORIES` and the four picker rows to `CATEGORY_GROUPS`.
  Version stamp v2026.07.17.3 -> v2026.07.17.4.
- Validation: every query run through the exact call the app makes
  (`itunes.apple.com/search?entity=song&limit=5`, first result with a
  previewUrl). Critically, PASS was not trusted blindly — each resolved
  trackName was checked against the intended song to catch silent
  wrong-master hits. Dropped traps like "Me Porto Bonito" -> Smooth Jazz
  All Stars instrumental, "Money Lisa" -> wrong artist, "Next Level aespa"
  -> unrelated track, "My Life Is Going On" -> Marvin Gaye, plus assorted
  covers/remixes by other artists. Also de-duped against existing pools.
- iTunes rate-limits hard (HTTP 429/403) under burst; validator uses backoff
  + slow pacing so throttled queries aren't mistaken for genuine misses.
- Kannada is the thinnest on Apple Music (Pogaru, Roberrt, Kotigobba,
  Yajamana, Googly soundtracks not indexed with accessible previews). Took
  four batches to reach 30 clean matches, filling with well-digitized KGF /
  Kantara / Mungaru Male / classic (Rajkumar, SPB, S. Janaki) catalog.
- Verified: JS parses; all four categories = exactly 30 entries, 0 dupes;
  every CATEGORY_GROUPS reference resolves; page loads with no console errors.
- Per Irfan's plan: start at 30 each, grow a category if analytics show
  players using it.

## 2026-07-17: IndexNow push-notify on deploy (IN REVIEW)

Ticket #12, branch `feat/indexnow`. Broaden reach beyond Google by pinging
IndexNow whenever we deploy, so Bing (and the engines on its index:
DuckDuckGo, Yahoo, Ecosia, ChatGPT Search), plus Yandex, Seznam, and Naver
get told about changes instantly instead of waiting for a crawl. Prompted
by Irfan wanting visibility on other search engines and AI search; pairs
with the Bing Webmaster Tools signup he just completed (imported from GSC).

- Key file `www/bdb6e922c549db6b9fb7aee008298985.txt` (content is the key)
  hosted at the site root. Firebase hosting public dir is `www` and there
  are no rewrites, so it resolves at `https://impostorgames.com/<key>.txt`,
  which is the keyLocation IndexNow fetches to prove ownership.
- `scripts/indexnow-ping.mjs`: zero-dependency Node 18+ script. With no
  args it reads every `<loc>` from `www/sitemap.xml` and submits them; pass
  paths or full URLs to submit a subset. POSTs the batch to
  api.indexnow.org and reports HTTP 200/202 as success, with readable hints
  for 403/422 (usually "key file not live yet, deploy first").
- The `scripts/` dir sits outside `www/`, so it is committed to the repo
  but never served by hosting.

Deploy step: run `node scripts/indexnow-ping.mjs` right AFTER
`firebase deploy` so the live pages match what we submit. Verified offline:
script syntax checks, sitemap parsing returns the three public URLs, arg
forms resolve correctly, and the key file is served at the root by the
local preview. Not pinged live yet (the key file must be on prod first).

---

## 2026-07-17 — Stats: Games by mode panel (Shuffle Party vs DJ Mode) (IN REVIEW)

Ticket #11, branch `feat/stats-games-by-mode`. Display-only: the dance app
already writes games/modes/{category,hostPicks} (total + per-day), so this
just surfaces it.

- New "Games by mode" ranked panel in the Dance section only (gated on a
  new `hasModes` flag; Word has no modes), placed between "Games by
  country" and "Top categories". Reuses renderRanked, so it respects the
  7/14/30/90/all/custom range via sumMap like the other panels.
- MODE_LABELS maps the stored ids to display names (category -> Shuffle
  Party, hostPicks -> DJ Mode). Both rows are seeded so the split always
  shows two rows when there's data in range; zero tagged rounds in range
  shows the empty state.
- Caption "since DJ Mode launch" flags that mode tracking began at launch,
  so the split won't sum to all-time total games for earlier periods.
- Hardened renderRanked's max to Math.max(1, …) so an all-zero object can't
  produce NaN bar widths.

Verified live against prod analytics: last 30 days Shuffle Party 75 / DJ
Mode 24; range switching and the pre-launch empty state both work; no
modes panel leaks into the Word section.

---

## 2026-07-17 — How-to-play: impostor tactic + discussion beat (IN REVIEW)

Two dance how-to-play copy tweaks (ticket #9, branch
`feat/howto-impostor-strategy`), prompted by comparing our flow to the
competitor's:
- Step 5 now includes the impostor's point of view — they get a different
  track and must fake it by following the crowd so their moves don't give
  them away.
- Step 6 rewritten to surface the group discussion/accusation moment (the
  real "Find the Impostor — who danced off the vibe?" screen) before the
  host reveals. Deliberately no "voting" or "points" language — the app has
  neither (the reveal is discussion + host tap; the .vote-row CSS is
  unused legacy).

Dance version → v2026.07.17.3.

---

## 2026-07-17 — SEO fix: "Who is the Impostor" is a dance app, retargeted (IN REVIEW)

Correction to the entry below. Irfan flagged that "Who Is The Imposter?"
(by TikTok creator The Famileigh) is a **dance/music** party app — everyone
dances to the same song except one impostor hearing a different tune in
their headphones — not a word/social-deduction game. Verified via web
search. The earlier pass wrongly targeted it from the word page + hub with
word-game framing, which would have drawn the wrong intent.

Fix on branch `fix/seo-competitor-is-dance-app` (ticket #8):
- Word page fully reverted to its pre-SEO baseline (v2026.07.16.5) — the
  competitor keywords and FAQ are gone; those searchers want the dance game.
- Competitor capture added to the **dance page**: keywords plus an "Is this
  a free alternative to the Who is the Impostor app?" FAQ (JSON-LD +
  visible) describing the dance concept and positioning the browser game as
  a free, no-download alternative — also cross-promotes DJ Mode.
- Hub FAQ (JSON-LD + visible) reframed from word to dance, pointing to
  /dance.
- llms.txt: competitor-alternative note moved to the dance section; the
  common-questions entry now points to /dance.
- Framing unchanged in spirit: competitor brand, "free browser version /
  alternative" — never "also known as." Dance + hub bumped to v2026.07.17.2.

---

## 2026-07-17 — SEO: DJ Mode surfacing + "Who is the Impostor" capture (IN REVIEW)

Two tightly-scoped SEO passes on branch `feat/seo-dj-mode-and-competitor`.
No deploy until Irfan reviews.

**DJ Mode (ticket #6, www/dance/index.html + www/llms.txt).** The dance
copy only described the category/random-song flow, so we didn't surface for
"pick the song" / "song imposter" / "DJ party game" intent. Added: DJ Mode
to the meta description + keywords, a two-mode clause on the VideoGame
schema description, a new FAQPage entry and matching visible FAQ ("Can the
host pick the exact song? (DJ Mode)"), a "Two ways to play" how-to note
(Shuffle Party vs DJ Mode), and the mode names in the llms.txt dance
section. Dance version → v2026.07.17.1.

**"Who is the Impostor" (ticket #7, www/word/index.html + www/index.html +
www/llms.txt).** That competitor is a word/social-deduction app, so the
Impostor Word Game (and the hub) are the natural match — not the dance
game. Framing rule kept strict: it's a competitor brand, not an alias, so
all copy uses "free browser alternative to" and honest "same kind of game"
language — never "also known as." Added competitor keywords to the word and
hub pages, an "Is this like the Who is the Impostor app?" FAQ (JSON-LD +
visible) on both, and alternative positioning in llms.txt. Word version →
v2026.07.17.1, hub version → v2026.07.17.1.

Verified: all JSON-LD blocks parse; new FAQ/how-to copy renders on all
three pages via the local preview; version stamps updated.

---

## 2026-07-16 — Host Picks (DJ) game mode on /dance (DONE)

New second game mode alongside the original category flow. Host becomes a
game master: searches iTunes for the exact song the group hears, optionally
picks the impostor's song too (auto-picked to match if skipped), sits the
round out, can never be the impostor, and watches knowing who it is.
Decisions confirmed with Irfan: mode selector lives in the lobby
(category-picker pattern), impostor song optional with auto-pick-similar,
minimum host + 3 dancers (4 total), host gets a full GM view.

- Data model: `meta.mode` ('category' | 'hostPicks'), `roomMode()` defaults
  legacy rooms to 'category'. Host's picks stay host-local in
  `state.hostPick` until start — the room JSON is world-readable, so any
  pre-start write would let players peek. At start they're written as the
  existing crewmateTrack/imposterTrack, so playback/reveal needed no shape
  changes.
- Lobby: Game Mode card (host trigger + modal, players see label + hint);
  in DJ mode the category card becomes a Songs card with group/impostor
  pick buttons; host row tag reads DJ; start gated on 3 ready dancers +
  crew song picked; impostor stepper thresholds count dancers, not room
  size (host excluded).
- Song search modal: debounced iTunes search (350 ms, stale-response
  guard), artwork rows, tap-to-preview on a dedicated Audio element,
  identical-song-for-both-slots rejected, touchRoom() on open/select so
  browsing doesn't trip the idle watchdog.
- Auto-pick impostor song (revised per Irfan): CONTRAST, not similarity —
  a slow song against a banger is what makes the impostor visibly off.
  Candidates still come from related sources (same artist, then genre) so
  language/culture fits, but the pick maximizes measured vibe contrast:
  previews are fetched (iTunes CDN sends open CORS) and analyzed with the
  Web Audio API. Metric: zero-crossing rate (bangers ~4000+/s, ballads
  ~1300–2000/s — clean gap, loudness-invariant). Tried tempo via onset
  autocorrelation + onset density first: octave errors scored Beat It
  below My Heart Will Go On; ZCR separated every test pair correctly.
  Picks the max |Δscore| vs the crew song. Analysis failure → random
  related song; no related results → DEFAULT_CATEGORY pool → throw into
  fbStartGame's recovery.
- Round: impostor pool excludes the host in DJ mode; GM banner (teal twin
  of the impostor banner) names the impostor(s); GM hears the crew song.
  Replay clears the picks so the lobby re-prompts each round.
- Analytics: games/modes/<mode> counters (+ daily); category counters only
  bump in category mode; DJ rounds still bump games/songs with the crew
  title.
- GitHub: issues #1–#5 on irfanrafeek/imposter map the chunks; branch
  feat/host-picks-mode merged to main. v2026.07.16.11 deployed to prod
  (impostorgames.com/dance/); preview channel host-picks retired after
  merge.

Design pass (Irfan): merge Mode + Music/Songs into one card (was two,
took too much vertical space). Modes renamed for punch: Category →
Shuffle Party (dice icon), Host Picks (DJ) → DJ Mode (headphones);
internal ids stay 'category' / 'hostPicks' so existing rooms and
analytics keep working. Trigger and modal rows both show the icon.
Section divider between mode and music/songs. Under-trigger hints
dropped — the start-hint below Start Game already handles blockers.
Player view drastically simplified to a single MUSIC line with the
mode name. In Shuffle mode the line shows the raw category name
("80s Hits", "Bollywood", etc. — Irfan wanted the originals preserved).
In DJ mode it shows "DJ Mode".

Mode-change propagation test (Irfan flagged as broken): verified end-
to-end in the preview channel that a Shuffle → DJ (and DJ → Shuffle)
switch on the host updates the player's MUSIC line within one snapshot.
Suspected cause of Irfan's report: cached HTML — hard refresh needed.

---

## 2026-07-16 — Lobby sticky action bar + keyboard-friendly name screens (both apps) (DONE)

Irfan: with many players the lobby's Ready/Start buttons scroll below the fold,
and on the name screens the mobile keyboard covers the bottom-pinned button
(user had to dismiss the keyboard to continue). Options discussed (sticky bar /
capped scrolling list / avatar-chip grid / reorder); Irfan picked the sticky bar.

First pass put the name-screen button directly under the input; Irfan then
asked for sticky-at-bottom everywhere, lifted above the keyboard (both apps):

- `.sticky-actions` bar (one shared class): `position: sticky` with
  `bottom: -48px` and `margin: 0 -24px -48px` to cancel #app's padding so the
  bar hugs the viewport edge stuck AND at rest. Solid `--bg` background + soft
  top shadow; content scrolls underneath; safe-area padding for iPhone. Note:
  sticky offset is measured from the scrollport (shrunk by classic
  scrollbars), so desktop preview shows an 8px overshoot clipping only empty
  padding; overlay-scrollbar phones are exactly flush.
- Wrapped in it: lobby Ready/Start + hint, join-name "Enter room", setup
  "Create Room", host-share "Go to Lobby" (the last for visual consistency —
  no keyboard there). Name screens keep their bottom-pinning `flex:1` spacer.
- Keyboard handling: `interactive-widget=resizes-content` added to the
  viewport meta (Android Chrome resizes the layout, so bottom-anchored flex
  reflows above the keyboard natively) + a visualViewport resize/scroll
  listener that translates `.sticky-actions` up by the keyboard overlap (iOS,
  where the keyboard overlays instead of resizing; gap computes to 0 on
  Android so no double-lift).
- Enter/Go key on the name inputs now submits (clicks btn-join/btn-go-lobby).
- Verified in preview (mobile viewport): all four bars flush at the viewport
  edge on both apps, rows slide under the lobby bar (15 fake players),
  Enter-key flow works, lift transform positions correctly with a simulated
  336px keyboard, no console errors. Real-device keyboard behavior (iOS lift
  smoothness) worth a phone check before deploy.
- Irfan's phone test caught a gap: with few players the lobby content is
  short and sticky alone doesn't push the bar down (sticky only stops it
  scrolling out of view). Fix: `#screen-lobby .stack-lg` becomes a
  `flex:1` column and `.sticky-actions` gets `margin-top: auto`, so the bar
  is pinned to the screen bottom at any player count. Both apps
  v2026.07.16.3.

---

## 2026-07-15 — Fix poor CLS on /dance: visualizer animated height → scaleY (DONE)

Clarity showed /dance CLS 1.5 (poor) while /word sat at 0.04 and the hub at 0
(LCP/INP good everywhere). Culprit: the round-screen music visualizer — 24
bottom-aligned bars whose `height` was randomized every 110 ms via JS. Height
is a layout property, so every tick moved each bar's top edge with no recent
user input → hundreds of counted layout shifts per song. All other animations
(dancer, confetti, join pop) were already transform/opacity-based and CLS-safe.

Fix (dance only, v2026.07.15.3): bars get a fixed 150px layout height and
bounce via `transform: scaleY()` with `transform-origin: bottom`; JS writes
`scaleY(h/150)` instead of `height`. Transforms don't participate in layout,
so the animation can no longer produce shifts — and it skips layout/reflow
9×/sec (cheaper on phones). Screenshot-verified the equalizer looks identical;
no console errors. Note: CLS can't be measured in the local preview (tab is
`visibilityState: hidden` → no paints → no layout-shift entries); proof will
be Clarity field data over the days after deploy.

Also clarified for Irfan: screen-off → disconnect → rejoin does NOT drive CLS
(hidden pages don't paint); at most the re-render on wake adds one small shift.

---

## 2026-07-15 — SEO images: OG cards + max-image-preview + image sitemap (DONE)

Irfan noticed Google results for /dance and /word show no thumbnail (the hub
does). Diagnosis: Google picks result thumbnails from visible content images on
the page, and the game pages' only visible image is the 200×160 logo — too
small/logo-like. Also the shared og:image (logo.png) was 448×448, below
Google's recommended ≥1200px width. Shipped (Irfan chose the illustrated
mascot style over human photos — brand consistency, no bait-and-switch):

- `<meta name="robots" content="max-image-preview:large">` on hub, /dance, /word.
- New 1200×630 OG cards from Irfan's artwork (`~/Documents/Impostor images/`):
  `www/og-dance.jpg` (dancing group, 240 KB) and `www/og-word.jpg` (card table,
  199 KB). Wired into og:image (+width/height/alt), twitter:image, and JSON-LD
  `image` on each game page. Hub keeps logo.png. Note: og:image is only fetched
  by crawlers/link-preview bots — zero page-load cost for players.
- sitemap.xml: added Google image-sitemap namespace and `<image:image>` entries
  per URL (og cards + game logos); lastmod → 2026-07-15. xmllint-validated.
- Straggler fix caught in diff review: word JSON-LD description still said
  "3–8 players" (dash stored as `–` so earlier cap sweep's grep missed
  it) → now 3–20.
- Verified in preview: JSON-LD parses on both pages, meta tags correct, og
  images serve 200, no console errors. Versions: dance/word v2026.07.15.2,
  hub v2026.07.15.1.

Expectation set with Irfan: thumbnails are Google's per-query choice and take
days–weeks of recrawls; favicon (regenerated 07-14) also pending Google's
separate favicon crawl.

---

## 2026-07-15 — Tighten home-screen bottom space (both apps) (DONE)

Irfan flagged that the space below the "How to play" ghost button on the dance
landing was a bit too generous and asked to trim ~16px on both apps.

- Reduced `.home-fold { min-height: calc(100dvh - 160px) }` → `calc(100dvh - 120px)`
  in both `www/dance/index.html` and `www/word/index.html`. The fold takes 40px
  more of the viewport, so the "How to play" button (bottom of the fold) drops
  by the same amount and the empty space below it shrinks correspondingly.
  (Initial pass used 144px / 16px; Irfan hand-tuned it tighter to 120px / 40px.)
- Verified in the preview at mobile viewport (375×812): cards, spacer, title
  block, and scroll-to-how-to-play behaviour unchanged.
- Version stamps bumped: dance/word both v2026.07.15.1.

---

## 2026-07-14 — Animal avatars for players (both apps) (DONE)

Irfan supplied a 5×4 sheet of 20 kawaii animal faces to replace the initials
player avatars. Shipped in both apps:
- **Assets**: first pass cropped the sheet in-browser (canvas) but the crops
  read poorly; Irfan then supplied 20 individually pre-cropped PNGs (247px,
  transparent corners) which were converted to `www/avatars/av01–av20.webp`,
  192px with alpha, ~8–10 KB each (~180 KB total). Full-bleed circles, much
  cleaner. Order: fox, panda, koala, dog, rabbit, bear, lion, tiger, raccoon,
  penguin, deer, giraffe, elephant, cow, hedgehog, owl, otter, shiba, frog,
  chick. 7-day cache header added for `/avatars/**` in firebase.json.
  (Canvas note: `Image.decode()` hung in the preview pipeline; use
  `createImageBitmap(blob)` instead.)
- **Assignment** (Irfan picked): random, no repeats within a room — `pickAvatar()`
  chooses a random unused index 1..20 at create/join time, stored as `av` on the
  player's RTDB record so every phone shows the same animal and it survives
  leaves/joins. 20 animals = MAX_PLAYERS, so never exhausted.
- **Render**: lobby `renderLobby()` swaps the initials div for
  `<img class="player-avatar">` (same 40px circle). Fallback: players without
  `av` (rooms created pre-deploy, or mid-rollout clients) keep initials circle.
- **Gotcha handled**: `refreshPresence()` rewrites the whole player record on
  reconnect — `av: state.myAv` included there or avatars would vanish on
  network blips.
- Verified in preview against live DB: dance host got elephant, simulated
  friend rendered tiger; word host got owl; no-`av` player fell back to "OL"
  initials. Test rooms removed. Zero console errors.
- Version stamps → v2026.07.14.4 (dance, word). Hub untouched.
- **Join animation + lobby order** (follow-up, same day): Irfan picked
  "pop-in bounce" from three options. New player's row fades in
  (`row-in`, 0.3s) while the avatar scales 0→1 with soft overshoot
  (`avatar-pop`, 0.42s, cubic-bezier(0.34,1.56,0.64,1)). A module-level
  `lobbySeen` Set tags only never-seen player ids as `.just-joined` so ready
  toggles / phase re-renders don't re-animate (verified); cleared in
  `leaveRoom`. **Bug found by Irfan testing locally**: a real join fires 2-3
  RTDB snapshots back-to-back (player write + lastActivity stamp), and the
  second re-render stripped the class ~50ms in — animation invisible. Fixed:
  `lobbySeen` is a Map(id → first-render time) and `isNewInLobby()` keeps the
  class for 700ms (JOIN_ANIM_MS), so rapid re-renders retain it. Verified with
  in-page REST-simulated join: class + `avatar-pop` animation live on the row
  after the double write. Follow-up (Irfan asked about a blink): each rebuild
  restarted the animation from opacity 0 — fixed by setting a negative
  `animation-delay` equal to elapsed-since-first-render on row + avatar, so
  rebuilds RESUME the animation mid-flight. Measured with MutationObserver:
  2nd rebuild at +92ms resumed at opacity 0.458 instead of snapping to 0.
  Also dropped `loading="lazy"` from avatar imgs (useless at 40px, could add
  a decode flash on rebuild).
- **Confetti micro-burst on join** (Irfan picked option 1 of 4): 10 tiny
  pastel strips/dots (brand palette) fly out from the new player's avatar and
  fade over 0.65s (`confetti-fly`). Particles are appended to `<body>`
  (position: fixed) so list rebuilds can't kill them; each self-removes at
  700ms — verified 10 added / 10 removed, none leaked. Fired once per player
  (`burstFired` Set, cleared in leaveRoom) and skipped on the initial lobby
  paint so late joiners don't see a burst salvo. Two gotchas hit and fixed:
  (1) rAF-deferred firing never ran in throttled/background tabs — fire
  synchronously instead; (2) measuring the avatar for the burst origin
  returned 0x0 because `avatar-pop` starts at scale(0) and gBCR returns the
  transformed box — measure the row and offset (+36px, padding + half
  avatar) instead. Respects prefers-reduced-motion. Both apps.
  v2026.07.14.6. Lobby display order changed: host pinned on top, then newest
  join first (presentation-only sort copy — `state.players` stays
  joinedAt-asc for game logic). Respects `prefers-reduced-motion`. Both apps.
  Verified in preview: order host→newest→older, class only on new row, no
  console errors. v2026.07.14.5. Also: Irfan hand-tweaked ready-row green
  (#c8eecd → #c8e8d9) in dance — kept.

---

## 2026-07-14 — Hub tagline + multiplayer SEO terms (DONE)

Irfan wanted the hub tagline changed from "Free imposter online multiplayer
games" to "Trust no one. ;)" — a punchier, on-brand line. Since the old tagline
was the ONLY place "multiplayer" appeared in Google-indexed text (it existed
elsewhere only in JSON-LD `playMode` and body FAQs), added multiplayer keywords
to the high-value SEO surfaces so we don't lose that signal:
- **Hub / Dance / Word**: `meta description`, `meta keywords`, `og:description`,
  `twitter:description` all now include "multiplayer" once (natural placement)
  plus per-app multiplayer phrases in keywords (`multiplayer party game`,
  `multiplayer impostor game`, `multiplayer dance/word game`,
  `online multiplayer party game`).
- Titles left alone — already keyword-dense, adding more risks reading spammy.
- Version stamps bumped to v2026.07.14.3 on all three public pages.
- Verified in preview: multiplayer present in all four meta surfaces per page,
  hero renders the new tagline cleanly, Clarity snippet still in place.

---

## 2026-07-14 — Microsoft Clarity (heatmaps + session recording) (DONE)

Irfan wanted to see how audiences arrive and how they use the site. Added
Microsoft Clarity (free, unlimited) — project "Impostor Games", ID `xm6tsps1dc`.
- Snippet added high in `<head>` of the **three public pages**: hub, `/dance/`,
  `/word/`. **Skipped `stats.html`** deliberately — it's the owner-only `noindex`
  admin dashboard; tracking our own visits there would pollute audience data.
- Chose **no consent banner** (Irfan's call) — Clarity's standard snippet tracks
  immediately via first-party cookies. Departs from our cookie-free stance; noted
  that EU/GDPR traffic may later warrant switching to consent-gated mode
  (`clarity('consent')`, one-line change).
- Version stamps bumped to v2026.07.14.2 on all three pages.
- Verified in preview: tag `clarity.ms/tag/xm6tsps1dc → 200`, real tracker
  `scripts.clarity.ms/.../clarity.js → 200`, telemetry `POST j.clarity.ms/collect
  → 204`. Data confirmed flowing.
- Our own cookie-free aggregate analytics (sessions/rounds/categories/ratings/
  errors) stay in place; Clarity is additive, not a replacement.

---

## 2026-07-14 — Stats page: view selector + ratings/feedback (DONE)

Irfan wanted ratings/feedback exposed in stats + a per-app split. Shipped:
- **Both apps**: on emoji click in the feedback popup, additionally bump
  `analytics/${GAME}/fbprompt/ratings/${1..4}` (via existing bumpAnalytics). Same
  privacy model — just per-rating aggregate counters, no comments/text/PII. Full
  feedback records with text stay in `feedback/${GAME}` (`.read: false`) and are
  read from Firebase Console when Irfan wants them. Discussed both options —
  Irfan picked counters-only, leaving comments private.
- **stats.html restructured**:
  - Dropdown selector at top: Overview / Impostor Dance Game / Impostor Word
    Game. Only the picked section renders (`section.game.active` toggle). URL
    param `?view=music|word` preserved so refresh + share keep the choice.
    Default overview (no param).
  - Overview KPI split per Irfan: total app visits + **Dance games** +
    **Word games** as three separate cards (was one combined "Games" card).
    Second KPI row adds **Total ratings** (with avg score 0–4 and popup response
    rate %) + hub visits.
  - Per-app views get a third KPI card: Ratings (with same avg + response).
  - New Ratings panel (both overview and per-app): distribution rows 🤩/😄/😐/😕
    with counts + percent-of-total bars, plus header showing "N ratings · N
    dismissed". Empty state "No ratings yet." for pools with no data.
  - Footer note updated to explain what's included/excluded.
- Verified in preview end-to-end: seeded test ratings 3/5/18/22 into Firebase,
  confirmed overview and dance views both render distribution + avg (3.23/4) +
  response rate (48/51%), URL param + dropdown state persist across
  refresh, then removed the test node.
- Bug caught: my initial buildSections removed the combined `all-g-total` KPI
  but renderSection still tried to write to it → null textContent throw. Fixed
  by guarding those three assignments with element-exists check while keeping
  the combined games chart (which does still render for overview).
Dance v2026.07.14.1, word v2026.07.14.1.

## 2026-07-13 — Favicons + WebSite JSON-LD + PWA manifests (SERP polish) (DONE)

Google results for the site showed the generic globe icon — root cause: the site had NO favicon
at all (no link tags, no /favicon.ico — it 404'd). Also no WebSite JSON-LD, so results show the
bare domain instead of a branded "Impostor Games" site name. Shipped:
- **Icon family** in `www/icons/` (canvas compositing in the preview browser — no ImageMagick/PIL
  on this machine): brand set 16/32/48/96/180/192/512 + 512-maskable from a front-facing
  headphones-character artwork Irfan supplied in chat (1892² webp, recovered from the session
  transcript base64; small sizes crop to the central ~78–88% so the character reads, maskable
  uses the full frame as safe zone). Word-game set 180/192/512 + maskable from logo-word on cream
  `#FBF8F3`. All opaque so they never go invisible in dark UIs. Plus `/favicon.ico` (16+32+48
  PNG-in-ICO, built with a small Python struct script).
- **Link tags** on all three pages: favicon.ico + 48/96/192 PNGs (Google wants multiples of 48px),
  apple-touch-icon (word page gets its own), manifest link.
- **WebSite JSON-LD** added to the hub @graph (name "Impostor Games", alternateName imposter
  spelling) → lets Google show a branded site name in results. Organization logo now points at the
  square opaque icon-512 (better for logo rich results than the transparent logo.png, which stays
  as og:image).
- **PWA step 1 (manifest-only, NO service worker** — deliberately: a caching SW would fight the
  multiple-deploys-a-day flow): three manifests — hub (`/`), dance (`/dance/` scope), word
  (`/word/` scope, own icons). "Add to Home Screen" now yields a real app icon + splash +
  standalone full-screen instead of a glorified bookmark. Zero UI change, zero install push;
  Chrome may quietly offer "Install app" in its menu.
- **firebase.json**: `/icons/**` + `/favicon.ico` get `Cache-Control: public, max-age=604800`
  (immutable-ish assets shouldn't inherit the site-wide no-store).
- sitemap lastmod 2026-07-07 → 2026-07-13.
Verified in preview: all icon/manifest URLs 200 on all three pages, JSON-LD + manifests parse,
no console errors. NOTE: Google picks up the favicon on its own recrawl (days–2 weeks); Search
Console verification (Irfan's action) would let us request reindexing + see search queries.
All three pages → v2026.07.13.1.

## 2026-07-13 — Error telemetry (aggregate, cookie-free) (DONE)

Growth means bugs need to surface on their own — the "Could not load song" bug was only caught
because Irfan personally hit it in a live game; everything else fails silently. Added lightweight
aggregate error telemetry to **both apps**, reusing the existing analytics machinery
(`bumpAnalytics` + `safeKey`), so no new dependency, no cookies, no consent banner:
- **`trackError(label)`** helper → bumps `analytics/<GAME>/errors/<label>/count` plus a
  `errors/daily/<YYYY-MM-DD>/<label>` breakdown (mirrors the games/daily pattern for spotting
  spikes). Stores a bucketed LABEL + count only — **never** a stack trace, URL, room code or user
  id (same privacy bar as the country/song counters). Throttled to ≤1 bump per label per 10s so a
  hot error loop can't spam Firebase or inflate counts.
- **Global handlers**: `window` `error` + `unhandledrejection` → any uncaught script/async failure
  gets bucketed. Resource 404s (message-less `error` events, e.g. a failed `<img>`) are skipped as
  noise.
- **Deliberate labels** at the known-fragile spots: dance `fbStartGame` catch →
  `song_load_failed` (the exact bug that started this); word `fbStartGame` catch →
  `round_start_failed`. Hand-labeled counters beat cryptic auto-messages.
- DB rules unchanged — `analytics/` is already `.read/.write: true`, so the new `errors/` subtree
  needs nothing.
E2E-verified in preview: dispatched synthetic `error` + `unhandledrejection` events → confirmed
`js: …/count:1`, `promise: …/count:1` and the `daily` breakdown landed in Firebase, then removed
the test node (`/analytics/music/errors` back to null). Both apps load with zero console errors;
module syntax checked. Dance v2026.07.12.6, word v2026.07.12.5.
NOTE: this is a pull, not a push — glance at `analytics/<GAME>/errors` occasionally. Natural
follow-up: a scheduled threshold alert if any error label spikes.

## 2026-07-12 — All pools validated + song-loading hardened (DONE)

Irfan hit "Could not load song previews" in a real game. Root causes: dead pool entries clog the
no-repeat unplayed list (they're never marked played) until <2 resolvable songs remain; iTunes
rate-limiting on burst lookups; plain network blips. Fixes:
- **Validated the 5 remaining categories** (sweep script): 80s 36/36, TikTok 39/39, 90s 39/39,
  Bollywood 40/40 clean. **Tamil had 7 dead + 1 wrong-match** ('Roja Janeman' → instrumental
  cover — served to real players 3× today per analytics). Fixed/corrected: Vaseegara,
  Singappenney, Naan Pizhai (movie was wrong), Manasilaayo (→Vettaiyan); added Katchi Sera,
  Aasa Kooda, Jalabulajangu, Chikitu, Monica, Golden Sparrow; dropped Roja/Mukkala/Bachelor-Don/
  Aaha Kalyanam (iTunes has covers only). Tamil now 42 validated. Bollywood: 'Kesariya' query
  fixed (was matching a random 'Druidess' track).
- **Preview cache**: successful lookups cached in localStorage 24h (short TTL on purpose — a
  rotted cached URL would silently break a round). Cuts iTunes traffic + rate-limit risk.
- **Auto-retry**: round start silently retries pickPair once before surfacing an error.
- **Friendlier failure**: "Couldn't load songs — check your connection and tap Start again".
- Also caught leftover "Three to eight friends" copy in both apps' How to Play (→ twenty).
E2E-verified in preview with a real room (bots injected): round started, both tracks resolved,
cache populated with exactly the picked pair. Test room + game noise cleaned/negligible (330 real
games today!). Dance v2026.07.12.5, word v2026.07.12.4.

## 2026-07-12 — Malayalam pool rebuilt: 60 validated songs, dance-heavy mix (DONE)

Expanded Malayalam from 40 → 60 entries — but the real fix: validating the old pool against the
iTunes Search API (the app's exact lookup: `entity=song&limit=5`, first result with a previewUrl
wins) showed **18 of 40 entries never resolved** (silently skipped by pickPair every round) and
one ('Vaathil Hridayam') matched a wrong song. Effective pool was ~21 songs. All 60 new entries
are script-validated end-to-end; several queries deliberately drop/change the movie name because
that's what surfaces the right master (e.g. Aluva Puzha is from Premam, Mukkathe Penne from Ennu
Ninte Moideen, Kattu Mooliyo from Ohm Shanthi Oshaana). Mix per Irfan: reels-trending + hits,
rebalanced to ~2:1 danceable-to-melodic (added Pistah, Avial ×3, Thaikkudam Bridge ×2,
Chingamaasam; cut the 7 slowest classics). Notable: 'Manavalan Thug' has NO iTunes preview in any
form — it was always dead and stays out. Covers/karaoke-only matches rejected on principle.
Validation scripts in session scratchpad; re-runnable pattern documented here. Dance v2026.07.12.4.

## 2026-07-12 — Player cap 8 → 20, now actually enforced (DONE)

`MAX_PLAYERS` was defined as 8 but **never referenced** — the cap was purely marketing copy; a
9th player could already join any room. Raised to 20 in both apps AND wired it into the join
flow: `joinRoom` and the code-box precheck now read the whole room, count players, and reject
with a "Room is full" toast (double-check guards the simultaneous-join race at 19/20). Both
prechecks order the guards consistently: not-found → in-progress → full. Updated every player-count
mention to 3–20 (28 spots: meta/og/twitter descriptions, JSON-LD maxValue, FAQs, on-page
definitions across hub/dance/word, plus llms.txt). The imposter stepper's existing scaling
(2 at 6+, 3 at 10+) now applies to big rooms. Live-tested: seeded a 20-player room, join as #21
→ "Room is full". Hub v2026.07.12.2, dance/word v2026.07.12.3.

## 2026-07-12 — PNG → WebP for in-app images (DONE)

Converted the three PNGs actually loaded in-app to WebP (cwebp -q 85 -alpha_q 100 -m 6, alpha
preserved) for faster loads: game-dance (127K→27K), game-word (124K→24K), logo-word (144K→26K)
— ~80% smaller each, no visible clarity loss (verified in preview). Updated `<img>` src in
www/index.html (both hub cards) and www/word/index.html (word logo); deleted the old PNGs.
**Kept logo.png as PNG** — it's used only as the og:image/twitter:image/JSON-LD share image,
never loaded in-app (no speed gain), and WebP og:images render unreliably across social/chat
platforms. Hub v2026.07.12.1, word v2026.07.12.2.

## 2026-07-12 — Round-milestone feedback popup (DONE, deployed)

Both apps now ask engaged players for feedback. Each device counts completed rounds in
localStorage (shared across dance + word — same origin). From the 20th round on, the Round Over
screen auto-opens a small popup (2s after the reveal so it never covers the payoff moment):
"Enjoying the game? 🎉" + one-tap emoji rating (😕😐😄🤩) + "Tell us what you think" link into the
existing feedback modal. It returns on later Round Overs until the player interacts once (rate /
open form / dismiss via ✕, backdrop, or Esc) — then never again on that device. Auto-closes
without burning the chance if the host starts the next round. Emoji ratings + form submissions
land in `feedback/<game>` with a `source` field (`landing` vs `rounds-milestone`); impressions
tracked at `analytics/<game>/fbprompt/{shown,rated,dismissed}`. Considered and rejected: gating
the host's Start on popup interaction (holds the group hostage to a feedback form). Test data
cleaned from live DB after verification. Dance v2026.07.12.1, word v2026.07.12.1.

## 2026-07-11 — Dance: persistent unmute overlay (DONE, deployed)

Browser autoplay policy can reject `play()` at round start; the old fallback was a 2.2s toast
("Tap anywhere to start audio") that was easy to miss — players sat in silence while the decorative
visualizer kept dancing. Replaced with a full-screen **audio-blocked overlay** (dark card, same
style as the reveal card, blurred backdrop): "🔇 Tap to start the music". It stays up until the
audio element's `playing` event fires; the tap re-seeks to the shared `startAt` offset, so a late
unmute still lands in sync. Safety-hidden in beginVoting / revealImposter / leaveRoom so it can't
linger past the round. Pre-unlock on Create/Join/Ready untouched. Dance v2026.07.11.1.

Discussed but parked: honest visualizer (animate only while actually playing), live 🔊/🔇 status
chip, audible "sound check" chime on I'm Ready.

---

## 2026-07-07 — Imposter Word Game + hub restructure (IN PROGRESS)

**Goal:** Add game #2 — the **Impostor Word Game** — and restructure the site into a hub.

### Decisions (confirmed with Irfan)
- **Structure (Option A):** hub landing at `/`, dance game moves to `/dance/`, word game at `/word/`.
  - SEO must not be compromised: the hub at `/` **keeps** the dance game's ranking content
    (title keywords, quotable definition, How to Play, FAQ, JSON-LD) and adds two game cards.
- **Word game rules:** each player gets a card — everyone sees the same secret word except the
  imposter, who sees "You're the Imposter" + a vague hint. Clue-giving/guessing is **all verbal**:
  no timer, no in-app voting, no in-app guessing. Host taps **"Reveal Imposter"** → every screen
  shows the imposter's name + the secret word → Play again (new word, new imposter).
- **Categories (6 × ~50 words, each word has an imposter hint):**
  Food · Animals · Places · Everyday Objects · Movies & TV · Football (soccer — players/clubs/terms).
- **Brand:** "Impostor Word Game" (o-spelling on screen, "imposter" e-variants kept in SEO keywords) —
  same convention as the dance game.
- **Tech:** self-contained `www/word/index.html` reusing the dance engine (lobby/QR/presence/idle
  cleanup, same visual style) minus all music/iTunes code. Rooms at `rooms-word/$code` (no
  collision with dance rooms). Analytics namespace `analytics/word`, feedback at `feedback/word`.
- **Process (standing):** create tickets per task and close them when done; keep this WORKLOG
  updated; best coding practices always.

### Plan / ticket list
1. ✅ WORKLOG.md set up (this entry)
2. ✅ Word content: 300 word+hint pairs (6 × 50, validated: no dups, all hints present)
3. ✅ Build `www/word/index.html` — dance engine reused; music/voting stripped; card screen +
   host Reveal; `rooms-word/$code`; `analytics/word` (games/words instead of games/songs)
4. ✅ Dance game moved to `www/dance/` (git mv) — SHARE_BASE → /dance, canonical/og → /dance/,
   absolute image paths, v2026.07.07.5
5. ✅ Hub at `www/index.html` — keeps dance SEO (title kw, definition, FAQ, JSON-LD with
   Organization + 2 VideoGames + FAQPage), two game cards, legacy `?join=` → /dance/ forward,
   `analytics/hub` visits
6. ✅ DB rules: `rooms-word` added (deployed to Firebase during testing)
7. ✅ SEO artifacts: sitemap (3 URLs), llms.txt rewritten for hub + both games; robots unchanged
8. ✅ Local test passed: full word round (create SFAB → 2 injected test players → start →
   imposter card w/ hint → Reveal shows name+word → Play Again → lobby); category modal bug
   found & fixed (CATEGORY_GROUPS key `items` → `categories`); hub render + join-forward OK;
   dance page OK at /dance/. Test rooms + test analytics (word/hub) deleted after.
9. ⏳ Deploy (firebase deploy --only hosting) + live verification — AWAITING IRFAN'S GO
   (DB rules already live; hosting deploy flips the site to hub structure)

### Post-batch polish (2026-07-08, all local, part of the same pending deploy)
- Hub redesigned to Irfan's mockup: big game illustrations (game-dance.png / game-word.png),
  dark Play pills, About divider before SEO content, version stamp tiny in footer.
  Cream `.art-frame` backdrop behind each illustration for visual weight.
- Both apps: "← All games" back-link on home, version stamp hidden (kept in DOM for feedback),
  home-fold bottom gap fixed (100dvh − 160px).
- Per-game logos: logo.webp → logo-dance.webp (git mv); new logo-word.png on /word/.
- Hub load-in stagger animation (pure CSS, prefers-reduced-motion safe).
- Word-game hints rewritten twice per Irfan: final style = 1–2 word attributes ("Pizza→Cheesy",
  "Messi→Magical"), hard mode — each fits several pool words, unique per category, no leaks.
- **Round Over reveal redesigned** (both apps): dark card with inline coral "IMPOSTER" pill +
  big serif name; track section (dance) / secret word (word) moved outside the card; "drumroll
  please…" subtitle removed. Play Again + Exit Room buttons kept.
- **Per-room no-repeat pool** (both apps): every round's picked song(s)/word written to
  `meta/played/<category>/<sanitizedKey>: true`. Next round filters the pool; when <2 unplayed
  remain (dance) or 0 (word), the category's played subtree is silently replaced with the fresh
  picks. Play Again preserves the played list; category swaps keep each pool's own history.
- **Ready state persists across rounds** (both apps): `fbReplay()` no longer clears
  `players/*/ready`. Players opt in once per session, toggle off manually if they need to step
  away. Fresh joins still default unready.
- **Stats dashboard extended**: stacked Impostor Dance / Impostor Word / Hub landing sections
  under one shared day-range selector; single `analytics/` read hydrates all three. Word section
  swaps "Top songs" for "Top words"; hub section is visits-only.
- End-to-end tested live (rooms H5D9 dance, 85TM word): 2 rounds each, played history + ready
  persistence verified via direct Firebase reads. Test rooms cleaned up.
- Versions after this batch: dance v2026.07.08.3, word v2026.07.08.3, hub v2026.07.07.3.

### Notes / watch-outs
- **Native app (Capacitor):** `www/` is the webDir, so the Android app will now open the hub.
  Fine (app = hub with both games), but revisit SHARE_BASE handling when the app is next built.
- Old QR codes / shared links point at `impostorgames.com/?join=CODE` → hub must forward these to
  `/dance/?join=CODE` (dance rooms are the only rooms that existed before the split).
- Two rounds of test analytics from the e2e verification are in the live DB (word ~2 games,
  dance ~2 games). Trivial; not worth clearing.

---

## Earlier context (pre-worklog summary)

- **2026-07-07:** Analytics split into clean `visits/` + `games/` subtrees under `analytics/music`
  (legacy keys cleared, fresh start). Cookie-free stats dashboard at `/stats.html` with a global
  day-range selector (7/14/30/90/All, default 30). AI-search visibility pack shipped: `llms.txt`,
  explicit AI-crawler robots.txt, quotable on-page definition, conversational FAQs.
- **2026-06-24 → 07-06:** Domain `impostorgames.com` connected (GoDaddy DNS), DB security rules
  version-controlled (`database.rules.json`), cookie-free analytics added, 15-min idle room
  cleanup, feedback form, share-code screen with QR join, SEO/rebrand to "Impostor Dance Game",
  Capacitor native-app groundwork (see NATIVE_APP_NOTES.md / ANDROID.md).
