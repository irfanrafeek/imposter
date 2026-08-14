// ============================================================
// SUPPORT CHAT TRANSPORT — visitor <-> developer
//
// Implements the transport contract in shared/chat.js against RTDB, for the
// one thread this browser owns. The visitor is NOT signed in (anonymous auth
// is deliberately off), so the thread is addressed by an unguessable id kept
// in localStorage and nowhere else. Losing that id — cleared storage, a new
// phone — starts a fresh thread, which is the accepted cost of asking nobody
// to sign in before reporting a bug.
//
// The same factory serves both ends. role:'user' manages the id and treats
// 'dev' messages as incoming; role:'dev' is handed a thread id by the
// stats.html inbox and treats them the other way round.
//
// Read state is asymmetric on purpose. The visitor's marker lives in
// localStorage because "have I seen this" is per-device by definition and
// writing it would be a round trip that buys nothing. The developer's marker
// (meta/devSeenAt) has to be in the database, because the inbox is read from
// more than one machine.
// ============================================================

import {
  ref, child, push, update, get, onValue,
  query, limitToLast, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const TID_KEY = 'imp_chat_tid';
const SEEN_KEY = 'imp_chat_seen';
const EMAIL_KEY = 'imp_chat_email';
const QUOTA_KEY = 'imp_chat_quota';

// Enough that nobody writing in good faith will ever meet it, low enough that
// a stuck loop or a bored teenager stops being our storage bill. Rules cannot
// express this; see the note in database.rules.json.
const DAILY_CAP = 30;

// Only the newest slice is loaded. A support thread that ran past 200 messages
// stopped being a support thread some time ago.
const WINDOW = 200;

function ls(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) { /* private mode */ }
}

// crypto.randomUUID needs a secure context and Safari 15.4+. Everything else
// falls back to the same 122 bits assembled by hand rather than to Math.random,
// which would make the id guessable and the thread readable by strangers.
function newThreadId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return null;
  }
}

function todayKey() { return new Date().toISOString().slice(0, 10); }

function readQuota() {
  let q = null;
  try { q = JSON.parse(ls(QUOTA_KEY)); } catch (e) { /* corrupt, start over */ }
  if (!q || q.d !== todayKey()) q = { d: todayKey(), n: 0 };
  return q;
}

// Counted on success only. A send the database rejected cost us no storage, so
// charging a dropped connection against someone's daily allowance would punish
// the one case that is definitely not abuse.
function bumpQuota() {
  const q = readQuota();
  q.n += 1;
  lsSet(QUOTA_KEY, JSON.stringify(q));
}

/**
 * @param {object} o
 * @param {object} o.db        RTDB handle from shared/firebase.js
 * @param {'user'|'dev'} o.role
 * @param {string} [o.tid]     required for role 'dev'
 * @param {string} [o.source]  'hub' | 'word' | 'dance' | 'draw' (role 'user')
 * @param {Function} [o.meta]  () => ({ country, countryCode, version }), read
 *                             lazily so geo lookups that are still in flight at
 *                             page load are not baked in as null
 */
