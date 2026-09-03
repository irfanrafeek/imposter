#!/usr/bin/env node
/* Builds www/imposter-dance-how-to-play.svg, the lead illustration for the
   How to Play section of the dance game (#200).

   The character is the house one from www/characterdance.svg, inlined four
   times. Run this after changing that character so the two do not drift:

     node scripts/build-dance-howto.mjs

   Everything the illustration has to say is said by timing and by shape,
   never by colour alone: the impostor's note is a different glyph as well
   as a different hue, because teal against red is exactly the pairing that
   disappears for a red-green colour-blind reader. */

import { writeFileSync } from 'node:fs';

const OUT = 'www/imposter-dance-how-to-play.svg';

const TEAL = '#2f9e94';
const RED = '#d04a2f';
const CREW_BEAT = '1.5s';
const IMP_BEAT = '1.12s';

/* Three crew share one beat and one phase, so they groove together. The
   impostor runs a different tempo AND a different phase, which is the whole
   game rendered as timing rather than as a label. */
const DANCERS = [
  { x: 90, beat: CREW_BEAT, delay: '0s', scale: 0.97, flip: false },
  { x: 415, beat: CREW_BEAT, delay: '0s', scale: 1, flip: false },
  { x: 740, beat: CREW_BEAT, delay: '0s', scale: 0.98, flip: true },
  { x: 1065, beat: IMP_BEAT, delay: '-0.44s', scale: 1, flip: false },
];

/* The crew share a beat and a phase, which is the point: same song, same
   timing. Left identical they also share every pixel, and three exact clones
   read as a copy-paste slip rather than as unison. A little size variation,
   and one of them mirrored, breaks the clone look without touching the beat.
   This goes on the outer group, which is never animated. */
const place = ({ x, scale, flip }) =>
  flip
    ? `translate(${x + 285 * scale} 190) scale(${-scale} ${scale})`
    : `translate(${x} 190) scale(${scale})`;

