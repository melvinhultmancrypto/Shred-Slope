/*
 * Shred Slope: coins, the shop, the locker and the cups (client side).
 *
 * Coins are play money kept on the server with your account (see accounts.js): you earn them for
 * every finished run, for each new star, for a podium in multiplayer, and in the Daily and Weekly
 * Cups. They buy suits, boards, helmets and goggles here, and the locker puts them on. Guests can
 * look around and wear the ten free outfits; buying and cups need an account.
 *
 * game.js hands in hooks: the 3D try-on preview, what to do when your look changes, starting a cup
 * run, and a toast.
 */
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});
  const I = SS.ITEMS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const COIN = '<i class="coin" aria-hidden="true"></i>';
  const LISTS = { suit: 'suits', board: 'boards', helmet: 'helmets', goggles: 'goggles' };
  const TIER = { free: 'FREE', common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

  let hooks = null;
  let wallet = null;      // { coins, earned, owned, equip, inbox } while signed in
  let mode = 'shop';      // shop | locker
  let slot = 'suit';
  let picked = null;      // the item you're trying on in the shop
  let confirmBuy = false;
  let busy = false;
  let backTo = null;
  let cups = null, cupsTimer = null, cupsTick = null;

  // ---- the server
  async function api(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = SS.Account && SS.Account.token;
    if (tok) headers.Authorization = 'Bearer ' + tok;
    try {
      const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
      let data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      return { status: data ? r.status : 0, data: data || { error: 'Coins, buying and the cups only work in the online game.' } };
    } catch (e) {
      return { status: 0, data: { error: 'Can’t reach the server. Check your connection.' } };
    }
  }
  const signedIn = () => !!(SS.Account && SS.Account.token && wallet);
  const owns = (it) => it.price === 0 || !!(wallet && wallet.owned.includes(it.slot + ':' + it.id));
  const equipped = (it) => {
    const l = currentLook();
    return l[it.slot] === it.id;
  };
  // what you wear: your locker when signed in, otherwise the free outfit you picked
  function currentLook() {
    if (wallet) return Object.assign({}, wallet.equip);
    return I.defaultLook(hooks ? hooks.outfit() : 0);
  }

  // ---- coins on the season pass and in the store
  function renderCoins() {
    const show = !!wallet;
    const chip = $('passCoins');
    if (chip) chip.classList.toggle('hidden', !show);
    for (const id of ['coinsTotal', 'storeCoins']) { const el = $(id); if (el) el.textContent = fmt(wallet ? wallet.coins : 0); }
    const sc = $('storeCoinChip');
    if (sc) sc.classList.toggle('hidden', !show);
  }
  function bump() {
    for (const id of ['passCoins', 'storeCoinChip']) {
      const el = $(id);
      if (!el) continue;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }
  function setWallet(w) {
    const was = wallet;
    wallet = w ? { coins: w.coins | 0, earned: w.earned | 0, owned: Array.isArray(w.owned) ? w.owned : [], equip: Object.assign(I.defaultLook(0), w.equip || {}), inbox: w.inbox || [] } : null;
    renderCoins();
    if (hooks) hooks.lookChanged();
    if (isOpen('store')) renderStore();
    if (isOpen('cups')) renderCups();
    if (wallet && wallet.inbox.length) showInbox(wallet.inbox);
    if (wallet && !was && wallet.earned === 0 && wallet.coins > 0) hooks && hooks.toast(`You have ${fmt(wallet.coins)} coins to spend in the shop`);
  }
  function setCoins(n, earned) {
    if (!wallet) return;
    wallet.coins = n;
    if (earned) { wallet.earned += earned; bump(); }
    renderCoins();
    if (isOpen('store')) renderStore();
  }
  // cup prizes and other news from the server, one toast after another
  function showInbox(list) {
    const ids = list.map((n) => n.id);
    list.forEach((n, i) => setTimeout(() => hooks && hooks.toast(`${n.text} · +${fmt(n.coins)} coins`), 600 + i * 3600));
    if (ids.length) api('POST', '/api/inbox/seen', { ids });
    wallet.inbox = [];
  }

  // ---- little pictures for the item cards
  const cssOf = (c) => (Array.isArray(c) ? `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})` : c);
  function suitCols(it) {
    if (it.pal !== undefined) { const p = SS.PALETTE[it.pal]; return { jacket: cssOf(p.jacket), trim: cssOf(p.trim), pants: cssOf(p.pants), pat: 3 }; }
    return { jacket: it.jacket, trim: it.trim, pants: it.pants, pat: it.pat || 3, patCol: it.patCol };
  }
  function suitOfLook() {
    const s = I.get('suit', currentLook().suit) || I.suits[0];
    if (s.pal !== undefined) { const p = SS.PALETTE[s.pal]; return { board: cssOf(p.board), stripe: cssOf(p.stripe), helmet: cssOf(p.helmet), lens: cssOf(p.lens) }; }
    return { board: s.board, stripe: s.stripe, helmet: s.helmet, lens: s.lens };
  }
  function art(it) {
    const base = suitOfLook();
    if (it.slot === 'suit') {
      const c = suitCols(it);
      const pat = c.pat === 1 ? `<path d="M26 34h48M26 46h48M26 58h48M38 30v40M50 30v40M62 30v40" stroke="${c.patCol}" stroke-width="3" opacity="0.55"/>`
        : c.pat === 2 ? `<path d="M30 38q6-5 12 0t10 2M56 52q5-6 12-1M32 60q8-4 14 1" stroke="${c.patCol}" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.75"/>` : '';
      return `<svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M30 70 L32 96 L46 96 L50 76 L54 96 L68 96 L70 70Z" fill="${c.pants}" stroke="#10204a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M24 28 Q50 16 76 28 L80 72 Q50 78 20 72Z" fill="${c.jacket}" stroke="#10204a" stroke-width="2.5" stroke-linejoin="round"/>
        ${pat}
        <path d="M22 44 Q50 50 78 44 L79 56 Q50 62 21 56Z" fill="${c.trim}"/>
        <path d="M24 28 L10 60 L18 64 L28 40" fill="${c.jacket}" stroke="#10204a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M76 28 L90 60 L82 64 L72 40" fill="${c.jacket}" stroke="#10204a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M40 20 Q50 14 60 20 L58 30 Q50 33 42 30Z" fill="${c.jacket}" stroke="#10204a" stroke-width="2.5"/>
        <path d="M50 30 V74" stroke="#10204a" stroke-width="1.6" opacity="0.7"/>
      </svg>`;
    }
    if (it.slot === 'board') {
      const b = it.board || base.board, s = it.stripe || base.stripe;
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-30 50 50)">
        <rect x="6" y="38" width="88" height="24" rx="12" fill="${b}" stroke="#10204a" stroke-width="2.5"/>
        <path d="M14 50 H86" stroke="${s}" stroke-width="6" stroke-linecap="round"/>
        <rect x="30" y="41" width="10" height="18" rx="3" fill="#20232c"/><rect x="60" y="41" width="10" height="18" rx="3" fill="#20232c"/>
        ${it.shine ? '<path d="M20 42 L34 42" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>' : ''}
      </g></svg>`;
    }
    if (it.slot === 'helmet') {
      const h = it.helmet || base.helmet;
      return `<svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M18 64 Q18 22 50 20 Q82 22 82 64 Z" fill="${h}" stroke="#10204a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M30 34 Q50 24 70 34" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity="${it.shine ? 0.85 : 0.35}"/>
        <rect x="20" y="52" width="60" height="18" rx="9" fill="#eef1f6" stroke="#10204a" stroke-width="2.5"/>
        <rect x="25" y="55" width="50" height="12" rx="6" fill="${base.lens}"/>
      </svg>`;
    }
    const l = it.lens || base.lens;
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M8 50 Q8 36 22 34 L78 34 Q92 36 92 50 Q92 66 78 66 L60 66 Q50 58 40 66 L22 66 Q8 66 8 50Z" fill="${it.frame || '#eef1f6'}" stroke="#10204a" stroke-width="2.5"/>
      <path d="M15 50 Q15 41 25 40 L75 40 Q85 41 85 50 Q85 60 75 60 L60 60 Q50 53 40 60 L25 60 Q15 60 15 50Z" fill="${l}"/>
      <path d="M24 45 L40 45" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
    </svg>`;
  }

  // ---- the store: SHOP (try on and buy) and LOCKER (wear what you own)
  const overlays = () => [...document.querySelectorAll('.overlay:not(.hidden)')];
  function isOpen(which) { const el = $(which); return !!el && !el.classList.contains('hidden'); }
  function openStore(m, from) {
    mode = m || 'shop';
    slot = 'suit';
    picked = null;
    confirmBuy = false;
    backTo = from || null;
    for (const el of overlays()) { if (!backTo) backTo = el; el.classList.add('hidden'); }
    $('store').classList.remove('hidden');
    renderStore();
    startPreview();
    if (signedIn()) refreshWallet();
  }
  function closeStore() {
    $('store').classList.add('hidden');
    if (hooks) hooks.preview(null);
    (backTo || $('title')).classList.remove('hidden');
    backTo = null;
  }
  function previewLook() {
    const l = currentLook();
    if (picked) l[picked.slot] = picked.id;
    return l;
  }
  function startPreview() { if (hooks) hooks.preview($('storeCv'), previewLook()); }

  function renderStore() {
    const store = $('store');
    store.dataset.mode = mode;
    store.querySelectorAll('.store-tabs button').forEach((b) => b.classList.toggle('sel', b.dataset.mode === mode));
    store.querySelectorAll('.store-slots button').forEach((b) => b.classList.toggle('sel', b.dataset.slot === slot));
    // the shop sells what costs coins; the locker shows what you have (the free outfits and "suit colours" too)
    const items = I[LISTS[slot]].filter((it) => (mode === 'shop' ? it.price > 0 : owns(it)));
    $('storeGrid').innerHTML = items.map((it) => {
      const own = owns(it), on = equipped(it), sel = picked && picked.slot === it.slot && picked.id === it.id;
      const cta = on ? '<span class="cta on">WEARING</span>' : own ? `<span class="cta own">${mode === 'shop' ? 'OWNED' : 'WEAR'}</span>` : `<span class="cta price">${COIN}${fmt(it.price)}</span>`;
      return `<button type="button" class="item t-${it.tier}${own ? ' owned' : ''}${on ? ' on' : ''}${sel ? ' sel' : ''}" data-slot="${it.slot}" data-id="${esc(it.id)}">
        <span class="item-art">${art(it)}</span><span class="item-name">${esc(it.name)}</span><span class="item-tier">${TIER[it.tier] || ''}</span>${cta}</button>`;
    }).join('') || `<p class="small dim store-empty">${mode === 'locker' ? 'Nothing here yet. Earn coins by riding and buy something in the shop.' : 'Nothing for sale here.'}</p>`;
    renderAct();
    renderCoins();
    const hint = $('storeHint');
    if (!signedIn()) hint.innerHTML = 'Create an account to earn coins and buy gear. <button type="button" class="linkbtn" data-a="up">Create one</button> or <button type="button" class="linkbtn" data-a="in">sign in</button>.';
    else hint.textContent = mode === 'shop'
      ? `Earn coins: ${I.runCoins(0)}–150 for every run, ${I.STAR_COINS} for each new star and ${I.RACE_PRIZES[0]} for winning a multiplayer race.`
      : 'Tap anything you own to wear it. Drag the rider to turn them round. Your look shows in multiplayer too.';
  }
  function renderAct() {
    const act = $('storeAct');
    const it = picked;
    if (!it || mode !== 'shop') {
      const l = currentLook();
      const parts = I.SLOTS.map((s) => (I.get(s, l[s]) || {}).name).filter((n) => n && n !== 'Suit colours');
      act.innerHTML = `<span class="act-name">${mode === 'shop' ? 'Tap an item to try it on' : 'Wearing'}</span><span class="act-sub">${esc(parts.join(' · '))}</span>`;
      return;
    }
    const own = owns(it), on = equipped(it);
    let btn;
    if (!signedIn()) btn = `<button type="button" class="btn sm" data-act="signin">SIGN IN TO BUY</button>`;
    else if (on) btn = `<button type="button" class="btn sm ghost" disabled>WEARING</button>`;
    else if (own) btn = `<button type="button" class="btn sm alt" data-act="wear">WEAR IT</button>`;
    else if (wallet.coins < it.price) btn = `<button type="button" class="btn sm" disabled>NEED ${fmt(it.price - wallet.coins)} MORE</button>`;
    else btn = `<button type="button" class="btn sm${confirmBuy ? ' alt' : ''}" data-act="buy">${confirmBuy ? 'CONFIRM' : 'BUY'} ${COIN}${fmt(it.price)}</button>`;
    act.innerHTML = `<span class="act-name">${esc(it.name)} <em class="t-${it.tier}">${TIER[it.tier]}</em></span>${btn}`;
  }
  async function refreshWallet() {
    const r = await api('GET', '/api/wallet');
    if (r.status === 200) setWallet(r.data.wallet);
  }
  async function buy(it) {
    if (busy) return;
    if (!confirmBuy) { confirmBuy = true; renderAct(); return; }
    busy = true;
    const r = await api('POST', '/api/shop/buy', { slot: it.slot, id: it.id });
    busy = false;
    confirmBuy = false;
    if (r.status !== 200) { hooks.toast(r.data.error || 'Couldn’t buy that. Try again.'); renderAct(); return; }
    wallet = Object.assign(wallet, { coins: r.data.wallet.coins, owned: r.data.wallet.owned });
    hooks.toast(`${it.name} is yours!`);
    await wear(it);
  }
  async function wear(it) {
    if (!signedIn()) {
      // guests: only the free outfits
      if (it.slot === 'suit' && it.pal !== undefined) { hooks.setOutfit(it.pal); renderStore(); startPreview(); }
      return;
    }
    if (busy) return;
    busy = true;
    const r = await api('POST', '/api/locker/equip', { slot: it.slot, id: it.id });
    busy = false;
    if (r.status !== 200) { hooks.toast(r.data.error || 'Couldn’t put that on.'); return; }
    wallet.equip = Object.assign(I.defaultLook(0), r.data.wallet.equip);
    if (it.slot === 'suit' && it.pal !== undefined) hooks.setOutfit(it.pal, true);
    hooks.lookChanged();
    picked = null;
    renderStore();
    startPreview();
  }
  // the outfit picker on the season pass wears one of the free suits
  function wearFree(i) {
    const it = I.suits[i];
    if (signedIn() && it && wallet.equip.suit !== it.id) wear(it);
  }

  // ---- cups
  const left = (ms) => {
    const m = Math.max(0, Math.floor(ms / 60000));
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
  };
  const medal = ['🥇', '🥈', '🥉'];
  async function loadCups() {
    const r = await api('GET', '/api/cups');
    if (r.status === 200) { cups = r.data; cups.at = Date.now(); }
    else if (!cups) cups = { error: r.data.error || 'Couldn’t load the cups.' };
    renderCups();
  }
  function openCups(from) {
    backTo = from || null;
    for (const el of overlays()) { if (!backTo) backTo = el; el.classList.add('hidden'); }
    $('cups').classList.remove('hidden');
    renderCups();
    loadCups();
    clearInterval(cupsTimer);
    clearInterval(cupsTick);
    cupsTimer = setInterval(loadCups, 30000);
    cupsTick = setInterval(tickCups, 1000);
  }
  function closeCups() {
    clearInterval(cupsTimer);
    clearInterval(cupsTick);
    $('cups').classList.add('hidden');
    (backTo || $('title')).classList.remove('hidden');
    backTo = null;
  }
  function tickCups() {
    if (!cups || !cups.cups) return;
    for (const c of cups.cups) {
      const el = document.querySelector(`.cup[data-kind="${c.kind}"] .cup-left`);
      if (el) el.textContent = 'Ends in ' + left(c.left - (Date.now() - cups.at));
    }
  }
  function renderCups() {
    $('cupAcct').classList.toggle('hidden', signedIn() || !(SS.Account && SS.Account.online));
    const box = $('cupList');
    if (!cups) { box.innerHTML = '<p class="small dim">Loading the cups…</p>'; $('cupPast').innerHTML = ''; return; }
    if (cups.error) { box.innerHTML = `<p class="small">${esc(cups.error)}</p>`; return; }
    box.innerHTML = cups.cups.map((c) => {
      const rows = c.top.length
        ? c.top.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${medal[i] || i + 1}</td><td>${esc(r.name)}</td><td class="n">${fmt(r.score)}</td></tr>`).join('')
        : '<tr><td colspan="3" class="dim">Nobody has ridden it yet. Be the first!</td></tr>';
      const me = c.me ? `<div class="cup-me">Your best <b>${fmt(c.me.best)}</b> · <b>${c.me.rank}${['th', 'st', 'nd', 'rd'][(c.me.rank % 100 > 10 && c.me.rank % 100 < 14) ? 0 : c.me.rank % 10] || 'th'}</b> of ${c.n}</div>` : `<div class="cup-me dim">${c.n} rider${c.n === 1 ? '' : 's'} so far</div>`;
      return `<div class="cup" data-kind="${c.kind}">
        <div class="cup-pic" style="background-image:url('img/maps/${esc(c.map)}.jpg')"><span class="cup-name brush">${esc(c.name)}</span><span class="cup-left">Ends in ${left(c.left)}</span></div>
        <div class="cup-body">
          <div class="cup-map">${esc(c.mapName)}<small>Same course for everyone</small></div>
          <div class="cup-prizes"><span>${medal[0]} ${COIN}${fmt(c.prizes[0])}</span><span>${medal[1]} ${COIN}${fmt(c.prizes[1])}</span><span>${medal[2]} ${COIN}${fmt(c.prizes[2])}</span><span>Top 10 ${COIN}${fmt(c.top10)}</span><span>Everyone ${COIN}${fmt(c.entry)}</span></div>
          ${me}
          <table class="cup-board">${rows}</table>
          <button type="button" class="btn${c.kind === 'weekly' ? ' alt' : ''}" data-play="${c.kind}">${signedIn() ? (c.me ? 'RIDE AGAIN' : 'ENTER') : 'SIGN IN TO ENTER'}</button>
        </div>
      </div>`;
    }).join('');
    $('cupPast').innerHTML = cups.past && cups.past.length
      ? `<h3>Last results</h3>` + cups.past.map((p) => `<div class="cup-res"><b>${esc(I.CUPS[p.kind].name)}</b> · ${esc(p.mapName)} · ${p.n} rider${p.n === 1 ? '' : 's'}<span>${p.top.map((t, i) => `${medal[i]} ${esc(t.name)} ${fmt(t.score)}`).join(' &nbsp; ') || 'nobody rode it'}</span></div>`).join('')
      : '';
  }
  function playCup(kind) {
    if (!signedIn()) { SS.Account && SS.Account.open('up', $('cups')); return; }
    const c = cups && cups.cups && cups.cups.find((x) => x.kind === kind);
    if (!c) return;
    clearInterval(cupsTimer);
    clearInterval(cupsTick);
    $('cups').classList.add('hidden');
    backTo = null;
    hooks.startCup({ kind: c.kind, name: c.name, map: c.map, seed: c.seed });
  }

  // ---- runs: coins for the score, and the cup leaderboard
  async function reportRun(run) {
    if (!signedIn()) return { guest: true };
    const r = await api('POST', '/api/run', run);
    if (r.status === 200) setCoins(r.data.coins, r.data.earned);
    return Object.assign({ status: r.status }, r.data);
  }
  // coins from the server outside a run: new stars, a multiplayer podium
  function onStarCoins(n, total) {
    if (!wallet || !n) return;
    setCoins(total, n);
    hooks.toast(`+${fmt(n)} coins for ${n / I.STAR_COINS === 1 ? 'a new star' : n / I.STAR_COINS + ' new stars'}`);
  }
  function onRaceCoins(m) {
    if (!wallet) return;
    setCoins(m.coins, m.earned);
    hooks.toast(`+${fmt(m.earned)} coins · ${m.place <= 3 ? ['1st', '2nd', '3rd'][m.place - 1] + ' place' : 'you finished'}`);
  }

  function init(h) {
    hooks = h;
    const store = $('store');
    if (!store) return;
    store.querySelector('.store-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      b.blur();
      mode = b.dataset.mode;
      picked = null;
      confirmBuy = false;
      renderStore();
      startPreview();
    });
    store.querySelector('.store-slots').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      b.blur();
      slot = b.dataset.slot;
      picked = null;
      confirmBuy = false;
      renderStore();
      startPreview();
    });
    $('storeGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.item');
      if (!b) return;
      b.blur();
      const it = I.get(b.dataset.slot, b.dataset.id);
      if (!it) return;
      if (mode === 'locker') { wear(it); return; }
      picked = picked && picked.id === it.id && picked.slot === it.slot ? null : it;
      confirmBuy = false;
      renderStore();
      startPreview();
    });
    $('storeAct').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !picked) return;
      b.blur();
      if (b.dataset.act === 'buy') buy(picked);
      else if (b.dataset.act === 'wear') wear(picked);
      else if (b.dataset.act === 'signin') SS.Account && SS.Account.open('up', $('store'));
    });
    $('storeHint').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && SS.Account) SS.Account.open(b.dataset.a, $('store'));
    });
    $('storeBack').addEventListener('click', (e) => { e.currentTarget.blur(); closeStore(); });
    $('cupsBack').addEventListener('click', (e) => { e.currentTarget.blur(); closeCups(); });
    $('cupList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-play]');
      if (b) { b.blur(); playCup(b.dataset.play); }
    });
    $('cupSignUp').addEventListener('click', () => SS.Account && SS.Account.open('up', $('cups')));
    $('cupSignIn').addEventListener('click', () => SS.Account && SS.Account.open('in', $('cups')));
    // the cups are switched off until they're ready (CUPS_OPEN brings the screen back)
    const cupsBtnFn = () => (I.CUPS_OPEN ? openCups($('title')) : hooks.toast('Cups are coming soon: one course for everyone, with coin prizes for the top riders'));
    for (const [id, fn] of [['shopBtn', () => openStore('shop', $('title'))], ['lockerBtn', () => openStore('locker', $('title'))], ['cupsBtn', cupsBtnFn]]) {
      const b = $(id);
      if (b) b.addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
    }
    // Esc closes the shop or the cups (before the game sees it)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || (SS.Account && SS.Account.isOpen())) return;
      if (isOpen('store')) { e.stopImmediatePropagation(); closeStore(); }
      else if (isOpen('cups')) { e.stopImmediatePropagation(); closeCups(); }
    }, true);
    renderCoins();
  }

  SS.Shop = {
    init,
    setWallet,
    setCoins,
    reportRun,
    onStarCoins,
    onRaceCoins,
    wearFree,
    openStore,
    openCups,
    // your look for drawing (null for a guest: the free outfit number is used instead)
    look: () => (wallet ? Object.assign({}, wallet.equip) : null),
    get coins() { return wallet ? wallet.coins : null; },
    get signedIn() { return signedIn(); },
    isOpen: () => isOpen('store') || isOpen('cups'),
  };
})();
