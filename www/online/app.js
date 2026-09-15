// ============================================================
// /online: THE LIVE LIST OF ONLINE GAMES  (#271)
// ============================================================
// Reads online-games/, which anyone may read, and keeps the list in step for
// as long as the page is open. The rows are only hints: the room itself is
// checked again when somebody joins (shared/online-games.js).
//
// The served page shows the empty message. It waits a moment before showing
// it (see online.css), so a page with games on it does not flash "No games
// open" while this loads.

import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "../shared/firebase.js";
import { pageLang, gamePathFor } from "../shared/lang.js";
import { ONLINE_TREE, listForPage } from "../shared/online-games.js";
import { gameCard, tickCardClocks, cardSignature } from "../shared/game-card.js";

const $ = (id) => document.getElementById(id);
const section = document.querySelector('.online-games');

// The list is drawn again on this beat as well as on every change: a card's
// minutes count down, and a host who goes quiet has to drop off the list even
// though nothing in the tree changes when they do.
const TICK_MS = 15 * 1000;
// The start time on each card ticks on its own, once a second (#299).
const CLOCK_MS = 1000;

// ?emu=1 and ?clocks=fast only work on localhost (shared/firebase.js,
// shared/online-clock.js). Carried onto the links so a test round that starts
// here stays on the emulator.
const TEST_PARAMS = (() => {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const out = new URLSearchParams();
  if (!local) return out;
  const here = new URLSearchParams(location.search);
  for (const key of ['emu', 'clocks']) if (here.has(key)) out.set(key, here.get(key));
  return out;
})();

function withTestParams(href) {
  if (![...TEST_PARAMS.keys()].length) return href;
  return href + (href.includes('?') ? '&' : '?') + TEST_PARAMS.toString();
}

for (const a of section.querySelectorAll('a.btn')) a.href = withTestParams(a.getAttribute('href'));

// A card links to the game's page in the game's own language, which is where
// joining would send the player anyway (shared/lang.js).
function joinHref(row) {
  const path = gamePathFor('word', row.lang) || '/word/';
  return withTestParams(`${path}?join=${encodeURIComponent(row.code)}&s=online`);
}

let tree = null;
let loaded = false;
let connected = false;
let serverOffset = 0;
// code -> { el, html } for the cards on screen now.
let drawn = new Map();

// Cards are kept by code, so a card that has not changed is the same element
// from one draw to the next and nothing on screen blinks. A card that has
// changed is swapped, keeping its faces when those are the same, so the
// images are not loaded again every time a minute ticks down.
function cardsFor(rows, now, next) {
  return rows.map((row) => {
    const el = gameCard(row, { code: row.code, now, href: joinHref(row) });
    // Blind to the seconds, which tickCardClocks() keeps up to date in place.
    const html = cardSignature(el);
    const old = drawn.get(row.code);
    if (old && old.html === html) { next.set(row.code, old); return old.el; }
    if (old) {
      const oldFaces = old.el.querySelector('.game-card-faces');
      const newFaces = el.querySelector('.game-card-faces');
      if (oldFaces.outerHTML === newFaces.outerHTML) newFaces.replaceWith(oldFaces);
    } else if (drawn.size || section.dataset.state === 'list') {
      // Fades in when it arrives, not on the first draw.
      el.classList.add('is-new');
    }
    next.set(row.code, { el, html });
    return el;
  });
}

function draw() {
  if (!loaded) return;
  const now = Date.now() + serverOffset;
  const { open, playing } = listForPage(tree, now, pageLang());
  const next = new Map();
  $('online-open').replaceChildren(...cardsFor(open, now, next));
  $('online-playing').replaceChildren(...cardsFor(playing, now, next));
  drawn = next;

  const any = open.length + playing.length > 0;
  $('online-start-top').hidden = !any;
  $('online-playing-label').hidden = !playing.length;
  $('online-empty').hidden = any;
  section.dataset.state = any ? 'list' : 'empty';
}

// The dot beside "Open games" pulses while the list is live.
function drawDot() {
  $('online-dot').classList.toggle('live-dot', loaded && connected);
}

if (db) {
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => { serverOffset = snap.val() || 0; });
  onValue(ref(db, '.info/connected'), (snap) => { connected = snap.val() === true; drawDot(); });
  onValue(ref(db, ONLINE_TREE), (snap) => {
    tree = snap.val();
    loaded = true;
    draw();
    drawDot();
  }, () => {
    // Refused or failed: say so the way the page says nobody is playing.
    tree = null;
    loaded = true;
    draw();
  });
  setInterval(draw, TICK_MS);
  setInterval(() => { if (loaded) tickCardClocks(section, Date.now() + serverOffset); }, CLOCK_MS);
} else {
  section.dataset.state = 'empty';
}
