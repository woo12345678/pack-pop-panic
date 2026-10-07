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
test('prepared value survives into the final result', () => { let s=Object.assign(playing(),{lotIndex:2,quota:1,destroyed:0}); s=R.prepareRelease(R.advanceHold(R.beginHold(s),2500)); const p=s.preparedBlast; s=R.applyExplosion(s,1); s=R.finishTally(s); assert.equal(s.phase,'result'); assert.equal(s.preparedBlast,p); assert.equal(s.lastResult.preparedValue,p.value); });
test('seeded lots are deterministic and seeds differ', () => { assert.deepEqual(R.generateLot(9, 1), R.generateLot(9, 1)); assert.notDeepEqual(R.generateLot(9, 1), R.generateLot(10, 1)); });
test('relay propagation never exceeds budget', () => { const lot = R.generateLot(42, 0); const p = R.propagate(lot, {x:4,y:3}, 13); assert.ok(p.spent <= 13); assert.equal(new Set(p.hitIds).size, p.hitIds.length); });
test('propagation crosses old rubble without spending the new blast', () => { const lot=R.generateLot(42,0), first=R.propagate(lot,{x:4,y:3},12), second=R.propagate(lot,{x:4,y:3},12,first.hitIds); assert.equal(second.spent,12); assert.equal(second.hitIds.some(id=>first.hitIds.includes(id)),false); });
test('consumed collection IDs cannot be hit again while retaining relay traversal', () => { const lot=R.generateLot(42,0), consumed=[lot.cells.find(c=>c.type==='scrap').id,lot.cells.find(c=>c.type==='gold').id], p=R.propagate(lot,{x:4,y:3},20,consumed); assert.equal(p.hitIds.some(id=>consumed.includes(id)),false); assert.equal(new Set(p.hitIds).size,p.hitIds.length); });
test('each deterministic lot is winnable in three reasonable perfect releases', () => { for(let li=0;li<R.LOT_CONFIG.length;li++){const lot=R.generateLot(73421,li),gone=[];for(let charge=0;charge<3&&gone.length<lot.quota;charge++){const budget=(R.LOT_CONFIG[li].base+Math.floor(2500/180))*2;gone.push(...R.propagate(lot,{x:4,y:3},budget,gone).hitIds)}assert.ok(gone.length>=lot.quota,`lot ${li} cleared ${gone.length}/${lot.quota}`)} });
test('quota transitions through lots to victory', () => { let s = playing(); for (let i=0;i<3;i++) { s = R.prepareRelease(R.advanceHold(R.beginHold(s),2500)); s=R.applyExplosion(s,100); s=R.finishTally(s); } assert.equal(s.phase,'result'); assert.equal(s.won,true); });
test('missing quota after three charges fails', () => { let s=playing(); for(let i=0;i<3;i++){s=R.prepareRelease(R.beginHold(s));s=R.applyExplosion(s,0);s=R.finishTally(s);} assert.equal(s.phase,'result');assert.equal(s.won,false); });
test('pause freezes hold and honors pause ownership', () => { let s=R.advanceHold(R.beginHold(playing()),500); s=R.setPaused(s,true,'visibility'); const frozen=R.advanceHold(s,999); assert.equal(frozen.holdMs,500); assert.equal(R.setPaused(frozen,false,'user').paused,true); assert.equal(R.setPaused(frozen,false,'visibility').paused,false); });
