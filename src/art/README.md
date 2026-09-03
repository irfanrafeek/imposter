# Art masters

Source files for illustrations that ship as compressed assets under `www/`.
The `.webp` in `www/` is the build output; these are what it was made from.

## how-to-play leads

`dance-how-to-play.png` and `word-how-to-play.png` are the lead illustrations
for the How to Play section of each game (#200).

They contain **characters only, on a transparent ground**, with empty space
left above their heads. Everything that goes in that space, the music notes
for dance and the word cards for word, is drawn in HTML over the top by
`src/components/howto-lead.njk`. Nothing that is a word may be baked into the
picture, or `/es/` gets an English illustration, which is the bug in #199.

Transparency is load-bearing too. It means the art sits on the page's own
background with no rectangle around it, and keeps working if that background
ever changes.

To regenerate the shipped assets after editing a master:

```sh
cwebp -q 90 -m 6 -alpha_q 100 src/art/dance-how-to-play.png -o www/imposter-dance-how-to-play.webp
cwebp -q 90 -m 6 -alpha_q 100 src/art/word-how-to-play.png  -o www/imposter-word-how-to-play.webp
```

Lossy at q90 is deliberate. Lossless WebP is nearly three times the size on
this artwork, because the characters carry soft shading rather than flat fill.

If a master is ever redrawn, the mark positions in `howto-lead.njk` have to be
re-measured. They are the centre of each character's head as a percentage of
the image width, taken off the alpha channel.

The `.jpg` files are the earlier, superseded versions of the same two images.
They are kept only until someone confirms they are not needed.
