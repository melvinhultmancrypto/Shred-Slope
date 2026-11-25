/*
 * Shred Slope: coins, the shop and the locker (client side): two pages of the lobby.
 *
 * Coins are play money kept on the server with your account (see accounts.js): you earn them for
 * every finished run, for each new star and for a podium in multiplayer. They buy suits, boards,
 * helmets and goggles in the SHOP, and the LOCKER puts them on. Guests can look around and wear the
 * ten free outfits; buying needs an account. (The cups are coming soon.)
 *
 * game.js hands in hooks: what the rider on the stage wears (the try-on), little 3D pictures of the
 * items, what to do when your look changes, and a toast.
 */
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});
  const I = SS.ITEMS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const COIN = '<i class="coin" aria-hidden="true"></i>';
  const LISTS = { rider: 'riders', suit: 'suits', board: 'boards', helmet: 'helmets', goggles: 'goggles' };
  const TIER = { free: 'FREE', common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

  let hooks = null;
  let wallet = null;      // { coins, earned, owned, equip, inbox } while signed in
  let page = 'ride';      // the lobby page showing
  let slot = 'rider';     // the locker's slot
  let shopSlot = 'all';   // the shop's filter
  let picked = null;      // the item you're trying on in the shop
  let confirmBuy = false;
  let busy = false;

  // ---- the server
  async function api(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = SS.Account && SS.Account.token;
    if (tok) headers.Authorization = 'Bearer ' + tok;
    try {
      const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
      let data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      return { status: data ? r.status : 0, data: data || { error: 'Coins and buying only work in the online game.' } };
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
    return I.defaultLook(hooks ? hooks.outfit() : 0, hooks && hooks.rider ? hooks.rider() : 'kai');
  }
  const withItem = (it) => Object.assign(currentLook(), { [it.slot]: it.id });

  // ---- coins on the season pass and in the store
  function renderCoins() {
    const chip = $('passCoins');
    if (chip) chip.classList.toggle('hidden', !wallet);
    const el = $('coinsTotal');
    if (el) el.textContent = fmt(wallet ? wallet.coins : 0);
  }
  function bump() {
    for (const id of ['passCoins']) {
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
    refresh();
    if (wallet && wallet.inbox.length) showInbox(wallet.inbox);
    if (wallet && !was && wallet.earned === 0 && wallet.coins > 0) hooks && hooks.toast(`You have ${fmt(wallet.coins)} coins to spend in the shop`);
  }
  function setCoins(n, earned) {
    if (!wallet) return;
    wallet.coins = n;
    if (earned) { wallet.earned += earned; bump(); }
    renderCoins();
    refresh();
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
  // ---- the pictures: 3D shots from game.js, cached; an <img data-k> waits for its shot
  const SLOT_NAME = { rider: 'Rider', suit: 'Suit', board: 'Board', helmet: 'Helmet', goggles: 'Goggles' };
  const SLOT_PLURAL = { rider: 'RIDERS', suit: 'SUITS', board: 'BOARDS', helmet: 'HELMETS', goggles: 'GOGGLES' };
  // a rider's four stats as little bars (1 to 5)
  const STAT_NAMES = [['speed', 'SPD'], ['air', 'AIR'], ['spin', 'SPN'], ['balance', 'BAL']];
  function statBars(st) {
    return `<span class="stats">${STAT_NAMES.map(([k, l]) => `<span class="st"><em>${l}</em><i>${[1, 2, 3, 4, 5].map((n) => `<b class="${n <= st[k] ? 'on' : ''}"></b>`).join('')}</i></span>`).join('')}</span>`;
  }
  SS.statBars = statBars;
  let picN = 0;
  function pic(look, sl) {
    const id = 'p' + ++picN;
    const now = hooks.thumb(look, sl, (url) => { const el = document.querySelector(`img[data-k="${id}"]`); if (el) el.src = url; });
    return `<img data-k="${id}" alt=""${now ? ` src="${now}"` : ''}>`;
  }
  const nameOf = (it) => (it.id === 'stock' ? 'Stock' : it.name);
  const dotOf = (it) => {
    const c = it.slot === 'suit' ? suitColour(it) : it.board || it.helmet || it.lens;
    return c ? `<i class="dot" style="background:${cssOf(c)}"></i>` : '';
  };
  function suitColour(it) { return it.pal !== undefined ? SS.PALETTE[it.pal].jacket : it.jacket; }

  // ---- LOCKER: what you're wearing, slot by slot, and what you can put on
  function renderLocker() {
    const look = currentLook();
    $('slotTiles').innerHTML = I.SLOTS.map((sl) => {
      const it = I.get(sl, look[sl]) || I[LISTS[sl]][0];
      return `<button type="button" class="tile${sl === slot ? ' sel' : ''}" data-slot="${sl}">${pic(look, sl)}<span class="tl">${SLOT_NAME[sl]}</span><span class="tn">${esc(nameOf(it))}</span></button>`;
    }).join('');
    $('lockerListLabel').textContent = SLOT_PLURAL[slot];
    $('lockerGrid').classList.toggle('riders', slot === 'rider');
    $('lockerGrid').innerHTML = I[LISTS[slot]].map((it) => {
      const own = owns(it), on = equipped(it);
      const l = withItem(it);
      if (it.slot === 'rider') return `<button type="button" class="tile rider-tile${on ? ' on' : ''}" data-slot="rider" data-id="${esc(it.id)}" title="${esc(it.name)}">${pic(l, 'rider')}<span class="tl">${on ? 'RIDING' : esc(it.tag.toUpperCase())}</span><span class="tn">${esc(it.name)}</span>${statBars(it.stats)}</button>`;
      return `<button type="button" class="tile${on ? ' on' : ''}${own ? '' : ' locked'}" data-slot="${it.slot}" data-id="${esc(it.id)}" title="${esc(nameOf(it))}${own ? '' : ' · ' + fmt(it.price) + ' coins in the shop'}">${pic(l, it.slot)}<span class="tl">${own ? (on ? 'WEARING' : TIER[it.tier] || '') : fmt(it.price) + ' COINS'}</span><span class="tn">${esc(nameOf(it))}</span></button>`;
    }).join('');
    const hint = $('lockerHint');
    if (!signedIn()) hint.innerHTML = SS.Account && SS.Account.online
      ? 'Pick any rider. Guests can wear the ten free suits. <button type="button" class="linkbtn" data-a="up" style="display:inline;margin:0">Create an account</button> to earn coins and unlock the rest.'
      : 'Pick a rider and wear any of the ten free suits. Drag your rider to turn them round.';
    else hint.textContent = 'Tap anything you own to put it on. Locked gear is in the shop. Your look shows in multiplayer too.';
  }

  // ---- SHOP: big cards, tap one to try it on
  function card(it) {
    const own = owns(it), on = equipped(it), sel = picked && picked.slot === it.slot && picked.id === it.id;
    const badge = on ? '<span class="own on">WEARING</span>' : own ? '<span class="own">OWNED</span>' : '';
    return `<button type="button" class="sitem t-${it.tier}${sel ? ' sel' : ''}" data-slot="${it.slot}" data-id="${esc(it.id)}">
      <span class="price">${COIN}${fmt(it.price)}</span>${badge}${pic(withItem(it), it.slot)}
      <span class="meta"><small>${SLOT_NAME[it.slot]} &middot; ${TIER[it.tier] || ''}</small><b>${esc(it.name)}</b></span></button>`;
  }
  function renderShop() {
    document.querySelectorAll('#shopSlots button').forEach((b) => b.classList.toggle('sel', b.dataset.slot === shopSlot));
    const slots = (shopSlot === 'all' ? I.SLOTS : [shopSlot]).filter((sl) => sl !== 'rider');
    $('shopGrid').innerHTML = slots.map((sl) => {
      const items = I[LISTS[sl]].filter((it) => it.price > 0);
      return (shopSlot === 'all' ? `<div class="shop-sec"><h3 class="brush">${SLOT_NAME[sl]}s</h3><span class="kicker">${items.length} ITEMS</span></div>` : '')
        + `<div class="shop-grid">${items.map(card).join('')}</div>`;
    }).join('');
    const hint = $('shopHint');
    if (!signedIn()) hint.innerHTML = SS.Account && SS.Account.online
      ? 'Tap anything to try it on. <button type="button" class="linkbtn" data-a="up" style="display:inline;margin:0">Create an account</button> or <button type="button" class="linkbtn" data-a="in" style="display:inline;margin:0">sign in</button> to earn coins and buy gear.'
      : 'Tap anything to try it on. Buying works in the online game, with an account.';
    else hint.textContent = `Earn coins: ${I.runCoins(0)}–150 for every run, ${I.STAR_COINS} for each new star and ${I.RACE_PRIZES[0]} for winning a multiplayer race.`;
    renderTryOn();
  }
  function renderTryOn() {
    const box = $('tryOn'), act = $('storeAct');
    const open = !!picked && page === 'shop';
    box.classList.toggle('hidden', !open);
    box.parentNode.classList.toggle('trying', open);
    if (hooks) hooks.stageLook(open ? previewLook() : null);
    if (!open) return;
    const it = picked, own = owns(it), on = equipped(it);
    let btn;
    if (!signedIn()) btn = `<button type="button" class="btn primary wide" data-act="signin">SIGN IN TO BUY</button>`;
    else if (on) btn = `<button type="button" class="btn outline wide" disabled>WEARING</button>`;
    else if (own) btn = `<button type="button" class="btn primary wide" data-act="wear">WEAR IT</button>`;
    else if (wallet.coins < it.price) btn = `<button type="button" class="btn outline wide" disabled>NEED ${fmt(it.price - wallet.coins)} MORE COINS</button>`;
    else btn = `<button type="button" class="btn primary wide" data-act="buy">${confirmBuy ? 'CONFIRM: BUY FOR' : 'BUY'} ${COIN}${fmt(it.price)}</button>`;
    act.innerHTML = `<div class="ti-tier t-${it.tier}">${TIER[it.tier] || ''} ${SLOT_NAME[it.slot].toUpperCase()}</div><div class="ti-name">${esc(it.name)}</div>
      <p class="ti-sub">${own ? 'You own this.' : `${COIN} ${fmt(it.price)} coins${wallet ? ` &middot; you have ${fmt(wallet.coins)}` : ''}`}</p>${btn}`;
  }
  function previewLook() {
    const l = currentLook();
    if (picked) l[picked.slot] = picked.id;
    return l;
  }
  function closeTryOn() { picked = null; confirmBuy = false; renderShop(); }

  // whichever page is showing, drawn again (your look or wallet changed)
  function refresh() {
    if (!hooks) return;
    if (page === 'locker') renderLocker();
    else if (page === 'shop') renderShop();
  }
  function setPage(pg) {
    page = pg;
    if (pg !== 'shop') { picked = null; confirmBuy = false; }
    refresh();
    if (signedIn() && (pg === 'shop' || pg === 'locker')) refreshWallet();
  }
  async function refreshWallet() {
    const r = await api('GET', '/api/wallet');
    if (r.status === 200) setWallet(r.data.wallet);
  }
  async function buy(it) {
    if (busy) return;
    if (!confirmBuy) { confirmBuy = true; renderTryOn(); return; }
    busy = true;
    const r = await api('POST', '/api/shop/buy', { slot: it.slot, id: it.id });
    busy = false;
    confirmBuy = false;
    if (r.status !== 200) { hooks.toast(r.data.error || 'Couldn’t buy that. Try again.'); renderTryOn(); return; }
    wallet = Object.assign(wallet, { coins: r.data.wallet.coins, owned: r.data.wallet.owned });
    renderCoins();
    hooks.toast(`${it.name} is yours!`);
    await wear(it);
  }
  async function wear(it) {
    if (!signedIn()) {
      // guests: only the free outfits
      if (it.slot === 'suit' && it.pal !== undefined) { hooks.setOutfit(it.pal); flashSaved(); }
      else if (it.slot === 'rider') { hooks.setRider(it.id); flashSaved(); }
      else if (owns(it) && it.id === 'stock') { /* stock is all a guest has */ }
      refresh();
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
    flashSaved();
    refresh();
  }
  function flashSaved() {
    const el = $('lockerSaved');
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
  // the free suits (guests' outfit picker)
  function wearFree(i) {
    const it = I.suits[i];
    if (signedIn() && it && wallet.equip.suit !== it.id) wear(it);
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
    if (!$('slotTiles')) return;
    $('slotTiles').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      b.blur();
      slot = b.dataset.slot;
      renderLocker();
    });
    $('lockerGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      b.blur();
      const it = I.get(b.dataset.slot, b.dataset.id);
      if (!it) return;
      if (owns(it)) { wear(it); return; }
      // not yours yet: try it on in the shop
      picked = it;
      confirmBuy = false;
      if (hooks.setPage) hooks.setPage('shop');
    });
    $('shopSlots').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      b.blur();
      shopSlot = b.dataset.slot;
      renderShop();
    });
    $('shopGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.sitem');
      if (!b) return;
      b.blur();
      const it = I.get(b.dataset.slot, b.dataset.id);
      if (!it) return;
      picked = picked && picked.id === it.id && picked.slot === it.slot ? null : it;
      confirmBuy = false;
      renderShop();
    });
    $('tryOnX').addEventListener('click', (e) => { e.currentTarget.blur(); closeTryOn(); });
    $('storeAct').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !picked) return;
      b.blur();
      if (b.dataset.act === 'buy') buy(picked);
      else if (b.dataset.act === 'wear') wear(picked);
      else if (b.dataset.act === 'signin') SS.Account && SS.Account.open('up', $('title'));
    });
    for (const id of ['shopHint', 'lockerHint']) $(id).addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b && SS.Account) SS.Account.open(b.dataset.a, $('title'));
    });
    // Esc closes the try-on first (before the game sees it)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || (SS.Account && SS.Account.isOpen())) return;
      if (picked && page === 'shop' && !$('title').classList.contains('hidden')) { e.stopImmediatePropagation(); closeTryOn(); }
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
    page: setPage,
    refresh,
    openStore: (m) => hooks && hooks.setPage && hooks.setPage(m === 'locker' ? 'locker' : 'shop'),
    openCups: () => hooks && hooks.setPage && hooks.setPage('cups'),
    // your look for drawing (null for a guest: the free outfit number is used instead)
    look: () => (wallet ? Object.assign({}, wallet.equip) : null),
    get coins() { return wallet ? wallet.coins : null; },
    get signedIn() { return signedIn(); },
    isOpen: () => !!picked && page === 'shop',
  };
})();
