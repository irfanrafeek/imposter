# `src/` — what the pages in `www/` are built from

Every HTML page under `www/` is generated from this directory by
`scripts/build.mjs`. Do not hand-edit a generated page: the next build
overwrites it, and `firebase deploy` runs a build first.

```
src/
  site.json       the manifest: locales, and the list of pages to build
  pages/          one template per KIND of page (a game, the hub)
  components/     reusable blocks: topbar, how-to, FAQ, head, footer
  partials/       large literal chunks, mostly the hero SVGs
  content/
    en/  hub.json  word.json  ...    one file per page, per language
         shared.json                 strings for the modules in www/shared/
    es/  hub.json  word.json  ...
```

A **page** is a template plus a content file. A **language** is a
content file. Adding Spanish to a page that already has a template
means writing `content/es/<page>.json` and adding `"es"` to that page's
`locales` in `site.json`. Nothing is copied.

## Commands

```
npm run build          write www/
npm run build:check    render and compare, write nothing, exit 1 on a real difference
npm run build:watch    rebuild as you edit
npm test               test the comparison itself
```

## `build:check` is the migration gate

Moving an existing page onto a template must not change what it serves.
`--check` renders the page and compares it to what is committed, on a
canonical form: indentation and attribute order are ignored, JSON-LD is
compared as parsed data rather than as formatting, and HTML comments are
allowed to differ. Anything else is a failure.

It is deliberately conservative: it will flag differences that are
visually harmless, such as whitespace appearing or disappearing between
two block elements. That costs a template tweak. The opposite mistake
ships a changed page and nobody notices.

The rules are tested in both directions in `scripts/build.test.mjs` —
for each difference the gate ignores, there is a test that it does not
also ignore the real difference next to it.

## Two kinds of string

A content file has two blocks of app text, and the difference is when
they are read, not what they are.

`screens` is rendered into the page at build time. It is what a visitor
and a crawler see in the served bytes.

`runtime` is what `app.js` writes into the DOM while a round is played:
toasts, lobby statuses, the reveal line. Those cannot be rendered ahead
of time, so `components/i18n.njk` ships the whole `runtime` table as an
inert JSON block at the foot of the page, and `www/shared/i18n.js`
parses it once (#134):

```js
import { t, plural, list } from '../shared/i18n.js';

t('lobby.waiting-host-start')             // "Waiting for host to start…"
t('a11y.rename', { name: p.name })        // "Rename Ann"
plural('lobby.need-players', 2)           // "Need 2 more players to start."
list(['Ann', 'Bob', 'Cara'])              // "Ann, Bob and Cara"
```

A `runtime` value that is an **object** is a plural set (`one`/`other`,
and whichever other forms a language needs) and is read with `plural()`.
`Intl.PluralRules` picks the form, so a language where zero is singular
gets that right without anyone hand-writing the rule. `list()` is
`Intl.ListFormat`, which is what gets Spanish its "y"/"e" alternation.

Templates can read the same table: `t` and `plural` are in the render
context, so a button whose label `app.js` also rewrites is written once.

Two things the build enforces, both in `scripts/build.mjs`:

- **Every key a page's JavaScript calls has to exist in that page's
  bundle.** A renamed key is otherwise invisible until a player reaches
  that screen, in a language nobody on the team reads.
- **`<` is escaped in the shipped JSON**, so a string containing
  `</script>` cannot end the block and spill the rest into the page.

`data-lang` on the block is the tag the `Intl` formatters use, and is
deliberately not the `html lang`: the copy is British English while the
`html lang` is a bare `en`, and a bare `en` gives `Intl.ListFormat` an
Oxford comma the rest of the site does not use.

## The one trap

`www/shared/base.css` and `page.css` no longer define the colour
palette; `www/shared/tokens.css` does (#128). Any page must link
`tokens.css` **before** them or it renders with every `var()` invalid.
The shared head component handles this, which is most of why it exists.
