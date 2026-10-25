import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {CivilizationSimulationSystem} from './src/CivilizationSimulationSystem.js';
import {WorldTradeAuthority} from './src/WorldTradeAuthority.mjs';
import {civRoadGraphFingerprint} from './src/CivilizationTrustedCheckpoint.mjs';
function create({distance=80,speed=2,ore=20,gold=30,
  passive=false,hunger=0.92,grievance=0.8,relation=-0.8,threat=0,blocked=false,
  guard=0,patrol=true,seed=6}={}) {
  const sim=new CivilizationSimulationSystem({distanceAwareTravel:true,caravanUnitsPerTick:speed});
  sim.registerNode('A',{factionId:'traders',market:{ORE:{sellPrice:8,buyPrice:8}}});
  sim.registerNode('B',{factionId:'town',market:{ORE:{sellPrice:25,buyPrice:25}}});
  sim.registerRoute('R',{fromNodeId:'A',toNodeId:'B',distance,baseSecurity:blocked?0.1:0.99,toll:3});
  const w=new WorldTradeAuthority(sim);
  w.seedNode('A',{ORE:ore},gold);w.seedNode('B',{ORE:0},5);
  if(patrol)w.addPatrol({id:'orc-band',faction:'orcs',routeIds:['R'],passive,hunger,grievance,toll:4});
  w.setRelation('orcs','traders',relation);
  w.sealGenesis(seed);
  return {w,threat,guard};
}
function dispatch(obj,id='shipment') {
  const {w,threat,guard}=obj;return w.dispatch({id,routeId:'R',fromNodeId:'A',faction:'traders',
    cargo:{ORE:16},gold:20,threat,guard});
}
function advance(world,n) {for(let j=0;j<n;j++)world.tick()}
function encounters(world) {return world.events.filter(x=>x.type==='encounter')}
function arrivals(world) {return world.events.filter(x=>x.type==='arrival_committed')}
let p=create({passive:true,hunger:1,grievance:1,relation:-1});
dispatch(p);advance(p.w,130);
assert.equal(encounters(p.w)[0]?.kind,'pass');
assert.equal(arrivals(p.w).length,1);
assert.equal(p.w.stocks.B.ORE,16);
assert.equal(p.w.factionLoot.orcs.ORE||0,0);
assert.equal(p.w.assertConservation(),true);
assert.throws(()=>dispatch(p),/duplicate shipment/);
assert.equal(p.w._settle(p.w.shipments.shipment,130),false);
assert.equal(arrivals(p.w).length,1);
let retaliate=create({passive:true,hunger:1,grievance:1,relation:-1,threat:0.9});
dispatch(retaliate);advance(retaliate.w,130);
assert.equal(encounters(retaliate.w)[0].kind,'attack');
assert.equal(retaliate.w.factionLoot.orcs.ORE,4);
assert.equal(retaliate.w.stocks.B.ORE,12);
assert.equal(retaliate.w.assertConservation(),true);
let hostile=create({passive:false});
dispatch(hostile);advance(hostile.w,130);
assert.equal(encounters(hostile.w)[0].kind,'attack');
assert.equal(hostile.w.factionLoot.orcs.ORE,4);
assert.equal(hostile.w.vaults.B,25);
let toll=create({passive:false,hunger:0.5,grievance:0,relation:0.2});
dispatch(toll);advance(toll.w,130);
assert.equal(encounters(toll.w)[0].kind,'toll');
assert.equal(toll.w.factionGold.orcs,4);
assert.equal(toll.w.vaults.B,21);
let blocked=create({blocked:true});
const preBlocked=JSON.stringify(blocked.w.getState());
assert.throws(()=>dispatch(blocked),/blocked/);
assert.equal(JSON.stringify(blocked.w.getState()),preBlocked);
let rng=0xD00DFEED;
const rnd=()=> {rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng;};
let replayCases=0,trustRejections=0;
for(let i=0;i<300;i++){
  const o={distance:22+rnd()%180,speed:1+rnd()%9,ore:20+rnd()%150,
    gold:22+rnd()%100,passive:(rnd()%2)===0,hunger:(rnd()%100)/100,
    grievance:(rnd()%100)/100,relation:(rnd()%201)/100-1,threat:(rnd()%100)/100,seed:rnd()};
  const a=create(o),b=create(o); dispatch(a);dispatch(b);
  const pause=rnd()%36, total=200;
  advance(a.w,total);advance(b.w,pause);
  const saved=JSON.parse(JSON.stringify(b.w.getState()));
  const trusted=civRoadGraphFingerprint(saved.sim);
  const c=create(o);
  c.w.restore(saved,trusted);
  advance(c.w,total-pause);
  assert.deepEqual(c.w.getState(),a.w.getState(),'seeded replay '+i);
  assert.equal(arrivals(c.w).length,1,'arrival '+i);
  assert.equal(encounters(c.w).length,1,'single encounter '+i);
  assert.equal(c.w.assertConservation(),true);
  assert.throws(()=>dispatch(c),/duplicate shipment/);
  const tampered=JSON.parse(JSON.stringify(saved));
  tampered.sim.routes[0].distance++;
  const before=JSON.stringify(c.w.getState());
  assert.throws(()=>c.w.restore(tampered,trusted),/graph differs/);
  assert.equal(JSON.stringify(c.w.getState()),before);
  trustRejections++;replayCases++;
}
let invalid=create({ore:30}),snapshotInvalid;
dispatch(invalid);advance(invalid.w,8);
const graph=civRoadGraphFingerprint(invalid.w.sim.getState());
snapshotInvalid=invalid.w.getState();
snapshotInvalid.stocks.A.ORE+=1;
const before=JSON.stringify(invalid.w.getState());
assert.throws(()=>invalid.w.restore(snapshotInvalid,graph),/conservation violated/);
assert.equal(JSON.stringify(invalid.w.getState()),before);
assert.throws(()=>invalid.w.seedNode('A',{ORE:5},2),/genesis sealed/);
assert.throws(()=>invalid.w.dispatch({id:'forgery',routeId:'R',fromNodeId:'A',
  faction:'traders',cargo:{ORE:99999},gold:1}),/insufficient/);
