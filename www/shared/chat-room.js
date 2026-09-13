// ============================================================
// ROOM CHAT TRANSPORT — players <-> players
//
// Implements the transport contract in shared/chat.js against one room's
// `chat` node. The support transport next door talks to the developer; this
// one talks to whoever else is holding the same four-character code.
//
// Everything the support version has to look after is gone here:
//
//   - NO THREAD ID. The room code addresses the conversation, so the whole
//     localStorage dance around an unguessable id has nothing to do.
//   - NO READ MARKER. Nobody comes back to a room chat later. The room is
//     deleted minutes after the last player leaves, so "have I seen this" only
//     has to survive until the panel is opened, which is memory, not storage.
//   - THE NAME AND FACE TRAVEL ON THE MESSAGE. A player who quits mid-round is
//     gone from `players` but their accusation is still on screen and still
//     has to be attributable. Looking either up at render time would leave it
//     blank for exactly the person the room is arguing about.
//
// What is kept is the daily cap. Rules cannot express rate limiting, for the
// same reason spelled out in database.rules.json, and a room being open to
// anyone with the code is precisely why the client carries one.
// ============================================================

import {
  ref, push, update, onValue,
  query, limitToLast, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const QUOTA_KEY = 'imp_room_chat_quota';

// Higher than the support cap, because this is a conversation rather than a
// bug report and several rounds in an evening is normal play. Still low enough
// that a stuck loop stops being our storage bill.
const DAILY_CAP = 200;

// A room lives about as long as one game. Older messages than this are from a
// round nobody is still arguing about, and loading them would make a player
// who joined late pay for a backlog they cannot follow.
const WINDOW = 60;

function todayKey() { return new Date().toISOString().slice(0, 10); }

function readQuota() {
  let q = null;
  try { q = JSON.parse(localStorage.getItem(QUOTA_KEY)); } catch (e) { /* corrupt */ }
  if (!q || q.d !== todayKey()) q = { d: todayKey(), n: 0 };
  return q;
}

function bumpQuota() {
  const q = readQuota();
  q.n += 1;
  try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch (e) { /* private mode */ }
}

/**
 * @param {object} o
 * @param {object} o.db      RTDB handle from shared/firebase.js
 * @param {string} o.code    room code
 * @param {string} o.me      this player's id, written as `from`
 * @param {Function} o.name  () => string, read at send time rather than at
 *                           mount, because a player can rename themselves in
 *                           the lobby after the panel already exists
 * @param {Function} o.av    () => number, the player's avatar id, 0 for none
 */
export function createRoomTransport(o) {
  const db = o.db;
  const base = `rooms-word/${o.code}`;
  let sub = null;

  return {
    subscribe(cb) {
      const q = query(ref(db, `${base}/chat`), limitToLast(WINDOW));
      sub = onValue(q, (snap) => {
        const out = [];
        snap.forEach((c) => {
          const v = c.val() || {};
          out.push({
            id: c.key,
            from: v.from,
            name: v.name || '',
            av: v.av || 0,
            text: v.text || '',
            ts: v.ts || null,
          });
        });
        cb(out);
      });
      return () => { if (sub) { sub(); sub = null; } };
    },

    async send(text) {
      if (readQuota().n >= DAILY_CAP) throw new Error('chat/too-many');
      const mid = push(ref(db, `${base}/chat`)).key;
      // lastActivity moves with the message, so a room where people are
      // talking in the lobby is not swept up as idle mid-sentence.
      await update(ref(db, base), {
        [`chat/${mid}`]: {
          from: o.me,
          name: (o.name && o.name()) || '?',
          av: (o.av && o.av()) || 0,
          text,
          ts: serverTimestamp(),
        },
        'meta/lastActivity': serverTimestamp(),
      });
      bumpQuota();
    },

    // Nothing to write. Read state is per device and dies with the room.
    markSeen() {},

    close() { if (sub) { sub(); sub = null; } },
  };
}
