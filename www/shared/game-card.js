// ============================================================
// ONE ONLINE GAME, AS A CARD  (#271)
// ============================================================
// The list at /online draws one of these for each game, and the word game's
// waiting screen draws the game somebody is waiting for. One builder, so the
// two cannot drift apart; the look is .game-card in base.css.
//
// Built with the DOM and never with innerHTML: the name on a card is text a
// stranger typed, shown on a public page.
//
// `row` is a listing as shared/online-games.js writes it: lang, host,
// players, phase, and avs and lobbyAt when the host has them.

import { t, plural } from './i18n.js';
import { clockText } from './online-clock.js';

// Each language in its own name, whatever language the page is in. The card
// tells a reader what language a game is played in, and a reader knows their
// own language's name best. The same on every page, so not in t().
export const LANG_NAMES = { en: 'English', es: 'Español', pt: 'Português', fr: 'Français' };

// The animal images, av01.webp to av20.webp. AVATAR_COUNT in word/app.js.
const AVATAR_COUNT = 20;

function add(parent, tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  parent.appendChild(el);
  return el;
}

// "Starts in 3:22", in the lobby clock's m:ss, and "Starting now" once it
// runs out (#299). The time is its own element carrying the deadline, so a
// page can tick it every second with tickCardClocks() without rebuilding the
// card, and so without replacing the Join button under a finger.
const CLOCK_CLASS = 'game-card-starts';

function startsText(lobbyAt, now) {
  return lobbyAt - now > 0
    ? t('game-card.starts-in', { time: clockText(lobbyAt - now) })
    : t('game-card.starting');
}

export function tickCardClocks(root, now) {
  for (const el of root.querySelectorAll(`.${CLOCK_CLASS}`)) {
    const text = startsText(Number(el.dataset.at), now);
    if (el.textContent !== text) el.textContent = text;
  }
}

// The card's markup with every ticking time blanked, for a page that keeps a
// card on screen until something other than the seconds has changed.
export function cardSignature(card) {
  const copy = card.cloneNode(true);
  for (const el of copy.querySelectorAll(`.${CLOCK_CLASS}`)) el.textContent = '';
  return copy.outerHTML;
}

// `href` adds the button: Join for a game in its lobby, Join next round for a
// game in a round. Without it, as on the waiting screen, the card only shows.
export function gameCard(row, { code = '', now, href } = {}) {
  const playing = row.phase !== 'lobby';
  const card = document.createElement('div');
  card.className = playing ? 'game-card is-playing' : 'game-card';

  const top = add(card, 'div', 'game-card-top');
  // The count below says how many play, so the faces are only a picture.
  const faces = add(top, 'div', 'game-card-faces');
  faces.setAttribute('aria-hidden', 'true');
  // The database hands a two-item list back as an array, but a row written
  // by hand may come back as an object.
  const avs = Object.values(row.avs || {})
    .filter(av => Number.isInteger(av) && av >= 1 && av <= AVATAR_COUNT);
  for (const av of avs) {
    const img = add(faces, 'img', 'player-avatar');
    img.src = `/avatars/av${String(av).padStart(2, '0')}.webp`;
    img.alt = '';
  }
  const players = Math.max(0, Number(row.players) || 0);
  const more = players - avs.length;
  if (avs.length && more > 0) add(faces, 'span', 'game-card-more').textContent = `+${more}`;

  const lang = add(top, 'span', 'game-card-lang');
  lang.lang = row.lang || '';
  lang.textContent = LANG_NAMES[row.lang] || String(row.lang || '').toUpperCase();

  const bottom = add(card, 'div', 'game-card-bottom');
  const text = add(bottom, 'div', 'game-card-text');
  const name = add(text, 'p', 'game-card-name');
  name.textContent = row.host ? t('game-card.name', { name: row.host }) : code;
  const meta = add(text, 'p', 'game-card-meta');
  meta.textContent = plural('game-card.players', players);
  if (playing) {
    meta.textContent += ` · ${t('game-card.in-round')}`;
  } else if (typeof row.lobbyAt === 'number' && typeof now === 'number') {
    meta.append(' · ');
    const starts = add(meta, 'span', CLOCK_CLASS);
    starts.dataset.at = String(row.lobbyAt);
    starts.textContent = startsText(row.lobbyAt, now);
  }

  if (href) {
    const button = add(bottom, 'a', playing ? 'btn game-card-join game-card-next' : 'btn btn-primary game-card-join');
    button.href = href;
    button.textContent = playing ? t('game-card.join-next') : t('game-card.join');
    // "Join" alone says nothing to a screen reader moving from link to link.
    if (code) {
      name.id = `game-card-${code}`;
      button.setAttribute('aria-describedby', name.id);
    }
  }
  return card;
}
