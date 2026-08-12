# GEO: Getting Named by AI Assistants

How impostorgames.com gets *mentioned* by ChatGPT, Gemini, Perplexity and
Claude, as opposed to merely being indexed by them.

`SEO.md` covers the plumbing: robots, sitemap, indexing, per-page heads, and
the review loop. That plumbing is done and healthy. This file covers the layer
above it: given that the engines *can* read us, why do they so rarely *name*
us, and what closes that gap.

Source for the diagnosis below: a third-party GEO audit commissioned in
August 2026, plus our own checks against the repo. Where the two disagree,
the repo wins.

---

## The diagnosis, in one line

**We do not have a quality problem. We have a reach problem.**

Two facts, held together:

- **When an AI engine names us, it names us well.** Average mention position
  around #2, top-3 placement every time, sentiment strongly positive, zero
  negative mentions. The pitch lands. The product reads as good.
- **It almost never names us.** Roughly 15% of tested prompts, and zero on
  awareness-stage questions like "what are free online party games you can
  play without downloading anything".

So the instinct to rewrite titles and descriptions again is the wrong one.
What is working should be left alone. The two things actually holding us back
are **surface area** and **outside corroboration**.

### Root cause 1: engines have nothing but us to cite

Almost all citations trace back to impostorgames.com itself. When the audit
pulled the third-party pages the engines were reading, **not one of them
contained a usable mention of the brand.** A third-party link index puts the
site at roughly 13 inbound links with an authority score of zero.

An engine that can only find you on your own site will hedge. An engine that
sees you on itch.io, on Reddit, in a "skribbl.io alternatives" listicle, and
in a browser-games directory will name you outright. This is the single
biggest lever available, and it is entirely off-site work.

### Root cause 2: four pages cannot answer the questions people ask

The sitemap has exactly four URLs: `/`, `/dance/`, `/word/`, `/draw/`. Every
one of them is a "here is a game, play it" page.

There is no page on this site that could plausibly be the answer to:

- "what are free online party games you can play without downloading anything"
- "I want to play a quick online game with 6 friends tonight that doesn't
  require accounts or installs, something like Among Us but simpler"
- "explain how room code party games work for playing with friends remotely"
- "how do impostor-style party games work for group play online"
- "what are some fun browser-based multiplayer games for a virtual hangout"

We lose all of those, and we lose them for a mechanical reason, not a ranking
one. This is the same principle already recorded in `SEO.md`: re-editing an
existing page does not compound, **new pages targeting new questions do.**

### Root cause 3: we describe the mechanic, not the friction we remove

Engines currently describe us with: *free, browser-based, impostor-style,
social deduction, multiplayer*. All accurate.

What is missing from how we are described: *no install, no account, quick to
start*. Those are the exact words in the prompts we lose. People are not
asking for a social deduction game, they are asking for something they can
start with six friends in the next two minutes. Our copy buries that.

---

## What we are doing about it

Ordered by what to do first, not by size. Tracked as GitHub issues under the
GEO epic.

### 1. Earn external citations (highest impact, off-site)

Get the site mentioned on pages the engines already read. Targets, roughly in
order of value per hour:

- **itch.io listing.** Free, indexed hard by both Google and Bing, and
  routinely cited by LLMs answering "free browser party games".
- **Reddit** (r/WebGames, r/playmygame, r/partygames). Links are nofollow so
  near-zero raw SEO value, but Reddit is weighted heavily in AI retrieval.
  Post as a developer sharing work, reply to every comment.
- **"skribbl.io alternatives" listicles.** People search this, and the owners
  of those posts update them. Direct fit for the draw game.
- **Browser-game directories**: CrazyGames, GameJolt, Newgrounds.
- **LinkedIn company page**: website field plus a pinned featured link. Zero
  effort, already controlled.

A useful shortcut for finding targets: look at where our actual competitors
are already listed. The ones that surface alongside us in AI answers are
skribbl.io, Gartic Phone, PlayCircle.io, OnlineParty.Games, GameBuddies.io,
Afterparty.games, imposter.app and impostergame.net. Wherever several of
those appear on one page, that page is a target.

Not competitors, despite showing up in the same answers: Among Us, Jackbox,
Goose Goose Duck. Different product, different price, different install
story. Do not benchmark against them.

