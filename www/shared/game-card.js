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

// "Starts in 3 min", counted up so it never says 0 while there is time left.
function startsText(lobbyAt, now) {
  if (typeof lobbyAt !== 'number' || typeof now !== 'number') return '';
  const min = Math.ceil((lobbyAt - now) / 60000);
  return min > 0 ? plural('game-card.starts-in', min) : t('game-card.starting');
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
  meta.textContent = [
    plural('game-card.players', players),
    playing ? t('game-card.in-round') : startsText(row.lobbyAt, now),
  ].filter(Boolean).join(' · ');

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
