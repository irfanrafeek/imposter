// ============================================================
// THE TURN CLOCK YOU CAN HEAR
// ============================================================
// One sound, and a button to silence it: a tick a second while the turn is
// yours, going quiet the moment it is not. Synthesised rather than loaded, so
// there is no asset to fetch, nothing to fail offline, and no licence to worry
// about.
//
// Shared rather than copied (#254). It began in the drawing game, and the word
// game's clue board wants exactly the same clock: same pitches, same decay,
// same mute button. Two of those drifting apart would be two different games
// telling a player the same thing in two voices.
//
// No t() in here on purpose. Every file in www/shared is scanned for keys
// against EVERY page's bundle, so a string named here would have to exist on
// the hub and the dance page too, neither of which has a clock. The caller
// hands in its own label instead.

export function createTurnClock(opts) {
  const storageKey = opts.storageKey;
  const btn = opts.button || null;
  const labelFor = opts.label || (() => '');

  let muted = false;
  try { muted = localStorage.getItem(storageKey) === '1'; } catch (e) {}

  let audioCtx = null;

  // Browsers refuse to start audio without a gesture, so the context is built
  // on the first tap anywhere and kept for the session. Every player has
  // tapped something (Ready, Join, Start) long before a turn is theirs.
  function ensureAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  document.addEventListener('pointerdown', ensureAudio, { passive: true });

  // Tick and tock at two pitches, because a clock that only ticks sounds like
  // a fault rather than a countdown.
  function playTick(high) {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(high ? 1180 : 880, t);
    // Struck, not held: full level instantly, then a 40ms decay to nothing.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // The second the last tick was played for, so a 250ms ticker only sounds
  // once per second. -1 means "not my turn", which also makes the first tick
  // of a turn fire the instant it arrives.
  let lastSecond = -1;

  function tick(secondsLeft) {
    if (secondsLeft === lastSecond) return;
    lastSecond = secondsLeft;
    if (secondsLeft > 0) playTick(secondsLeft % 2 === 0);
  }

  function reset() { lastSecond = -1; }

  const ICON_ON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function render() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', labelFor(muted));
    btn.innerHTML = muted ? ICON_OFF : ICON_ON;
  }

  if (btn) {
    btn.addEventListener('click', () => {
      muted = !muted;
      try { localStorage.setItem(storageKey, muted ? '1' : '0'); } catch (e) {}
      render();
      if (!muted) playTick(true);   // so you hear what you just turned on
    });
    render();
  }

  return { tick, reset, render, playTick };
}
