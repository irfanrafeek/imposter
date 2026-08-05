import globals from 'globals';

// A name-checker, not a style checker.
//
// This exists because of one bug class that cost us two weeks of broken
// rounds in production: `startPlayback` referenced `meta`, which a refactor
// had removed, and `groupMode`, which was never destructured. Both lines read
// perfectly. The file parsed, the app booted, and the browser console stayed
// empty, because the throw happened inside a setInterval, where a failed tick
// is silently discarded and the next one is scheduled anyway.
//
// `no-undef` reads the code without running it and catches exactly that.
// Deliberately nothing else is switched on: no formatting rules, no opinions
// about style. Every finding here should be a real bug, so that a clean run
// means something and a red run is never noise to be scrolled past.
//
// Run it with `npm run lint`.

export default [
  {
    // Vendored minified library. Not ours to fix, and its UMD wrapper trips
    // no-undef on `define` and `module` by design.
    ignores: ['www/shared/qrcode.js', 'node_modules/**', 'android/**'],
  },
  {
    // The games and shared modules: ES modules running in a browser.
    files: ['www/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: { 'no-undef': 'error' },
  },
  {
    // Maintenance scripts: ES modules running in Node.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: { 'no-undef': 'error' },
  },
];
