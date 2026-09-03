# Art masters

Source files for illustrations that ship as compressed assets under `www/`.
The `.webp` in `www/` is the processed output; these are what it was made from.

## how-to-play leads

`dance-how-to-play.png` and `word-how-to-play.png` are the lead illustrations
for the How to Play section of each game (#200).

They contain **characters only, on a transparent ground**, with empty space
left above their heads. Everything that goes in that space, the music notes for
dance and the word cards for word, is drawn in HTML over the top by
`src/components/howto-lead.njk`. Nothing that is a word may be baked into the
picture, or `/es/` gets an English illustration, which is the bug in #199.

Transparency is load-bearing too. It means the art sits on the page's own
background with no rectangle around it, and keeps working if that background
ever changes.

### The two normalisations

A shipped lead is not a crop of its master. It is composed, and both steps
exist to keep one rule: **a character is the same size on every game's page.**

1. **Common character height.** The optical unit is the marshmallow, not the
   file. Measure each master's body band, the rows carrying more than 35% of
   the peak ink, which is torsos rather than headphones or speed lines. Scale
   each drawing so that band matches the tallest across the whole set. The
   masters are not drawn consistently: word's characters arrived about 7%
   shorter than dance's.

2. **Common artboard.** Currently **1208x429**, and `howto-lead.njk` declares it
   once as `LEAD_BOARD`. Place each scaled drawing centred horizontally with
   the top of its ink at 150px, leaving 26px of padding elsewhere. The board is
   the widest scaled ink plus padding, and the tallest scaled ink plus the
   headroom and padding.

A three-character scene therefore carries wider side margins than a
four-character one, rather than being stretched to fill. Skip these steps and
crop each master to its own ink, and the three-character art renders about 12%
larger than the four-character one, because both are laid out at the same width
on the page. That was the first attempt, and it was visibly wrong.

Export WebP at quality 0.92. Lossy is deliberate: lossless is nearly three
times the size on this artwork, because the characters carry soft shading
rather than flat fill.

### After any change to a master

Re-run both normalisations for **every** lead, not just the one that changed. A
new drawing with taller characters moves the reference height, so the others
have to be recomposed against it.

Then re-measure the mark positions in `howto-lead.njk`. They are the centre of
each character's head as a percentage of the artboard width, taken off the
alpha channel of the composed image rather than estimated by eye.

The `.jpg` files are the earlier, superseded versions of the same two images.
They are kept only until someone confirms they are not needed.
