/* Shared tap feedback.
   Mobile browsers fire :active unreliably — they cancel it the moment a
   finger drifts a pixel (guessing you meant to scroll), so a quick tap often
   shows nothing. We drive the pressed state ourselves with pointer events and
   toggle an .is-pressed class the CSS animates. One delegated listener covers
   every button, including ones rendered later. */
(function () {
  'use strict';
  var SELECTOR = '.btn, .tile, .vote-row, .game-card, .pill-btn';
  var held = null;

  function release() {
    if (held) { held.classList.remove('is-pressed'); held = null; }
  }

  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest(SELECTOR);
    if (!el || el.disabled) return;
    release();
    held = el;
    el.classList.add('is-pressed');
  }, { passive: true });

  // Finger slid off the button before lifting — drop the visual.
  document.addEventListener('pointermove', function (e) {
    if (held && e.target.closest(SELECTOR) !== held) release();
  }, { passive: true });

  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('blur', release);
})();
