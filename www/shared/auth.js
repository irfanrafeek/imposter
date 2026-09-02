// Shared, hub-level authentication for Impostor Games.
//
// DOM-free auth logic used across dance, word, and the hub. Sign-in is NOT a
// wall in front of the game — it exists so a host can create and reuse their
// own Song Groups. Everything here is safe to import on any page; it only
// initialises Firebase Auth, never gates anything on its own.
//
// Providers: Google popup (with redirect fallback for in-app WebViews) and
// passwordless email magic-link. Apple is added later with the iOS build.
//
// Auth state persists per-origin (Firebase default), so signing in on one page
// under impostorgames.com is visible on every other page automatically.

import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  deleteUser, reauthenticateWithPopup,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, remove, get, set, update, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
// Config + app singleton live in shared/firebase.js so every page (and this
// module) shares one Firebase app, whatever the import order.
import { app } from "./firebase.js";
// Coarse geo and the production gate are shared with the game counters, so
// an account number and a visit number can never disagree about where a
// player is or about what counts as real usage.
import { analyticsEnabled, peekGeo, fetchGeo, safeKey, todayKey } from "./analytics.js";

const auth = getAuth(app);

// Keep the user signed in across visits (this is the whole point — reuse across
// gatherings). browserLocalPersistence is the default, but set it explicitly so
// intent is clear and WebViews behave.
setPersistence(auth, browserLocalPersistence).catch(() => {});

const EMAIL_KEY = 'imp_email_for_signin';

// --- state ---------------------------------------------------------------

export function currentUser() { return auth.currentUser; }

// Subscribe to sign-in/out. Returns an unsubscribe function.
export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }

// --- Google --------------------------------------------------------------

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    // Popups are blocked or unsupported inside some in-app / WebView browsers;
    // fall back to a full-page redirect there.
    const code = e && e.code;
    if (code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

// --- email magic-link ----------------------------------------------------

export async function sendEmailLink(email) {
  const actionCodeSettings = {
    // Return to the same page; completeEmailLinkSignIn() finishes it on load.
    url: location.origin + location.pathname,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  try { window.localStorage.setItem(EMAIL_KEY, email); } catch (e) {}
}

// Call once on page load. If the URL is an email sign-in link, complete it and
// tidy the URL. Returns the user credential, or null if there was nothing to do.
export async function completeEmailLinkSignIn() {
  try {
    if (!isSignInWithEmailLink(auth, location.href)) return null;
    let email = null;
    try { email = window.localStorage.getItem(EMAIL_KEY); } catch (e) {}
    // Opened the link on a different device/browser than it was requested on.
    if (!email) email = window.prompt('Confirm your email to finish signing in');
    if (!email) return null;
    const res = await signInWithEmailLink(auth, email, location.href);
    try { window.localStorage.removeItem(EMAIL_KEY); } catch (e) {}
    try { history.replaceState(null, '', location.origin + location.pathname); } catch (e) {}
    return res;
  } catch (e) {
    console.error('Email-link sign-in failed:', e);
    return null;
  }
}

// Resolve a pending Google redirect sign-in (no-op for the popup path). Safe to
// call on every load; swallows the "no redirect in progress" case.
export async function completeRedirectSignIn() {
  try { return await getRedirectResult(auth); } catch (e) { return null; }
}

// --- sign out ------------------------------------------------------------

export function signOut() { return fbSignOut(auth); }

// --- delete account ------------------------------------------------------

// Permanently delete the signed-in user: first remove everything they own
// under users/<uid> (while still authenticated — the rules require it), then
// delete the Firebase Auth user. Firebase requires a recent login before
// deleting an account; for Google we re-auth inline via popup and retry. For
// email-link users who need re-auth, the owned data is already gone and we
// surface a 'needs-resignin' error so the UI can ask them to sign in again and
// retry (remove() is idempotent, so the second pass just deletes the account).
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) { const e = new Error('not-signed-in'); e.code = 'not-signed-in'; throw e; }

  const db = getDatabase(app);
  await remove(ref(db, 'users/' + user.uid));

  try {
    await deleteUser(user);
  } catch (e) {
    if (e && e.code === 'auth/requires-recent-login') {
      const providerId = (user.providerData[0] && user.providerData[0].providerId) || '';
      if (providerId === 'google.com') {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
        await deleteUser(user);
      } else {
        const err = new Error('needs-resignin'); err.code = 'needs-resignin'; throw err;
      }
    } else {
      throw e;
    }
  }
}

// --- account counting (aggregate, cookie-free) ---------------------------

