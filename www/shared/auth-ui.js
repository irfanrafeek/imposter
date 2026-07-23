// Shared sign-in UI for Impostor Games: a drop-in modal + an account button.
//
// Any page imports this, calls initAuthUI() once, and mounts an account button
// wherever it likes. The modal DOM and styles are injected on demand so there is
// no markup to duplicate across dance / word / hub. Styles lean on the site's
// CSS custom properties (--card, --ink, ...) with fallbacks, so it inherits each
// page's look.

import {
  currentUser, onAuthChange, signInWithGoogle, sendEmailLink,
  completeEmailLinkSignIn, completeRedirectSignIn, signOut,
} from './auth.js';

let stylesInjected = false;
let modalEl = null;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .imp-auth-backdrop{position:fixed;inset:0;z-index:1000;display:none;
    align-items:center;justify-content:center;padding:20px;
    background:rgba(20,16,12,.45);backdrop-filter:blur(2px)}
  .imp-auth-backdrop.open{display:flex}
  .imp-auth-sheet{background:var(--card,#fff);color:var(--ink,#2a2520);
    width:100%;max-width:360px;border-radius:20px;padding:24px 22px 20px;
    box-shadow:0 20px 60px rgba(42,37,32,.25);position:relative;
    font-family:Inter,-apple-system,system-ui,sans-serif}
  .imp-auth-close{position:absolute;top:12px;right:14px;border:0;background:none;
    font-size:26px;line-height:1;color:var(--ink-soft,#8a7e6f);cursor:pointer}
  .imp-auth-sheet h2{margin:2px 0 6px;font-size:22px;font-weight:700}
  .imp-auth-sub{margin:0 0 18px;font-size:14px;color:var(--ink-soft,#8a7e6f);line-height:1.4}
  .imp-auth-btn{width:100%;border-radius:12px;padding:13px 16px;font-size:15px;
    font-weight:600;cursor:pointer;border:1px solid transparent;
    font-family:inherit;display:flex;align-items:center;justify-content:center;gap:10px}
  .imp-auth-google{background:#fff;color:#3c4043;border-color:#dadce0;margin-bottom:4px}
  .imp-auth-google:active{background:#f7f8f8}
  .imp-auth-or{display:flex;align-items:center;gap:12px;margin:14px 0;
    color:var(--ink-soft,#8a7e6f);font-size:12px}
  .imp-auth-or::before,.imp-auth-or::after{content:"";flex:1;height:1px;
    background:var(--bg-soft,#eee)}
  .imp-auth-email-form{display:flex;flex-direction:column;gap:8px}
  .imp-auth-email{width:100%;border-radius:12px;padding:12px 14px;font-size:15px;
    border:1px solid var(--bg-soft,#e2dccd);background:var(--bg,#fbf8f3);
    color:var(--ink,#2a2520);font-family:inherit}
  .imp-auth-email-send{background:var(--ink,#1a2530);color:#fff}
  .imp-auth-email-send:active{opacity:.9}
  .imp-auth-msg{margin:12px 0 0;font-size:13px;line-height:1.4;min-height:1px;
    color:var(--ink-soft,#8a7e6f)}
  .imp-auth-msg.err{color:#c0392b}
  .imp-auth-account{border:1px solid var(--bg-soft,#e2dccd);background:var(--card,#fff);
    color:var(--ink,#2a2520);border-radius:999px;padding:7px 14px;font-size:13px;
    font-weight:600;cursor:pointer;font-family:Inter,-apple-system,system-ui,sans-serif;
    max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .imp-auth-account:active{transform:scale(.98)}
  .imp-auth-menu{position:absolute;z-index:1001;background:var(--card,#fff);
    border:1px solid var(--bg-soft,#e2dccd);border-radius:14px;padding:6px;
    box-shadow:0 12px 36px rgba(42,37,32,.16);min-width:180px;display:none;
    font-family:Inter,-apple-system,system-ui,sans-serif}
  .imp-auth-menu.open{display:block}
  .imp-auth-menu .who{padding:8px 10px 10px;font-size:12px;color:var(--ink-soft,#8a7e6f);
    border-bottom:1px solid var(--bg-soft,#eee);word-break:break-all}
  .imp-auth-menu button{width:100%;text-align:left;border:0;background:none;
    padding:10px;border-radius:8px;font-size:14px;cursor:pointer;color:var(--ink,#2a2520);
    font-family:inherit}
  .imp-auth-menu button:active{background:var(--bg,#f5f0e8)}
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

function buildModal() {
  if (modalEl) return modalEl;
  injectStyles();
  const el = document.createElement('div');
  el.className = 'imp-auth-backdrop';
  el.innerHTML = `
    <div class="imp-auth-sheet" role="dialog" aria-modal="true" aria-labelledby="imp-auth-title">
      <button class="imp-auth-close" aria-label="Close">&times;</button>
      <h2 id="imp-auth-title">Sign in</h2>
      <p class="imp-auth-sub">Create your own song groups and reuse them at your next gathering.</p>
      <button class="imp-auth-btn imp-auth-google" type="button">Continue with Google</button>
      <div class="imp-auth-or"><span>or</span></div>
      <form class="imp-auth-email-form">
        <input class="imp-auth-email" type="email" inputmode="email" autocomplete="email"
               placeholder="you@email.com" aria-label="Email address" required>
        <button class="imp-auth-btn imp-auth-email-send" type="submit">Email me a link</button>
      </form>
      <p class="imp-auth-msg" role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(el);
  modalEl = el;

  const msg = el.querySelector('.imp-auth-msg');
  const setMsg = (t, isErr) => { msg.textContent = t || ''; msg.classList.toggle('err', !!isErr); };

  el.querySelector('.imp-auth-close').addEventListener('click', closeSignInModal);
  el.addEventListener('click', (e) => { if (e.target === el) closeSignInModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('open')) closeSignInModal();
  });

  el.querySelector('.imp-auth-google').addEventListener('click', async () => {
    setMsg('Opening Google…');
    try { await signInWithGoogle(); }
    catch (e) { setMsg(friendlyError(e), true); }
  });

  el.querySelector('.imp-auth-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el.querySelector('.imp-auth-email').value.trim();
    if (!email) return;
    setMsg('Sending your link…');
    try {
      await sendEmailLink(email);
      setMsg('Check your inbox for a sign-in link.');
    } catch (err) { setMsg(friendlyError(err), true); }
  });

  return el;
}

function friendlyError(e) {
  const code = e && e.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/network-request-failed') return 'Network problem. Try again.';
  if (code === 'auth/operation-not-allowed') return 'Sign-in is not enabled yet.';
  if (code === 'auth/invalid-email') return 'That email looks off.';
  return 'Something went wrong. Please try again.';
}

export function openSignInModal() {
  buildModal();
  modalEl.querySelector('.imp-auth-msg').textContent = '';
  modalEl.classList.add('open');
}

export function closeSignInModal() {
  if (modalEl) modalEl.classList.remove('open');
}

// Renders and manages an account button inside `container`. Signed out shows
// "Sign in" (opens the modal); signed in shows the user's name with a small
// menu holding their email and a Sign out action.
export function mountAccountButton(container) {
  if (!container) return;
  injectStyles();
  container.style.position = container.style.position || 'relative';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'imp-auth-account';
  btn.textContent = 'Sign in';

  const menu = document.createElement('div');
  menu.className = 'imp-auth-menu';
  menu.innerHTML = `<div class="who"></div><button type="button" class="imp-auth-signout">Sign out</button>`;

  container.appendChild(btn);
  container.appendChild(menu);

  const closeMenu = () => menu.classList.remove('open');
  document.addEventListener('click', (e) => { if (!container.contains(e.target)) closeMenu(); });
  menu.querySelector('.imp-auth-signout').addEventListener('click', async () => {
    closeMenu();
    try { await signOut(); } catch (e) {}
  });

  btn.addEventListener('click', () => {
    if (currentUser()) menu.classList.toggle('open');
    else openSignInModal();
  });

  onAuthChange((user) => {
    if (user) {
      const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Account');
      btn.textContent = name;
      menu.querySelector('.who').textContent = user.email || 'Signed in';
    } else {
      btn.textContent = 'Sign in';
      closeMenu();
    }
  });
}

// Complete any pending email-link / redirect sign-in, then close the modal once
// a user is present. Call once per page load.
export function initAuthUI() {
  completeRedirectSignIn();
  completeEmailLinkSignIn();
  onAuthChange((user) => { if (user) closeSignInModal(); });
}
