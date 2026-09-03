#!/usr/bin/env node
/*
  Composes the How to Play lead illustrations from the masters in src/art/
  onto the shared artboard, and writes the shipped WebP into www/.

  Run it with no arguments to rebuild every lead:

      node scripts/build-howto-lead.mjs

  or name the ones you want:

      node scripts/build-howto-lead.mjs draw

  Why a script and not a note in a README. The masters are not drawn to a
  common size, so every lead has to be scaled before it is placed, and getting
  that wrong is invisible until two games sit side by side and one set of
  characters is plainly bigger than the other. That happened once already. The
  numbers below are the record of what each drawing needed; the composition
  itself is arithmetic and should not be done by hand again.

  Image handling is written out longhand because this machine has no image
  library. Node ships zlib, which is the only genuinely hard part of reading
  and writing a PNG, so the rest is a few dozen lines of bookkeeping. WebP is
  left to cwebp, which does have to be installed.
*/

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- artboard */

// Shared across every lead, and declared again as LEAD_BOARD.width in
// src/components/howto-lead.njk. Both have to agree: the template writes it
// into the <img> width so the browser reserves the right box before the image
// arrives, and the marks are positioned as a percentage of it.
const BOARD_WIDTH = 1208;
const PAD = 26;

/*
  scale    what the master is multiplied by before it is placed.

           The rule is that a character is the same size on every game's page.
           Every board is the same width and every lead is laid out at the same
           width on the page, so matching character size means matching how
           much of the board width one character takes up. Dance is the
           reference at 1:1, where a head is about 191px across.

           These are measured, not guessed, and they are recorded here rather
           than re-derived at build time because no single measurement works on
           all three drawings. Head width is the honest unit: heads are always
           upright, never occluded, and unlike a torso band they are not thrown
           off by a wide floor shadow or by thin legs. Measuring anything else
           gave answers up to 12% apart on the same pair of images.

           Draw is a special case. Matching heads exactly would put it at 0.86,
           which is wider than the board, so it is fitted to the board instead
           and lands at 0.82. That puts its heads within a pixel or two of
           dance's anyway, which is the whole reason it is allowed to stand.

  headroom empty space left above the ink, for the marks that
           src/components/howto-lead.njk draws over the top. Draw carries no
           marks, so it gets ordinary padding instead.
*/
const LEADS = {
  dance: { master: 'dance-how-to-play.png', out: 'imposter-dance-how-to-play.webp', scale: 1.0000, headroom: 151 },
  word:  { master: 'word-how-to-play.png',  out: 'imposter-word-how-to-play.webp',  scale: 1.0811, headroom: 151 },
  draw:  { master: 'draw-how-to-play.png',  out: 'imposter-draw-how-to-play.webp',  scale: 0.8205, headroom: PAD },
};

// Lossy is deliberate. These characters are softly shaded rather than flat
// filled, so lossless WebP runs to nearly three times the size for a
// difference nobody can see at 370px wide. Alpha stays lossless: the art sits
// on the page's own background and a chewed edge would show.
const WEBP = ['-q', '92', '-m', '6', '-alpha_q', '100'];

// Alpha at or below this counts as empty when finding the edge of the ink.
const INK = 24;

/* -------------------------------------------------------------------- PNG */

