// Regenerate the word game's juggling hero animation.
//
//   node scripts/build-word-hero.mjs            # print to stdout
//   node scripts/build-word-hero.mjs --write    # rewrite the block in word.css
//
// The keyframes in www/word/word.css are GENERATED, not hand-written, and this
// is what generates them. Editing them by hand is possible but a bad idea: the
// card paths are parabolas sampled at 8 points per throw, and the numbers only
// hold together as a set.
//
// You need this if you want to change any of:
//   - the tempo or the length of the still stretch (T_CYCLE below)
//   - where the cards rest in the hands (REST_*)
//   - the shape of a throw (TOP_LR / TOP_RL, or the flight/dwell split)
//
// It also prints the three resting-card transforms, because those appear a
// second time in www/word-cards-blink.svg for the lobby icon and the two must
// agree or the character holds its cards differently in the lobby than on the
// home screen.
//
// The checks below are not decoration. Each one caught a real mistake while
// this was being built, and all of them are the kind that look fine until you
// have watched the animation loop twenty times.

import { readFileSync, writeFileSync } from 'node:fs';

const LH_THROW = { x: 133.15, y: 225.22, r:  -7.97 };
const LH_CATCH = { x: 115.00, y: 228.50, r: -14.00 };
const RH_CATCH = { x: 297.54, y: 227.90, r:   9.10 };
const RH_THROW = { x: 279.00, y: 225.00, r:  15.00 };
const TOP_RL   = { x: 206.17, y:  96.16 };
const TOP_LR   = { x: 234.00, y:  96.16 };
const AIR_TILT = -9.02;

const REST_L = { x: 140.0, y: 218.0, r:  -4.0 };
const REST_A = { x: 114.0, y: 246.0, r: -16.0 };
const REST_R = { x: 296.0, y: 229.0, r:   7.0 };

const LEAD = Math.abs(AIR_TILT - (RH_THROW.r + LH_CATCH.r) / 2);

function flightAt(from, to, top, s) {
  const x = from.x * (2 * s * s - 3 * s + 1)
          + top.x  * (-4 * s * s + 4 * s)
          + to.x   * (2 * s * s - s);
  const h = (from.y + to.y) / 2 - top.y;
  const y = from.y + (to.y - from.y) * s - 4 * h * s * (1 - s);
  const dir = Math.sign(to.r - from.r);
  const r = from.r + (to.r - from.r) * s + LEAD * Math.sin(Math.PI * s) * dir;
  return { x, y, r };
}
const moveAt = (seg, s) => {
  const e = s * s * (3 - 2 * s);
  return {
    x: seg.from.x + (seg.to.x - seg.from.x) * e,
    y: seg.from.y + (seg.to.y - seg.from.y) * e,
    r: seg.from.r + (seg.to.r - seg.from.r) * e,
  };
};

const T = { l: [0.675, 2.675, 4.675], r: [1.675, 3.675, 5.675] };
const C = { r: [2.525, 4.525, 6.525], l: [3.525, 5.525, 7.525] };
const WINDUP = 0.6, SETTLE = 0.85;
const T_RUN = C.l[2] + SETTLE;     // 8.375 beats of movement

// 24 beats end to end, which at the approved tempo is 12s: 4.19s of juggling
// and 7.81s perfectly still. The 12s matches the dance and draw heroes exactly.
const T_CYCLE = 24;

const fly = (from, to, top, t0, t1) => ({ kind: 'fly', from, to, top, t0, t1 });
const move = (from, to, t0, t1) => ({ kind: 'move', from, to, t0, t1 });
const hold = (at, t0, t1) => ({ kind: 'move', from: at, to: at, t0, t1 });
const TO_R = [LH_THROW, RH_CATCH, TOP_LR];
const TO_L = [RH_THROW, LH_CATCH, TOP_RL];

const RUN = {
  l: [
    move(REST_L, LH_THROW, 0, WINDUP),
    hold(LH_THROW, WINDUP, T.l[0]),
    fly(...TO_R, T.l[0], C.r[0]),
    move(RH_CATCH, RH_THROW, C.r[0], T.r[1]),
    fly(...TO_L, T.r[1], C.l[1]),
    move(LH_CATCH, LH_THROW, C.l[1], C.l[1] + 1.15),
    hold(LH_THROW, C.l[1] + 1.15, C.l[2]),
    move(LH_THROW, REST_L, C.l[2], T_RUN),
  ],
  a: [
    hold(REST_A, 0, T.l[0]),
    move(REST_A, LH_THROW, T.l[0], T.l[1]),
    fly(...TO_R, T.l[1], C.r[1]),
    move(RH_CATCH, RH_THROW, C.r[1], T.r[2]),
    fly(...TO_L, T.r[2], C.l[2]),
    move(LH_CATCH, REST_A, C.l[2], T_RUN),
  ],
  r: [
    move(REST_R, RH_THROW, 0, T.r[0]),
    fly(...TO_L, T.r[0], C.l[0]),
    move(LH_CATCH, LH_THROW, C.l[0], T.l[2]),
    fly(...TO_R, T.l[2], C.r[2]),
    move(RH_CATCH, REST_R, C.r[2], T_RUN),
  ],
};

