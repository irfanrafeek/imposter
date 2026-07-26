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
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
if (FB_CONFIGURED) {
  try {
    app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    db = getDatabase(app);
  } catch (e) {
    console.error('Firebase init failed:', e);
  }
}
