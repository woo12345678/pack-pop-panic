(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PackPopRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LOT_CONFIG = [
    { name: '철거 연습장', en: 'WARM-UP YARD', quota: 30, base: 12 },
    { name: '압축 창고', en: 'CRUSH DEPOT', quota: 42, base: 15 },
    { name: '연쇄 환승장', en: 'RELAY JUNCTION', quota: 46, base: 17 },
    { name: '거대 굴뚝', en: 'LAST STACK', quota: 48, base: 18 }
  ];
  var TRAITS = [
    { id: 'dense', name: '고밀도 적재', en: 'DENSE PACKING', effect: '고철이 더 촘촘합니다' },
    { id: 'relay', name: '릴레이 풍부', en: 'RELAY-RICH ROUTE', effect: '릴레이 경로가 더 많습니다' },
    { id: 'hot', name: '뜨거운 레드라인', en: 'HOT REDLINE', effect: '황금 드럼이 많아 수치가 빠르게 뜁니다' }
  ];
  var UPGRADES = Object.freeze({
    'pack-1': { id: 'pack-1', branch: 'pack', tier: 1, name: 'PRESSURE RAM', ko: '압력 램', effect: '홀드 성장', before: '100%', after: '125%' },
    'pack-2': { id: 'pack-2', branch: 'pack', tier: 2, name: 'GOLD TEETH', ko: '황금 이빨', effect: '황금 드럼', before: '+5', after: '+10' },
    'pack-3': { id: 'pack-3', branch: 'pack', tier: 3, name: 'STARTER LOAD', ko: '시동 장약', effect: '시작 장전', before: '+0칸', after: '+6칸' },
    'pop-1': { id: 'pop-1', branch: 'pop', tier: 1, name: 'RELAY COIL', ko: '릴레이 코일', effect: '릴레이 도달', before: '+0칸', after: '+1칸' },
    'pop-2': { id: 'pop-2', branch: 'pop', tier: 2, name: 'RUBBLE BRIDGE', ko: '잔해 다리', effect: '잔해 연결', before: '1개', after: '2개' },
    'pop-3': { id: 'pop-3', branch: 'pop', tier: 3, name: 'TARGET LOCK', ko: '표적 고정', effect: '조준', before: '수동 시작', after: '최대 연쇄 고정' },
    'panic-1': { id: 'panic-1', branch: 'panic', tier: 1, name: 'FAT REDLINE', ko: '넓은 레드라인', effect: '완벽 구간', before: '0.50초', after: '0.90초' },
    'panic-2': { id: 'panic-2', branch: 'panic', tier: 2, name: 'TRIPLE HIT', ko: '트리플 히트', effect: '완벽 배수', before: '×2', after: '×3' },
    'panic-3': { id: 'panic-3', branch: 'panic', tier: 3, name: 'SAFETY VALVE', ko: '안전 밸브', effect: '과열 하한', before: '60%', after: '80%' }
  });

  function deriveModifiers(owned) {
    var set = new Set(owned || []);
    return {
      holdGrowth: set.has('pack-1') ? 1.25 : 1,
      goldValue: set.has('pack-2') ? 10 : 5,
      starterLoad: set.has('pack-3') ? 6 : 0,
      relayReach: set.has('pop-1') ? 1 : 0,
      rubbleBridge: set.has('pop-2') ? 2 : 1,
      targetLock: set.has('pop-3'),
      perfectStart: set.has('panic-1') ? 2150 : 2350,
      perfectEnd: set.has('panic-1') ? 3050 : 2850,
      perfectMultiplier: set.has('panic-2') ? 3 : 2,
      overheatFloor: set.has('panic-3') ? 0.8 : 0.6
    };
  }

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
    var trait = TRAITS[(seed + index * 7) % TRAITS.length];
    var cols = 9, rows = 6, cells = [], id = 0;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var roll = rnd();
        var goldEdge = trait.id === 'hot' ? 0.16 : trait.id === 'dense' ? 0.12 : 0.10;
        var relayEdge = goldEdge + (trait.id === 'relay' ? 0.22 : 0.12);
        var scrapEdge = trait.id === 'dense' ? 0.91 : 0.82;
        var type = roll < goldEdge ? 'gold' : roll < relayEdge ? 'relay' : roll < scrapEdge ? 'scrap' : 'wall';
        cells.push({ id: id++, x: x, y: y, type: type, hp: type === 'wall' ? 2 : 1, jitter: Math.round(rnd() * 1000) });
      }
    }
    return { index: index, name: cfg.name, en: cfg.en, quota: cfg.quota, base: cfg.base, trait: Object.assign({}, trait), cols: cols, rows: rows, cells: cells };
  }

  function newRun(seed) {
    seed = seed == null ? 73421 : seed >>> 0;
    return { seed: seed, phase: 'title', lotIndex: 0, charges: 3, destroyed: 0, runDestroyed: 0, runQuota: LOT_CONFIG.reduce(function (n, lot) { return n + lot.quota; }, 0), quota: LOT_CONFIG[0].quota, holding: false, paused: false, pauseOwner: null, holdMs: 0, collectorBonus: 0, blast: 0, preparedBlast: null, lastResult: null, won: false, offered: [], ownedUpgrades: [], branchLevels: { pack: 0, pop: 0, panic: 0 } };
  }

  function start(state) {
    if (state.phase !== 'title' && state.phase !== 'result') return state;
    return Object.assign(newRun(state.seed), { phase: 'playing' });
  }

  function beginHold(state) {
    if (state.phase !== 'playing' || state.paused || state.holding || state.charges < 1) return state;
    var mods = deriveModifiers(state.ownedUpgrades);
    return Object.assign({}, state, { holding: true, holdMs: 0, collectorBonus: 0, blast: LOT_CONFIG[state.lotIndex].base + mods.starterLoad, preparedBlast: null, lastResult: null });
  }

  function holdValue(lotIndex, ms, modifiers) {
    var mods = modifiers || deriveModifiers([]);
    return LOT_CONFIG[lotIndex].base + mods.starterLoad + Math.floor(Math.floor(clamp(ms, 0, 3600) / 180) * mods.holdGrowth);
  }

  function advanceHold(state, deltaMs) {
    if (!state.holding || state.paused || state.phase !== 'playing') return state;
    var ms = clamp(state.holdMs + Math.max(0, deltaMs), 0, 3600);
    return Object.assign({}, state, { holdMs: ms, blast: holdValue(state.lotIndex, ms, deriveModifiers(state.ownedUpgrades)) + state.collectorBonus });
  }

  function timingFor(ms, modifiers) {
    var mods = modifiers || deriveModifiers([]);
    if (ms >= 3600) return 'overheat';
    if (ms >= mods.perfectStart && ms <= mods.perfectEnd) return 'perfect';
    return 'normal';
  }

  function collect(current, kind, modifiers) {
    var mods = modifiers || deriveModifiers([]);
    var add = kind === 'gold' ? mods.goldValue : kind === 'scrap' ? 1 : 0;
    return { before: current, add: add, after: current + add };
  }
  function collectBlast(state, kind) {
    if (!state.holding || state.paused) return { state: state, change: null };
    var change = collect(state.blast, kind, deriveModifiers(state.ownedUpgrades));
    return { state: Object.assign({}, state, { collectorBonus: state.collectorBonus + change.add, blast: change.after, destroyed: state.destroyed + 1, runDestroyed: state.runDestroyed + 1 }), change: change };
  }

  function prepareRelease(state) {
    if (!state.holding || state.paused || state.phase !== 'playing') return state;
    var mods = deriveModifiers(state.ownedUpgrades), timing = timingFor(state.holdMs, mods);
    var base = state.blast;
    var applied = timing === 'perfect' ? base * mods.perfectMultiplier : timing === 'overheat' ? Math.floor(base * mods.overheatFloor) : base;
    var prepared = Object.freeze({ base: base, timing: timing, multiplier: timing === 'perfect' ? mods.perfectMultiplier : timing === 'overheat' ? mods.overheatFloor : 1, value: applied, holdMs: state.holdMs });
    return Object.assign({}, state, { holding: false, phase: 'exploding', charges: state.charges - 1, preparedBlast: prepared, lastResult: null });
  }

  function propagate(lot, origin, budget, excludedIds, modifiers) {
    var mods = modifiers || deriveModifiers([]);
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
      var reach = cell.type === 'relay' ? 2 + mods.relayReach : excluded.has(cell.id) ? mods.rubbleBridge : 1;
      for (var d = 1; d <= reach; d++) {
        queue.push({ x: p.x + d, y: p.y }); queue.push({ x: p.x - d, y: p.y });
        queue.push({ x: p.x, y: p.y + d }); queue.push({ x: p.x, y: p.y - d });
      }
    }
    return { hitIds: hit, spent: spent, budget: budget };
  }

  function targetOrigin(lot, requested, budget, excludedIds, modifiers) {
    var mods = modifiers || deriveModifiers([]);
    if (!mods.targetLock) return { x: requested.x, y: requested.y };
    var excluded = new Set(excludedIds || []), best = null;
    lot.cells.forEach(function (cell) {
      if (excluded.has(cell.id)) return;
      var result = propagate(lot, cell, budget, excludedIds, mods);
      var distance = Math.abs(cell.x - requested.x) + Math.abs(cell.y - requested.y);
      var candidate = { x: cell.x, y: cell.y, spent: result.spent, distance: distance };
      if (!best || candidate.spent > best.spent || (candidate.spent === best.spent && candidate.distance < best.distance) || (candidate.spent === best.spent && candidate.distance === best.distance && (candidate.y < best.y || (candidate.y === best.y && candidate.x < best.x)))) best = candidate;
    });
    return best ? { x: best.x, y: best.y } : { x: requested.x, y: requested.y };
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
      var offered = ['pack', 'pop', 'panic'].map(function (branch) { return branch + '-' + (state.branchLevels[branch] + 1); });
      return Object.assign({}, state, { phase: 'draft', offered: offered, holding: false });
    }
    if (state.charges <= 0) return Object.assign({}, state, { phase: 'result', won: false });
    return Object.assign({}, state, { phase: 'playing', blast: 0, preparedBlast: null });
  }

  function chooseUpgrade(state, id) {
    if (state.phase !== 'draft' || state.offered.indexOf(id) < 0 || state.ownedUpgrades.indexOf(id) >= 0 || !UPGRADES[id]) return state;
    var upgrade = UPGRADES[id], levels = Object.assign({}, state.branchLevels);
    if (upgrade.tier !== levels[upgrade.branch] + 1) return state;
    levels[upgrade.branch] = upgrade.tier;
    var next = state.lotIndex + 1;
    return Object.assign({}, state, { phase: 'playing', lotIndex: next, charges: 3, destroyed: 0, quota: LOT_CONFIG[next].quota, blast: 0, preparedBlast: null, lastResult: null, offered: [], ownedUpgrades: state.ownedUpgrades.concat(id), branchLevels: levels });
  }

  function setPaused(state, paused, owner) {
    if (state.phase === 'title' || state.phase === 'result') return state;
    if (paused) return Object.assign({}, state, { paused: true, pauseOwner: owner || 'user' });
    if (!state.paused || (owner && state.pauseOwner !== owner)) return state;
    return Object.assign({}, state, { paused: false, pauseOwner: null });
  }

  return { LOT_CONFIG: LOT_CONFIG, TRAITS: TRAITS, UPGRADES: UPGRADES, deriveModifiers: deriveModifiers, clamp: clamp, mulberry32: mulberry32, generateLot: generateLot, newRun: newRun, start: start, beginHold: beginHold, advanceHold: advanceHold, holdValue: holdValue, timingFor: timingFor, collect: collect, collectBlast: collectBlast, prepareRelease: prepareRelease, propagate: propagate, targetOrigin: targetOrigin, applyExplosion: applyExplosion, finishTally: finishTally, chooseUpgrade: chooseUpgrade, setPaused: setPaused };
});