function readPNG(path) {
  const buf = readFileSync(path);
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (ctype !== 6 && ctype !== 2))
    throw new Error(`${path}: need an 8-bit non-interlaced RGB or RGBA PNG, got depth ${depth} colour type ${ctype}`);

  const src = ctype === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * src;
  const un = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = un.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? un.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= src ? cur[x - src] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= src) ? prev[x - src] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  if (src === 4) return { width: w, height: h, data: un };
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 3) {
    data[i * 4] = un[j]; data[i * 4 + 1] = un[j + 1]; data[i * 4 + 2] = un[j + 2]; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function writePNG(path, { width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter; the deflate pass does the work
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ------------------------------------------------------------ composition */

function inkBox({ width: w, height: h, data }) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > INK) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/*
  Area-average resample, on premultiplied alpha.

  Premultiplying matters. Transparent pixels in the master still carry a colour,
  usually white or black, and averaging that colour in alongside the visible
  pixels paints a halo around every edge. Multiplying by alpha first weights
  each pixel by how much of it there is, which is what an average of a partly
  transparent region actually means.
*/
function resample(img, box, outW, outH) {
  const { width: w, data } = img;
  const out = Buffer.alloc(outW * outH * 4);
  const sx = box.width / outW, sy = box.height / outH;
  for (let oy = 0; oy < outH; oy++) {
    const ya = box.y0 + oy * sy, yb = ya + sy;
    const y0 = Math.floor(ya), y1 = Math.min(img.height - 1, Math.ceil(yb) - 1);
    for (let ox = 0; ox < outW; ox++) {
      const xa = box.x0 + ox * sx, xb = xa + sx;
      const x0 = Math.floor(xa), x1 = Math.min(w - 1, Math.ceil(xb) - 1);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y <= y1; y++) {
        const wy = Math.min(yb, y + 1) - Math.max(ya, y);
        if (wy <= 0) continue;
        for (let x = x0; x <= x1; x++) {
          const wx = Math.min(xb, x + 1) - Math.max(xa, x);
          if (wx <= 0) continue;
          const k = wx * wy, i = (y * w + x) * 4, al = data[i + 3] / 255;
          r += data[i] * al * k; g += data[i + 1] * al * k; b += data[i + 2] * al * k;
          a += data[i + 3] * k; n += k;
        }
      }
      const o = (oy * outW + ox) * 4;
      if (n === 0 || a === 0) continue;
      const av = a / n;
      out[o] = Math.round(r / n / (av / 255));
      out[o + 1] = Math.round(g / n / (av / 255));
      out[o + 2] = Math.round(b / n / (av / 255));
      out[o + 3] = Math.round(av);
    }
  }
  return { width: outW, height: outH, data: out };
}

// A starting point for the mark positions, not an answer. Every run of ink with
// a clear column either side is reported as a centre, in the percentage of the
// board width that howto-lead.njk wants. Real drawings do not divide that
// cleanly: speed lines beside a head come back as their own run, and characters
// that touch or share a prop come back as one. Dance returns six runs for four
// characters, draw three. Use the list to find the columns, then pick the
// centres that are actually heads.
function characterCentres(img) {
  const { width: w, height: h, data } = img;
  const cols = new Uint8Array(w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > INK) cols[x] = 1;
  const runs = [];
  for (let x = 0; x < w; x++) {
    if (!cols[x]) continue;
    let e = x;
    while (e + 1 < w && cols[e + 1]) e++;
    runs.push([x, e]);
    x = e;
  }
  return runs.map(([a, b]) => ({ from: a, to: b, x: +(((a + b) / 2) / w * 100).toFixed(1) }));
}

/* ------------------------------------------------------------------- main */

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(LEADS);

for (const name of names) {
  const lead = LEADS[name];
  if (!lead) {
    console.error(`unknown lead "${name}". known: ${Object.keys(LEADS).join(', ')}`);
    process.exitCode = 1;
    continue;
  }

  const masterPath = join(ROOT, 'src/art', lead.master);
  const master = readPNG(masterPath);
  const box = inkBox(master);

  const outW = Math.round(box.width * lead.scale);
  const outH = Math.round(box.height * lead.scale);
  const boardH = lead.headroom + outH + PAD;
  if (outW > BOARD_WIDTH - PAD * 2)
    throw new Error(`${name}: scaled ink is ${outW}px, wider than the ${BOARD_WIDTH - PAD * 2}px the board leaves for it`);

  const board = { width: BOARD_WIDTH, height: boardH, data: Buffer.alloc(BOARD_WIDTH * boardH * 4) };
  const art = resample(master, box, outW, outH);
  const left = Math.round((BOARD_WIDTH - outW) / 2);
  for (let y = 0; y < outH; y++)
    art.data.copy(board.data, ((lead.headroom + y) * BOARD_WIDTH + left) * 4, y * outW * 4, (y + 1) * outW * 4);

  const tmp = join(ROOT, `.${name}-lead.tmp.png`);
  const outPath = join(ROOT, 'www', lead.out);
  writePNG(tmp, board);
  try {
    execFileSync('cwebp', [...WEBP, tmp, '-o', outPath], { stdio: 'pipe' });
  } catch (err) {
    throw new Error(`cwebp failed for ${name}. Install it with "brew install webp".\n${err.stderr || err.message}`);
  } finally {
    unlinkSync(tmp);
  }

  const bytes = readFileSync(outPath).length;
  console.log(`${name}: ${lead.master} ink ${box.width}x${box.height} @ ${lead.scale} -> board ${BOARD_WIDTH}x${boardH}, ${lead.out} ${bytes} bytes`);
  console.log(`  mark x: ${characterCentres(board).map(c => c.x).join(', ')}`);
}