// Count each account once, the first time it signs in, so the stats page can
// show how many hosts have registered, without storing any PII. We stamp
// users/<uid>/createdAt on first sight (the user's own node, allowed by the
// rules) and then bump an aggregate counter under analytics/hub/accounts.
// Production-only, through the games' own analytics gate, so dev and preview
// never inflate the count. This module used to carry its own copy of that
// gate; it now imports the one in shared/analytics.js, which it depends on
// anyway for geo (#194).
//
// The stats dashboard is excluded on top of the gate. It is served from the
// production hostname and it mounts the account button, so without this
// every read of the numbers would write to the numbers.
function acctCountable() {
  if (!analyticsEnabled()) return false;
  try { if (/(^|\/)stats(\.html)?$/.test(location.pathname)) return false; } catch (e) {}
  return true;
}

async function recordAccountOnce(user) {
  if (!user || user.isAnonymous) return;
  if (!acctCountable()) return;                     // never count from dev/preview
  try {
    const db = getDatabase(app);
    const stamp = ref(db, 'users/' + user.uid + '/createdAt');
    const snap = await get(stamp);
    if (snap.exists()) return;                        // already counted this account
    await set(stamp, serverTimestamp());              // mark first, so we never double-count
    const day = todayKey();
    const u = {
      'total': increment(1),
      ['daily/' + day + '/count']: increment(1),
    };
    // Where the account was created (#195). This one can never be
    // backfilled, for the reason written under the session counter below:
    // the stamp we just wrote is what keeps an account out of here forever
    // after, so accounts/countries only ever describes accounts created
    // from the day it shipped and will always total less than
    // accounts/total. The panel says so.
    let geo = peekGeo();
    if (!geo || !geo.cc) { try { geo = await fetchGeo(); } catch (e) {} }
    if (geo && geo.cc) {
      const cc = safeKey(geo.cc);
      u['countries/' + cc] = increment(1);
      u['daily/' + day + '/countries/' + cc] = increment(1);
    }
    update(ref(db, 'analytics/hub/accounts'), u).catch(() => {});
  } catch (e) { /* accounting must never block sign-in */ }
}

// --- signed-in sessions, by country (#194) -------------------------------

// WHY THERE ARE TWO COUNTERS AND NOT ONE. accounts/countries above answers
// where new accounts are CREATED, and it can never be backfilled:
// recordAccountOnce is guarded by users/<uid>/createdAt, so every account that
// already exists never passes through it again, and Firebase Auth stores no
// country to recover. It started at zero and fills one signup at a time.
//
// This one counts SESSIONS. One bump per browser session in which a signed-in
// user loads a page, deduped exactly the way trackSession dedupes a visit. It
// includes every account that already exists, so it read on day one, which is
// the whole reason it shipped first.
//
// Read together: accounts/countries is acquisition, accounts/seen is where the
// signed-in audience actually is. They will not agree, and the disagreement is
// the interesting part.
//
// The cost, and the reason the panel says so: this is sessions, not people.
// Someone who opens the app daily contributes thirty a month, so the shape is
// "where signed-in usage happens", not "where our users live".
const SEEN_KEY = 'imp_acct_sess';

async function recordSignedInSession(user) {
  if (!user || user.isAnonymous) return;
  if (!acctCountable()) return;
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return;
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch (e) {}
  try {
    const db = getDatabase(app);
    const day = todayKey();
    const u = {
      'seen/total': increment(1),
      ['seen/daily/' + day + '/count']: increment(1),
    };
    // trackSession is resolving the same country on this load, so the cache
    // is usually already warm and this costs nothing. On a first-ever visit
    // the two race, and fetchGeo hands both callers one shared request.
    let geo = peekGeo();
    if (!geo || !geo.cc) { try { geo = await fetchGeo(); } catch (e) {} }
    if (geo && geo.cc) {
      const cc = safeKey(geo.cc);
      u['seen/countries/' + cc] = increment(1);
      u['seen/daily/' + day + '/countries/' + cc] = increment(1);
    }
    update(ref(db, 'analytics/hub/accounts'), u).catch(() => {});
  } catch (e) { /* accounting must never block sign-in */ }
}

// One module-level listener does the accounting on every signed-in load.
// Both calls are safe to repeat: the first is guarded by a node in the
// database, the second by sessionStorage, so a token refresh or a sign-out
// and back in within one session adds nothing.
onAuthStateChanged(auth, u => {
  if (!u) return;
  recordAccountOnce(u);
  recordSignedInSession(u);
});
