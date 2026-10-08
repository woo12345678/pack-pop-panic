'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules.js');

function playing() { return R.start(R.newRun(42)); }
function released(ms) { return R.prepareRelease(R.advanceHold(R.beginHold(playing()), ms)); }

test('hold growth is monotonic', () => {
  let s = R.beginHold(playing()), last = s.blast;
  for (let i = 0; i < 30; i++) { s = R.advanceHold(s, 100); assert.ok(s.blast >= last); last = s.blast; }
});
test('collector reports exact before/add/after', () => assert.deepEqual(R.collect(17, 'gold'), { before: 17, add: 5, after: 22 }));
test('collector changes authoritative held blast exactly', () => { const s=R.beginHold(playing()), out=R.collectBlast(s,'scrap'); assert.deepEqual(out.change,{before:12,add:1,after:13}); assert.equal(out.state.blast,13); });
test('collected objects count once toward lot and run quotas', () => { const s=R.beginHold(playing()), out=R.collectBlast(s,'gold'); assert.equal(out.state.destroyed,1); assert.equal(out.state.runDestroyed,1); assert.equal(out.state.collectorBonus,5); });
test('perfect redline doubles prepared value', () => { const s = released(2500); assert.equal(s.preparedBlast.timing, 'perfect'); assert.equal(s.preparedBlast.value, s.preparedBlast.base * 2); });
test('overheat applies floor of sixty percent', () => { const s = released(3600); assert.equal(s.preparedBlast.timing, 'overheat'); assert.equal(s.preparedBlast.value, Math.floor(s.preparedBlast.base * .6)); });
test('preview and applied values are identical', () => { let s = released(1700), v = s.preparedBlast.value; s = R.applyExplosion(s, v); assert.equal(s.lastResult.preparedValue, v); assert.equal(s.lastResult.appliedValue, v); });
test('prepared blast stays frozen through explosion and tally', () => { let s = released(2500), p = s.preparedBlast, v=p.value; assert.ok(Object.isFrozen(p)); s = R.applyExplosion(s, 50); assert.equal(s.preparedBlast, p); assert.equal(s.lastResult.preparedValue,v); assert.equal(s.lastResult.appliedValue,v); });
test('prepared value survives into the final result', () => { let s=Object.assign(playing(),{lotIndex:3,quota:1,destroyed:0}); s=R.prepareRelease(R.advanceHold(R.beginHold(s),2500)); const p=s.preparedBlast; s=R.applyExplosion(s,1); s=R.finishTally(s); assert.equal(s.phase,'result'); assert.equal(s.preparedBlast,p); assert.equal(s.lastResult.preparedValue,p.value); });
test('seeded lots are deterministic and seeds differ', () => { assert.deepEqual(R.generateLot(9, 1), R.generateLot(9, 1)); assert.notDeepEqual(R.generateLot(9, 1), R.generateLot(10, 1)); });
test('relay propagation never exceeds budget', () => { const lot = R.generateLot(42, 0); const p = R.propagate(lot, {x:4,y:3}, 13); assert.ok(p.spent <= 13); assert.equal(new Set(p.hitIds).size, p.hitIds.length); });
test('propagation crosses old rubble without spending the new blast', () => { const lot=R.generateLot(42,0), first=R.propagate(lot,{x:4,y:3},12), second=R.propagate(lot,{x:4,y:3},12,first.hitIds); assert.equal(second.spent,12); assert.equal(second.hitIds.some(id=>first.hitIds.includes(id)),false); });
test('consumed collection IDs cannot be hit again while retaining relay traversal', () => { const lot=R.generateLot(42,0), consumed=[lot.cells.find(c=>c.type==='scrap').id,lot.cells.find(c=>c.type==='gold').id], p=R.propagate(lot,{x:4,y:3},20,consumed); assert.equal(p.hitIds.some(id=>consumed.includes(id)),false); assert.equal(new Set(p.hitIds).size,p.hitIds.length); });
test('each deterministic lot is winnable in three reasonable perfect releases', () => { for(let li=0;li<R.LOT_CONFIG.length;li++){const lot=R.generateLot(73421,li),gone=[];for(let charge=0;charge<3&&gone.length<lot.quota;charge++){const budget=(R.LOT_CONFIG[li].base+Math.floor(2500/180))*2;gone.push(...R.propagate(lot,{x:4,y:3},budget,gone).hitIds)}assert.ok(gone.length>=lot.quota,`lot ${li} cleared ${gone.length}/${lot.quota}`)} });
test('quota transitions through lots to victory', () => { let s = playing(); for (let i=0;i<4;i++) { s = R.prepareRelease(R.advanceHold(R.beginHold(s),2500)); s=R.applyExplosion(s,100); s=R.finishTally(s); if (s.phase==='draft') s=R.chooseUpgrade(s,s.offered[0]); } assert.equal(s.phase,'result'); assert.equal(s.won,true); });
test('missing quota after three charges fails', () => { let s=playing(); for(let i=0;i<3;i++){s=R.prepareRelease(R.beginHold(s));s=R.applyExplosion(s,0);s=R.finishTally(s);} assert.equal(s.phase,'result');assert.equal(s.won,false); });
test('pause freezes hold and honors pause ownership', () => { let s=R.advanceHold(R.beginHold(playing()),500); s=R.setPaused(s,true,'visibility'); const frozen=R.advanceHold(s,999); assert.equal(frozen.holdMs,500); assert.equal(R.setPaused(frozen,false,'user').paused,true); assert.equal(R.setPaused(frozen,false,'visibility').paused,false); });

