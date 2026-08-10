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

## How the plumbing is set up (reference)

### robots.txt (`www/robots.txt`)
Allows all crawlers, and explicitly names the AI crawlers so they are welcome:
GPTBot, OAI-SearchBot, ChatGPT-User (OpenAI); ClaudeBot, Claude-User,
Claude-SearchBot (Anthropic); Google-Extended (Gemini); PerplexityBot; bingbot;
CCBot; and others. Declares the sitemap. If a new AI crawler becomes relevant,
add an `Allow: /` block for its user-agent here.

### sitemap.xml (`www/sitemap.xml`)
One entry per page. Currently: `/`, `/dance/`, `/word/`, `/draw/`. Bing reads
this and reports "URLs discovered". Keep `<lastmod>` accurate — bump it when a
page meaningfully changes so engines know to recrawl.

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
