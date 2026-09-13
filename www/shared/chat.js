// ============================================================
// SHARED CHAT COMPONENT
//
// A chat panel that knows nothing about Firebase, rooms, or who is talking to
// whom. Everything it needs arrives through a `transport` object, so the same
// component can serve a visitor talking to the developer today and players
// talking to each other inside a room later, with no change here.
//
//   transport = {
//     subscribe(cb)  -> unsubscribe    cb receives the FULL ordered message
//                                      array on every change
//     send(text)     -> Promise
//     markSeen()                       optional, called on open and on new
//                                      messages while the panel is open
//     close()                          optional, released by destroy()
//   }
//
// A message is { id, from, text, ts }. `from` is compared against the `me`
// option to decide which side of the thread a bubble sits on; it is otherwise
// opaque, which is what lets room chat pass a player id.
//
// The markup is built here rather than sitting in five HTML files, because the
// hub, the three games and the stats inbox would otherwise each carry their own
// copy to drift out of step. Styles live in shared/chat.css, linked by all five.
//
// Nothing here asks for an email address. Replies arrive in the thread, so the
// only thing a form field would add is a piece of personal data to look after.
// ============================================================

import { t, plural } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Enter-to-send is a desktop habit. On a touch keyboard the same key is how
// you get a new line, and stealing it makes the composer feel broken, so
// there we leave Enter alone and rely on the send button.
const ENTER_SENDS = typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches;

const REDUCED_MOTION = typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Stroked by default; pass { fill: true } for a solid shape, and `transform`
// for the rare icon that needs nudging inside its own box.
function icon(paths, size, opts) {
  const o = opts || {};
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    if (o.fill) {
      p.setAttribute('fill', 'currentColor');
    } else {
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
    }
    if (o.transform) p.setAttribute('transform', o.transform);
    svg.appendChild(p);
  }
  return svg;
}

function timeLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const today = new Date();
  const y = new Date(today.getTime() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * @param {object} o
 * @param {object} o.transport   see the contract at the top of this file
 * @param {'sticky'|'pill'|Element|null} o.launcher  how the panel is opened
 * @param {string} [o.launcherLabel]  visible text on the 'pill' launcher
 * @param {boolean} [o.dock]     docked, non-modal presentation (#246)
 * @param {boolean} [o.eager]    subscribe on mount rather than on first open,
 *                               so unread can be counted before anyone looks
 * @param {number} [o.cooldown]  ms between sends, default 3000
 * @param {boolean} [o.days]    false drops the day divider, for a thread
 *                               that cannot outlive the day it started in
 * @param {boolean} [o.times]   false drops the per-message clock, for a
 *                               thread short enough to read as one sitting
 * @param {Function} [o.avatar]  (message) => Element, the sender's picture.
 *                               Supplied by the caller rather than drawn here:
 *                               a room already has a way of picturing its
 *                               players and this panel should not invent a
 *                               second one.
 * @param {string} o.title       panel heading
 * @param {string} [o.opener]    greeting bubble pinned above the thread
 * @param {string} [o.placeholder]
 * @param {string} o.me          the `from` value that renders as outgoing
 * @param {Function} [o.onOpen]
 * @param {Function} [o.onSend]
 * @param {Element} [o.mount]
 */
export function mountChat(o) {
  const mount = o.mount || document.body;
  const me = o.me;
  let unsub = null;
  let open = false;
  let sending = false;
  let lastSentAt = 0;
  let lastReturnFocus = null;
  let unread = 0;
  let launcherWanted = false;
  // Docked is a presentation, not a second component. Everything below this
  // line is the panel that already ships; the flag only decides whether it
  // behaves as a sheet over an inert page or as a bar over a live game.
  const docked = !!o.dock;

  // Ids already on screen. The transport hands us the whole thread on every
  // change; appending only what is new keeps scroll position and text
  // selection intact, which a full re-render would destroy on every keystroke
  // the other side types.
  const drawn = new Set();
  let lastDay = null;
  // Who wrote the row above, so a run of messages from one player does not
  // repeat their name and face on every line.
  let lastFrom = null;
  // First delivery from the transport is existing history, not news.
  let firstBatch = true;
  // Greeting state: `done` once the bubble is on screen, `running` while the
  // timers between opening the panel and that moment are in flight.
  let openerDone = false;
  let openerRunning = false;
  let typingTimer = null;
  let typingEl = null;

  // ---- launcher ----------------------------------------------------------

  let launcher = null;
  let dot = null;

  if (o.launcher === 'sticky') {
    launcher = el('button', 'chat-fab');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', o.title);
    launcher.appendChild(icon(
      ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
      22,
    ));
    dot = el('span', 'chat-fab-dot');
    dot.hidden = true;
    launcher.appendChild(dot);
    mount.appendChild(launcher);
  } else if (o.launcher === 'pill') {
    // Deliberately NOT the round shape above. The support panel wears that
    // one, and a second round button in the same corner of the same page
    // would read as the same control. This is wide, dark and carries a word.
    launcher = el('button', 'chat-pill');
    launcher.type = 'button';
    launcher.appendChild(icon(
      ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
      15,
    ));
    launcher.appendChild(el('span', 'chat-pill-label', o.launcherLabel || o.title));
    dot = el('span', 'chat-pill-count');
    dot.hidden = true;
    launcher.appendChild(dot);
    // Starts hidden. Which screens this belongs on is the caller's business,
    // not the panel's, and a pill that flashed up on the way to being told
    // would land on the one screen it must never cover.
    launcher.hidden = true;
    mount.appendChild(launcher);
  } else if (o.launcher instanceof Element) {
    launcher = o.launcher;
  }

  // ---- panel -------------------------------------------------------------

  const backdrop = el('div', 'chat-backdrop' + (docked ? ' is-dock' : ''));
  if (docked) {
    // Not a dialog, and deliberately so. The round underneath keeps running
    // and a player has to watch their turn arrive while reading a message, so
    // nothing here traps focus and nothing tells a screen reader that the
    // game behind it has gone inert (#246).
    backdrop.setAttribute('role', 'region');
  } else {
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
  }
  backdrop.setAttribute('aria-label', o.title);

  const panel = el('div', 'chat-panel' + (docked ? ' is-dock' : ''));

  const header = el('div', 'chat-header');
  header.appendChild(el('h2', 'chat-title', o.title));
  const closeBtn = el('button', 'chat-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', t('chat.close'));
  closeBtn.appendChild(icon(['M6 6l12 12', 'M18 6L6 18'], 22));
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const list = el('div', 'chat-list');
  list.setAttribute('role', 'log');
  list.setAttribute('aria-live', 'polite');
  // The greeting arrives on a timer rather than being in the DOM already, so it
  // reads as a message someone just sent. It needs a fixed slot at the top of
  // the list all the same: history can land while the typing dots are still up,
  // and appending the greeting late would file it underneath messages it is
  // supposed to precede.
  const openerSlot = el('div', 'chat-opener-slot');
  list.appendChild(openerSlot);
  panel.appendChild(list);

  const foot = el('div', 'chat-foot');

  const composer = el('div', 'chat-composer');
  const field = el('textarea', 'chat-field');
  field.rows = 1;
  field.maxLength = 1000;
  field.placeholder = o.placeholder || t('chat.placeholder');
  field.setAttribute('aria-label', t('chat.message-label'));
  const sendBtn = el('button', 'send-btn');
  sendBtn.type = 'button';
  sendBtn.setAttribute('aria-label', t('chat.send-label'));
  sendBtn.disabled = true;
  // Filled paper plane, optically centred. A right-pointing shape carries its
  // mass in the wide tail and only a thin point reaches right, so it reads left
  // of centre even when its bounding box does not: measured, the ink sits 2.66
  // units left in a 24 box. It cannot simply be shifted right, because the path
  // already spans x=2..23 and anything past +1 has its tip clipped by the
  // viewBox. Scaling to 86% first makes the room, then the translate puts the
  // ink centre on the button centre, both axes.
  // The templates render this same icon from the plane macro in
  // src/components/icons.njk. This panel has no template, so it is built here;
  // change one and change the other (#257).
  sendBtn.appendChild(icon(
    ['M2 21l21-9L2 3v7l15 2-15 2v7z'],
    20,
    { fill: true, transform: 'translate(3.02 1.68) scale(0.86)' },
  ));
  composer.appendChild(field);
  composer.appendChild(sendBtn);
  foot.appendChild(composer);

  const err = el('div', 'chat-err');
  err.hidden = true;
  foot.appendChild(err);

  panel.appendChild(foot);
  backdrop.appendChild(panel);
  mount.appendChild(backdrop);

  // ---- rendering ---------------------------------------------------------

  function nearBottom() {
    return list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }

  function render(messages) {
    const stick = nearBottom();
    // Real messages outrank the theatre. If a thread already has history, the
    // greeting is skipped straight to its final state: dots that "type" ahead
    // of a conversation from last week would be a lie about what is happening.
    if (messages.length) settleOpener();

    for (const m of messages) {
      if (drawn.has(m.id)) continue;
      drawn.add(m.id);

      const day = m.ts && o.days !== false ? dayLabel(m.ts) : null;
      if (day && day !== lastDay) {
        lastDay = day;
        lastFrom = null;
        list.appendChild(el('div', 'chat-day', day));
      }

      // Only messages that turn up while the panel is open get the arrival
      // animation. Animating the backlog on open would be a wall of movement,
      // and with `eager` the backlog is everything said while it was shut.
      const isNew = !firstBatch && open && m.from !== me;
      if (!open && !firstBatch && m.from !== me) unread += 1;
      const mine = m.from === me;
      const runOn = !mine && m.from === lastFrom;
      const row = el('div', 'chat-row ' + (mine ? 'is-me' : 'is-them') + (isNew ? ' chat-arrive' : ''));
      const bubble = el('div', 'chat-bubble', m.text);
      if (m.name && !mine && !runOn) bubble.prepend(el('span', 'chat-who', m.name));
      const t = o.times === false ? '' : timeLabel(m.ts);
      if (o.avatar && !mine) {
        // The face sits beside the bubble, which makes the bubble and its
        // time a column of their own. Only on the first message of a run: the
        // same face four times down the edge of one thought is noise, and the
        // empty slot keeps the rest of the run on the same left edge.
        row.classList.add('has-av');
        const slot = el('div', 'chat-av');
        if (!runOn) {
          const face = o.avatar(m);
          if (face) slot.appendChild(face);
        }
        const stack = el('div', 'chat-stack');
        stack.appendChild(bubble);
        if (t) stack.appendChild(el('div', 'chat-time', t));
        row.appendChild(slot);
        row.appendChild(stack);
      } else {
        row.appendChild(bubble);
        if (t) row.appendChild(el('div', 'chat-time', t));
      }
      lastFrom = mine ? me : m.from;
      list.appendChild(row);
    }
    firstBatch = false;
    if (!open) setUnread(unread);
    // Jumping to the newest message is right when the reader is already at the
    // bottom. Someone scrolled up re-reading an earlier message did not ask to
    // be yanked away from it.
    if (stick) list.scrollTop = list.scrollHeight;
  }

  // ---- the greeting arriving ---------------------------------------------
  //
  // Opening the panel should feel like someone noticed and wrote back: a beat
  // of nothing, then typing dots, then the message. It runs once per page load,
  // not on every open, because watching the same greeting be typed out a third
  // time is a tell that nobody is really there.

  function settleOpener() {
    if (openerDone || !o.opener) return;
    openerDone = true;
    clearTimeout(typingTimer);
    if (typingEl) { typingEl.remove(); typingEl = null; }
    const row = el('div', 'chat-row is-them chat-arrive');
    row.appendChild(el('div', 'chat-bubble', o.opener));
    openerSlot.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function playOpener() {
    if (openerDone || openerRunning || !o.opener) return;
    // Someone who asked for less motion is asking about this exact kind of
    // thing, so they get the message and none of the performance.
    if (REDUCED_MOTION) { settleOpener(); return; }
    openerRunning = true;
    typingTimer = setTimeout(() => {
      if (openerDone) return;
      typingEl = el('div', 'chat-row is-them');
      const dots = el('div', 'chat-bubble chat-typing');
      dots.setAttribute('aria-label', t('chat.typing'));
      for (let i = 0; i < 3; i += 1) dots.appendChild(el('span', 'chat-dot'));
      typingEl.appendChild(dots);
      openerSlot.appendChild(typingEl);
      list.scrollTop = list.scrollHeight;
      typingTimer = setTimeout(settleOpener, 950);
    }, 300);
  }

  function showError(msg) {
    err.textContent = msg;
    err.hidden = false;
  }

  function clearError() {
    err.hidden = true;
  }

  // ---- sending -----------------------------------------------------------

  // Three seconds is right for a bug report and wrong for an argument, so a
  // room passes its own. It is still not zero: this writes to a node anyone
  // holding the code can write to.
  const COOLDOWN_MS = o.cooldown || 3000;

  function syncSendState() {
    sendBtn.disabled = sending || field.value.trim().length === 0;
  }

  async function doSend() {
    const text = field.value.trim();
    if (!text || sending) return;
    const since = Date.now() - lastSentAt;
    if (since < COOLDOWN_MS) {
      showError(t('chat.too-fast'));
      return;
    }
    sending = true;
    syncSendState();
    clearError();
    try {
      await o.transport.send(text.slice(0, 1000));
      lastSentAt = Date.now();
      field.value = '';
      autoGrow();
      if (o.onSend) o.onSend();
    } catch (e) {
      showError(
        e && e.message === 'chat/too-many'
          ? t('chat.too-many')
          : t('chat.send-failed'),
      );
    } finally {
      sending = false;
      syncSendState();
    }
  }

  // A one-row textarea that grows with the text, capped so a long message
  // scrolls instead of eating the thread above it.
  function autoGrow() {
    field.style.height = 'auto';
    // The field is border-box, and scrollHeight covers content plus padding but
    // not the border. Handing it straight back leaves the field a border short
    // of its own content, so it scrolls on a single word and Android draws a
    // scrollbar down the side of it. Desktop Chrome hides that behind overlay
    // scrollbars, which is why it went unseen.
    const borders = field.offsetHeight - field.clientHeight;
    field.style.height = Math.min(field.scrollHeight + borders, 120) + 'px';
  }

  field.addEventListener('input', () => { autoGrow(); syncSendState(); clearError(); });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && ENTER_SENDS) {
      e.preventDefault();
      doSend();
    }
  });
  sendBtn.addEventListener('click', doSend);

  // ---- keeping the sheet over what is actually on screen ------------------
  //
  // `position: fixed` anchors to the LAYOUT viewport, and opening a phone
  // keyboard does not shrink that: only the visual viewport shrinks. Safari
  // then scrolls to reveal the focused input, which drags the whole sheet up
  // and leaves a strip of the page showing underneath it, between the composer
  // and the keyboard.
  //
  // Pinning the backdrop to the visual viewport instead keeps it exactly over
  // the visible area, keyboard open or shut. On a desktop the two viewports
  // are the same, so this writes the values the CSS already produced.

  const vv = window.visualViewport;

  function fitViewport() {
    if (!vv) return;
    backdrop.style.top = vv.offsetTop + 'px';
    backdrop.style.left = vv.offsetLeft + 'px';
    backdrop.style.width = vv.width + 'px';
    backdrop.style.height = vv.height + 'px';
    // inset: 0 sets all four; the two that are not being driven have to give
    // way or they fight the width and height above.
    backdrop.style.right = 'auto';
    backdrop.style.bottom = 'auto';
    // The keyboard eats the bottom of the thread as it opens. Follow it down
    // so the newest message stays where the reader left it.
    if (nearBottom()) list.scrollTop = list.scrollHeight;
  }

  function releaseViewport() {
    for (const prop of ['top', 'left', 'width', 'height', 'right', 'bottom']) {
      backdrop.style[prop] = '';
    }
  }

  // ---- open / close ------------------------------------------------------

  function onKeydown(e) {
    if (e.key === 'Escape' && open) closePanel();
  }

  function openPanel() {
    if (open) return;
    open = true;
    lastReturnFocus = document.activeElement;
    backdrop.classList.add('open');
    // A paused CSS animation holds its FIRST frame, not its last, and this
    // one's first frame is the sheet sitting entirely below the screen. A tab
    // that is hidden when the panel opens freezes the animation clock and
    // would keep it there, so the arrival is a class rather than a rule and
    // the resting state never depends on it.
    if (docked) panel.classList.toggle('is-arriving', !document.hidden);
    syncLauncher();
    setUnread(0);
    clearError();
    if (!unsub) {
      unsub = o.transport.subscribe((messages) => {
        render(messages);
        if (open && o.transport.markSeen) o.transport.markSeen();
      });
    }
    if (o.transport.markSeen) o.transport.markSeen();
    document.addEventListener('keydown', onKeydown);
    if (vv) {
      fitViewport();
      vv.addEventListener('resize', fitViewport);
      vv.addEventListener('scroll', fitViewport);
    }
    playOpener();
    // The scroll has to wait for layout, or scrollHeight is still zero.
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
      // The docked panel is opened to READ. Taking focus would throw the
      // keyboard up over the sheet that was just asked for, and over the
      // board it is supposed to be sitting beside.
      if (!docked) field.focus();
    });
    if (o.onOpen) o.onOpen();
  }

  function closePanel() {
    if (!open) return;
    open = false;
    backdrop.classList.remove('open');
    panel.classList.remove('is-arriving');
    syncLauncher();
    document.removeEventListener('keydown', onKeydown);
    if (vv) {
      vv.removeEventListener('resize', fitViewport);
      vv.removeEventListener('scroll', fitViewport);
      releaseViewport();
    }
    if (lastReturnFocus && lastReturnFocus.focus) lastReturnFocus.focus();
  }

  // The pill is the way in and the way out is the panel's own close button, so
  // leaving it on screen underneath would be a second control for a thing that
  // is already open.
  function syncLauncher() {
    if (!launcher || o.launcher !== 'pill') return;
    launcher.hidden = !launcherWanted || open;
  }

  function setUnread(n) {
    unread = n;
    if (!dot) return;
    dot.hidden = !n;
    if (o.launcher !== 'pill') return;
    // Past nine the exact number stops being information and starts being a
    // wider pill. The count is there to say "go and look", not to be counted.
    dot.textContent = n > 9 ? '9+' : String(n);
    const label = o.launcherLabel || o.title;
    launcher.setAttribute('aria-label', n ? label + ', ' + plural('chat.unread', n) : label);
  }

  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePanel();
  });
  if (launcher) launcher.addEventListener('click', openPanel);

  // Counting unread means listening before anyone has opened anything. The
  // support panel does not do this on purpose: a visitor who never opens it
  // should never cost a listener.
  if (o.eager) {
    unsub = o.transport.subscribe((messages) => {
      render(messages);
      if (open && o.transport.markSeen) o.transport.markSeen();
    });
  }

  return {
    open: openPanel,
    close: closePanel,
    setUnread,
    isOpen: () => open,
    showLauncher(v) { launcherWanted = !!v; syncLauncher(); },
    destroy() {
      closePanel();
      // The greeting timers outlive the panel otherwise, and fire against a
      // list that is no longer in the document. Matters in the stats inbox,
      // which destroys one conversation to open the next.
      clearTimeout(typingTimer);
      if (unsub) { unsub(); unsub = null; }
      if (o.transport.close) o.transport.close();
      backdrop.remove();
      if ((o.launcher === 'sticky' || o.launcher === 'pill') && launcher) launcher.remove();
    },
  };
}
