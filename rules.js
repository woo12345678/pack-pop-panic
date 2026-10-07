(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PackPopRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LOT_CONFIG = [
    { name: '철거 연습장', en: 'WARM-UP YARD', quota: 30, base: 12 },
    { name: '압축 창고', en: 'CRUSH DEPOT', quota: 42, base: 15 },
    { name: '거대 굴뚝', en: 'LAST STACK', quota: 48, base: 18 }
  ];

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function generateLot(seed, index) {
    var cfg = LOT_CONFIG[index];
    if (!cfg) throw new RangeError('lot index');
    var rnd = mulberry32((seed + index * 2654435761) >>> 0);
    var cols = 9, rows = 6, cells = [], id = 0;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var roll = rnd();
        var type = roll < 0.10 ? 'gold' : roll < 0.22 ? 'relay' : roll < 0.82 ? 'scrap' : 'wall';
        cells.push({ id: id++, x: x, y: y, type: type, hp: type === 'wall' ? 2 : 1, jitter: Math.round(rnd() * 1000) });
      }
    }
    return { index: index, name: cfg.name, en: cfg.en, quota: cfg.quota, base: cfg.base, cols: cols, rows: rows, cells: cells };
  }

  function newRun(seed) {
    seed = seed == null ? 73421 : seed >>> 0;
    return { seed: seed, phase: 'title', lotIndex: 0, charges: 3, destroyed: 0, runDestroyed: 0, runQuota: LOT_CONFIG.reduce(function (n, lot) { return n + lot.quota; }, 0), quota: LOT_CONFIG[0].quota, holding: false, paused: false, pauseOwner: null, holdMs: 0, collectorBonus: 0, blast: 0, preparedBlast: null, lastResult: null, won: false };
  }

  function start(state) {
    if (state.phase !== 'title' && state.phase !== 'result') return state;
    return Object.assign(newRun(state.seed), { phase: 'playing' });
  }

  function beginHold(state) {
    if (state.phase !== 'playing' || state.paused || state.holding || state.charges < 1) return state;
    return Object.assign({}, state, { holding: true, holdMs: 0, collectorBonus: 0, blast: LOT_CONFIG[state.lotIndex].base, preparedBlast: null, lastResult: null });
  }

  function holdValue(lotIndex, ms) {
    return LOT_CONFIG[lotIndex].base + Math.floor(clamp(ms, 0, 3600) / 180);
  }

  function advanceHold(state, deltaMs) {
    if (!state.holding || state.paused || state.phase !== 'playing') return state;
    var ms = clamp(state.holdMs + Math.max(0, deltaMs), 0, 3600);
    return Object.assign({}, state, { holdMs: ms, blast: holdValue(state.lotIndex, ms) + state.collectorBonus });
  }

  function timingFor(ms) {
    if (ms >= 3600) return 'overheat';
    if (ms >= 2350 && ms <= 2850) return 'perfect';
    return 'normal';
  }

  function collect(current, kind) {
    var add = kind === 'gold' ? 5 : kind === 'scrap' ? 1 : 0;
    return { before: current, add: add, after: current + add };
  }
  function collectBlast(state, kind) {
    if (!state.holding || state.paused) return { state: state, change: null };
    var change = collect(state.blast, kind);
    return { state: Object.assign({}, state, { collectorBonus: state.collectorBonus + change.add, blast: change.after, destroyed: state.destroyed + 1, runDestroyed: state.runDestroyed + 1 }), change: change };
  }

  function prepareRelease(state) {
    if (!state.holding || state.paused || state.phase !== 'playing') return state;
    var timing = timingFor(state.holdMs);
    var base = state.blast;
    var applied = timing === 'perfect' ? base * 2 : timing === 'overheat' ? Math.floor(base * 0.6) : base;
    var prepared = Object.freeze({ base: base, timing: timing, multiplier: timing === 'perfect' ? 2 : timing === 'overheat' ? 0.6 : 1, value: applied, holdMs: state.holdMs });
    return Object.assign({}, state, { holding: false, phase: 'exploding', charges: state.charges - 1, preparedBlast: prepared, lastResult: null });
  }

  function propagate(lot, origin, budget, excludedIds) {
    var byPos = new Map();
    var excluded = new Set(excludedIds || []);
    lot.cells.forEach(function (c) { byPos.set(c.x + ',' + c.y, c); });
    var queue = [{ x: origin.x, y: origin.y }], seen = new Set(), hit = [], spent = 0;
    while (queue.length && spent < budget) {
      var p = queue.shift(), key = p.x + ',' + p.y;
      if (seen.has(key)) continue;
      seen.add(key);
      var cell = byPos.get(key);
      if (!cell) continue;
      if (!excluded.has(cell.id)) { hit.push(cell.id); spent++; }
      var reach = cell.type === 'relay' ? 2 : 1;
      for (var d = 1; d <= reach; d++) {
        queue.push({ x: p.x + d, y: p.y }); queue.push({ x: p.x - d, y: p.y });
        queue.push({ x: p.x, y: p.y + d }); queue.push({ x: p.x, y: p.y - d });
      }
    }
    return { hitIds: hit, spent: spent, budget: budget };
  }

  function applyExplosion(state, destroyedNow) {
    if (state.phase !== 'exploding' || !state.preparedBlast) return state;
    var value = state.preparedBlast.value;
    var result = Object.freeze({ preparedValue: value, appliedValue: value, destroyed: Math.min(value, Math.max(0, destroyedNow == null ? value : destroyedNow)) });
    return Object.assign({}, state, { phase: 'tally', destroyed: state.destroyed + result.destroyed, runDestroyed: state.runDestroyed + result.destroyed, lastResult: result });
  }

  function finishTally(state) {
    if (state.phase !== 'tally') return state;
    if (state.destroyed >= state.quota) {
      if (state.lotIndex === LOT_CONFIG.length - 1) return Object.assign({}, state, { phase: 'result', won: true });
      var next = state.lotIndex + 1;
      return Object.assign({}, state, { phase: 'playing', lotIndex: next, charges: 3, destroyed: 0, quota: LOT_CONFIG[next].quota, blast: 0, preparedBlast: null, lastResult: null });
    }
    if (state.charges <= 0) return Object.assign({}, state, { phase: 'result', won: false });
    return Object.assign({}, state, { phase: 'playing', blast: 0, preparedBlast: null });
  }

  function setPaused(state, paused, owner) {
    if (state.phase === 'title' || state.phase === 'result') return state;
    if (paused) return Object.assign({}, state, { paused: true, pauseOwner: owner || 'user' });
    if (!state.paused || (owner && state.pauseOwner !== owner)) return state;
    return Object.assign({}, state, { paused: false, pauseOwner: null });
  }

  return { LOT_CONFIG: LOT_CONFIG, clamp: clamp, mulberry32: mulberry32, generateLot: generateLot, newRun: newRun, start: start, beginHold: beginHold, advanceHold: advanceHold, holdValue: holdValue, timingFor: timingFor, collect: collect, collectBlast: collectBlast, prepareRelease: prepareRelease, propagate: propagate, applyExplosion: applyExplosion, finishTally: finishTally, setPaused: setPaused };
});
