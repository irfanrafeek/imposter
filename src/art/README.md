# Art masters

Source files for illustrations that ship as compressed assets under `www/`.
The `.webp` in `www/` is the processed output; these are what it was made from.

## how-to-play leads

`dance-how-to-play.png`, `word-how-to-play.png` and `draw-how-to-play.png` are
the lead illustrations for the How to Play section of each game (#200).

They contain **characters only, on a transparent ground**. Nothing that is a
word may be baked into the picture, or `/es/` gets an English illustration,
which is the bug in #199.

Dance and word leave empty space above the heads. Everything that goes in that
space, the music notes for dance and the word cards for word, is drawn in HTML
over the top by `src/components/howto-lead.njk`.

Draw has no such space and needs none. Its secret is a drawing rather than a
word, so there is nothing per-character to translate, and the picture already
says who the impostor is through the puzzled face, the question marks and a
scribble that is not part of the frog. All three are shape rather than colour,
so it reads for a colour blind player without help from the mark layer.

Transparency is load-bearing too. It means the art sits on the page's own
background with no rectangle around it, and keeps working if that background
ever changes.

### Composing a lead

Do not do this by hand. Run:

```bash
node scripts/build-howto-lead.mjs          # every lead
node scripts/build-howto-lead.mjs draw     # just one
```

It reads a master, trims to its ink, scales it, centres it on the artboard and
writes the WebP. It needs `cwebp` on the path (`brew install webp`).

Two things the script encodes, and the reasons they are worth knowing:

1. **A character is the same size on every game's page.** Every board is the
   same width and every lead is laid out at the same width on the page, so
   matching how much of the board width a character occupies is what matches
   how big it looks. Dance is the reference at 1:1. Skip this and crop each
   master to its own ink, and a three-character scene renders about 12% larger
   than a four-character one. That was the first attempt, and it was visibly
   wrong.

   The per-master scale is recorded in the script rather than measured at build
   time, because no single automatic measurement survives all three drawings.
   Head width is the honest unit: heads are always upright and never occluded,
   and unlike a torso band they are not thrown off by a wide floor shadow or by
   thin legs. Measuring the band instead gave answers 12% apart on the same
   pair of images.

2. **Board height is free, board width is not.** Dance and word are rows of
   standing characters and come out 1208x429. Draw is a scene around an easel
   and comes out 1208x665. Fitting it into the shorter board would mean
   shrinking the characters, which is the one thing that must not happen.

### After any change to a master

Re-run the script for that lead and update its `height` in
`src/components/howto-lead.njk`, which the template writes into the `<img>` so
the browser reserves the right box before the image arrives.

Then re-measure the mark positions for that lead. They are the centre of each
character's head as a percentage of the artboard width. The script prints
candidates off the alpha channel of the composed image, one per run of ink with
a clear column either side, which is a starting point rather than an answer:
speed lines beside a head come back as their own run, and characters that touch
or share a prop come back as one. Dance returns six runs for four characters.
Read the columns off that list, then pick the centres that are heads.

Changing one master does not disturb the others. The scales are fixed against
dance rather than against whichever drawing happens to be tallest, precisely so
that adding a fourth game cannot force the three already shipped to be scaled
up and re-encoded.

The `.jpg` files are the earlier, superseded versions of dance and word. They
are kept only until someone confirms they are not needed.
