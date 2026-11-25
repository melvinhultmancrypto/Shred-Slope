/*
 * Shred Slope accounts (client side): the sign in / create account screen, the account chip on the
 * season pass, and keeping your saved game in sync with the server.
 *
 * game.js hands in a few hooks (get the current save, apply one, set the rider name). Guests keep
 * playing exactly as before, with progress saved in this browser only. When the server can't be
 * reached (the offline demo) the account parts simply stay hidden.
 */
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});
  const ACC_KEY = 'shredSlope.account';   // { token, name, created }
  const OWNER_KEY = 'shredSlope.owner';   // whose progress is in this browser: '' for a guest
  const GUEST_KEY = 'shredSlope.guestOk'; // chose "play as a guest", so don't open the sign-in screen by itself
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let hooks = null;
  let acc = get(ACC_KEY, null);
  if (!acc || typeof acc.token !== 'string' || typeof acc.name !== 'string') acc = null;
  let online = false;      // the account server answered
  let pushTimer = null, pushing = false, pushAgain = false;
  let mode = 'in';         // in | up | acct
  let busy = false;
  let backTo = null;       // the screen to return to when the panel closes

  // ---- talking to the server
  async function api(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (acc) headers.Authorization = 'Bearer ' + acc.token;
    let r;
    try {
      r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) {
      return { status: 0, data: { error: 'Can’t reach the server. Check your connection and try again.' } };
    }
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!data) return { status: 0, data: { error: 'Accounts only work in the online game.' } };
    return { status: r.status, data };
  }

  function emptySave() { return { best: 0, progress: {}, outfit: null, prefs: {} }; }
  // the two saves together, keeping the best of each (same rules as the server)
  function merge(a, b) {
    const out = { best: Math.max(a.best || 0, b.best || 0), progress: {}, outfit: b.outfit != null ? b.outfit : a.outfit, prefs: Object.assign({}, a.prefs, b.prefs) };
    for (const src of [a.progress || {}, b.progress || {}]) {
      for (const [id, p] of Object.entries(src)) {
        const o = out.progress[id] || { best: 0, stars: [false, false, false] };
        const st = Array.isArray(p.stars) ? p.stars : [];
        out.progress[id] = { best: Math.max(o.best, p.best || 0), stars: o.stars.map((v, i) => v || st[i] === true) };
      }
    }
    return out;
  }
  const hasProgress = (s) => (s.best || 0) > 0 || Object.values(s.progress || {}).some((p) => p.best > 0 || (p.stars || []).some(Boolean));

  function signedIn(data) {
    acc = { token: data.token || acc.token, name: data.user.name, created: data.user.created };
    set(ACC_KEY, acc);
    set(OWNER_KEY, acc.name.toLowerCase());
    hooks.apply(data.save || emptySave(), true);
    hooks.setName(acc.name, true);
    if (SS.Shop && data.wallet) SS.Shop.setWallet(data.wallet);
    render();
  }
  function signedOut(keepProgress) {
    acc = null;
    set(ACC_KEY, null);
    set(OWNER_KEY, '');
    clearTimeout(pushTimer);
    // the progress on this computer belonged to that account, so a guest starts fresh
    if (!keepProgress) hooks.apply(emptySave(), true);
    hooks.setName(null, false);
    if (SS.Shop) SS.Shop.setWallet(null);
    render();
  }

  // save to the account a moment after something changes (a run, a star, a new outfit)
  function push(now) {
    if (!acc || !online) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, now ? 0 : 1500);
  }
  async function doPush() {
    if (!acc) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    const r = await api('PUT', '/api/save', { save: hooks.save() });
    pushing = false;
    if (r.status === 401) { signedOut(true); return; }
    if (r.status !== 200) { pushTimer = setTimeout(doPush, 15000); return; } // try again later
    if (r.data.starCoins && SS.Shop) SS.Shop.onStarCoins(r.data.starCoins, r.data.coins); // coins for new stars
    if (pushAgain) { pushAgain = false; push(); }
  }

  // ---- the panel
  const ui = {};
  function grab() {
    ['auth', 'authTabs', 'authForm', 'authTitle', 'authSub', 'authUser', 'authPass', 'authPass2', 'authEye', 'authErr', 'authGo', 'authGuest',
      'authFine', 'authAcct', 'authClose', 'passAcct', 'acctName', 'acctMeta', 'acctOut', 'acctDel', 'acctDelBox', 'acctDelPass', 'acctDelGo', 'acctBack', 'acctErr']
      .forEach((id) => { ui[id] = $(id); });
  }

  function setMode(m) {
    mode = m;
    const up = m === 'up';
    ui.authTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.mode === m));
    ui.auth.classList.toggle('up', up);
    ui.auth.querySelector('.authcard').classList.toggle('up', up);
    ui.authForm.classList.toggle('hidden', m === 'acct');
    ui.authTabs.classList.toggle('hidden', m === 'acct');
    ui.authAcct.classList.toggle('hidden', m !== 'acct');
    ui.authTitle.textContent = up ? 'Create account' : 'Welcome back';
    ui.authSub.textContent = up ? 'Pick a username and a password. Your stars and best runs are saved to it.' : 'Sign in and your stars, best runs and outfit come with you.';
    ui.authGo.textContent = up ? 'CREATE ACCOUNT' : 'SIGN IN';
    ui.authPass.autocomplete = up ? 'new-password' : 'current-password';
    ui.authFine.textContent = up ? 'Anything you’ve already earned as a guest on this computer comes with you.' : 'As a guest your progress stays on this computer only.';
    error('');
    if (m === 'acct') renderAcct();
  }
  function error(msg, field) {
    ui.authErr.textContent = msg || '';
    ui.authErr.classList.toggle('on', !!msg);
    for (const el of [ui.authUser, ui.authPass, ui.authPass2]) el.closest('.af').classList.remove('bad');
    const el = field === 'username' ? ui.authUser : field === 'password' ? ui.authPass : field === 'password2' ? ui.authPass2 : null;
    if (el) {
      const af = el.closest('.af');
      af.classList.remove('bad');
      void af.offsetWidth; // restart the shake
      af.classList.add('bad');
      el.focus();
    }
  }
  function setBusy(b) {
    busy = b;
    ui.authGo.disabled = b;
    ui.auth.classList.toggle('busy', b);
  }

  function open(m, from) {
    if (!online) return;
    backTo = from || null;
    // the lobby stays behind the panel; anything else steps aside until it closes
    for (const el of document.querySelectorAll('.overlay:not(.hidden)')) if (el !== ui.auth && el.id !== 'title') { if (!backTo) backTo = el; el.classList.add('hidden'); }
    setMode(m || (acc ? 'acct' : get(GUEST_KEY, false) ? 'in' : 'up'));
    ui.authPass.value = ui.authPass2.value = '';
    if (m !== 'acct' && !acc) ui.authUser.value = ui.authUser.value || '';
    ui.auth.classList.remove('hidden');
    setTimeout(() => { if (mode !== 'acct') (ui.authUser.value ? ui.authPass : ui.authUser).focus({ preventScroll: true }); }, 380);
  }
  function close() {
    ui.auth.classList.add('hidden');
    ui.acctDelBox.classList.add('hidden');
    if (backTo) backTo.classList.remove('hidden');
    else if ($('title') && !document.querySelector('#hud:not(.hidden)')) $('title').classList.remove('hidden');
    backTo = null;
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const name = ui.authUser.value.trim(), pw = ui.authPass.value;
    if (!name) return error('Type your username.', 'username');
    if (mode === 'up') {
      if (!/^[A-Za-z0-9_.-]{3,16}$/.test(name)) return error('Usernames are 3 to 16 letters or numbers (and _ . - if you like).', 'username');
      if (pw.length < 6) return error('Your password needs at least 6 characters.', 'password');
      if (pw !== ui.authPass2.value) return error('The two passwords aren’t the same.', 'password2');
    } else if (!pw) return error('Type your password.', 'password');
    setBusy(true);
    // guest progress on this computer joins the account; another account's leftovers never do
    const local = hooks.save();
    const mine = get(OWNER_KEY, '') === '' && hasProgress(local);
    const r = await api('POST', mode === 'up' ? '/api/auth/signup' : '/api/auth/login', { username: name, password: pw, save: mine ? local : undefined });
    setBusy(false);
    if (r.status === 200 || r.status === 201) {
      acc = { token: r.data.token, name: r.data.user.name };
      signedIn(r.data);
      set(GUEST_KEY, true);
      hooks.toast(mode === 'up' ? `Welcome, ${acc.name}! Your season pass is saved.` : `Signed in as ${acc.name}`);
      close();
      return;
    }
    error(r.data.error || 'Something went wrong. Try again.', r.data.field);
  }

  // ---- the account view (when signed in)
  function renderAcct() {
    if (!acc) return;
    const s = hooks.save();
    const stars = Object.values(s.progress).reduce((n, p) => n + p.stars.filter(Boolean).length, 0);
    ui.acctName.textContent = acc.name;
    const since = acc.created ? new Date(acc.created).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
    ui.acctMeta.innerHTML = `<span><b>${stars}</b> stars</span><span>Best run <b>${(s.best || 0).toLocaleString('en-US')}</b></span>${since ? `<span>Rider since <b>${esc(since)}</b></span>` : ''}`;
    ui.acctErr.textContent = '';
  }
  async function signOutNow() {
    await doPushIfPending();
    api('POST', '/api/auth/logout');
    const n = acc ? acc.name : '';
    signedOut(false);
    hooks.toast(n ? `Signed out of ${n}` : 'Signed out');
    close();
  }
  async function doPushIfPending() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; await doPush(); }
  }
  async function deleteNow() {
    if (busy) return;
    const pw = ui.acctDelPass.value;
    if (!pw) { ui.acctErr.textContent = 'Type your password to delete the account.'; ui.acctDelPass.focus(); return; }
    busy = true;
    const r = await api('DELETE', '/api/me', { password: pw });
    busy = false;
    if (r.status !== 200) { ui.acctErr.textContent = r.data.error || 'Couldn’t delete it. Try again.'; return; }
    signedOut(false);
    hooks.toast('Your account is deleted');
    close();
  }

  // the strip on the season pass
  // the chip in the lobby's top bar: SIGN IN, or your name
  function render() {
    if (!ui.passAcct) return;
    ui.passAcct.classList.toggle('hidden', !online && !acc);
    if (acc) {
      ui.passAcct.innerHTML = `<button type="button" class="pa-btn" data-a="acct" title="Your account"><span class="pa-dot"></span><span class="pa-txt">${esc(acc.name)}${online ? '' : ' <em>(offline)</em>'}</span></button>`;
    } else {
      ui.passAcct.innerHTML = `<button type="button" class="pa-btn go" data-a="in" title="Save your stars, coins and gear">SIGN IN</button>`;
    }
    if (hooks && hooks.changed) hooks.changed();
  }

  async function init(h) {
    hooks = h;
    grab();
    if (!ui.auth) return;
    ui.authTabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setMode(b.dataset.mode); ui.authUser.focus(); } });
    ui.authForm.addEventListener('submit', submit);
    ui.authEye.addEventListener('click', () => {
      const show = ui.authPass.type === 'password';
      for (const el of [ui.authPass, ui.authPass2]) el.type = show ? 'text' : 'password';
      ui.authEye.textContent = show ? 'HIDE' : 'SHOW';
      ui.authEye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    ui.authGuest.addEventListener('click', () => { set(GUEST_KEY, true); close(); });
    ui.authClose.addEventListener('click', () => { set(GUEST_KEY, true); close(); });
    ui.acctBack.addEventListener('click', close);
    ui.acctOut.addEventListener('click', signOutNow);
    ui.acctDel.addEventListener('click', () => { ui.acctDelBox.classList.toggle('hidden'); ui.acctErr.textContent = ''; if (!ui.acctDelBox.classList.contains('hidden')) ui.acctDelPass.focus(); });
    ui.acctDelGo.addEventListener('click', deleteNow);
    ui.acctDelPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') deleteNow(); });
    ui.passAcct.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) { b.blur(); open(b.dataset.a === 'acct' ? 'acct' : 'in', $('title')); }
    });
    ui.auth.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    // keys typed into the form must not steer the rider in the background
    ui.auth.addEventListener('keydown', (e) => e.stopPropagation());
    ui.auth.addEventListener('keyup', (e) => e.stopPropagation());

    if (acc) hooks.setName(acc.name, true);
    render();
    // is there an account server? (the offline demo has none)
    let health = false;
    if (/^https?:$/.test(location.protocol)) {
      try { const r = await fetch('/health', { cache: 'no-store' }); health = r.ok && (await r.text()).trim() === 'ok'; } catch (e) { health = false; }
    }
    online = health;
    if (!online) { render(); return; }
    if (acc) {
      const r = await api('GET', '/api/me');
      if (r.status === 200) {
        // what this browser has (from offline play) plus what the account has
        const local = get(OWNER_KEY, '') === acc.name.toLowerCase() ? hooks.save() : emptySave();
        const both = merge(r.data.save || emptySave(), local);
        signedIn({ token: acc.token, user: r.data.user, save: both, wallet: r.data.wallet });
        if (hasProgress(local)) push(true);
      } else if (r.status === 401) {
        signedOut(true);
        hooks.toast('You were signed out. Sign in again to keep saving.');
      } else render();
    } else {
      render();
      // first visit: show the sign-in screen over the title (play as a guest closes it for good)
      if (!get(GUEST_KEY, false) && !$('title').classList.contains('hidden')) open(null, $('title'));
    }
  }

  SS.Account = {
    init,
    push,
    open,
    get name() { return acc ? acc.name : null; },
    get token() { return acc ? acc.token : null; },
    get online() { return online; },
    isOpen: () => ui.auth && !ui.auth.classList.contains('hidden'),
  };
})();