### 2. Lead with "no install, no account" in copy we already have

Cheap, and it targets the exact narrative gap. Work the zero-friction angle
into the game-page meta descriptions, the FAQ answers, and `llms.txt`, which
currently opens on the impostor mechanic rather than on the fact that there is
nothing to download.

Constraint: this must not disturb the titles. Titles are tuned from real
Search Console data and are performing. See `SEO.md` for the spelling
convention (lead with "Imposter", brand stays "Impostor").

### 3. Add pages (four is not enough; aim for eight to ten)

Each of these exists to be the answer to a question we currently lose:

| Page | Question it answers |
|---|---|
| `/party-games/` | free online party games, no download |
| `/how-to-play/<game>/` (x3) | how each game actually works, in detail |
| `/how-room-codes-work/` | how do room-code party games work |
| `/what-is-an-impostor-game/` | how do impostor-style party games work |
| `/games-like-among-us/` | quick game for 6 friends, no accounts, simpler |

The how-to-play pages do double duty: they also fix the thin-content problem
(the site averages about 714 words per page) and give us somewhere legitimate
to put `HowTo` schema.

### 4. Two more schema types: HowTo and BreadcrumbList

We currently ship `Organization`, `WebSite`, `VideoGame` and `FAQPage` on
every page, which is good coverage but narrow variety. `HowTo` on the new
how-to-play pages and `BreadcrumbList` site-wide are both actively extracted
by AI engines.

### 5. Internal linking

Verified in the repo, and worse than the audit reported: **each game page has
exactly one internal link, `href="/"`.** The three games do not link to each
other at all. Home links out to all three, so the graph is a star with no
edges between the points.

Fix: cross-link the games with descriptive anchor text, and wire the new
content pages in both directions. Small job, but it only becomes meaningful
once item 3 gives us something to link to.

---

## What we are deliberately not doing

Recorded here so it does not get re-proposed every time an audit lands.

- **Author bios and person schema.** Standard GEO audit advice, and wrong for
  this site. E-E-A-T proxies are built for YMYL and editorial content. Nobody
  picking a drawing game wants the author's credentials, and no engine expects
  a party game to have them. Audits that weight this heavily will score us at
  or near zero on it forever, and that is fine.
- **`Product` and `Review` schema.** There is no product to sell, and
  fabricated reviews are not on the table.
- **Chasing a single engine's zero.** A 10-prompt, single-run scan showing 0%
  on one engine is inside the noise band. Do not build a strategy around it.
- **Re-tuning titles and descriptions.** Done in August 2026 from real Search
  Console data. Hold, per the change-once-hold-2-3-weeks rule in `SEO.md`.

---

## Reading a vendor GEO audit

We will be sold more of these. What to check before believing one:

1. **Sample size and runs per prompt.** AI answers are stochastic. Ten prompts
   at one run each is a snapshot, not a measurement. Vendors usually admit
   this in a limitations appendix at the back; read that page first.
2. **Does the page count match the advice?** Recommendations like "add schema
   to 15 pages" or "author bios on 20 pages" are boilerplate from a template
   built for content sites. We have four pages.
3. **Internal consistency.** Check whether the score summary and the detail
   pages agree with each other. They sometimes do not.
4. **Is the score self-graded?** If the 90-day target is measured by re-running
   the same vendor's audit, the target is not independent.
5. **Which numbers are directional?** Citation-source splits are usually
   inferred from answer text rather than observed links. Treat them as pattern,
   not fact.

What is worth keeping from almost any of them, regardless of the score: the
**list of prompts we lose**, the **list of brands we appear alongside**, and
any **hard off-site number** like a backlink count. Those three are actionable.
The composite score is not.

---

## Re-measuring

There is no clean self-serve tool for this, so the practical check is manual
and takes ten minutes:

1. Ask each of ChatGPT, Gemini, Perplexity and Claude the five losing prompts
   listed above, verbatim, in a fresh session with no memory of the site.
2. Record whether impostorgames.com is named, and in what position.
3. Repeat quarterly, not weekly. Content and links take months to move this.

Expect the link work (item 1) to move the needle before the content work
(item 3), and expect both to take longer than a search ranking would.
