import assert from 'node:assert/strict';
import {CivilizationSimulationSystem} from '../../packages/core/src/CivilizationSimulationSystem.js';
import {WorldTradeAuthority} from '../../packages/core/src/WorldTradeAuthority.mjs';
import {civRoadGraphFingerprint} from '../../packages/core/src/CivilizationTrustedCheckpoint.mjs';
function make(){
 const s=new CivilizationSimulationSystem({distanceAwareTravel:true,caravanUnitsPerTick:1});
 s.registerNode('A');s.registerNode('B');s.registerRoute('R',{fromNodeId:'A',toNodeId:'B',distance:80,baseSecurity:0.99});
 const w=new WorldTradeAuthority(s);w.seedNode('A',{ORE:60},10);w.seedNode('B',{ORE:0},5);w.sealGenesis(12);
 w.dispatch({id:'a',routeId:'R',fromNodeId:'A',faction:'merchant',cargo:{ORE:8},gold:2});
 return w;
}
const live=make();for(let i=0;i<16;i++)live.tick();
const trusted=civRoadGraphFingerprint(live.sim.getState());
const original=JSON.stringify(live.getState());
function deny(transform,match){
 const tampered=JSON.parse(original);transform(tampered);
 assert.throws(()=>live.restore(tampered,trusted),match);
 assert.equal(JSON.stringify(live.getState()),original,'rejected checkpoint mutated live state');
}
deny(s=>{s.events=[]},/shipment journal disagreement/);
deny(s=>{s.events.push({...s.events[0]})},/shipment journal disagreement/);
deny(s=>{s.events[0].tick=1000},/invalid event order/);
deny(s=>{s.shipments.a.cargo.ORE=7;s.stocks.A.ORE++},/enroute escrow mismatch/);
deny(s=>{s.shipments.a.targetNodeId='A'},/shipment route disagreement/);
deny(s=>{s.sim.routes[0].distance++},/graph differs/);
// Checkpoint schema/provenance: a graph fingerprint does not validate the
// ledger's JSON dictionaries, journal references or caravan escrow fields.
deny(s=>{s.stocks=[]},/invalid checkpoint dictionary stocks/);
deny(s=>{s.patrols=[]},/invalid checkpoint dictionary patrols/);
deny(s=>{s.shipments.a.encounterDone='false'},/invalid restored shipment/);
deny(s=>{s.shipments.a.routeId='missing-route'},/invalid restored shipment/);
deny(s=>{
 const ghost=structuredClone(s.sim.entities[0]);
 ghost.id='trade:ghost';ghost.cargo={};ghost.wealth=0;ghost.routeProgress=0.99;
 s.sim.entities.push(ghost);
},/unclaimed trade entity/);
deny(s=>{s.events.push({type:'arrival_committed',shipmentId:'ghost',tick:s.sim.tickCount});},
 /unknown journal shipment/);
deny(s=>{s.events[0].type='unrecognized'},/unknown journal event/);
for(let i=0;i<120;i++)live.tick();
const completed=JSON.stringify(live.getState());
const same=civRoadGraphFingerprint(live.sim.getState());
const good=JSON.parse(completed);
assert.equal(good.events.filter(e=>e.type==='arrival_committed').length,1);
for(const mutator of [
 s=>{s.events=s.events.filter(e=>e.type!=='arrival_committed')},
 s=>{const e=s.events.find(e=>e.type==='arrival_committed');s.events.push({...e})},
 s=>{s.shipments.a.status='enroute'}
]){
 const bad=JSON.parse(completed);mutator(bad);
 assert.throws(()=>live.restore(bad,same),/journal disagreement|enroute escrow mismatch/);
 assert.equal(JSON.stringify(live.getState()),completed);
}
console.log('PASS: 16 corrupt ledger/journal/route/escrow/arrival checkpoints rejected atomically');