const dancer = (d) => `  <g class="dh-dancer" transform="${place(d)}" style="--dh-beat:${d.beat}; --dh-delay:${d.delay}">
   <g class="dh-shadow"><ellipse transform="translate(37 274)" cx="106.5" cy="25" rx="106.5" ry="25" fill="#E8E0D7"/></g>
   <g class="dh-legs">
    <path transform="translate(123.143 212.781) rotate(61.8423)" d="M48.5366 71.4295C67.3889 80.0171 74.0561 57.1434 68.8962 47.1657C63.7364 37.188 58.0975 34.7345 50.9282 25.6389C42.0142 14.3297 32.8254 1.71912 17.9156 0.0788079C0.0452518 -1.8872 0 33.5835 0 33.5835C2.04551 45.4499 28.8228 62.4496 48.5366 71.4295Z" fill="#FDF0E0" stroke="black" stroke-width="5"/>
    <path transform="matrix(-0.38653 0.922277 0.922277 0.38653 161.575 211.781)" d="M51.7034 70.3855C70.5557 77.6621 75.94 54.8482 70.7802 46.3936C65.6203 37.939 57.3852 31.9646 50.2159 24.2575C41.3019 14.6747 30.9694 1.44329 16.0596 0.0533809C-1.8108 -1.61251 0.0557561 36.3865 0.0557561 36.3865C2.10127 46.4414 31.9897 62.7764 51.7034 70.3855Z" fill="#FDF0E0" stroke="black" stroke-width="5"/>
   </g>
   <g class="dh-body">
    <g transform="translate(8.99913 48.7812)">
     <g class="dh-arm-r"><path transform="translate(214.284 123.219) rotate(8.31068)" d="M27.4188 71.4006C40.4889 83.5914 55.917 77.7432 54.0142 64.385C52.1113 51.0268 43.4251 40.8563 37.1769 32.6672C27.1536 19.5302 5.98421 0 5.98421 0L0 38.236C8.85714 44.8733 15.2985 60.0958 27.4188 71.4006Z" fill="#FDF0E0" stroke="black" stroke-width="5"/></g>
     <g class="dh-arm-l"><path transform="matrix(-0.989499 -0.144541 -0.144541 0.989499 58.8457 132.129)" d="M30.306 76.1804C40.8544 87.9458 52.6596 68.8343 45.74 54.5C38.8204 40.1657 37.3599 37.83 30.6677 28.7345C22.3466 17.4252 5.72828 0 5.72828 0L0 38.236C8.62615 44.7164 11.2263 54.8995 30.306 76.1804Z" fill="#FDF0E0" stroke="black" stroke-width="5"/></g>
     <rect transform="translate(35.5009)" x="3" y="3" width="192" height="208" rx="45" fill="#FDF0E0" stroke="black" stroke-width="6"/>
     <path transform="translate(40.501 5.70703)" d="M125.001 20.5112C141.401 15.3112 150.001 3.51556 147.501 0.0220768C138.501 0.0236841 120.501 0 120.501 0C120.501 0 78.6574 0.0424484 50.0011 0.0197779C25.0011 0 19 6.01172 10.5 15.0117C3.63376 22.2818 4.6173 29.4253 1.50117 39.0117C1.50117 60.0117 1.50117 105.012 0 127.012C1.50117 147.512 -0.734339 155.601 1.50117 169.012C4.66829 188.012 19.5011 196.993 32.0011 201.011C44.5011 205.029 127.942 202.511 147.001 202.511C165.5 202.511 189.001 181.011 175.501 184.511C162.001 188.011 50.0011 194.512 32.0011 171.512C14.0012 148.512 11.0011 60.0117 37.5012 34.5326C63.258 9.76815 104.501 27.0112 125.001 20.5112Z" fill="#F4D7B3"/>
     <g transform="translate(114.727 124)">
      <path d="M35.1636 0.792835C25.6635 4.17526 11.8197 3.87456 2.89288 0.959285C1.61115 0.540707 0.205003 1.36098 0.120174 2.70665C-0.483876 12.2889 1.22817 22.2489 4.37976 26.45C7.82976 31.049 13.0048 34.4996 19.9048 34.4996C26.8049 34.4996 33.4789 28.1085 36.0049 22.425C38.0716 17.7751 39.2097 8.48287 37.7508 2.05661C37.4942 0.926157 36.2557 0.404016 35.1636 0.792835Z" fill="black"/>
      <path transform="translate(7.77344 13)" d="M10.6585 0C4.82439 0 1.12195 1.11111 0 3.33333C1.12195 10.5556 4.4878 15 12.3415 15C19.0732 15 22.439 7.77778 23 3.88889C21.3171 1.11111 16.4927 0 10.6585 0Z" fill="#F17542"/>
     </g>
     <g class="dh-eyes">
      <g transform="translate(79.5009 69)">
       <ellipse cx="19" cy="23" rx="19" ry="23" fill="#091314"/>
       <ellipse transform="translate(19 7.85366)" cx="5.5" cy="6.73171" rx="5.5" ry="6.73171" fill="white"/>
       <ellipse transform="translate(7 30.2927)" cx="1.5" cy="1.68293" rx="1.5" ry="1.68293" fill="white"/>
      </g>
      <g transform="translate(154.501 69)">
       <ellipse cx="19" cy="23" rx="19" ry="23" fill="#091314"/>
       <ellipse transform="translate(9 8.85547)" cx="5.5" cy="6.73171" rx="5.5" ry="6.73171" fill="white"/>
       <ellipse transform="translate(23 33.293)" cx="1.5" cy="1.68293" rx="1.5" ry="1.68293" fill="white"/>
      </g>
     </g>
    </g>
    <g class="dh-cans">
     <path transform="translate(30.5)" d="M209.28 103.006C213.701 111.253 225 112.003 225 83.2148C225 63.7977 207.69 36.8759 191.5 24.2812C175.31 11.6866 148.362 0 115.448 0C82.5328 0 58.8731 4.67007 36.5 21.1411C17.4777 35.1451 4.06355 62.3382 0 83.2148C1.25041 98.3584 12.007 131.057 16.2119 103.006C19.4639 81.3129 32.8147 49.0847 50 36.4346C69.1608 22.3304 93.8319 19.3418 115.448 19.3418C137.063 19.3418 164.262 29.2856 179 39.7812C193.738 50.2769 210.59 96.2593 209.28 103.006Z" fill="#F7B555" stroke="black" stroke-width="6"/>
     <g transform="translate(283.56 186.602) rotate(-180)">
      <path d="M0 52.5382C0 18.2765 13.1353 10.982 24.8962 4.88441C24.8962 1.57904 44.4725 -4.21826 47.6593 4.88441C51.6429 16.2628 52.5607 87.4702 47.6593 102.882C44.079 114.14 30.2076 107.237 24.8962 102.882L24.6864 102.745C12.9796 95.0869 0 86.5963 0 52.5382Z" fill="#F37D56"/>
      <path d="M24.8962 4.88441C13.1353 10.982 0 18.2765 0 52.5382C0 86.7998 13.1353 95.1874 24.8962 102.882M24.8962 4.88441C24.8962 23.3515 24.8962 77.9108 24.8962 102.882M24.8962 4.88441C24.8962 1.57904 44.4725 -4.21826 47.6593 4.88441C51.6429 16.2627 52.5607 87.4702 47.6593 102.882C44.079 114.14 30.2076 107.237 24.8962 102.882" stroke="black" stroke-width="6"/>
     </g>
     <g transform="translate(0 79.1172)">
      <path d="M0 54.6746C0 18.2808 12.9067 10.5322 23.0765 4.05509C23.0765 -0.196631 30.8902 -1.29216 40.5 1.6639C47 3.66335 52.9762 31.301 53 54.6746C53 97.1502 47.2604 106.15 40.5 110.65C33.7402 115.15 27.6693 112.778 23.0765 108.151C12.9067 99.9779 0 91.0684 0 54.6746Z" fill="#F16E41"/>
      <path d="M23.0765 4.05509C12.9067 10.5322 0 18.2808 0 54.6746C0 91.0684 12.9067 99.9779 23.0765 108.151M23.0765 4.05509C23.0765 -0.196631 30.8902 -1.29216 40.5 1.6639C47 3.66335 52.9762 31.301 53 54.6746C53 97.1502 47.2604 106.15 40.5 110.65C33.7402 115.15 27.6693 112.778 23.0765 108.151M23.0765 4.05509C23.0765 4.05509 30.4001 22.6641 30.4001 57.1608C32 87.1641 23.0765 108.151 23.0765 108.151" stroke="black" stroke-width="6"/>
     </g>
    </g>
   </g>
  </g>`;

