// The language dropdown's two manners (#139).
//
// <details> already opens, closes and handles the keyboard on its own, so
// this adds only the two things it does not do: close when you tap somewhere
// else, and close on Escape. Everything here is an enhancement; with this
// file blocked or still loading the menu opens and navigates normally.
//
// A plain script, not a module, and it binds two document-level listeners
// rather than one per switcher, so a page with several costs the same as a
// page with one.
(function () {
  'use strict';

  function openOnes() {
    return document.querySelectorAll('details.lang-switch[open]');
  }

  // pointerdown, not click: a click fires after the pointer is released, so
  // a drag that starts inside the menu and ends outside it would close the
  // menu out from under the link the user is still on.
  document.addEventListener('pointerdown', function (e) {
    openOnes().forEach(function (d) {
      if (!d.contains(e.target)) d.open = false;
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    openOnes().forEach(function (d) {
      d.open = false;
      // Focus goes back to the control that opened it, or it lands on <body>
      // and a keyboard user has to tab in from the top of the page again.
      var s = d.querySelector('summary');
      if (s) s.focus();
    });
  });
})();