test('seeded run has four labeled trait lots that stay winnable across a broad sweep', () => {
  assert.equal(R.LOT_CONFIG.length, 4);
  const traits = new Set();
  for (let seed = 1; seed <= 128; seed++) {
    const signature = [];
    for (let li = 0; li < 4; li++) {
      const lot = R.generateLot(seed, li);
      assert.ok(lot.trait && lot.trait.id && lot.trait.name && lot.trait.effect);
      traits.add(lot.trait.id);
      signature.push(lot.trait.id + ':' + lot.cells.map(c => c.type[0]).join(''));
      const gone = [];
      for (let charge = 0; charge < 3 && gone.length < lot.quota; charge++) {
        const budget = (lot.base + Math.floor(2500 / 180)) * 2;
        gone.push(...R.propagate(lot, {x: 4, y: 3}, budget, gone).hitIds);
      }
      assert.ok(gone.length >= lot.quota, `seed ${seed} lot ${li}: ${gone.length}/${lot.quota}`);
    }
    assert.deepEqual(signature, [0, 1, 2, 3].map(li => {
      const lot = R.generateLot(seed, li);
      return lot.trait.id + ':' + lot.cells.map(c => c.type[0]).join('');
    }));
  }
  assert.deepEqual([...traits].sort(), ['dense', 'hot', 'relay']);
});

test('cleared lots 1-3 draft exactly three next tiers and only offered choices advance', () => {
  let s = playing();
  const pick = ['pack-1', 'pack-2', 'pop-1'];
  for (let lot = 0; lot < 3; lot++) {
    s = R.prepareRelease(R.advanceHold(R.beginHold(s), 2500));
    s = R.finishTally(R.applyExplosion(s, 999));
    assert.equal(s.phase, 'draft');
    assert.equal(s.lotIndex, lot);
    assert.deepEqual(s.offered, [
      `pack-${s.branchLevels.pack + 1}`,
      `pop-${s.branchLevels.pop + 1}`,
      `panic-${s.branchLevels.panic + 1}`
    ]);
    assert.equal(new Set(s.offered).size, 3);
    const frozen = structuredClone(s);
    assert.deepEqual(R.chooseUpgrade(s, 'not-offered'), s);
    assert.deepEqual(s, frozen);
    s = R.chooseUpgrade(s, pick[lot]);
    assert.equal(s.phase, 'playing');
    assert.equal(s.lotIndex, lot + 1);
    assert.equal(s.charges, 3);
  }
  assert.deepEqual(s.ownedUpgrades, ['pack-1', 'pack-2', 'pop-1']);
  assert.deepEqual(s.branchLevels, { pack: 2, pop: 1, panic: 0 });
  assert.deepEqual(R.chooseUpgrade(s, 'pack-1'), s);
});