export function createSupportTransport(o) {
  const db = o.db;
  const isDev = o.role === 'dev';
  let tid = isDev ? o.tid : ls(TID_KEY);
  let persisted = !!tid; // is `tid` written down, or only generated in memory?
  let sub = null;        // active onValue unsubscribe
  let pendingCb = null;  // subscriber waiting for a thread to exist

  function threadRef() { return ref(db, `chats/${tid}`); }

  function attach(cb) {
    const q = query(child(threadRef(), 'messages'), limitToLast(WINDOW));
    return onValue(q, (snap) => {
      const out = [];
      snap.forEach((c) => {
        const v = c.val() || {};
        out.push({ id: c.key, from: v.from, text: v.text || '', ts: v.ts || null });
      });
      // Newest message time doubles as the visitor's read marker while the
      // panel is open, so a reply read now is not still unread on reload.
      if (!isDev && out.length) {
        const newest = out[out.length - 1];
        if (newest.ts) lsSet(SEEN_KEY, String(newest.ts));
      }
      cb(out);
    });
  }

  return {
    subscribe(cb) {
      if (!tid) {
        // No thread yet — nothing to listen to. Remember the subscriber so the
        // first send can wire it up without the caller re-subscribing.
        pendingCb = cb;
        cb([]);
        return () => { pendingCb = null; };
      }
      sub = attach(cb);
      return () => { if (sub) { sub(); sub = null; } };
    },

    async send(text) {
      // "Fresh" tracks whether the id has been WRITTEN DOWN, not whether one
      // has been generated. A first send that fails leaves an id in memory and
      // nothing in localStorage; inferring from `tid` alone would make the
      // retry look like an established thread, and the id would never be
      // persisted at all — messages in the database that this browser could
      // never find again. The generated id is deliberately reused on retry, so
      // a flaky connection produces one thread rather than one per attempt.
      const fresh = !persisted;
      if (!isDev) {
        if (readQuota().n >= DAILY_CAP) throw new Error('chat/too-many');
        if (!tid) {
          tid = newThreadId();
          if (!tid) throw new Error('chat/no-crypto');
        }
      }

      const mid = push(child(threadRef(), 'messages')).key;
      const updates = {
        [`messages/${mid}`]: {
          from: isDev ? 'dev' : 'user',
          text,
          ts: serverTimestamp(),
        },
        'meta/lastMsgAt': serverTimestamp(),
        'meta/lastFrom': isDev ? 'dev' : 'user',
      };
      if (isDev) {
        updates['meta/devSeenAt'] = serverTimestamp();
      } else {
        const m = (o.meta && o.meta()) || {};
        // Stamped on every message, not just the first: a visitor who comes
        // back a month later on a new version is telling us something, and the
        // thread would otherwise still claim the version they first wrote from.
        updates['meta/source'] = o.source || 'hub';
        if (m.version) updates['meta/version'] = m.version;
        if (m.country) updates['meta/country'] = m.country;
        if (m.countryCode) updates['meta/countryCode'] = m.countryCode;
        const email = ls(EMAIL_KEY);
        if (email) updates['meta/email'] = email;
        if (fresh) updates['meta/createdAt'] = serverTimestamp();
      }

      await update(threadRef(), updates);
      if (!isDev) bumpQuota();

      // The id is only remembered once the write has landed. Storing it first
      // would leave a dangling id pointing at a thread that does not exist
      // whenever the very first message fails.
      if (fresh && !isDev) {
        persisted = true;
        lsSet(TID_KEY, tid);
        if (pendingCb) { sub = attach(pendingCb); pendingCb = null; }
      }
    },

    markSeen() {
      if (!tid) return;
      if (isDev) {
        update(threadRef(), { 'meta/devSeenAt': serverTimestamp() }).catch(() => {});
      } else {
        lsSet(SEEN_KEY, String(Date.now()));
      }
    },

    // Cheap enough to run on page load: one read of a handful of fields, and
    // only for visitors who already have a thread. First-time visitors never
    // touch the network for this.
    async hasUnread() {
      if (!tid || isDev) return false;
      try {
        const snap = await get(child(threadRef(), 'meta'));
        const m = snap.val();
        if (!m || m.lastFrom !== 'dev') return false;
        return (m.lastMsgAt || 0) > (parseInt(ls(SEEN_KEY), 10) || 0);
      } catch (e) {
        return false;
      }
    },

    getEmail() { return ls(EMAIL_KEY) || ''; },

    setEmail(v) {
      lsSet(EMAIL_KEY, v);
      // Backfill an existing thread so a reply address given after the first
      // message still reaches the inbox.
      if (tid && v) update(threadRef(), { 'meta/email': v }).catch(() => {});
    },

    close() { if (sub) { sub(); sub = null; } },
  };
}
