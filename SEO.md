# SEO & AI-Search Checklist — Impostor Games

How impostorgames.com gets found by Google, Bing, and AI assistants
(ChatGPT, Gemini, Perplexity, Copilot). Use the "When you add a new game"
section every time a new game ships. The rest is reference for how the
plumbing is set up and why.

Live site: https://impostorgames.com  (Firebase project `imposter-20b85`)

---

## The one rule that explains everything: submitted =/= indexed

Every tool below has two separate stages, and it is easy to think you are
done at stage 1:

1. **Discovered / submitted** — the search engine has been *told* the URL
   exists (via sitemap, IndexNow, or manual submit).
2. **Indexed** — the engine has actually crawled it, judged it, and added it
   to the index it serves answers from.

Only stage 2 makes a page show up in search results or in an AI assistant's
answer. A brand-new page normally sits at stage 1 for days to a few weeks.
Nothing is broken during that gap; it is just the indexing clock.

And there is a *third* clock for AI specifically: ChatGPT Search reads from
Bing's index on its own refresh schedule, so even after Bing indexes a page,
ChatGPT can take another 1-2 weeks to mention it. You cannot speed that part
up. Give it time.

---

## When you add a new game (do this each time)

A new game lives at `www/<game>/index.html`. After it is deployed:

1. **Sitemap** — add the new URL to `www/sitemap.xml` (`<loc>`, `<lastmod>`,
   and the `image:` block like the others). Redeploy. There should be one
   `<loc>` per game plus the home page.
2. **Home page** — make sure the home page links to the new game (it already
   does for existing games) and that the game is in the home page's
   `VideoGame` structured data (JSON-LD). Crawlers and LLMs both read this.
3. **Per-page `<head>`** — the new page needs its own `<title>`, meta
   description, canonical, OG/Twitter tags, and its own FAQ + VideoGame
   structured data. Copy an existing game page's head as the template.
4. **Google Search Console** — URL Inspection -> Request Indexing for the new
   URL. (Covers Google + Gemini + Google AI Overviews.)
5. **Bing Webmaster Tools** — URL Inspection -> Request Indexing for the new
   URL. (Covers Bing + ChatGPT Search + Copilot.) IndexNow usually submits it
   automatically, but requesting indexing by hand pushes it up the queue.
6. **Wait & verify** — after ~1-2 weeks, use URL Inspection in *both* consoles
   to confirm the status flipped to **indexed**. Only then expect it in
   results / AI answers. AI assistants may lag a further 1-2 weeks.
7. **External signal (optional but powerful)** — one link to the new game from
   anywhere else on the web (Reddit, a directory, another page you own) is
   what tips an LLM from "saw it once" to "will mention it."

---

## When you add a language, or a game to a language