test('PACK and PANIC tiers aggregate into the authoritative prepared blast', () => {
  assert.equal(Object.keys(R.UPGRADES).length, 9);
  Object.values(R.UPGRADES).forEach(u => {
    assert.ok(u.effect && u.before && u.after, `${u.id} needs concrete visible effect metadata`);
  });
  let s = Object.assign(playing(), {
    ownedUpgrades: ['pack-1','pack-2','pack-3','panic-1','panic-2','panic-3'],
    branchLevels: {pack:3,pop:0,panic:3}
  });
  const m = R.deriveModifiers(s.ownedUpgrades);
  assert.deepEqual(m, {
    holdGrowth: 1.25, goldValue: 10, starterLoad: 6,
    relayReach: 0, rubbleBridge: 1, targetLock: false,
    perfectStart: 2150, perfectEnd: 3050, perfectMultiplier: 3, overheatFloor: .8
  });
  s = R.beginHold(s);
  assert.equal(s.blast, R.LOT_CONFIG[0].base + 6);
  s = R.advanceHold(s, 1800);
  assert.equal(s.blast, R.LOT_CONFIG[0].base + 6 + Math.floor(10 * 1.25));
  const gold = R.collectBlast(s, 'gold');
  assert.equal(gold.change.add, 10);
  s = R.prepareRelease(R.advanceHold(gold.state, 400));
  assert.equal(s.preparedBlast.timing, 'perfect');
  assert.equal(s.preparedBlast.multiplier, 3);
  assert.equal(s.preparedBlast.value, s.preparedBlast.base * 3);
  let hot = R.beginHold(Object.assign(playing(), {ownedUpgrades:['panic-3'], branchLevels:{pack:0,pop:0,panic:3}}));
  hot = R.prepareRelease(R.advanceHold(hot, 3600));
  assert.equal(hot.preparedBlast.value, Math.floor(hot.preparedBlast.base * .8));
});

test('POP tiers improve deterministic routing without spending above the frozen budget', () => {
  const relayLot = {cells:[
    {id:0,x:0,y:0,type:'relay'}, {id:1,x:1,y:0,type:'scrap'}, {id:2,x:3,y:0,type:'scrap'}
  ]};
  const plain = R.propagate(relayLot,{x:0,y:0},3,[],R.deriveModifiers([]));
  const coil = R.propagate(relayLot,{x:0,y:0},3,[],R.deriveModifiers(['pop-1']));
  assert.deepEqual(plain.hitIds,[0,1]);
  assert.deepEqual(coil.hitIds,[0,1,2]);

  const rubbleLot = {cells:[
    {id:0,x:0,y:0,type:'scrap'}, {id:1,x:1,y:0,type:'scrap'}, {id:2,x:3,y:0,type:'scrap'}
  ]};
  assert.deepEqual(R.propagate(rubbleLot,{x:0,y:0},2,[0,1],R.deriveModifiers([])).hitIds,[]);
  assert.deepEqual(R.propagate(rubbleLot,{x:0,y:0},2,[0,1],R.deriveModifiers(['pop-2'])).hitIds,[2]);

  const targetLot = {cells:[
    {id:0,x:0,y:0,type:'scrap'}, {id:1,x:4,y:0,type:'scrap'},
    {id:2,x:5,y:0,type:'scrap'}, {id:3,x:4,y:1,type:'scrap'}
  ]};
  const locked = R.targetOrigin(targetLot,{x:0,y:0},3,[],R.deriveModifiers(['pop-3']));
  assert.deepEqual(locked,{x:4,y:0});
  const routed = R.propagate(targetLot,locked,3,[],R.deriveModifiers(['pop-3']));
  assert.equal(routed.spent,3);
  assert.ok(routed.spent <= routed.budget);
  assert.equal(new Set(routed.hitIds).size,routed.hitIds.length);
});

test('PACK, POP, and PANIC each support a complete three-draft run', () => {
  for (const branch of ['pack','pop','panic']) {
    let s = playing();
    for (let lot = 0; lot < 3; lot++) {
      s = R.finishTally(R.applyExplosion(R.prepareRelease(R.advanceHold(R.beginHold(s),2500)),999));
      assert.equal(s.phase,'draft');
      s = R.chooseUpgrade(s,`${branch}-${lot+1}`);
    }
    assert.equal(s.branchLevels[branch],3);
    assert.deepEqual(s.ownedUpgrades,[`${branch}-1`,`${branch}-2`,`${branch}-3`]);
    s = R.finishTally(R.applyExplosion(R.prepareRelease(R.advanceHold(R.beginHold(s),2500)),999));
    assert.equal(s.phase,'result');
    assert.equal(s.won,true);
  }
});

test('restart creates a clean seeded build, draft, and blast lifecycle', () => {
  let dirty = playing();
  dirty = R.finishTally(R.applyExplosion(R.prepareRelease(R.advanceHold(R.beginHold(dirty),2500)),999));
  dirty = R.chooseUpgrade(dirty,'pack-1');
  const reset = R.start(R.newRun(8675309));
  assert.equal(reset.seed,8675309);
  assert.equal(reset.lotIndex,0);
  assert.equal(reset.phase,'playing');
  assert.deepEqual(reset.ownedUpgrades,[]);
  assert.deepEqual(reset.offered,[]);
  assert.deepEqual(reset.branchLevels,{pack:0,pop:0,panic:0});
  assert.equal(reset.preparedBlast,null);
  assert.equal(reset.charges,3);
});