const HOME = { l: LH_THROW, a: { ...TOP_RL, r: AIR_TILT }, r: RH_CATCH };
const REST = { l: REST_L, a: REST_A, r: REST_R };

function check() {
  for (const key of Object.keys(RUN)) {
    const segs = RUN[key];
    for (let i = 1; i < segs.length; i++) {
      if (Math.abs(segs[i].t0 - segs[i - 1].t1) > 1e-9) throw new Error(`${key}: gap at ${segs[i].t0}`);
    }
    if (Math.abs(segs[segs.length - 1].t1 - T_RUN) > 1e-9) throw new Error(`${key}: wrong length`);
    if (segs[0].from !== REST[key] || segs[segs.length - 1].to !== REST[key]) {
      throw new Error(`${key}: does not begin and end at rest`);
    }
    for (const s of segs) {
      if (s.kind === 'fly' && Math.abs((s.t1 - s.t0) - 1.85) > 1e-9) throw new Error(`${key}: bad flight`);
    }
  }
  const throws = [...T.l.map(t => ['L', t]), ...T.r.map(t => ['R', t])].sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < throws.length; i++) {
    if (throws[i][0] === throws[i - 1][0]) throw new Error('two throws in a row from one hand');
    if (Math.abs((throws[i][1] - throws[i - 1][1]) - 1) > 1e-9) throw new Error('uneven throws');
  }
  console.error(`ok: ${throws.length} throws, ${T_RUN} beats of movement in a ${T_CYCLE} beat cycle`);
}
check();

const n = v => (v.toFixed(2).replace(/\.?0+$/, '') || '0');
const frame = (home, p) => {
  const dx = p.x - home.x, dy = p.y - home.y, dr = p.r - home.r;
  if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005 && Math.abs(dr) < 0.005) return 'none';
  return `translate(${n(dx)}px, ${n(dy)}px) rotate(${n(dr)}deg)`;
};

function cardKeyframes(name, key) {
  const home = HOME[key], rows = [];
  for (const seg of RUN[key]) {
    const still = seg.kind === 'move' && seg.from === seg.to;
    const steps = seg.kind === 'fly' ? 8 : (still ? 1 : 3);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const t = seg.t0 + (seg.t1 - seg.t0) * f;
      const p = seg.kind === 'fly' ? flightAt(seg.from, seg.to, seg.top, f) : moveAt(seg, f);
      rows.push(`  ${n(t / T_CYCLE * 100)}% { transform: ${frame(home, p)}; }`);
    }
  }
  rows.push(`  100% { transform: ${frame(home, REST[key])}; }`);
  return `@keyframes ${name} {\n${rows.filter((r, i) => r !== rows[i - 1]).join('\n')}\n}`;
}

function armKeyframes(name, hand, sign) {
  const pts = [[0, 0]];
  for (const t of T[hand]) pts.push([t - 0.3, 3], [t, 8], [t + 0.35, 0]);
  for (const t of C[hand]) pts.push([t - 0.25, -2], [t, -5], [t + 0.4, -1], [t + 0.75, 0]);
  pts.push([T_RUN, 0], [T_CYCLE, 0]);
  const seen = new Map();
  for (const [t, v] of pts) {
    const k = Math.round(t * 1e6);
    if (seen.has(k) && Math.abs(seen.get(k) - v) > 1e-9) throw new Error(`${name}: clash at ${t}`);
    seen.set(k, v);
  }
  const rows = [...seen.entries()].map(([k, v]) => [k / 1e6, v])
    .filter(([t]) => t >= 0 && t <= T_CYCLE).sort((a, b) => a[0] - b[0]);
  return `@keyframes ${name} {\n${rows
    .map(([t, v]) => `  ${n(t / T_CYCLE * 100)}% { transform: rotate(${n(v * sign)}deg); }`)
    .join('\n')}\n}`;
}

