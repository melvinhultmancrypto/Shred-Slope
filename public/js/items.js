/*
 * Shred Slope: everything you can wear, and what it costs in coins.
 * Shared by the browser (window.SS.ITEMS) and the server (require), so prices and ids match.
 *
 * Coins are play money: you earn them by riding (runs, new stars, multiplayer races, cups) and
 * spend them here. They can't be bought or cashed out.
 *
 * Five slots: the rider (who you are, with their own stats), a suit (hoodie and pants), a board,
 * a hat and goggles. "stock" in the board, hat and goggles slots means "whatever comes with the suit".
 * The first ten suits are the free outfits everyone has (same order as the outfit picker, rider.js
 * PALETTE). The helmet slot.
 */
(function (root, make) {
  const ITEMS = make();
  if (typeof module === 'object' && module.exports) module.exports = ITEMS;
  else { root.SS = root.SS || {}; root.SS.ITEMS = ITEMS; }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const FREE = ['forest', 'blaze', 'glacier', 'bubblegum', 'lemon', 'ultraviolet', 'lagoon', 'inferno', 'whiteout', 'acid'];
  const FREE_NAMES = ['Forest', 'Blaze', 'Glacier', 'Bubblegum', 'Lemon', 'Ultraviolet', 'Lagoon', 'Inferno', 'Whiteout', 'Acid'];

  // the riders: everyone can pick any of them. Stats run 1 to 5 and add up to 12:
  // speed (top speed and glide), air (pop and hang time), spin (how fast you rotate and flip)
  // and balance (how forgiving landings, rails and edges are)
  const riders = [
    { id: 'kai', slot: 'rider', name: 'Kai', price: 0, tier: 'free', tag: 'All-rounder', stats: { speed: 3, air: 3, spin: 3, balance: 3 } },
    { id: 'mia', slot: 'rider', name: 'Mia', price: 0, tier: 'free', tag: 'Spinner', stats: { speed: 2, air: 3, spin: 5, balance: 2 } },
    { id: 'dre', slot: 'rider', name: 'Dre', price: 0, tier: 'free', tag: 'Speed', stats: { speed: 5, air: 3, spin: 2, balance: 2 } },
    { id: 'yuki', slot: 'rider', name: 'Yuki', price: 0, tier: 'free', tag: 'Big air', stats: { speed: 2, air: 5, spin: 3, balance: 2 } },
    { id: 'rio', slot: 'rider', name: 'Rio', price: 0, tier: 'free', tag: 'Steady', stats: { speed: 3, air: 2, spin: 2, balance: 5 } },
  ];
  const RIDER_IDS = riders.map((r) => r.id);

  // tiers colour the cards in the shop
  const suits = FREE.map((id, i) => ({ id, slot: 'suit', name: FREE_NAMES[i], price: 0, tier: 'free', pal: i }));
  suits.push(
    { id: 'candy', slot: 'suit', name: 'Candy Cane', price: 1000, tier: 'rare', jacket: '#f3f4f7', trim: '#e3262f', pants: '#c41f28', board: '#e3262f', stripe: '#ffffff', helmet: '#f3f4f7', lens: '#ff4f8b', boot: '#2b2a2e' },
    { id: 'lumber', slot: 'suit', name: 'Lumberjack', price: 1200, tier: 'rare', pat: 1, patCol: '#1b1416', jacket: '#b3261e', trim: '#1b1416', pants: '#2c3a52', board: '#c79a5b', stripe: '#3b2a1d', helmet: '#3b2a1d', lens: '#ffb02e', boot: '#6b4a2e' },
    { id: 'lava', slot: 'suit', name: 'Lava Flow', price: 1400, tier: 'rare', jacket: '#1c1c20', trim: '#ff5a1f', pants: '#1c1c20', board: '#ff5a1f', stripe: '#ffcc33', helmet: '#1c1c20', lens: '#ff7a1f', boot: '#1d1d21' },
    { id: 'arctic', slot: 'suit', name: 'Arctic Camo', price: 1500, tier: 'rare', pat: 2, patCol: '#a9b4c9', jacket: '#e8eef7', trim: '#5f6b80', pants: '#cfd8e6', board: '#2f7dff', stripe: '#ffffff', helmet: '#f2f2f4', lens: '#38c6ff', boot: '#d9d4c7' },
    { id: 'retro', slot: 'suit', name: "Retro '92", price: 1600, tier: 'epic', jacket: '#18b5b0', trim: '#e8409b', pants: '#4b2a86', board: '#ffd23f', stripe: '#e8409b', helmet: '#f2f2f4', lens: '#ff4fa0', boot: '#f2f2f4' },
    { id: 'tiger', slot: 'suit', name: 'Tiger Stripe', price: 1700, tier: 'epic', pat: 2, patCol: '#1a1a1a', jacket: '#f28a1a', trim: '#1a1a1a', pants: '#1a1a1a', board: '#f28a1a', stripe: '#1a1a1a', helmet: '#1a1a1a', lens: '#ffb02e', boot: '#1d1d21' },
    { id: 'aurora', slot: 'suit', name: 'Aurora', price: 1800, tier: 'epic', jacket: '#13c29a', trim: '#7b3fe4', pants: '#1b1640', board: '#7b3fe4', stripe: '#13c29a', helmet: '#1b1640', lens: '#4dffa6', boot: '#24262c' },
    { id: 'stealth', slot: 'suit', name: 'Stealth', price: 2000, tier: 'epic', jacket: '#1d1f25', trim: '#3a3f4b', pants: '#121317', board: '#16171b', stripe: '#ff2d55', helmet: '#16171b', lens: '#ff2d55', boot: '#16171b' },
    { id: 'midnight', slot: 'suit', name: 'Midnight Gold', price: 2200, tier: 'epic', jacket: '#16213f', trim: '#d4af37', pants: '#0f1426', board: '#16213f', stripe: '#d4af37', helmet: '#16213f', lens: '#d4af37', boot: '#1d1d21' },
    { id: 'gold', slot: 'suit', name: 'Gold Medal', price: 3000, tier: 'legendary', jacket: '#d9a521', trim: '#1b1c22', pants: '#f2f2f4', board: '#1b1c22', stripe: '#d9a521', helmet: '#f2f2f4', lens: '#ffb02e', boot: '#f2f2f4' },
  );

  const boards = [
    { id: 'stock', slot: 'board', name: 'Suit colours', price: 0, tier: 'free' },
    { id: 'b_classic', slot: 'board', name: 'Classic White', price: 300, tier: 'common', board: '#f2f2f4', stripe: '#1d2a4a' },
    { id: 'b_flame', slot: 'board', name: 'Flame', price: 600, tier: 'rare', board: '#ff3b1f', stripe: '#ffcc33' },
    { id: 'b_ice', slot: 'board', name: 'Ice Shard', price: 600, tier: 'rare', board: '#9fdcff', stripe: '#ffffff' },
    { id: 'b_carbon', slot: 'board', name: 'Carbon', price: 800, tier: 'rare', board: '#1a1b1f', stripe: '#5a6070' },
    { id: 'b_toxic', slot: 'board', name: 'Toxic', price: 800, tier: 'rare', board: '#7cff3a', stripe: '#1a1b1f' },
    { id: 'b_galaxy', slot: 'board', name: 'Galaxy', price: 1200, tier: 'epic', board: '#3b1f7a', stripe: '#ff7af2' },
    { id: 'b_gold', slot: 'board', name: 'Solid Gold', price: 2500, tier: 'legendary', board: '#e0b030', stripe: '#fff3c2', shine: [1.1, 60] },
  ];

  const helmets = [
    { id: 'stock', slot: 'helmet', name: 'Suit colours', price: 0, tier: 'free' },
    { id: 'h_white', slot: 'helmet', name: 'Snow White', price: 300, tier: 'common', helmet: '#f2f2f4' },
    { id: 'h_black', slot: 'helmet', name: 'Jet Black', price: 300, tier: 'common', helmet: '#16171b' },
    { id: 'h_red', slot: 'helmet', name: 'Cherry', price: 500, tier: 'rare', helmet: '#d9271f' },
    { id: 'h_blue', slot: 'helmet', name: 'Cobalt', price: 500, tier: 'rare', helmet: '#2f6dff' },
    { id: 'h_olive', slot: 'helmet', name: 'Olive', price: 600, tier: 'rare', helmet: '#55603a' },
    { id: 'h_chrome', slot: 'helmet', name: 'Chrome', price: 1500, tier: 'epic', helmet: '#c9ced8', shine: [0.6, 30] },
    { id: 'h_gold', slot: 'helmet', name: 'Gold Leaf', price: 2500, tier: 'legendary', helmet: '#e0b030', shine: [0.7, 30] },
  ];

  const goggles = [
    { id: 'stock', slot: 'goggles', name: 'Suit colours', price: 0, tier: 'free' },
    { id: 'g_fire', slot: 'goggles', name: 'Fire Iridium', price: 250, tier: 'common', lens: '#ff7a1f' },
    { id: 'g_ice', slot: 'goggles', name: 'Ice Blue', price: 250, tier: 'common', lens: '#38c6ff' },
    { id: 'g_smoke', slot: 'goggles', name: 'Smoke', price: 300, tier: 'common', lens: '#3a3f4b' },
    { id: 'g_emerald', slot: 'goggles', name: 'Emerald', price: 400, tier: 'rare', lens: '#2bd67b' },
    { id: 'g_rose', slot: 'goggles', name: 'Rose', price: 400, tier: 'rare', lens: '#ff4fa0' },
    { id: 'g_violet', slot: 'goggles', name: 'Violet', price: 500, tier: 'rare', lens: '#9a5cff' },
    { id: 'g_gold', slot: 'goggles', name: '24K', price: 800, tier: 'epic', lens: '#ffc93d', frame: '#2a2a2a' },
  ];

  const all = [...riders, ...suits, ...boards, ...helmets, ...goggles];
  const byKey = {};
  for (const it of all) byKey[it.slot + ':' + it.id] = it;

  return {
    SLOTS: ['rider', 'suit', 'board', 'helmet', 'goggles'],
    SLOT_NAMES: { rider: 'Riders', suit: 'Suits', board: 'Boards', helmet: 'Helmets', goggles: 'Goggles' },
    FREE_SUITS: FREE,
    RIDER_IDS,
    riders, suits, boards, helmets, goggles, all,
    get(slot, id) { return byKey[slot + ':' + id] || null; },
    // a rider's stats (an unknown id gets the all-rounder's)
    stats(id) { const r = byKey['rider:' + id] || riders[0]; return r.stats; },
    // the starting look: a rider, a free suit and its own board, hat and goggles
    defaultLook(i, rider) {
      const n = i | 0;
      return { rider: RIDER_IDS.includes(rider) ? rider : RIDER_IDS[(n % RIDER_IDS.length + RIDER_IDS.length) % RIDER_IDS.length], suit: FREE[(n % FREE.length + FREE.length) % FREE.length], board: 'stock', helmet: 'stock', goggles: 'stock' };
    },
    // what you earn (the server pays out; the numbers are here so the game can explain them)
    STARTER: 500,
    STAR_COINS: 25,
    runCoins(score) { return Math.max(0, Math.min(150, 10 + Math.floor((score || 0) / 150))); },
    RACE_PRIZES: [150, 100, 60],
    RACE_FINISH: 25,
    CUPS_OPEN: false, // the cups are coming soon: no new cups start and runs aren't entered in one
    CUPS: {
      daily: { name: 'Daily Cup', prizes: [1000, 600, 400], top10: 150, entry: 50 },
      weekly: { name: 'Weekly Cup', prizes: [5000, 3000, 2000], top10: 600, entry: 150 },
    },
  };
});
