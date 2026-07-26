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
// show how many hosts have registered — without storing any PII. We stamp
// users/<uid>/createdAt on first sight (the user's own node, allowed by the
// rules) and then bump an aggregate counter under analytics/hub/accounts.
// Production-only, mirroring the games' analytics gate, so dev and preview
// never inflate the count.
function acctAnalyticsEnabled() {
  try {
    if (window.Capacitor) return true;               // native app = real usage
    const h = location.hostname;
    return h === 'impostorgames.com' || h === 'www.impostorgames.com';
  } catch (e) { return false; }
}

async function recordAccountOnce(user) {
  if (!user || user.isAnonymous) return;
  if (!acctAnalyticsEnabled()) return;               // never count from dev/preview
  try {
    const db = getDatabase(app);
    const stamp = ref(db, 'users/' + user.uid + '/createdAt');
    const snap = await get(stamp);
    if (snap.exists()) return;                        // already counted this account
    await set(stamp, serverTimestamp());              // mark first, so we never double-count
    const day = new Date().toISOString().slice(0, 10);
    update(ref(db, 'analytics/hub/accounts'), {
      'total': increment(1),
      ['daily/' + day + '/count']: increment(1),
    }).catch(() => {});
  } catch (e) { /* accounting must never block sign-in */ }
}

// One module-level listener does the accounting on every signed-in load.
onAuthStateChanged(auth, u => { if (u) recordAccountOnce(u); });