const SWAY = [[0, 0], [1.6, -0.7], [3.1, 0.7], [4.6, -0.7], [6.1, 0.7], [7.6, 0], [T_CYCLE, 0]];
const sway = (name, amp, unit) => `@keyframes ${name} {\n${SWAY
  .map(([t, v]) => `  ${n(t / T_CYCLE * 100)}% { transform: ${
    unit === 'deg' ? `rotate(${n(v * amp)}deg)` : `translateX(${n(v * amp)}px)`}; }`)
  .join('\n')}\n}`;

const css = `/* ---- Hero character ------------------------------------------------
   Juggles three cards, then holds them. One cycle is --wj-cycle, default 12s,
   the same as the dance and draw heroes: 4.19s of movement and 7.81s perfectly
   still.

   The run itself is a real three-card cascade. A throw every beat, hands
   alternating, 1.85 beats in the air and 1.15 in a hand. Six throws and six
   catches, which is what makes it close on itself: each card goes out twice
   and comes back twice, so every one lands in the hand it started from.

   The opening and the ending are not special-cased choreography. They fall out
   of starting and finishing with two cards in one hand: the left hand throws
   twice before its first catch, because it began holding two, and at the other
   end it catches twice without throwing, because the run is over. No card is
   ever thrown just to make a pose work.

   Three things here are load-bearing and easy to undo by accident.

   1. Every animation drives a wrapper <g> that has no transform of its own.
      Put these on the drawn elements and each card's own rotate() is silently
      discarded, which pulls the artwork apart. Same rule the dance character
      needed to keep its headphones on.

   2. The resting pose is the three transforms on #wj-card-* below, and the
      keyframes begin and end on exactly those values. That is what lets
      /Word.svg stay exactly as drawn - the file still has the red card in the
      air - and it means there is nothing to fill forwards: with no JS, before
      anything animates, or under reduced motion, the character just rests.

   3. The viewBox is cropped to the resting pose, not to the juggle, and the
      svg is overflow:visible. The layout box is therefore 150x150 rather than
      150x194, and the thrown cards spill 36px into the margin above instead of
      reserving room for themselves all the time. At the top of a throw the
      nearest fixed element, the back link, is still 60px clear horizontally.

   Two gates, not one, matching dance and draw:
     .wj-run    loops forever. Applied on load by app.js.
     .wj-once   plays a single cycle: one run, then the still stretch, then
                stops. Used when the visitor has asked for reduced motion, so
                nothing moves on its own but a deliberate tap still plays. */

.hero-juggler {
    display: block;
    margin: 0 auto 8px;
    width: 115px;
    height: auto;
    max-width: 56%;
    overflow: visible;
    /* No pointer cursor on purpose. Tapping is a small reward, not
       navigation, and a pointer cursor would promise a link that isn't
       there. */
  }

.hero-juggler #wj-shadow,
  .hero-juggler #wj-body,
  .hero-juggler #wj-eyes,
  .hero-juggler #wj-arm-l,
  .hero-juggler #wj-arm-r,
  .hero-juggler #wj-card-l,
  .hero-juggler #wj-card-a,
  .hero-juggler #wj-card-r { transform-box: fill-box; }

/* Arms pivot at the shoulder, so the origin sits at the edge nearest the
     body. The body pivots where the legs meet it, so the feet stay planted. */

.hero-juggler #wj-body   { transform-origin: 50% 100%; }
.hero-juggler #wj-shadow { transform-origin: 50% 50%; }
.hero-juggler #wj-eyes   { transform-origin: 50% 50%; }
.hero-juggler #wj-arm-l  { transform-origin: 100% 4%; }
.hero-juggler #wj-arm-r  { transform-origin: 0% 4%; }
.hero-juggler #wj-card-l,
  .hero-juggler #wj-card-a,
  .hero-juggler #wj-card-r { transform-origin: 50% 50%; }

/* The resting pose. Also the first and last frame of the animation. */
.hero-juggler #wj-card-l { transform: ${frame(HOME.l, REST_L)}; }
.hero-juggler #wj-card-a { transform: ${frame(HOME.a, REST_A)}; }
.hero-juggler #wj-card-r { transform: ${frame(HOME.r, REST_R)}; }

/* Linear on the cards, because the parabolas are already sampled into the
     keyframes and an easing curve on top would bend them back out of shape.
     The arms and body are plain angles, so they take the easing. */

.hero-juggler.wj-run #wj-card-l { animation: wjCardL var(--wj-cycle, 12s) linear infinite; }
.hero-juggler.wj-run #wj-card-a { animation: wjCardA var(--wj-cycle, 12s) linear infinite; }
.hero-juggler.wj-run #wj-card-r { animation: wjCardR var(--wj-cycle, 12s) linear infinite; }
.hero-juggler.wj-run #wj-arm-l  { animation: wjArmL var(--wj-cycle, 12s) ease-in-out infinite; }
.hero-juggler.wj-run #wj-arm-r  { animation: wjArmR var(--wj-cycle, 12s) ease-in-out infinite; }
.hero-juggler.wj-run #wj-body   { animation: wjBody var(--wj-cycle, 12s) ease-in-out infinite; }
.hero-juggler.wj-run #wj-shadow { animation: wjShadow var(--wj-cycle, 12s) ease-in-out infinite; }

.hero-juggler.wj-once #wj-card-l { animation: wjCardL var(--wj-cycle, 12s) linear 1; }
.hero-juggler.wj-once #wj-card-a { animation: wjCardA var(--wj-cycle, 12s) linear 1; }
.hero-juggler.wj-once #wj-card-r { animation: wjCardR var(--wj-cycle, 12s) linear 1; }
.hero-juggler.wj-once #wj-arm-l  { animation: wjArmL var(--wj-cycle, 12s) ease-in-out 1; }
.hero-juggler.wj-once #wj-arm-r  { animation: wjArmR var(--wj-cycle, 12s) ease-in-out 1; }
.hero-juggler.wj-once #wj-body   { animation: wjBody var(--wj-cycle, 12s) ease-in-out 1; }
.hero-juggler.wj-once #wj-shadow { animation: wjShadow var(--wj-cycle, 12s) ease-in-out 1; }

/* Blinking runs on its own 11s clock rather than the juggle's 12s, so the two
     drift and the character never blinks on the same beat twice running. Two
     per cycle, 4.7s apart and then 6.3s, deliberately uneven: evenly spaced
     blinks read as a metronome rather than a living thing. Same blink the
     dance and draw lobby characters use. */

.hero-juggler.wj-run #wj-eyes,
  .hero-juggler.wj-once #wj-eyes { animation: wjBlink 11s linear infinite; }

@keyframes wjBlink {
  0%, 19%  { transform: scaleY(1); }
  19.9%    { transform: scaleY(0.08); }
  20.9%    { transform: scaleY(1); }
  61.8%    { transform: scaleY(1); }
  62.6%    { transform: scaleY(0.08); }
  63.6%    { transform: scaleY(1); }
  100%     { transform: scaleY(1); }
}

${cardKeyframes('wjCardL', 'l')}

${cardKeyframes('wjCardA', 'a')}

${cardKeyframes('wjCardR', 'r')}

${armKeyframes('wjArmL', 'l', 1)}

${armKeyframes('wjArmR', 'r', -1)}

/* The body barely moves: a slow lean under the throws, well under a degree of
     shoulder travel. Any more and the cards stop reading as the thing that is
     actually moving. */

${sway('wjBody', 1, 'deg')}

${sway('wjShadow', 2.8, 'px')}

/* Reduced motion kills .wj-run outright, so nothing moves on its own. It
     deliberately does NOT kill .wj-once: that class is only ever applied by a
     tap, and a tap is the visitor asking for the animation. The resting pose
     above is a plain transform, not an animation, so the character still holds
     its cards correctly with everything here switched off. */

@media (prefers-reduced-motion: reduce) {
  .hero-juggler.wj-run #wj-card-l,
  .hero-juggler.wj-run #wj-card-a,
  .hero-juggler.wj-run #wj-card-r,
  .hero-juggler.wj-run #wj-arm-l,
  .hero-juggler.wj-run #wj-arm-r,
  .hero-juggler.wj-run #wj-body,
  .hero-juggler.wj-run #wj-shadow,
  .hero-juggler.wj-run #wj-eyes { animation: none; }
}
`;

// The block is delimited so --write can replace exactly it and leave the rest
// of word.css alone.
const START = '/* ---- Hero character ---';
const END = '/* The card every player sees';

if (process.argv.includes('--write')) {
  const target = new URL('../www/word/word.css', import.meta.url);
  const cur = readFileSync(target, 'utf8');
  const a = cur.indexOf(START), b = cur.indexOf(END);
  if (a !== 0 || b < 0) throw new Error('word.css does not start with the hero block; refusing to guess');
  writeFileSync(target, css + '\n' + cur.slice(b));
  console.log('rewrote the hero block in www/word/word.css');
} else {
  process.stdout.write(css);
}

console.error('');
console.error('resting card transforms (these also live in www/word-cards-blink.svg):');
for (const [k, id] of [['l', 'wj-card-l'], ['a', 'wj-card-a'], ['r', 'wj-card-r']]) {
  console.error(`  #${id} { transform: ${frame(HOME[k], REST[k])}; }`);
}
