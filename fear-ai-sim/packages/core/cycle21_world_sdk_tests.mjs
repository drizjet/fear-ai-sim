import assert from 'node:assert/strict';
import {CivilizationSimulationSystem} from './src/CivilizationSimulationSystem.js';
import {civRoadGraphFingerprint,restoreTrustedCivState} from './src/CivilizationTrustedCheckpoint.mjs';
import {fingerprintGraph,verifyTrustedGraph} from './src/RoadGraphFingerprint.mjs';
import {readFileSync} from 'node:fs';
const corpus = JSON.parse(readFileSync(new URL('./GRAPH_GOLDEN_VECTORS.json', import.meta.url),'utf8'));
for (const v of corpus.vectors) { assert.equal(fingerprintGraph(v.graph),v.fingerprint); verifyTrustedGraph(v.graph,v.fingerprint); }
let state=0xBADC0FFE;
function rng(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state;}
function spawn(dist,speed,ore,blocked=false){
 const s=new CivilizationSimulationSystem({distanceAwareTravel:true,caravanUnitsPerTick:speed});
 s.registerNode('A');s.registerNode('B');
 s.registerRoute('R',{fromNodeId:'A',toNodeId:'B',distance:dist,baseSecurity:blocked?0.1:0.95,toll:0});
 s.registerEntity('wagon',{type:'CARAVAN',currentRouteId:'R',cargo:{ORE:ore},position:{x:0,y:0,z:0}});
 return s;
}
for(let i=0;i<500;i++){
 const dist=25+rng()%500, speed=1+rng()%8, ore=1+rng()%40, pause=1+rng()%60, total=200;
 const continuous=spawn(dist,speed,ore), paused=spawn(dist,speed,ore);
 for(let t=0;t<total;t++)continuous.advanceSimulation(1);
 for(let t=0;t<pause;t++)paused.advanceSimulation(1);
 const checkpoint=JSON.parse(JSON.stringify(paused.getState()));
 const independent=civRoadGraphFingerprint(checkpoint);
 const restored=spawn(dist,speed,ore);
 restoreTrustedCivState(restored,checkpoint,independent);
 for(let t=pause;t<total;t++)restored.advanceSimulation(1);
 assert.deepEqual(restored.getState(),continuous.getState(),'replay case '+i);
 const wagon=continuous.entities.get('wagon');
 assert.equal(continuous.events.filter(e=>e.type==='caravan_arrival_intent').length, wagon.routeProgress>=1?1:0);
 assert.equal(wagon.cargo.ORE,ore);
 const altered=JSON.parse(JSON.stringify(checkpoint));altered.routes[0].distance++;
 const pre=JSON.stringify(restored.getState());
 assert.throws(()=>restoreTrustedCivState(restored,altered,independent),/graph differs/);
 assert.equal(JSON.stringify(restored.getState()),pre);
}
const blocked=spawn(10,1,6,true);
for(let i=0;i<200;i++)blocked.advanceSimulation(1);
assert.equal(blocked.entities.get('wagon').routeProgress,0);
assert.equal(blocked.events.length,0);
const legacy=spawn(100,1,5);legacy.config.distanceAwareTravel=false;legacy.advanceSimulation(1);
assert.ok(legacy.entities.get('wagon').routeProgress>0);
console.log('PASS: 500 seeded saved/continuous caravan replays; inventory nonmutation; trusted rejection; blocked route; legacy path; 7 graph vectors');