/* Beamed pair: the shared track. Single flagged note: the impostor's. */
const notePair = ({ x, beat, delay, fill }) => `  <g transform="translate(${x} 40) scale(1.25)" style="--dh-beat:${beat}; --dh-delay:${delay}" fill="${fill}">
   <g class="dh-note">
    <ellipse cx="13" cy="60" rx="12.5" ry="9.5" transform="rotate(-18 13 60)"/>
    <ellipse cx="49" cy="52" rx="12.5" ry="9.5" transform="rotate(-18 49 52)"/>
    <rect x="21" y="8" width="7" height="52" rx="3.5"/>
    <rect x="57" y="0" width="7" height="52" rx="3.5"/>
    <path d="M21 8L64 0V13L21 21Z"/>
   </g>
  </g>`;

const noteSingle = ({ x, beat, delay, fill }) => `  <g transform="translate(${x} 40) scale(1.25)" style="--dh-beat:${beat}; --dh-delay:${delay}" fill="${fill}">
   <g class="dh-note">
    <ellipse cx="13" cy="60" rx="12.5" ry="9.5" transform="rotate(-18 13 60)"/>
    <rect x="21" y="6" width="7" height="54" rx="3.5"/>
    <path d="M28 6C44 14 46.5 28 38 41C42.5 26.5 38 18.5 28 20.5Z"/>
   </g>
  </g>`;