The build writes eight pages and updates none of the files below. Every
item here is hand-maintained, which is why they all went stale at once
when Spanish went from one game to three (#173 to #179). Nothing failed;
the site simply described itself wrongly for a week.

1. **`www/sitemap.xml`** — a `<loc>` per page per language, each with the
   full `xhtml:link` alternate set. `scripts/sitemap.test.mjs` checks the
   URLs and the alternates against the pages the build writes. It does
   **not** check `<lastmod>`, so a date can go stale silently and did.
2. **`www/llms.txt`** — the languages line and the Pages list. Not in the
   sitemap, not generated, not covered by any test. It claimed the
   Spanish site had one game for as long as it had three. An engine
   reading it concluded the other two did not exist. Read the whole file,
   not just the line you came for: the "Common questions" section names
   URLs too.
3. **`www/<dir>/manifest.webmanifest`** — one per page per language.
   `lang` matches the locale, `description` names what is actually there.
   **Never change `id` or `start_url`**: `id` is the installed app's
   identity, and changing it orphans an installed app into a second
   entry. `scripts/manifest.test.mjs` covers scope, existence and `lang`.
4. **Site-level JSON-LD.** The `Organization` and `WebSite` nodes
   describe the site, not the page, so every language's hub declares the
   **same** node, byte for byte. A per-language variant of either is
   wrong: there is one organisation and one website however many
   languages front them. Language belongs on the `VideoGame` nodes, which
   carry `inLanguage` and their own localised URLs.
   `scripts/jsonld.test.mjs` asserts both halves, including that the two
   languages of a page declare the same site-level nodes.
5. **The FAQ core set.** Every page in every language answers: what is
   this game, how many players, is it free, is there an app, one phone.
   Search questions on top of that are per-language and deliberately do
   not match. See `src/README.md` for the whole rule.
6. **`genre` and `alternateName`** on the `VideoGame` nodes are not
   translations of each other. `genre` should agree in meaning across
   languages, and `alternateName` should not: it lists names people
   actually type, which differ by language. English draw carries "Fake
   Artist Online" and Spanish does not, on purpose.

The pattern worth remembering: **anything the build does not write, the
build cannot keep honest.** When a language gains a game, grep the repo
for the old state (`grep -rn "word game only" www/`) rather than trusting
that a rebuild covered it.

---

## When you rename a game

Done once, for the Draw Game -> Impostor Artist (#198, 2026-09-03). Read this
before doing it again, because most of it is not in the content files.

**Separate the name from the id, and from the URL. They are three decisions.**

- The **name** is what ranks and it is cheap. Change it alone first.
- The **id** must not move. `draw` is the room namespace (`rooms-draw`), the
  analytics key, the played-word ledger key and the chat source tag. Renaming
  it forks every historical counter, and a stale installed client writing the
  old namespace while a fresh one writes the new puts two players typing the
  same code into different rooms. Same rule the category ids got in #135.
- The **URL** is a weak ranking signal that costs a re-index. Hold it, and
  decide with Search Console data rather than at the same time as the name.
  Shipping both together makes a dip unreadable: redirect settling, or the
  name failing.

**Keep the old name reachable.** It stays in `alternateName` and the keywords,
where no reader sees it and it holds whatever the page has earned. Add one FAQ
entry that retires the name explicitly ("Is this the same as the ...?"), which
catches the old query and reassures anyone who arrives on it. Do **not** leave
the old name in the visible prose as an alias: only list aliases people
actually say.

**Then grep, because the content files reach less than half of it.** The
build writes eight HTML pages and nothing else. Everything below is
hand-maintained and was missed on the first pass:

```
grep -rn "Old Name\|old name" www/ src/
```

| surface | why it matters |
|---|---|
| `www/<game>/manifest.webmanifest` | `short_name` is the label under the icon on an installed home screen. The most visible miss of all. |
| `www/manifest.webmanifest` | the hub's description names every game |
| `www/party-games/`, `www/games-like-among-us/` | hand-written, not build output |
| `www/llms.txt` | keep the aliases here; listing them is this file's job |
| `www/stats.html` | picker, chart titles, KPI labels |
| `src/partials/hero-*.svg` | hardcoded `aria-label`, shared by both locales |
| `README.md`, source comments | stale product names |

`scripts/manifest.test.mjs` pins `id`, `start_url`, `scope` and `lang`, not the
names, so no test catches any of this.

**Two traps in the copy itself.** A shorthand that named the game by its
mechanic ("the word and draw games") may not survive the rename; rewrite it to
the mechanic ("the word and drawing games") rather than forcing the new name
into a sentence it does not fit. And a string like "That code is a {game} room"
silently assumed every label began with a consonant; check the articles.

**`/party-games/` mirrors its FAQ into JSON-LD by hand.** Change both, then
verify by parsing the JSON-LD and matching each answer against the stripped
page text. It is the only page in the repo where the two can drift.

---

## When you change copy on a page that already exists

The common case, and the one that keeps getting missed. A new game is rare; a
reworded FAQ is not.

1. **`<lastmod>` in the same commit as the change.** See the sitemap section
   below for why, and for when *not* to bump it.
2. **Deploy, then ping, in that order.** `node scripts/indexnow-ping.mjs
   /the/page/` tells Bing to come and look, so it is worth nothing if it fires
   before the new bytes are live. Scope it to the paths that actually changed
   rather than submitting the whole sitemap; a submission that is mostly
   unchanged pages is noise.
3. **`llms.txt` is a separate channel.** It is not in the sitemap, Google does
   not consume it, and IndexNow will not carry it. It is read by AI crawlers on
   their own schedule, so a change there needs no ping and produces no search
   movement. Do not judge one by the other.
4. **Google needs asking separately.** IndexNow does not reach it. If the change
   matters, URL Inspection -> Request Indexing in Search Console.
5. **Body copy alone rarely moves rankings.** `<title>` and the meta description
   are what rank. Adding a FAQ answer helps AI retrieval and on-page clarity,
   and will usually do nothing to position. If the goal is search, the title or
   description has to carry it, and that is a change worth making alone and
   holding 2-3 weeks so it can be attributed.

---

## How the plumbing is set up (reference)

### robots.txt (`www/robots.txt`)
Allows all crawlers, and explicitly names the AI crawlers so they are welcome:
GPTBot, OAI-SearchBot, ChatGPT-User (OpenAI); ClaudeBot, Claude-User,
Claude-SearchBot (Anthropic); Google-Extended (Gemini); PerplexityBot; bingbot;
CCBot; and others. Declares the sitemap. If a new AI crawler becomes relevant,
add an `Allow: /` block for its user-agent here.

### sitemap.xml (`www/sitemap.xml`)
One entry per page. Currently: `/`, `/dance/`, `/word/`, `/draw/`,
`/party-games/`, `/games-like-among-us/`. Bing reads this and reports "URLs
discovered".

**`<lastmod>` is a deploy step, not a nice-to-have.** Update it in the same
commit as the content change, before deploying. This has been missed twice:
`/draw/` sat at `2026-08-16` through the Pass the Phone launch on the 17th,
the single biggest change that page has had, while `/` was correctly bumped.

The risk is not only a slow recrawl of the page that changed. A sitemap where
the changed page reports stale and an unchanged page reports fresh teaches the
crawler to discount the field altogether, and Google is openly sceptical of
`lastmod` on sites that get it wrong. Bing and IndexNow read it more literally,
which matters because that is the ChatGPT Search path.

**Bump it only for content a reader would notice.** Not for a version stamp, a
JS behaviour fix, or a refactor. On 2026-08-18 the word and dance pages had
their tap handling fixed and their stamps bumped, and their `lastmod` was
deliberately left alone; only `/draw/`, which gained a FAQ entry, moved. Bumping
everything on every deploy is the same failure as never bumping it.

### Google Search Console
- Property type: **Domain** (covers http/https + all subdomains), auto-verified
  through GoDaddy's "Domain name provider" integration — no DNS record to
  maintain by hand.
- Use for: **Performance -> Queries** (what search terms bring people in;
  toggle on Average position + CTR to read it properly), and URL Inspection ->
  Request Indexing.

### Bing Webmaster Tools
- Set up by **Import from Google Search Console** (one click; brings the
  property + verification across).
- **IndexNow** is active — it pings Bing the instant a URL is submitted, so new
  pages get noticed fast. Confirm new URLs appear in the IndexNow "Submitted
  URLs" list after deploy.
- Use for: URL Inspection -> Request Indexing, and checking indexed-page count.
- This is the lever for **ChatGPT Search**, which is Bing-backed.

### Per-page SEO (in each `www/<game>/index.html` head)
- `<title>` — lead with the exact phrase people search (data showed users type
  "imposter" with an e, not "impostor"), keep under ~60 characters so it does
  not truncate in results.
- Meta description — open with a hook; front-load the strongest query phrase;
  ~155 characters is what shows. Not a ranking factor, but drives click-through.
- `<link rel="canonical">` -> the impostorgames.com URL, so the web.app mirror
  does not split ranking signal.
- OG/Twitter tags mirror the title/description for shares.
- JSON-LD: `VideoGame` + `FAQPage`. LLMs and rich results both parse these.

---

## Reading the data (the review loop)

Change titles/descriptions **once**, then **hold 2-3 weeks** before touching
them again. SEO changes take 1-3 weeks to show in Search Console, and editing
faster than that means you never learn which change did what — and churning
titles can make Google distrust and rewrite your snippets.

- **Impressions but zero clicks** on a query = you rank but the snippet or
  position is not winning the click -> tune title/description, or you are
  ranked too low (needs content depth / links).
- **No impressions at all** for a term you want = not ranking / not indexed for
  it -> needs on-page content targeting that phrase, and indexing.

Editing the same page repeatedly does not compound. **New pages targeting new
queries do** — so if you want to invest in SEO regularly, add surface area
(a how-to page, a new game) rather than re-editing existing heads.

---

## Notes specific to AI assistants (ChatGPT, etc.)

- They learn a site two ways: **training data** (frozen months before the model
  ships — a page days/weeks old cannot be in it) and **live retrieval** (reads
  from a search index — Bing for ChatGPT). A new game only shows up once it is
  in that index *and* the assistant's refresh has picked it up.
- If an assistant lists some games but not a new one, it is almost always this
  freshness lag, not a site problem. Verify the page is indexed in Bing, then
  wait. To test whether it is a retrieval vs memory issue, ask the assistant to
  "browse impostorgames.com right now and list every game" — if it then finds
  the page, the site is fine and it is purely index/refresh timing.
