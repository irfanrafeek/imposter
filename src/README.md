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

## The one trap

`www/shared/base.css` and `page.css` no longer define the colour
palette; `www/shared/tokens.css` does (#128). Any page must link
`tokens.css` **before** them or it renders with every `var()` invalid.
The shared head component handles this, which is most of why it exists.