const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 560" width="1440" height="560" fill="none" role="img" aria-labelledby="dh-title dh-desc">
 <title id="dh-title">How to play the Imposter Dance Challenge</title>
 <desc id="dh-desc">Four players wearing headphones. Three of them hear the same song, shown by matching teal music notes, and dance in time with each other. The fourth is the impostor: a single red note shows they are hearing a completely different track, and their dance is out of time with the rest.</desc>
 <style><![CDATA[
/* ============================================================
   How-to-play lead illustration, dance
   ------------------------------------------------------------
   Generated by scripts/build-dance-howto.mjs from the house
   character in www/characterdance.svg. Edit the script, not this
   file, or the next regeneration will overwrite you.

   The character is inlined four times rather than instanced with
   <use>. <use> would be a quarter of the bytes, but it clones into
   a shadow tree, and per-instance animation timing then has to
   reach through that tree. Four copies of the path data gzip down
   to almost nothing and the animation is debuggable in devtools,
   which the shadow-tree version is not.

   Every animated wrapper is a <g> carrying NO transform attribute
   of its own, for the reason spelled out at length in
   characterdance.svg: transform-box + transform-origin on an element
   that already has a transform re-anchors it to the viewBox origin
   and tears the headphones off the head in Chrome. If you add a
   transform to one of these wrappers, wrap it in another <g> instead.

   Timing is per dancer, set inline as --dh-beat and --dh-delay.
   The three crew share a beat and a phase. The impostor does not.
   ============================================================ */

.dh-shadow, .dh-body, .dh-arm-l, .dh-arm-r,
.dh-eyes, .dh-cans, .dh-note { transform-box: fill-box; }

.dh-shadow, .dh-body, .dh-arm-l, .dh-arm-r,
.dh-eyes, .dh-cans, .dh-note {
  animation-duration: var(--dh-beat, 1.5s);
  animation-delay: var(--dh-delay, 0s);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

/* Feet stay planted: the legs sit outside .dh-body and never animate,
   and the body has no vertical travel. It grooves in place. */
.dh-body { transform-origin: 50% 100%; animation-name: dhBody; }
@keyframes dhBody {
  0%, 100% { transform: rotate(-3deg) scaleY(1); }
  25%      { transform: rotate(0deg) scaleY(1.025); }
  50%      { transform: rotate(3deg) scaleY(1); }
  75%      { transform: rotate(0deg) scaleY(1.025); }
}

.dh-shadow { transform-origin: 50% 50%; animation-name: dhShadow; }
@keyframes dhShadow {
  0%, 100% { transform: translateX(-4px) scaleX(0.98); }
  50%      { transform: translateX(4px) scaleX(0.98); }
}

/* Arms pivot at the shoulder, so the origin sits at the edge nearest
   the body. They hang down and outward and are drawn behind the body,
   so the sign that lifts each one differs. Getting this backwards
   tucks them out of sight. */
.dh-arm-l { transform-origin: 100% 6%; animation-name: dhArmL; }
@keyframes dhArmL {
  0%, 100% { transform: rotate(4deg); }
  25%      { transform: rotate(34deg); }
  50%      { transform: rotate(2deg); }
  75%      { transform: rotate(14deg); }
}
.dh-arm-r { transform-origin: 0% 6%; animation-name: dhArmR; }
@keyframes dhArmR {
  0%, 100% { transform: rotate(-4deg); }
  25%      { transform: rotate(-14deg); }
  50%      { transform: rotate(-2deg); }
  75%      { transform: rotate(-34deg); }
}

.dh-cans { transform-origin: 50% 72%; animation-name: dhCans; }
@keyframes dhCans {
  0%, 100% { transform: rotate(2deg); }
  25%      { transform: rotate(-1.5deg); }
  50%      { transform: rotate(-2deg); }
  75%      { transform: rotate(1.5deg); }
}

.dh-note { transform-origin: 50% 100%; animation-name: dhNote; }
@keyframes dhNote {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50%      { transform: translateY(-10px) rotate(4deg); }
}

/* One blink every third cycle, off the beat so it never looks mechanical */
.dh-eyes {
  transform-origin: 50% 50%;
  animation-name: dhBlink;
  animation-duration: calc(var(--dh-beat, 1.5s) * 3);
}
@keyframes dhBlink {
  0%, 90%, 100% { transform: scaleY(1); }
  93%           { transform: scaleY(0.08); }
  96%           { transform: scaleY(1); }
}

@media (prefers-reduced-motion: reduce) {
  .dh-shadow, .dh-body, .dh-arm-l, .dh-arm-r,
  .dh-eyes, .dh-cans, .dh-note { animation: none; }
}
 ]]></style>
`;

const parts = [
  ...DANCERS.map(dancer),
  ...DANCERS.map((d, i) => {
    const impostor = i === DANCERS.length - 1;
    const draw = impostor ? noteSingle : notePair;
    // centred over the head: dancer-local head centre is x+143, and the glyph
    // is drawn at 1.25 so its 64x70 box measures 80 wide on the page
    return draw({ ...d, x: d.x + 143 * d.scale - (impostor ? 20 : 40), fill: impostor ? RED : TEAL });
  }),
];

writeFileSync(OUT, head + parts.join('\n') + '\n</svg>\n');
console.log(`wrote ${OUT}`);
