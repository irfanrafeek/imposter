// Shared sign-in UI for Impostor Games: a drop-in modal + an account button.
//
// Any page imports this, calls initAuthUI() once, and mounts an account button
// wherever it likes. The modal DOM and styles are injected on demand so there is
// no markup to duplicate across dance / word / hub. Styles lean on the site's
// CSS custom properties (--card, --ink, ...) with fallbacks, so it inherits each
// page's look.

import {
  currentUser, onAuthChange, signInWithGoogle, sendEmailLink,
  completeEmailLinkSignIn, completeRedirectSignIn, signOut, deleteAccount,
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
  .imp-auth-google{background:#fff;color:#3c4043;border-color:#dadce0;margin-bottom:4px;position:relative}
  .imp-auth-gicon{position:absolute;left:16px;top:50%;transform:translateY(-50%)}
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
  .imp-auth-fine{margin:14px 0 0;font-size:11.5px;line-height:1.45;
    color:var(--ink-soft,#8a7e6f);opacity:.85}
  .imp-auth-account{border:0;background:none;
    color:var(--ink-soft,#8a7e6f);padding:8px 0;font-size:15px;
    font-weight:500;cursor:pointer;font-family:Inter,-apple-system,system-ui,sans-serif;
    max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .imp-auth-account:active{color:var(--ink,#2a2520)}
  .imp-auth-menu{position:absolute;z-index:1001;top:calc(100% + 6px);right:0;
    background:var(--card,#fff);
    border:1px solid var(--bg-soft,#e2dccd);border-radius:14px;padding:6px;
    box-shadow:0 12px 36px rgba(42,37,32,.16);min-width:180px;max-width:calc(100vw - 32px);
    display:none;font-family:Inter,-apple-system,system-ui,sans-serif}
  .imp-auth-menu.open{display:block}
  .imp-auth-menu .who{padding:8px 10px 10px;font-size:12px;color:var(--ink-soft,#8a7e6f);
    border-bottom:1px solid var(--bg-soft,#eee);word-break:break-all}
  .imp-auth-menu button{width:100%;text-align:left;border:0;background:none;
    padding:10px;border-radius:8px;font-size:14px;cursor:pointer;color:var(--ink,#2a2520);
    font-family:inherit}
  .imp-auth-menu button:active{background:var(--bg,#f5f0e8)}
  .imp-auth-menu .imp-auth-delete{color:#c0392b}
  .imp-auth-confirm{max-width:340px;text-align:left}
  .imp-auth-confirm h2{margin:2px 0 8px;font-size:20px;font-weight:700}
  .imp-auth-confirm p{margin:0 0 18px;font-size:14px;line-height:1.45;
    color:var(--ink-soft,#8a7e6f)}
  .imp-auth-confirm-actions{display:flex;gap:10px}
  .imp-auth-confirm-actions .imp-auth-btn{margin:0}
  .imp-auth-cancel{background:var(--bg,#f5f0e8);color:var(--ink,#2a2520);
    border-color:var(--bg-soft,#e2dccd)}
  .imp-auth-danger{background:#c0392b;color:#fff}
  .imp-auth-danger:disabled{opacity:.5;cursor:default}
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
      <p class="imp-auth-sub">Sign in to keep your song groups and reuse them anytime.</p>
      <button class="imp-auth-btn imp-auth-google" type="button">
        <svg class="imp-auth-gicon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        <span>Continue with Google</span>
      </button>
      <div class="imp-auth-or"><span>or</span></div>
      <form class="imp-auth-email-form">
        <input class="imp-auth-email" type="email" inputmode="email" autocomplete="email"
               placeholder="you@email.com" aria-label="Email address" required>
        <button class="imp-auth-btn imp-auth-email-send" type="submit">Email me a link</button>
      </form>
      <p class="imp-auth-msg" role="status" aria-live="polite"></p>
      <p class="imp-auth-fine">We only store your email and the song groups you create. You can delete your account anytime.</p>
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

// A one-off confirm dialog for the destructive "Delete account" action. Built
// lazily and reused. Deletes the user's data + auth account, then closes.
let confirmEl = null;
function openDeleteConfirm() {
  injectStyles();
  if (!confirmEl) {
    const el = document.createElement('div');
    el.className = 'imp-auth-backdrop';
    el.innerHTML = `
      <div class="imp-auth-sheet imp-auth-confirm" role="dialog" aria-modal="true"
           aria-labelledby="imp-auth-del-title">
        <h2 id="imp-auth-del-title">Delete account?</h2>
        <p>This permanently deletes your account and all your song groups. This
           can't be undone.</p>
        <p class="imp-auth-msg" role="status" aria-live="polite"></p>
        <div class="imp-auth-confirm-actions">
          <button class="imp-auth-btn imp-auth-cancel" type="button">Cancel</button>
          <button class="imp-auth-btn imp-auth-danger" type="button">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    confirmEl = el;

    const msg = el.querySelector('.imp-auth-msg');
    const cancel = el.querySelector('.imp-auth-cancel');
    const del = el.querySelector('.imp-auth-danger');
    const close = () => el.classList.remove('open');

    cancel.addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.classList.contains('open')) close();
    });

    del.addEventListener('click', async () => {
      del.disabled = true; cancel.disabled = true;
      msg.classList.remove('err');
      msg.textContent = 'Deleting your account…';
      try {
        await deleteAccount();
        close();
      } catch (e) {
        del.disabled = false; cancel.disabled = false;
        msg.textContent = deleteError(e);
        msg.classList.add('err');
      }
    });
  }
  const msg = confirmEl.querySelector('.imp-auth-msg');
  msg.textContent = ''; msg.classList.remove('err');
  confirmEl.querySelector('.imp-auth-danger').disabled = false;
  confirmEl.querySelector('.imp-auth-cancel').disabled = false;
  confirmEl.classList.add('open');
}

function deleteError(e) {
  const code = e && e.code;
  if (code === 'needs-resignin') return 'For security, sign out and sign in again, then delete.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
    return 'Confirmation cancelled. Try again.';
  if (code === 'auth/network-request-failed') return 'Network problem. Try again.';
  return 'Could not delete your account. Please try again.';
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
  menu.innerHTML = `<div class="who"></div>` +
    `<button type="button" class="imp-auth-signout">Sign out</button>` +
    `<button type="button" class="imp-auth-delete">Delete account</button>`;

  container.appendChild(btn);
  container.appendChild(menu);

  const closeMenu = () => menu.classList.remove('open');
  document.addEventListener('click', (e) => { if (!container.contains(e.target)) closeMenu(); });
  menu.querySelector('.imp-auth-signout').addEventListener('click', async () => {
    closeMenu();
    try { await signOut(); } catch (e) {}
  });
  menu.querySelector('.imp-auth-delete').addEventListener('click', () => {
    closeMenu();
    openDeleteConfirm();
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
