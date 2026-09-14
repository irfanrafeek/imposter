// ============================================================
// SHARED FIREBASE BOOTSTRAP
// One Firebase app + RTDB handle for every page (hub, games, stats,
// auth). ES modules are singletons: no matter how many files import
// this, initializeApp runs at most once, so pages that also load
// auth.js can never double-init. Keep every consumer on the SAME SDK
// version as below — mixing versions creates parallel module
// instances whose app/db handles reject each other.
// ============================================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Replace with your project's config. See README.md for setup.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDhDgQlJX8nM4IsGdEYNItHzZ2LjbIDIH0",
  authDomain: "imposter-20b85.firebaseapp.com",
  databaseURL: "https://imposter-20b85-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "imposter-20b85",
  storageBucket: "imposter-20b85.firebasestorage.app",
  messagingSenderId: "689271207746",
  appId: "1:689271207746:web:762f2f40b378e3a6d27adb",
};
export const FB_CONFIGURED = !FIREBASE_CONFIG.apiKey.includes("REPLACE_ME");

// Both stay null when unconfigured or init fails; every caller already
// guards with `if (!db)`, so a broken init degrades to offline mode
// instead of taking the whole page down.
export let app = null;
export let db = null;

// localhost, and only with ?emu=1 on the URL. Sends this page at the local
// emulator suite instead of the real project, which is the only way to try a
// change to database.rules.json before it is deployed to everyone (#267).
//
// Only the database half is here. The auth half is in auth.js, next to the
// getAuth() call it has to run before, and it reads the flag below. Both are
// needed: without the auth emulator the page signs in against the real
// project, the database emulator sees a uid it cannot verify, and every rule
// that reads auth.uid fails in a way that has nothing to do with the rules
// you came to test.
//
// Safe to ship: `localhost` is never the live hostname, so the branch cannot
// be reached in production, and connectDatabaseEmulator comes out of a module
// the page already loads.
//
//   JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
//     firebase emulators:start --only database,auth
//   http://localhost:8123/word/?emu=1
export const EMULATED = (() => {
  try {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local && new URLSearchParams(location.search).get('emu') === '1';
  } catch (e) { return false; }
})();

if (FB_CONFIGURED) {
  try {
    app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    db = getDatabase(app);
    if (EMULATED) {
      connectDatabaseEmulator(db, '127.0.0.1', 9000);
      console.warn('Firebase: talking to the local emulators, not the real project.');
    }
  } catch (e) {
    console.error('Firebase init failed:', e);
  }
}