// Multiple roads and a roaming Orc patrol use deterministic seeds.
function roaming(seed){
  const sim=new CivilizationSimulationSystem({distanceAwareTravel:true});
  for(const x of ['A','B','C'])sim.registerNode(x);
  sim.registerRoute('AB',{fromNodeId:'A',toNodeId:'B',distance:100,baseSecurity:0.9});
  sim.registerRoute('BC',{fromNodeId:'B',toNodeId:'C',distance:100,baseSecurity:0.9});
  const w=new WorldTradeAuthority(sim);w.seedNode('A',{ORE:50},15);
  w.seedNode('B',{ORE:0},0);w.seedNode('C',{ORE:0},0);
  w.addPatrol({id:'orc-wanderers',faction:'orcs',routeIds:['AB','BC'],passive:false,
    hunger:0.3,grievance:0.1,roamEvery:5});
  w.sealGenesis(seed);advance(w,90);return w.getState();
}
assert.deepEqual(roaming(123),roaming(123));
assert.equal(roaming(123).events.filter(x=>x.type==='roam').length,18);
const perf=[];
for(const n of [10,100,1000]){
  const sim=new CivilizationSimulationSystem({distanceAwareTravel:true,caravanUnitsPerTick:3});
  sim.registerNode('A');sim.registerNode('B');
  sim.registerRoute('R',{fromNodeId:'A',toNodeId:'B',distance:200,baseSecurity:0.99});
  const w=new WorldTradeAuthority(sim);
  w.seedNode('A',{ORE:n*5},n*2);w.seedNode('B',{ORE:0},0);w.sealGenesis(7);
  for(let j=0;j<n;j++)w.dispatch({id:'C'+j,routeId:'R',fromNodeId:'A',faction:'traders',
    cargo:{ORE:5},gold:2});
  const times=[];
  for(let j=0;j<25;j++){
    const t=performance.now();w.tick();times.push(performance.now()-t);
  }
  times.sort((a,b)=>a-b);
  perf.push({caravans:n,p50ms:+times[12].toFixed(3),p95ms:+times[23].toFixed(3),
    tick:sim.tickCount,conserved:w.assertConservation()});
}
console.log(JSON.stringify({ok:true,seededCheckpointReplays:replayCases,
  corruptedGraphRejections:trustRejections,passiveProtection:true,
  threatenedPassiveRetaliation:true,hostileAttacks:true,exactTolls:true,
  blockedDispatch:true,exactlyOnceSettlement:true,deterministicOrcRoaming:true,
  inventoryAndGoldConserved:true,performance:perf},null,2));
