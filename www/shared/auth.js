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

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Same public config the games already use. Kept here so auth works even on
// pages that have not initialised Firebase themselves (e.g. the hub).
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDhDgQlJX8nM4IsGdEYNItHzZ2LjbIDIH0",
  authDomain: "imposter-20b85.firebaseapp.com",
  databaseURL: "https://imposter-20b85-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "imposter-20b85",
  storageBucket: "imposter-20b85.firebasestorage.app",
  messagingSenderId: "689271207746",
  appId: "1:689271207746:web:762f2f40b378e3a6d27adb",
};

// Reuse whatever default app a page already created; otherwise create it. This
// keeps auth.js and each page's own initializeApp() from clashing regardless of
// import order.
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
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
