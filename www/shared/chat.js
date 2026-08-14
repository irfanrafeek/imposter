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

function icon(paths, size) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
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
 * @param {'sticky'|Element|null} o.launcher  how the panel is opened
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

  // Ids already on screen. The transport hands us the whole thread on every
  // change; appending only what is new keeps scroll position and text
  // selection intact, which a full re-render would destroy on every keystroke
  // the other side types.
  const drawn = new Set();
  let lastDay = null;
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
  } else if (o.launcher instanceof Element) {
    launcher = o.launcher;
  }

  // ---- panel -------------------------------------------------------------

  const backdrop = el('div', 'chat-backdrop');
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', o.title);

  const panel = el('div', 'chat-panel');

  const header = el('div', 'chat-header');
  header.appendChild(el('h2', 'chat-title', o.title));
  const closeBtn = el('button', 'chat-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
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
  field.placeholder = o.placeholder || 'Write a message…';
  field.setAttribute('aria-label', 'Message');
  const sendBtn = el('button', 'chat-send');
  sendBtn.type = 'button';
  sendBtn.setAttribute('aria-label', 'Send');
  sendBtn.disabled = true;
  sendBtn.appendChild(icon(['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'], 20));
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

      const day = m.ts ? dayLabel(m.ts) : null;
      if (day && day !== lastDay) {
        lastDay = day;
        list.appendChild(el('div', 'chat-day', day));
      }

      // Only messages that turn up while the panel is open get the arrival
      // animation. Animating the backlog on open would be a wall of movement.
      const isNew = !firstBatch && m.from !== me;
      const row = el('div', 'chat-row ' + (m.from === me ? 'is-me' : 'is-them') + (isNew ? ' chat-arrive' : ''));
      const bubble = el('div', 'chat-bubble', m.text);
      if (m.name && m.from !== me) bubble.prepend(el('span', 'chat-who', m.name));
      row.appendChild(bubble);
      const t = timeLabel(m.ts);
      if (t) row.appendChild(el('div', 'chat-time', t));
      list.appendChild(row);
    }
    firstBatch = false;
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
      dots.setAttribute('aria-label', 'typing');
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

  const COOLDOWN_MS = 3000;

  function syncSendState() {
    sendBtn.disabled = sending || field.value.trim().length === 0;
  }

  async function doSend() {
    const text = field.value.trim();
    if (!text || sending) return;
    const since = Date.now() - lastSentAt;
    if (since < COOLDOWN_MS) {
      showError('One moment, that was a little too fast.');
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
          ? 'That is a lot of messages for one day. Try again tomorrow.'
          : 'Could not send. Please try again.',
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
    field.style.height = Math.min(field.scrollHeight, 120) + 'px';
  }

  field.addEventListener('input', () => { autoGrow(); syncSendState(); clearError(); });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && ENTER_SENDS) {
      e.preventDefault();
      doSend();
    }
  });
  sendBtn.addEventListener('click', doSend);

  // ---- open / close ------------------------------------------------------

  function onKeydown(e) {
    if (e.key === 'Escape' && open) closePanel();
  }

  function openPanel() {
    if (open) return;
    open = true;
    lastReturnFocus = document.activeElement;
    backdrop.classList.add('open');
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
    playOpener();
    // The scroll has to wait for layout, or scrollHeight is still zero.
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
      field.focus();
    });
    if (o.onOpen) o.onOpen();
  }

  function closePanel() {
    if (!open) return;
    open = false;
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', onKeydown);
    if (lastReturnFocus && lastReturnFocus.focus) lastReturnFocus.focus();
  }

  function setUnread(n) {
    if (!dot) return;
    dot.hidden = !n;
  }

  closeBtn.addEventListener('click', closePanel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePanel();
  });
  if (launcher) launcher.addEventListener('click', openPanel);

  return {
    open: openPanel,
    close: closePanel,
    setUnread,
    isOpen: () => open,
    destroy() {
      closePanel();
      // The greeting timers outlive the panel otherwise, and fire against a
      // list that is no longer in the document. Matters in the stats inbox,
      // which destroys one conversation to open the next.
      clearTimeout(typingTimer);
      if (unsub) { unsub(); unsub = null; }
      if (o.transport.close) o.transport.close();
      backdrop.remove();
      if (o.launcher === 'sticky' && launcher) launcher.remove();
    },
  };
}
