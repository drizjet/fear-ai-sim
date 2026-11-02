#!/usr/bin/env node
/**
 * Standalone deterministic probe for the Cycle 22 trade shipment mirrors.
 * It proves that tolls, raids, delivery and checkpoint restore keep the
 * simulation entity's cargo/wealth aligned with the authoritative shipment.
 * This is a named manual probe, not an automated test-suite entry point.
 */

import { CivilizationSimulationSystem } from '../../packages/core/src/CivilizationSimulationSystem.js';
import { WorldTradeAuthority } from '../../packages/core/src/WorldTradeAuthority.mjs';
import { civRoadGraphFingerprint, restoreTrustedCivState } from '../../packages/core/src/CivilizationTrustedCheckpoint.mjs';
import { createContext, runInContext } from 'node:vm';

let assertions = 0;
function assert(condition, label) {
  assertions += 1;
  if (!condition) throw Error('FAIL: ' + label);
}
function equal(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function throws(fn, pattern, label) {
  assertions += 1;
  try {
    fn();
  } catch (error) {
    if (pattern.test(String(error))) return;
    throw Error(`FAIL: ${label}: unexpected error ${String(error)}`);
  }
  throw Error('FAIL: ' + label + ': expected an error');
}

function createWorld({
  passive = false, hunger = 0.5, grievance = 0, relation = 0.2,
  threat = 0, dispatch = true
} = {}) {
  const sim = new CivilizationSimulationSystem({
    distanceAwareTravel: true,
    caravanUnitsPerTick: 2
  });
  sim.registerNode('A');
  sim.registerNode('B');
  sim.registerRoute('R', { fromNodeId: 'A', toNodeId: 'B', distance: 80, baseSecurity: 0.99 });
  const authority = new WorldTradeAuthority(sim);
  authority.seedNode('A', { ORE: 20 }, 30);
  authority.seedNode('B', { ORE: 0 }, 5);
  authority.addPatrol({
    id: 'patrol', faction: 'orcs', routeIds: ['R'], passive, hunger, grievance, toll: 4
  });
  authority.setRelation('orcs', 'traders', relation);
  authority.sealGenesis(123);
  if (dispatch) {
    authority.dispatch({
      id: 'shipment', routeId: 'R', fromNodeId: 'A', faction: 'traders',
      cargo: { ORE: 16 }, gold: 20, threat
    });
  }
  return { sim, authority };
}

function advanceToEncounter(authority) {
  let ticks = 0;
  while (!authority.events.some(event => event.type === 'encounter') && ticks < 100) {
    authority.tick();
    ticks += 1;
  }
  assert(authority.events.some(event => event.type === 'encounter'), 'shipment reaches an encounter');
}
function advanceToCompletion(authority) {
  let ticks = 0;
  while (authority.shipments.shipment.status !== 'completed' && ticks < 100) {
    authority.tick();
    ticks += 1;
  }
  assert(authority.shipments.shipment.status === 'completed', 'shipment eventually completes');
}
function snapshotEntity(snapshot) {
  return snapshot.sim.entities.find(entity => entity.id === 'trade:shipment');
}
function assertRejectedWithoutMutation(target, snapshot, label) {
  const before = JSON.stringify(target.authority.getState());
  const fingerprint = civRoadGraphFingerprint(snapshot.sim);
  throws(() => target.authority.restore(snapshot, fingerprint),
    /escrow mismatch|entity mirror mismatch/, label);
  equal(JSON.stringify(target.authority.getState()), before, `${label} leaves target unchanged`);
}

const toll = createWorld();
equal(toll.authority.shipments.shipment.cargo, toll.sim.entities.get('trade:shipment').cargo,
  'dispatch mirrors shipment cargo');
equal(toll.authority.shipments.shipment.gold, toll.sim.entities.get('trade:shipment').wealth,
  'dispatch mirrors shipment wealth');
advanceToEncounter(toll.authority);
assert(toll.authority.events.find(event => event.type === 'encounter').kind === 'toll',
  'fixture produces a toll');
equal(toll.authority.shipments.shipment.gold, 16, 'toll reduces shipment gold');
equal(toll.sim.entities.get('trade:shipment').wealth, 16, 'toll synchronizes entity wealth');
equal(toll.sim.entities.get('trade:shipment').cargo, { ORE: 16 }, 'toll preserves mirrored cargo');
toll.authority.assertConservation();
advanceToCompletion(toll.authority);
equal(toll.sim.entities.get('trade:shipment').cargo, {}, 'settlement clears entity cargo');
equal(toll.sim.entities.get('trade:shipment').wealth, 0, 'settlement clears entity wealth');
toll.authority.assertConservation();

const raid = createWorld({ passive: true, grievance: 1, relation: -1, threat: 0.9 });
advanceToEncounter(raid.authority);
assert(raid.authority.events.find(event => event.type === 'encounter').kind === 'attack',
  'fixture produces a raid');
equal(raid.authority.shipments.shipment.cargo, { ORE: 12 }, 'raid reduces shipment cargo');
equal(raid.sim.entities.get('trade:shipment').cargo, { ORE: 12 }, 'raid synchronizes entity cargo');
equal(raid.sim.entities.get('trade:shipment').wealth, 20, 'raid preserves mirrored wealth');
raid.authority.assertConservation();
advanceToCompletion(raid.authority);
equal(raid.sim.entities.get('trade:shipment').cargo, {}, 'raided shipment settles with empty entity cargo');
equal(raid.sim.entities.get('trade:shipment').wealth, 0, 'raided shipment settles with zero entity wealth');

const completedSnapshot = JSON.parse(JSON.stringify(raid.authority.getState()));
const completedCargoTamper = JSON.parse(JSON.stringify(completedSnapshot));
snapshotEntity(completedCargoTamper).cargo = { ORE: 1 };
assertRejectedWithoutMutation(createWorld({ dispatch: false }), completedCargoTamper,
  'restore rejects stale completed cargo');
const completedWealthTamper = JSON.parse(JSON.stringify(completedSnapshot));
snapshotEntity(completedWealthTamper).wealth = 1;
assertRejectedWithoutMutation(createWorld({ dispatch: false }), completedWealthTamper,
  'restore rejects stale completed wealth');

// E01/E02: check aggregate limits and keys used as JSON object properties.
function freshAuthority() {
  const sim = new CivilizationSimulationSystem({ distanceAwareTravel: true });
  sim.registerNode('A');
  sim.registerNode('B');
  sim.registerRoute('R', { fromNodeId: 'A', toNodeId: 'B', distance: 80, baseSecurity: 0.99 });
  return new WorldTradeAuthority(sim);
}
const overflowGoods = freshAuthority();
overflowGoods.seedNode('A', { ORE: Number.MAX_SAFE_INTEGER }, 0);
overflowGoods.seedNode('B', { ORE: 2 }, 0);
throws(() => overflowGoods.sealGenesis(), /safe integer range/,
  'individually safe cargo stocks must not overflow their combined total');
assert(overflowGoods.initial === null, 'failed aggregate check does not seal the ledger');
const overflowGold = freshAuthority();
overflowGold.seedNode('A', {}, Number.MAX_SAFE_INTEGER);
overflowGold.seedNode('B', {}, 3);
throws(() => overflowGold.sealGenesis(), /safe integer range/,
  'individually safe vault gold must not overflow combined totals');
const reservedGoods = freshAuthority();
for (const key of ['__proto__', 'constructor', 'toString', 'prototype']) {
  const input = JSON.parse('{"' + key + '":1}');
  throws(() => reservedGoods.seedNode('A', input, 0), /reserved ID or goods key/,
    'reserved cargo property ' + key + ' must be rejected');
  assert(Object.keys(reservedGoods.stocks).length === 0,
    'rejected cargo key must not leave partially seeded stock');
}
throws(() => reservedGoods.seedNode('constructor', { ORE: 1 }, 0),
  /reserved ID or goods key/, 'reserved node identifier must be refused');
throws(() => reservedGoods.addPatrol({
  id: 'patrol', faction: '__proto__', routeIds: ['R']
}), /reserved ID or goods key/, 'reserved faction identifier must be refused');

// E04 follow-on: reject external public-map corruption *before* either
// registration/withdrawal or simulation time advances.
const externallyMutatedDispatch = freshAuthority();
externallyMutatedDispatch.seedNode('A', { ORE: 20 }, 10);
externallyMutatedDispatch.seedNode('B', { ORE: 0 }, 0);
externallyMutatedDispatch.sealGenesis(5);
externallyMutatedDispatch.stocks.A.ORE = 20.5;
const beforeUnsafeDispatch = JSON.stringify(externallyMutatedDispatch.getState());
throws(() => externallyMutatedDispatch.dispatch({
  id: 'shipment', routeId: 'R', fromNodeId: 'A', faction: 'traders',
  cargo: { ORE: 1 }, gold: 2
}), /nonnegative safe integer/, 'mutated fractional origin cannot partially dispatch');
equal(JSON.stringify(externallyMutatedDispatch.getState()), beforeUnsafeDispatch,
  'unsafe dispatch rejection leaves all host reference state unchanged');
throws(() => externallyMutatedDispatch.tick(), /nonnegative safe integer/,
  'mutated origin cannot advance a simulation tick before rejection');
equal(JSON.stringify(externallyMutatedDispatch.getState()), beforeUnsafeDispatch,
  'unsafe tick rejection leaves simulation time and ledger untouched');

const externallyDrained = freshAuthority();
externallyDrained.seedNode('A', { ORE: 20 }, 10);
externallyDrained.seedNode('B', { ORE: 0 }, 0);
externallyDrained.sealGenesis(7);
externallyDrained.stocks.A.ORE = 19;
const beforeDrainedDispatch = JSON.stringify(externallyDrained.getState());
throws(() => externallyDrained.dispatch({
  id: 'shipment', routeId: 'R', fromNodeId: 'A', faction: 'traders',
  cargo: { ORE: 1 }, gold: 2
}), /resource conservation violated/, 'valid-sized but stolen host stock blocks dispatch');
equal(JSON.stringify(externallyDrained.getState()), beforeDrainedDispatch,
  'host stock corruption cannot trigger a partial dispatch');

// The old "a|b" key format is ambiguous when either ID includes a bar.
// JSON tuple keys preserve distinct relationships and the trusted restore
// migrates only invertible legacy keys.
const namespacedRelations = freshAuthority();
namespacedRelations.setRelation('a|b', 'c', -0.75);
namespacedRelations.setRelation('a', 'b|c', 0.9);
assert(namespacedRelations.relations[JSON.stringify(['a|b', 'c'])] === -0.75,
  'first relation with a delimiter-bearing ID stays intact');
assert(namespacedRelations.relations[JSON.stringify(['a', 'b|c'])] === 0.9,
  'second relation has an independent key');
const legacyWorld = createWorld({ dispatch: false });
const legacyCheckpoint = legacyWorld.authority.getState();
legacyCheckpoint.relations = { 'orcs|traders': 0.2, 'traders|orcs': 0.2 };
const fromLegacy = createWorld({ dispatch: false });
fromLegacy.authority.restore(legacyCheckpoint, civRoadGraphFingerprint(legacyCheckpoint.sim));
assert(fromLegacy.authority.relations[JSON.stringify(['orcs','traders'])] === 0.2,
  'existing unambiguous legacy relation keys migrate on restore');
const ambiguousCheckpoint = JSON.parse(JSON.stringify(legacyCheckpoint));
ambiguousCheckpoint.relations = { 'a|b|c': -0.5 };
const beforeAmbiguousRestore = JSON.stringify(fromLegacy.authority.getState());
throws(() => fromLegacy.authority.restore(
  ambiguousCheckpoint, civRoadGraphFingerprint(ambiguousCheckpoint.sim)
), /ambiguous legacy relation key/, 'uninvertible legacy relation key must be rejected');
equal(JSON.stringify(fromLegacy.authority.getState()), beforeAmbiguousRestore,
  'ambiguous relation checkpoint rejection is atomic');

const enrouteSnapshot = JSON.parse(JSON.stringify(toll.authority.getState()));
snapshotEntity(enrouteSnapshot).wealth += 1;
assertRejectedWithoutMutation(createWorld({ dispatch: false }), enrouteSnapshot,
  'restore rejects enroute wealth divergence');

// A matching *graph* fingerprint cannot make corrupt entity IDs safe.
// setState silently drops falsy IDs, so validate before transferring state.
const civ = new CivilizationSimulationSystem({ distanceAwareTravel: true });
civ.registerNode('A');
civ.registerNode('B');
civ.registerRoute('R', { fromNodeId: 'A', toNodeId: 'B', distance: 80, baseSecurity: 0.99 });
const pristine = JSON.stringify(civ.getState());
const badEntity = civ.getState();
badEntity.entities.push({
  id: '', routeProgress: 0, lastUpdateTick: 0,
  position: { x: 0, y: 0, z: 0 }, cargo: {}, wealth: 1
});
const trusted = civRoadGraphFingerprint(badEntity);
throws(() => restoreTrustedCivState(civ, badEntity, trusted), /invalid caravan state/,
  'trusted road graph must not permit silent empty-ID entity loss');
equal(JSON.stringify(civ.getState()), pristine, 'invalid empty-ID restore is atomic');
badEntity.entities[0].id = 'wagon';
badEntity.entities[0].lastUpdateTick = -1;
throws(() => restoreTrustedCivState(civ, badEntity, trusted), /invalid caravan state/,
  'trusted road graph does not permit negative entity time');
equal(JSON.stringify(civ.getState()), pristine, 'invalid negative-time restore is atomic');

// Protect the simulation clock, patrol hunger and delivery state from malformed
// public reference-host fields before advanceSimulation begins.
function assertTickRefusalWithoutMutation(authority, pattern, label) {
  const before = JSON.stringify(authority.getState());
  throws(() => authority.tick(), pattern, label);
  equal(JSON.stringify(authority.getState()), before,
    label + ': tick refusal preserves the full reference state');
}
const brokenPatrol = createWorld({ dispatch: false });
brokenPatrol.authority.patrols.patrol.routeIds = null;
assertTickRefusalWithoutMutation(brokenPatrol.authority, /invalid restored or live patrol/,
  'null patrol routes cannot crash after advancing the clock');

const brokenEncounter = createWorld();
brokenEncounter.authority.shipments.shipment.encounterDone = 'false';
assertTickRefusalWithoutMutation(brokenEncounter.authority, /invalid live shipment/,
  'a string encounter flag cannot silently skip the planned encounter');

const brokenArrival = createWorld();
for(let i=0;i<39;i++) brokenArrival.authority.tick();
brokenArrival.authority.shipments.shipment.targetNodeId = 'A';
assertTickRefusalWithoutMutation(brokenArrival.authority, /live shipment route disagreement/,
  'tampered destination cannot fail after route arrival advanced the clock');

// A malformed transfer target may preserve global conservation but reject
// assignment only after the clock or encounter escrow has already changed.
const malformedDestination = createWorld();
for(let i=0;i<39;i++) malformedDestination.authority.tick();
malformedDestination.authority.stocks.B = true;
assertTickRefusalWithoutMutation(malformedDestination.authority, /invalid live writable stocks entry/,
  'primitive destination stock cannot fail halfway through arrival');

const malformedFactionLoot = createWorld({ passive: true, grievance: 1, relation: -1, threat: 0.9 });
malformedFactionLoot.authority.factionLoot.orcs = true;
assertTickRefusalWithoutMutation(malformedFactionLoot.authority, /invalid live writable factionLoot entry/,
  'primitive faction loot cannot fail halfway through an attack');

const frozenFactionGold = createWorld();
Object.freeze(frozenFactionGold.authority.factionGold);
assertTickRefusalWithoutMutation(frozenFactionGold.authority, /invalid live writable factionGold/,
  'frozen gold destination cannot deduct toll escrow before throwing');

const frozenRaidCargo = createWorld({ passive: true, grievance: 1, relation: -1, threat: 0.9 });
Object.freeze(frozenRaidCargo.authority.shipments.shipment.cargo);
assertTickRefusalWithoutMutation(frozenRaidCargo.authority, /invalid live writable shipment cargo/,
  'readonly escrow cannot fail after faction loot has already increased');

const readonlyEncounterFlag = createWorld({ passive: true, grievance: 1, relation: -1, threat: 0.9 });
Object.defineProperty(readonlyEncounterFlag.authority.shipments.shipment,'encounterDone',
  {value:false,writable:false,enumerable:true,configurable:true});
assertTickRefusalWithoutMutation(readonlyEncounterFlag.authority, /invalid live writable shipment/,
  'readonly encounter flag cannot fail after advancing the clock');

const frozenPatrolState = createWorld();
Object.freeze(frozenPatrolState.authority.patrols.patrol);
assertTickRefusalWithoutMutation(frozenPatrolState.authority, /invalid live writable patrol/,
  'frozen patrol cannot fail after route progress advances');

const frozenEventJournal = createWorld();
Object.freeze(frozenEventJournal.authority.events);
assertTickRefusalWithoutMutation(frozenEventJournal.authority, /invalid live writable event journal/,
  'frozen journal cannot reject an already committed delivery');

// Simulation progress/arrival intents are computed before settlement and
// must not encounter corrupted route geometry or stale entity routing late.
const invalidRoadDistance = createWorld();
invalidRoadDistance.sim.routes.get('R').distance = 0;
assertTickRefusalWithoutMutation(invalidRoadDistance.authority, /invalid live caravan route/,
  'a zero-distance caravan road cannot throw after advancing time');

const invalidEntityProgress = createWorld();
invalidEntityProgress.sim.entities.get('trade:shipment').routeProgress = 'bogus';
assertTickRefusalWithoutMutation(invalidEntityProgress.authority, /invalid live caravan entity/,
  'nonnumeric caravan route progress cannot be silently clamped');

const foreignCaravanRoute = createWorld();
foreignCaravanRoute.sim.registerNode('C');
foreignCaravanRoute.sim.registerRoute('R2',
  { fromNodeId:'A', toNodeId:'C', distance:80, baseSecurity:0.99 });
for(let i=0;i<39;i++) foreignCaravanRoute.authority.tick();
foreignCaravanRoute.sim.entities.get('trade:shipment').currentRouteId='R2';
assertTickRefusalWithoutMutation(foreignCaravanRoute.authority, /invalid live caravan entity/,
  'a shipment on another valid road cannot emit a wrong arrival');

function createSimultaneousArrivals() {
  const target = createWorld({ dispatch:false }).authority;
  for(const shipmentId of ['S1','S2'])
    target.dispatch({id:shipmentId, routeId:'R', fromNodeId:'A',
      faction:'traders', cargo:{ORE:8}, gold:5});
  for(let i=0;i<39;i++)target.tick();
  return target;
}
const readOnlySecondArrival = createSimultaneousArrivals();
const secondEntity = readOnlySecondArrival.sim.entities.get('trade:S2');
Object.defineProperty(secondEntity, 'cargo',
  {value:secondEntity.cargo,writable:false,enumerable:true,configurable:true});
assertTickRefusalWithoutMutation(readOnlySecondArrival,
  /invalid live writable caravan entity/,
  'one readonly arriving caravan cannot partially commit both deliveries');

const frozenSimulationJournal = createSimultaneousArrivals();
Object.freeze(frozenSimulationJournal.sim.events);
assertTickRefusalWithoutMutation(frozenSimulationJournal,
  /invalid live writable simulation journal/,
  'readonly simulation arrival journal cannot fail after advancing caravan progress');

// The simulation processes unrelated entities and all road danger before
// delivering trade intents. Their host-mutated state must not break a tick
// after two trade caravans have already generated arrival intents.
const frozenNeutral = createSimultaneousArrivals();
Object.freeze(frozenNeutral.sim.registerEntity('neutral',
  {type:'SCOUT',currentRouteId:'R',wealth:0}));
assertTickRefusalWithoutMutation(frozenNeutral,
  /invalid live writable due simulation entity/,
  'frozen nontrade entity cannot throw after two arriving caravans advance');

const badCoarseCaravan = createSimultaneousArrivals();
badCoarseCaravan.sim.registerRoute('BAD',
  {fromNodeId:'A',toNodeId:'B',distance:80,baseSecurity:0.99}).distance=0;
const badCoarseEntity = badCoarseCaravan.sim.registerEntity('neutral-caravan',
  {type:'CARAVAN',currentRouteId:'BAD',position:{x:150,y:0,z:0},wealth:0});
badCoarseEntity.lastUpdateTick=20; // LOD2 cadence 20 becomes due at tick 40.
assertTickRefusalWithoutMutation(badCoarseCaravan,
  /invalid live simulation caravan travel/,
  'bad neutral coarse-LOD road cannot fail after trade arrival intents');

const readonlyIdleRoute = createSimultaneousArrivals();
const idle = readonlyIdleRoute.sim.registerRoute('IDLE',
  {fromNodeId:'A',toNodeId:'B',distance:80,baseSecurity:0.99});
Object.defineProperty(idle,'perceivedDanger',
  {value:0.9,writable:false,enumerable:true,configurable:true});
assertTickRefusalWithoutMutation(readonlyIdleRoute,
  /invalid live writable decaying simulation route/,
  'unrelated readonly danger decay cannot throw after clock advances');

const mixedRoutes = createSimultaneousArrivals();
mixedRoutes.sim.registerRoute('BLOCKED_R',
  {fromNodeId:'A',toNodeId:'B',distance:80,baseSecurity:0.99});
mixedRoutes.dispatch({id:'BLOCK',routeId:'BLOCKED_R',fromNodeId:'A',
  faction:'traders',cargo:{ORE:4},gold:1});
mixedRoutes.sim.routes.get('BLOCKED_R').status='BLOCKED';
equal(mixedRoutes.tick().settled,2,
  'two open-road shipments arrive while a third blocked-route shipment waits');
equal(mixedRoutes.shipments.BLOCK.status,'enroute',
  'blocked-route shipment retains escrow and does not arrive');
mixedRoutes.assertConservation();

const coarseCatchup = createSimultaneousArrivals();
const neutralCatchup = coarseCatchup.sim.registerEntity('neutral',
  {type:'CARAVAN',currentRouteId:'R',position:{x:150,y:0,z:0},
    routeProgress:0.2,wealth:0});
neutralCatchup.lastUpdateTick=20;
equal(coarseCatchup.tick().settled,2,
  'two open-road shipments settle alongside a due neutral coarse-LOD caravan');
assert(Math.abs(neutralCatchup.routeProgress-0.7)<1e-12,
  'neutral LOD2 route progresses by 20 ticks of distance-aware travel');
coarseCatchup.assertConservation();

const validPair = createSimultaneousArrivals();
equal(validPair.tick().settled,2,'two uncorrupted same-tick arrivals both settle');
equal(validPair.shipments.S1.status,'completed','first simultaneous arrival completes');
equal(validPair.shipments.S2.status,'completed','second simultaneous arrival completes');
validPair.assertConservation();

// A host can shadow the array's push method without freezing its length.
// Reject before the simulation clock advances or the first escrow commits.
const brokenSimulationPush=createSimultaneousArrivals();
Object.defineProperty(brokenSimulationPush.sim.events,'push',
  {value:undefined,writable:false,configurable:true});
assertTickRefusalWithoutMutation(brokenSimulationPush,
  /invalid live writable simulation journal/,
  'shadowed simulation event append refuses before any arrival intent');

const brokenAuthorityPush=createSimultaneousArrivals();
Object.defineProperty(brokenAuthorityPush.events,'push',
  {value:null,writable:false,configurable:true});
assertTickRefusalWithoutMutation(brokenAuthorityPush,
  /invalid live writable event journal/,
  'shadowed authority append refuses before a first shipment can settle');

const brokenDangerHalfLife=createSimultaneousArrivals();
brokenDangerHalfLife.sim.config.routeDangerHalfLifeTicks=NaN;
brokenDangerHalfLife.sim.routes.get('R').perceivedDanger=0.6;
assertTickRefusalWithoutMutation(brokenDangerHalfLife,
  /invalid live simulation travel or danger configuration/,
  'a NaN danger half-life cannot silently erase road danger');

const overflowCoarseStep=createSimultaneousArrivals();
overflowCoarseStep.sim.registerRoute('R2',
  {fromNodeId:'A',toNodeId:'B',distance:80,baseSecurity:0.99});
const overflowNeutral=overflowCoarseStep.sim.registerEntity('neutral',
  {type:'CARAVAN',currentRouteId:'R2',position:{x:150,y:0,z:0},
    routeProgress:0.2,wealth:0});
overflowNeutral.lastUpdateTick=20;
overflowCoarseStep.sim.config.caravanUnitsPerTick=1e308;
assertTickRefusalWithoutMutation(overflowCoarseStep,
  /invalid live simulation caravan step/,
  'finite speed cannot overflow coarse-LOD travel and reset progress to zero');

const sparsePatrolRoute=createSimultaneousArrivals();
sparsePatrolRoute.patrols.patrol.routeIds=[,'R'];
assertTickRefusalWithoutMutation(sparsePatrolRoute,
  /invalid restored or live patrol/,
  'roaming must reject sparse route IDs instead of writing undefined');

const densePatrolRoute=createSimultaneousArrivals();
densePatrolRoute.patrols.patrol.routeIds=['R','R'];
equal(densePatrolRoute.tick().settled,2,
  'dense repeated patrol routes still permit both arrivals');
equal(densePatrolRoute.patrols.patrol.currentRouteId,'R',
  'dense patrol roaming chooses a real route');

const unknownNeutralLod=createSimultaneousArrivals();
const unknownLodEntity=unknownNeutralLod.sim.registerEntity('neutral',
  {type:'SCOUT',currentRouteId:'R',wealth:0});
unknownLodEntity.lodTier=5000;
equal(unknownNeutralLod.tick().settled,2,
  'existing unknown-LOD fallback remains allowed for neutral observers');
equal(unknownLodEntity.routeProgress,0.01,
  'existing unknown-LOD fallback advances with cadence one');

// A host mutation of the relations lookup was previously detected only when
// an encounter consulted it, after simulation time and arrival intents advanced.
const nullLiveRelations=createSimultaneousArrivals();
nullLiveRelations.relations=null;
nullLiveRelations.shipments.S1.encounterDone=false;
assertTickRefusalWithoutMutation(nullLiveRelations,/invalid live relations/,
  'null relations refuse before simultaneous arrivals and encounter policy');

const arrayLiveRelations=createSimultaneousArrivals();
arrayLiveRelations.relations=[];
arrayLiveRelations.shipments.S1.encounterDone=false;
assertTickRefusalWithoutMutation(arrayLiveRelations,/invalid live relations/,
  'array relations refuse rather than silently changing encounter outcomes');

const nanLiveRelation=createSimultaneousArrivals();
nanLiveRelation.relations['["orcs","traders"]']=NaN;
nanLiveRelation.shipments.S1.encounterDone=false;
assertTickRefusalWithoutMutation(nanLiveRelation,/invalid live relations/,
  'nonfinite live relation score cannot silently bias a patrol');

const frozenValidRelations=createSimultaneousArrivals();
Object.freeze(frozenValidRelations.relations);
frozenValidRelations.shipments.S1.encounterDone=false;
equal(frozenValidRelations.tick().settled,2,
  'readonly valid relation lookup is harmless during a tick');
frozenValidRelations.assertConservation();

const readonlyPatrolIndex=createSimultaneousArrivals();
Object.defineProperty(readonlyPatrolIndex.patrols.patrol.routeIds,'0',
  {value:'R',writable:false,configurable:true});
equal(readonlyPatrolIndex.tick().settled,2,
  'readonly existing patrol route index is safe for roaming');
readonlyPatrolIndex.assertConservation();

const readonlyPriorEventIndex=createSimultaneousArrivals();
readonlyPriorEventIndex.sim.events.push({type:'host_note',tick:39});
Object.defineProperty(readonlyPriorEventIndex.sim.events,'0',
  {value:readonlyPriorEventIndex.sim.events[0],writable:false,configurable:true});
equal(readonlyPriorEventIndex.tick().settled,2,
  'readonly existing simulation journal entry does not block future appends');
equal(readonlyPriorEventIndex.sim.events.length,3,
  'read-only prior journal entry preserves both later arrival intents');

// Graph fingerprint trust is not journal trust. A host may mutate or append
// historical sim-event records after delivery: trusted restore must refuse an
// impossible event chronology, without modifying the destination simulator.
const checkpointAfterArrival=createSimultaneousArrivals();
equal(checkpointAfterArrival.tick().settled,2,
  'journal snapshot fixture settles two shipments before export');
const completedCheckpoint=checkpointAfterArrival.getState();
function rejectCorruptSimJournal(change, label) {
  const snapshot=JSON.parse(JSON.stringify(completedCheckpoint));
  change(snapshot.sim.events,snapshot.sim.tickCount);
  const target=createWorld({dispatch:false}).authority;
  const before=JSON.stringify(target.getState());
  throws(()=>target.restore(snapshot,civRoadGraphFingerprint(snapshot.sim)),
    /invalid simulation event journal/,label);
  equal(JSON.stringify(target.getState()),before,
    label+': trusted checkpoint failure leaves the target unchanged');
}
rejectCorruptSimJournal((events,tick)=>events.push(
  {type:'host_note',tick:tick+1}), 'future simulation event refuses trusted restore');
rejectCorruptSimJournal(events=>events.push(
  {type:'host_note'}), 'missing simulation event tick refuses trusted restore');
rejectCorruptSimJournal(events=>events.push(null),
  'null simulation event refuses with an explicit checkpoint error');
rejectCorruptSimJournal(events=>{events[1].tick=events[0].tick-1;},
  'out-of-order simulation event refuses trusted restore');
rejectCorruptSimJournal(events=>{events.length+=1;},
  'sparse simulation journal refuses trusted restore');

const customCivJournal=JSON.parse(JSON.stringify(completedCheckpoint));
customCivJournal.sim.events.push({type:'host_note',tick:40,cargo:{ORE:1}});
const restoredCustomCiv=createWorld({dispatch:false}).authority;
restoredCustomCiv.restore(customCivJournal,civRoadGraphFingerprint(customCivJournal.sim));
equal(restoredCustomCiv.sim.events.at(-1),
  {type:'host_note',tick:40,cargo:{ORE:1}},
  'valid host-defined simulation event round-trips without type allowlisting');
restoredCustomCiv.assertConservation();

const preCorruptedLiveJournal=createSimultaneousArrivals();
preCorruptedLiveJournal.tick();
preCorruptedLiveJournal.sim.events.unshift(null);
const liveTickBefore=preCorruptedLiveJournal.sim.tickCount;
equal(preCorruptedLiveJournal.tick().tick,liveTickBefore+1,
  'append-only tick does not read previously corrupted journal entries');
throws(()=>preCorruptedLiveJournal.getState(),/invalid simulation event journal/,
  'export rejects an already malformed historical simulation event');

// Restore admission must check writable destination methods and properties
// before applying even the first field from an otherwise valid checkpoint.
function assertBlockedRestore(change, pattern, label, direct = false) {
  const source=createWorld().authority, target=createWorld().authority;
  source.tick();
  const snapshot=source.getState();
  const before=JSON.stringify(target.getState());
  change(target);
  throws(()=>direct
    ? restoreTrustedCivState(target.sim,snapshot.sim,civRoadGraphFingerprint(snapshot.sim))
    : target.restore(snapshot,civRoadGraphFingerprint(snapshot.sim)),pattern,label);
  equal(JSON.stringify(target.getState()),before,label+': leaves target unchanged');
}
assertBlockedRestore(target=>Object.defineProperty(target.sim.entities,'set',
  {value:null,writable:false,configurable:true}),
  /invalid writable civilization restore target/,
  'shadowed destination entity Map.set refuses before any restore');
assertBlockedRestore(target=>Object.defineProperty(target.sim.routes,'clear',
  {value:null,writable:false,configurable:true}),
  /invalid writable civilization restore target/,
  'shadowed destination route Map.clear refuses before clearing nodes');
assertBlockedRestore(target=>Object.defineProperty(target.sim,'events',
  {value:target.sim.events,writable:false,enumerable:true,configurable:true}),
  /invalid writable civilization restore target/,
  'readonly destination simulation journal refuses before map changes');
assertBlockedRestore(target=>Object.defineProperty(target,'rng',
  {value:target.rng,writable:false,enumerable:true,configurable:true}),
  /invalid writable authority restore target/,
  'readonly destination RNG refuses before the simulation transfer');
assertBlockedRestore(target=>Object.defineProperty(target.sim.entities,'set',
  {value:null,writable:false,configurable:true}),
  /invalid writable civilization restore target/,
  'direct trusted simulator restore preflights destination Map.set',true);

// Staged setState previously silently normalized malformed public snapshot data.
function assertMalformedRestore(change,pattern,label) {
  const source=createWorld().authority, target=createWorld().authority;
  const snapshot=source.getState();
  change(snapshot.sim);
  const before=JSON.stringify(target.getState());
  throws(()=>target.restore(snapshot,civRoadGraphFingerprint(snapshot.sim)),pattern,label);
  equal(JSON.stringify(target.getState()),before,label+': leaves target unchanged');
}
assertMalformedRestore(sim=>{sim.routes[0].waypoints=null;},
  /invalid civilization route waypoints/,
  'null route waypoints cannot silently become an empty array');
assertMalformedRestore(sim=>{sim.nodes[0].market=null;},
  /invalid civilization node state/,
  'null node market cannot silently become an empty object');
assertMalformedRestore(sim=>{sim.nodes[0].position=null;},
  /invalid civilization node state/,
  'null node position cannot silently become an empty object');

const validStructuredSource=createWorld().authority;
const validStructuredSnapshot=validStructuredSource.getState();
validStructuredSnapshot.sim.routes[0].waypoints=[{x:4,y:0,z:0}];
validStructuredSnapshot.sim.nodes[0].market={ORE:3};
const validStructuredTarget=createWorld().authority;
Object.defineProperty(validStructuredTarget.sim,'nodes',
  {value:validStructuredTarget.sim.nodes,writable:false,enumerable:true,configurable:true});
validStructuredTarget.restore(validStructuredSnapshot,
  civRoadGraphFingerprint(validStructuredSnapshot.sim));
equal(validStructuredTarget.sim.routes.get('R').waypoints,[{x:4,y:0,z:0}],
  'valid custom waypoints survive restore');
equal(validStructuredTarget.sim.nodes.get('A').market,{ORE:3},
  'valid custom market survives restore');
validStructuredTarget.assertConservation();

// The road fingerprint covers topology and selected attributes, not nested
// markets or waypoint metadata. Neither exported snapshots nor accepted
// checkpoint objects may remain aliased to the reference world's live data.
function nestedSnapshotWorld() {
  const world=createWorld();
  world.sim.nodes.get('A').market={ORE:{buyPrice:12,meta:{tier:1}}};
  world.sim.routes.get('R').waypoints=[{x:3,y:0,z:0,meta:{label:'original'}}];
  return world;
}
const nestedExport=nestedSnapshotWorld();
const exportedNested=nestedExport.sim.getState();
exportedNested.nodes[0].market.ORE.meta.tier=9;
exportedNested.routes[0].waypoints[0].meta.label='edited';
equal(nestedExport.sim.nodes.get('A').market.ORE.meta.tier,1,
  'mutating exported nested market metadata cannot mutate the live market');
equal(nestedExport.sim.routes.get('R').waypoints[0].meta.label,'original',
  'mutating exported waypoint metadata cannot mutate the live route');
const nestedDirectSource=nestedSnapshotWorld();
const nestedDirectSnapshot=nestedDirectSource.sim.getState();
const nestedDirectTarget=createWorld();
restoreTrustedCivState(nestedDirectTarget.sim,nestedDirectSnapshot,
  civRoadGraphFingerprint(nestedDirectSnapshot));
equal(nestedDirectTarget.sim.nodes.get('A').market.ORE.meta.tier,1,
  'trusted restore retains valid nested commodity metadata');
equal(nestedDirectTarget.sim.routes.get('R').waypoints[0].meta.label,'original',
  'trusted restore retains valid nested waypoint metadata');
nestedDirectSnapshot.nodes[0].market.ORE.meta.tier=88;
nestedDirectSnapshot.routes[0].waypoints[0].meta.label='later';
equal(nestedDirectTarget.sim.nodes.get('A').market.ORE.meta.tier,1,
  'trusted restore does not retain source nested market references');
equal(nestedDirectTarget.sim.routes.get('R').waypoints[0].meta.label,'original',
  'trusted restore does not retain source waypoint references');
const nestedAuthoritySource=nestedSnapshotWorld();
const nestedAuthoritySnapshot=nestedAuthoritySource.authority.getState();
const nestedAuthorityFingerprint=civRoadGraphFingerprint(nestedAuthoritySnapshot.sim);
const nestedAuthorityTarget=createWorld();
nestedAuthorityTarget.authority.restore(nestedAuthoritySnapshot,nestedAuthorityFingerprint);
const beforeNestedAuthority=JSON.stringify(nestedAuthorityTarget.authority.getState());
nestedAuthoritySnapshot.sim.nodes[0].market.ORE.buyPrice=99;
nestedAuthoritySnapshot.sim.routes[0].waypoints[0].x=99;
equal(JSON.stringify(nestedAuthorityTarget.authority.getState()),beforeNestedAuthority,
  'authority checkpoint mutation after restore cannot alter restored state');
// Independent restored worlds must advance identically after the same valid
// checkpoint and conserve escrow through the first tick and final arrival.
const replayOne=createWorld(), replayTwo=createWorld();
for(const w of [replayOne,replayTwo])
  w.authority.restore(nestedAuthoritySource.authority.getState(),nestedAuthorityFingerprint);
for(let i=0;i<40;i++){
  equal(replayOne.authority.tick(),replayTwo.authority.tick(),
    'restored twins return equal tick summaries '+i);
}
equal(replayOne.authority.getState(),replayTwo.authority.getState(),
  'restored twins have identical deterministic shipment and journal states');
equal(replayOne.authority.shipments.shipment.status,'completed',
  'replayed shipment settles exactly once');
replayOne.authority.assertConservation();
replayTwo.authority.assertConservation();

// Trusted checkpoint values may be valid for the road fingerprint while
// containing numeric/waypoint data that JSON would silently rewrite or whose
// quotes would yield NaN profits. Reject before changing the target world.
assertMalformedRestore(sim=>{sim.routes[0].waypoints=new Array(2);sim.routes[0].waypoints[0]={x:2,y:0,z:0};},
  /invalid civilization waypoint coordinates/,
  'sparse waypoint indices must not survive a trusted restore');
assertMalformedRestore(sim=>{sim.routes[0].waypoints=[null];},
  /invalid civilization waypoint coordinates/,
  'null waypoint must not survive a trusted restore');
assertMalformedRestore(sim=>{sim.routes[0].waypoints=[{x:Infinity,y:0,z:0}];},
  /invalid civilization waypoint coordinates/,
  'nonfinite waypoint must not become null on JSON serialization');
assertMalformedRestore(sim=>{sim.nodes[0].position.x=Infinity;},
  /invalid civilization position/,
  'nonfinite node coordinate must not become null on JSON serialization');
assertMalformedRestore(sim=>{sim.nodes[0].position.x='nonnumeric';},
  /invalid civilization position/,
  'string node coordinate must not silently alter world geometry');
assertMalformedRestore(sim=>{sim.focusOrigin.x=Infinity;},
  /invalid civilization position/,
  'nonfinite snapshot focus coordinate must not survive restore');
assertMalformedRestore(sim=>{sim.entities.find(e=>e.id==='trade:shipment').position.y=NaN;},
  /invalid civilization position/,
  'nonfinite entity coordinate must not silently change LOD inputs');
assertMalformedRestore(sim=>{sim.nodes[0].market={ORE:{sellPrice:'bad'}};},
  /invalid civilization market quote/,
  'nonnumeric sell quote cannot generate NaN profit');
assertMalformedRestore(sim=>{sim.nodes[0].market={ORE:{sellPrice:Infinity}};},
  /invalid civilization market quote/,
  'nonfinite sell quote cannot turn into null');
assertMalformedRestore(sim=>{sim.nodes[0].market={ORE:{sellPrice:-2}};},
  /invalid civilization market quote/,
  'negative sell quote cannot inflate trade profit');
const invalidLiveSnapshot=createWorld();
invalidLiveSnapshot.sim.nodes.get('A').position.x=Infinity;
throws(()=>invalidLiveSnapshot.authority.getState(),/invalid civilization position/,
  'authority export must refuse nonfinite node values before JSON serialization');
const invalidLiveWaypoint=createWorld();
invalidLiveWaypoint.sim.routes.get('R').waypoints=[{x:NaN,y:0,z:0}];
throws(()=>invalidLiveWaypoint.authority.getState(),/invalid civilization waypoint coordinates/,
  'authority export must not silently turn a nonfinite waypoint into null');
const invalidLiveMarket=createWorld();
invalidLiveMarket.sim.nodes.get('A').market={ORE:{sellPrice:NaN}};
throws(()=>invalidLiveMarket.authority.getState(),/invalid civilization market quote/,
  'authority export must refuse nonfinite sell prices');
const validTwoDimensional=createWorld();
const validTwoDimensionalSnapshot=validTwoDimensional.authority.getState();
validTwoDimensionalSnapshot.sim.routes[0].waypoints=[{x:2,y:3,meta:{hostTag:'keep'}}];
validTwoDimensionalSnapshot.sim.nodes[0].market={ORE:3,CUSTOM:{meta:{flag:true}}};
const validTwoDimensionalTarget=createWorld();
validTwoDimensionalTarget.authority.restore(validTwoDimensionalSnapshot,
  civRoadGraphFingerprint(validTwoDimensionalSnapshot.sim));
equal(validTwoDimensionalTarget.sim.routes.get('R').waypoints,
  [{x:2,y:3,meta:{hostTag:'keep'}}],
  'valid 2D waypoint and custom metadata survive restore');
equal(validTwoDimensionalTarget.sim.nodes.get('A').market,
  {ORE:3,CUSTOM:{meta:{flag:true}}},
  'custom scalar market values and unquoted metadata retain existing behavior');
validTwoDimensionalTarget.authority.tick();
validTwoDimensionalTarget.authority.assertConservation();

// A trusted road fingerprint does not authenticate the separately mutable
// incident timeline, LOD cadence or fear/morale fields. These fields
// affect first-tick behavior, so refuse invalid simulator checkpoint values
// before modifying a destination's maps or authoritative escrow. Preserve
// explicit host route-status overrides independent of perceived danger.
assertMalformedRestore(sim=>{sim.entities[0].lodTier=42;},
  /invalid civilization cognitive state/,
  'unknown LOD cannot fall back to cadence one');
assertMalformedRestore(sim=>{sim.entities[0].fear=-0.25;},
  /invalid civilization cognitive state/,
  'negative fear cannot survive a trusted restore');
assertMalformedRestore(sim=>{sim.entities[0].morale=NaN;},
  /invalid civilization cognitive state/,
  'nonfinite morale cannot silently serialize to null');
assertMalformedRestore(sim=>{sim.entities[0].morale=2;},
  /invalid civilization cognitive state/,
  'out-of-range morale cannot survive a trusted restore');
assertMalformedRestore(sim=>{sim.entities[0].lastLodChangeTick=sim.tickCount+1;},
  /invalid civilization cognitive state/,
  'future LOD transition timestamp cannot survive restore');
assertMalformedRestore(sim=>{sim.entities[0].lastLodChangeTick=-1;},
  /invalid civilization cognitive state/,
  'negative LOD transition timestamp cannot survive restore');
assertMalformedRestore(sim=>{sim.routes[0].status='UNKNOWN';},
  /invalid civilization route danger history/,
  'an invalid route status cannot survive a trusted restore');
assertMalformedRestore(sim=>{sim.routes[0].perceivedDanger=NaN;},
  /invalid civilization route danger history/,
  'nonfinite perceived danger cannot become null on export');
assertMalformedRestore(sim=>{sim.routes[0].incidentCount=-1;},
  /invalid civilization route danger history/,
  'negative incident counter cannot survive restore');
assertMalformedRestore(sim=>{sim.routes[0].lastRaidTick=sim.tickCount+1;},
  /invalid civilization route danger history/,
  'future raid timestamp cannot survive restore');
const invalidLiveLod=createWorld();
invalidLiveLod.sim.entities.get('trade:shipment').lodTier=42;
throws(()=>invalidLiveLod.authority.getState(),/invalid civilization cognitive state/,
  'export refuses an unknown LOD before writing a checkpoint');
const invalidLiveDanger=createWorld();
invalidLiveDanger.sim.routes.get('R').perceivedDanger=NaN;
throws(()=>invalidLiveDanger.authority.getState(),/invalid civilization route danger history/,
  'export refuses nonfinite route danger before serializing');
const validCognitiveSource=createWorld(),validCognitiveSnapshot=validCognitiveSource.authority.getState();
validCognitiveSnapshot.sim.entities[0].lodTier=4;
validCognitiveSnapshot.sim.entities[0].fear=0.75;
validCognitiveSnapshot.sim.entities[0].morale=0.25;
validCognitiveSnapshot.sim.entities[0].lastLodChangeTick=0;
validCognitiveSnapshot.sim.routes[0].perceivedDanger=0.55;
validCognitiveSnapshot.sim.routes[0].status='CONTESTED';
validCognitiveSnapshot.sim.routes[0].incidentCount=1;
validCognitiveSnapshot.sim.routes[0].lastRaidTick=0;
validCognitiveSnapshot.sim.events.push({type:'host_custom',tick:0,
  metadata:{hostTag:'keep',severity:0.75}});
const validCognitiveTarget=createWorld();
validCognitiveTarget.authority.restore(validCognitiveSnapshot,
  civRoadGraphFingerprint(validCognitiveSnapshot.sim));
equal(validCognitiveTarget.sim.entities.get('trade:shipment').lodTier,4,
  'legitimate offscreen LOD survives trusted restore');
equal(validCognitiveTarget.sim.routes.get('R').status,'CONTESTED',
  'route danger and matching status survive restore');
equal(validCognitiveTarget.sim.events.at(-1),
  {type:'host_custom',tick:0,metadata:{hostTag:'keep',severity:0.75}},
  'host-defined structured event metadata survives unchanged');
const validCognitiveBefore=validCognitiveTarget.sim.entities.get('trade:shipment').routeProgress;
equal(validCognitiveTarget.authority.tick().tick,1,
  'valid offscreen shipment resumes deterministic first tick');
equal(validCognitiveTarget.sim.entities.get('trade:shipment').routeProgress,
  validCognitiveBefore,'offscreen LOD waits until its cadence is due');
validCognitiveTarget.authority.assertConservation();
const intentionalBlock=createWorld(),intentionalBlockSnapshot=intentionalBlock.authority.getState();
intentionalBlockSnapshot.sim.routes[0].status='BLOCKED';
const intentionalBlockTarget=createWorld();
intentionalBlockTarget.authority.restore(intentionalBlockSnapshot,
  civRoadGraphFingerprint(intentionalBlockSnapshot.sim));
equal(intentionalBlockTarget.authority.tick().settled,0,
  'host may deliberately block a low-danger route');
equal(intentionalBlockTarget.sim.entities.get('trade:shipment').routeProgress,0,
  'explicit host route block prevents first-tick shipment advancement');
intentionalBlockTarget.authority.assertConservation();


// The trusted checkpoint checks all cognitive state and route history, not
// just an enroute trade entity. Live ticks previously skipped equivalent
// preflight on unrelated entities/roads, then delivered two shipments while
// the reference simulation still held malformed data.
function assertLiveCognitiveHistoryRefusal(change,pattern,label) {
  const authority=createSimultaneousArrivals();
  const neutral=authority.sim.registerEntity('neutral',{type:'SCOUT',
    position:{x:0,y:0,z:0},currentRouteId:'R',cargo:{host:{label:'preserve'}}});
  authority.sim.registerNode('C');
  const idle=authority.sim.registerRoute('IDLE',
    {fromNodeId:'A',toNodeId:'C',distance:80,baseSecurity:0.99});
  change({authority,neutral,idle});
  // getState rightly refuses malformed public simulation fields: capture
  // the live tick/escrow/journals directly rather than normalizing via JSON.
  const snapshot=()=>JSON.stringify({
    tick:authority.sim.tickCount,
    neutral:{lodTier:neutral.lodTier,fear:neutral.fear,
      morale:neutral.morale,lastLodChangeTick:neutral.lastLodChangeTick,
      progress:neutral.routeProgress,lastUpdateTick:neutral.lastUpdateTick},
    idle:{status:idle.status,incidentCount:idle.incidentCount,
      lastRaidTick:idle.lastRaidTick,perceivedDanger:idle.perceivedDanger},
    shipments:authority.shipments,stocks:authority.stocks,vaults:authority.vaults,
    journal:authority.events,simJournal:authority.sim.events
  });
  const before=snapshot();
  throws(()=>authority.tick(),pattern,label);
  equal(snapshot(),before,label+': live clock, escrow, and journals unchanged');
  authority.assertConservation();
}
assertLiveCognitiveHistoryRefusal(({neutral})=>{neutral.morale=Infinity;},
  /invalid civilization cognitive state/,
  'nontrade nonfinite morale refuses before two deliveries');
assertLiveCognitiveHistoryRefusal(({neutral,authority})=>{
  neutral.lastLodChangeTick=authority.sim.tickCount+1;},
  /invalid civilization cognitive state/,
  'future nontrade LOD transition refuses before two deliveries');
assertLiveCognitiveHistoryRefusal(({idle})=>{idle.incidentCount=-1;},
  /invalid civilization route danger history/,
  'negative unrelated road incident count refuses before two deliveries');
assertLiveCognitiveHistoryRefusal(({idle,authority})=>{
  idle.lastRaidTick=authority.sim.tickCount+1;},
  /invalid civilization route danger history/,
  'future unrelated road raid timestamp refuses before two deliveries');
assertLiveCognitiveHistoryRefusal(({idle})=>{idle.status='UNKNOWN';},
  /invalid civilization route danger history/,
  'unknown unrelated road status refuses before two deliveries');
assertLiveCognitiveHistoryRefusal(({neutral})=>{neutral.fear=-0.25;},
  /invalid live simulation entity progress/,
  'preexisting fear-specific live diagnostic remains intact');
const validLiveMetadata=createSimultaneousArrivals();
const customNeutral=validLiveMetadata.sim.registerEntity('neutral-host',
  {type:'SCOUT',currentRouteId:'MISSING',cargo:{host:{label:'kept',weight:2}}});
validLiveMetadata.sim.events.push({type:'host_note',tick:39,
  metadata:{hostTag:'keep',readings:[0.25,0.5]}});
const customBefore=validLiveMetadata.getState();
equal(customBefore.sim.events.at(-1),
  {type:'host_note',tick:39,metadata:{hostTag:'keep',readings:[0.25,0.5]}},
  'arbitrary valid structured host simulation event survives JSON export');
equal(customBefore.sim.entities.find(e=>e.id==='neutral-host').cargo,
  {host:{label:'kept',weight:2}},
  'valid nested custom nontrade cargo survives JSON export');
equal(validLiveMetadata.tick().settled,2,
  'nontrade missing-route and host metadata cannot block valid shipment settlement');
equal(customNeutral.currentRouteId,'MISSING',
  'nontrade unknown route remains an intentionally skipped reference-world route');
validLiveMetadata.assertConservation();
const nonfiniteHostNote=createWorld();
nonfiniteHostNote.sim.events.push({type:'host_note',tick:0,
  metadata:{measurements:[1,{reading:Infinity}]}});
throws(()=>nonfiniteHostNote.authority.getState(),
  /invalid simulation event numeric payload/,
  'nonfinite nested host event numeric value cannot silently serialize to null');
equal(nonfiniteHostNote.sim.events.at(-1).metadata.measurements[1].reading,Infinity,
  'rejected nested host event export does not rewrite the live source');
assertMalformedRestore(sim=>{sim.events.push({type:'host_note',tick:0,
    metadata:{reading:NaN}});},
  /invalid simulation event numeric payload/,
  'trusted restore rejects nested nonfinite host event number before destination transfer');

const invalidNontradeCargo=createWorld();
invalidNontradeCargo.sim.registerEntity('neutral-cargo',
  {type:'SCOUT',cargo:{host:{measurements:[Infinity],label:'keep'}}});
throws(()=>invalidNontradeCargo.authority.getState(),
  /invalid civilization cargo numeric metadata/,
  'nonfinite nested nontrade cargo cannot silently change into null on JSON export');
equal(invalidNontradeCargo.sim.entities.get('neutral-cargo').cargo.host.measurements[0],
  Infinity,'rejected cargo export does not mutate host-owned nested metadata');
assertMalformedRestore(sim=>{sim.entities.push({
    ...sim.entities[0],id:'neutral-cargo',type:'SCOUT',currentRouteId:null,
    cargo:{host:{values:[NaN]}},wealth:0
  });},
  /invalid civilization cargo numeric metadata/,
  'trusted restore refuses nested nonfinite host cargo before destination transfer');


// Direct snapshots and setState must not retain mutable live references for
// nested host events or nontrade cargo. Unlike the authority JSON checkpoint,
// the direct simulator contract may represent Dates, cycles and sparse arrays.
function hostReferenceFixture() {
  const sim=new CivilizationSimulationSystem();
  sim.registerNode('X');sim.registerNode('Y');
  sim.registerRoute('R_REF',{fromNodeId:'X',toNodeId:'Y',distance:80});
  sim.registerEntity('neutral-ref',{type:'SCOUT',cargo:{
    host:{nested:{label:'original'},date:new Date('2026-09-01T00:00:00.000Z')}
  }});
  sim.events.push({type:'host_note',tick:0,details:{
    nested:{label:'original'},date:new Date('2026-09-01T00:00:00.000Z')
  }});
  return sim;
}
const directHostSource=hostReferenceFixture(),directHostExport=directHostSource.getState();
const directHostEvent=directHostExport.events[0],
  directHostCargo=directHostExport.entities.find(e=>e.id==='neutral-ref').cargo.host;
directHostEvent.details.nested.label='changed';
directHostCargo.nested.label='changed';
directHostEvent.details.date.setUTCFullYear(2030);
directHostCargo.date.setUTCFullYear(2030);
equal(directHostSource.events[0].details.nested.label,'original',
  'editing direct export nested event must not change live journal');
equal(directHostSource.entities.get('neutral-ref').cargo.host.nested.label,'original',
  'editing direct export nested nontrade cargo must not change live cargo');
equal(directHostSource.events[0].details.date.getUTCFullYear(),2026,
  'direct export Date object must not alias live host event Date');
equal(directHostSource.entities.get('neutral-ref').cargo.host.date.getUTCFullYear(),2026,
  'direct export Date object must not alias live cargo Date');
const stateHostSource=hostReferenceFixture(),stateHostCopy=stateHostSource.getState(),
  stateHostTarget=hostReferenceFixture();
stateHostTarget.setState(stateHostCopy);
stateHostCopy.events[0].details.nested.label='changed';
stateHostCopy.entities.find(e=>e.id==='neutral-ref').cargo.host.nested.label='changed';
stateHostCopy.events[0].details.date.setUTCFullYear(2030);
stateHostCopy.entities.find(e=>e.id==='neutral-ref').cargo.host.date.setUTCFullYear(2030);
equal(stateHostTarget.events[0].details.nested.label,'original',
  'setState must not retain caller nested host journal references');
equal(stateHostTarget.entities.get('neutral-ref').cargo.host.nested.label,'original',
  'setState must not retain caller nested host cargo references');
equal(stateHostTarget.events[0].details.date.getUTCFullYear(),2026,
  'setState must not retain caller host event Date reference');
equal(stateHostTarget.entities.get('neutral-ref').cargo.host.date.getUTCFullYear(),2026,
  'setState must not retain caller host cargo Date reference');
const trustedHostSource=hostReferenceFixture(),trustedHostSnapshot=trustedHostSource.getState(),
  trustedHostTarget=hostReferenceFixture();
restoreTrustedCivState(trustedHostTarget,trustedHostSnapshot,
  civRoadGraphFingerprint(trustedHostSnapshot));
trustedHostSnapshot.events[0].details.nested.label='changed';
trustedHostSnapshot.entities.find(e=>e.id==='neutral-ref').cargo.host.nested.label='changed';
equal(trustedHostTarget.events[0].details.nested.label,'original',
  'trusted direct restore must not inherit caller nested event aliases');
equal(trustedHostTarget.entities.get('neutral-ref').cargo.host.nested.label,'original',
  'trusted direct restore must not inherit caller nested nontrade cargo aliases');
const cyclicHostSource=hostReferenceFixture(),cyclicHost={name:'cycle'};
cyclicHost.self=cyclicHost;
cyclicHostSource.events[0].details.cyclic=cyclicHost;
cyclicHostSource.entities.get('neutral-ref').cargo.host.cyclic=cyclicHost;
const cyclicHostExport=cyclicHostSource.getState(),
  exportedCycle=cyclicHostExport.events[0].details.cyclic,
  exportedCargoCycle=cyclicHostExport.entities.find(e=>e.id==='neutral-ref').cargo.host.cyclic;
assert(exportedCycle!==cyclicHost && exportedCycle.self===exportedCycle,
  'direct export detaches cyclic host journal data without breaking cycle');
assert(exportedCargoCycle!==cyclicHost && exportedCargoCycle.self===exportedCargoCycle,
  'direct export detaches cyclic nontrade cargo without breaking cycle');
const sparseHostSource=hostReferenceFixture(),sparseHostValues=[,'keep'];
sparseHostSource.events[0].details.sparse=sparseHostValues;
const sparseExport=sparseHostSource.getState().events[0].details.sparse;
assert(sparseExport.length===2 && !Object.hasOwn(sparseExport,0) &&
  sparseExport[1]==='keep' && sparseExport!==sparseHostValues,
  'direct host metadata clone preserves sparse array holes without aliasing');
const customJsonHostSource=hostReferenceFixture(),
  customHost={label:'valid',toJSON(){return {label:this.label,type:'custom'}}};
customJsonHostSource.events[0].details.custom=customHost;
const customDirect=customJsonHostSource.getState().events[0].details.custom;
assert(customDirect!==customHost && typeof customDirect.toJSON==='function',
  'direct snapshot detaches host custom toJSON object without discarding method');
equal(JSON.parse(JSON.stringify(customDirect)),{label:'valid',type:'custom'},
  'custom host toJSON protocol remains functional on direct snapshot');
const builtinHost=hostReferenceFixture();
builtinHost.events[0].details.map=new Map([['host',{flag:true}]]);
builtinHost.entities.get('neutral-ref').cargo.host.set=new Set(['keep']);
const builtinExport=builtinHost.getState();
assert(builtinExport.events[0].details.map instanceof Map &&
  builtinExport.events[0].details.map!==builtinHost.events[0].details.map,
  'direct event metadata preserves valid Map internal slots without alias');
assert(builtinExport.entities.find(e=>e.id==='neutral-ref').cargo.host.set instanceof Set,
  'direct cargo metadata preserves valid Set internal slots');

// Known nonplain metadata must not be fabricated with an unusable URL
// prototype, while a malformed Date must not silently JSON-null a checkpoint.
const validUrlHost=hostReferenceFixture();
validUrlHost.events[0].details.url=new URL('https://example.org/path?q=1');
const directUrl=validUrlHost.getState().events[0].details.url;
assert(directUrl instanceof URL && directUrl.href==='https://example.org/path?q=1' &&
  directUrl!==validUrlHost.events[0].details.url,
  'direct event URL clone preserves internal slots and detaches source');
directUrl.searchParams.set('q','other');
equal(validUrlHost.events[0].details.url.searchParams.get('q'),'1',
  'changing exported URL search parameters does not modify host source');
const validDateHost=hostReferenceFixture();
validDateHost.events[0].details.date=new Date('2026-09-01T00:00:00.000Z');
equal(validDateHost.getState().events[0].details.date.getUTCFullYear(),2026,
  'valid host Date still survives direct snapshot boundary');
const invalidEventDate=hostReferenceFixture(),badEventDate=new Date(NaN);
invalidEventDate.events[0].details.date=badEventDate;
throws(()=>invalidEventDate.getState(),/invalid simulation event numeric payload/,
  'invalid host event Date refuses before silent JSON null conversion');
assert(Number.isNaN(badEventDate.getTime()),
  'refused event Date export leaves live host Date unchanged');
const invalidCargoDate=hostReferenceFixture(),badCargoDate=new Date(NaN);
invalidCargoDate.entities.get('neutral-ref').cargo.host.date=badCargoDate;
throws(()=>invalidCargoDate.getState(),/invalid civilization cargo numeric metadata/,
  'invalid host cargo Date refuses before silent JSON null conversion');
assert(Number.isNaN(badCargoDate.getTime()),
  'refused cargo Date export leaves live host Date unchanged');
assertMalformedRestore(sim=>{
  sim.events.push({type:'host_custom',tick:0,details:{date:new Date(NaN)}});
},/invalid simulation event numeric payload/,
  'trusted restore refuses invalid event Date before staging');
assertMalformedRestore(sim=>{
  sim.entities[0].cargo={host:{date:new Date(NaN)}};
},/invalid civilization cargo numeric metadata/,
  'trusted restore refuses invalid cargo Date before staging');
const symbolicHost=hostReferenceFixture(),hostSymbol=Symbol('host-owned');
symbolicHost.events[0].details[hostSymbol]={label:'keep'};
const symbolicDirect=symbolicHost.getState().events[0].details;
equal(symbolicDirect[hostSymbol],{label:'keep'},
  'direct snapshot retains enumerable host-defined symbol-key metadata');
assert(symbolicDirect[hostSymbol]!==symbolicHost.events[0].details[hostSymbol],
  'host symbol-key nested value is detached from source');
const symbolicTarget=hostReferenceFixture();
symbolicTarget.setState(symbolicHost.getState());
equal(symbolicTarget.events[0].details[hostSymbol],{label:'keep'},
  'direct setState preserves enumerable host symbol-key metadata');
// Scientific negative: JSON checkpoints omit symbols by design; never claim
// their identity is part of the authority JSON format.
assert(!Object.hasOwn(symbolicHost.getState().events[0].details,'host-owned') &&
  Object.getOwnPropertySymbols(symbolicHost.getState().events[0].details).length===1,
  'direct symbol preservation does not invent string keys');
class PrivateHostMetadata {#secret=7; getSecret(){return this.#secret;}}
const privateSlotHost=hostReferenceFixture(),privateObj=new PrivateHostMetadata();
privateSlotHost.events[0].details.custom=privateObj;
const privateDirect=privateSlotHost.getState().events[0].details.custom;
throws(()=>privateDirect.getSecret(),/private member|class did not declare/,
  'scientific negative: arbitrary class private slots cannot be cloned by prototype copy');

// Direct simulator event/cargo snapshots are graphs, not independent JSON
// roots. Preserve repeated source identity across events and neutral cargo
// while detaching all snapshot references from the live host world.
const crossIdentityWorld=hostReferenceFixture(),crossIdentityShared={tag:'shared',nested:{n:1}};
crossIdentityWorld.events[0].details.first=crossIdentityShared;
crossIdentityWorld.events[0].details.again=crossIdentityShared;
crossIdentityWorld.events.push({type:'host_second',tick:0,payload:crossIdentityShared});
crossIdentityWorld.entities.get('neutral-ref').cargo.host.shared=crossIdentityShared;
const crossIdentitySnapshot=crossIdentityWorld.getState();
const sharedEvent=crossIdentitySnapshot.events[0].details.first;
const sharedCargo=crossIdentitySnapshot.entities.find(e=>e.id==='neutral-ref').cargo.host.shared;
assert(sharedEvent!==crossIdentityShared && sharedCargo!==crossIdentityShared,
  'cross-root direct snapshot object detached from original host');
assert(sharedEvent===crossIdentitySnapshot.events[0].details.again,
  'same-event repeated host reference retains identical detached object');
assert(sharedEvent===crossIdentitySnapshot.events[1].payload,
  'different-event roots retain common detached reference');
assert(sharedEvent===sharedCargo,
  'event and neutral cargo roots share detached object identity');
sharedEvent.nested.n=2;
equal(sharedCargo.nested.n,2,
  'mutations to one direct snapshot reference are visible to its shared alias');
equal(crossIdentityShared.nested.n,1,
  'mutating direct shared snapshot does not change live source');
const crossIdentityRestore=hostReferenceFixture();
crossIdentityRestore.setState(crossIdentitySnapshot);
const restoredEvent=crossIdentityRestore.events[0].details.first,
  restoredCargo=crossIdentityRestore.entities.get('neutral-ref').cargo.host.shared;
assert(restoredEvent===restoredCargo &&
  restoredEvent===crossIdentityRestore.events[1].payload &&
  restoredEvent!==sharedEvent,
  'direct setState retains cross-root identity without caller reference aliases');
restoredCargo.nested.n=3;
equal(restoredEvent.nested.n,3,
  'restored event and neutral cargo mutations see one reference');
equal(sharedEvent.nested.n,2,
  'restored world does not mutate caller snapshot');
const crossTrustedTarget=hostReferenceFixture();
restoreTrustedCivState(crossTrustedTarget,crossIdentitySnapshot,
  civRoadGraphFingerprint(crossIdentitySnapshot));
assert(crossTrustedTarget.events[0].details.first===
  crossTrustedTarget.entities.get('neutral-ref').cargo.host.shared,
  'trusted restore preserves direct shared host graph identity');
assert(crossTrustedTarget.events[0].details.first!==sharedEvent,
  'trusted restore detaches shared metadata from input snapshot');
const crossCycleHost=hostReferenceFixture(),cyclicShared={label:'cycle'};
cyclicShared.self=cyclicShared;
crossCycleHost.events[0].details.cycle=cyclicShared;
crossCycleHost.entities.get('neutral-ref').cargo.host.cycle=cyclicShared;
const crossCycleSnap=crossCycleHost.getState(),crossEventCycle=crossCycleSnap.events[0].details.cycle;
assert(crossEventCycle.self===crossEventCycle &&
  crossEventCycle===crossCycleSnap.entities.find(e=>e.id==='neutral-ref').cargo.host.cycle &&
  crossEventCycle!==cyclicShared,
  'cyclic cross-root host data is both detached and reference-identical');
// Explicit JSON limitation: the authority serializes data, not JS aliasing.
const crossAuthoritySim=hostReferenceFixture(),crossAuthorityShared={tag:'json'};
crossAuthoritySim.config.distanceAwareTravel=true;
crossAuthoritySim.config.caravanUnitsPerTick=2;
crossAuthoritySim.events[0].details.ref=crossAuthorityShared;
crossAuthoritySim.entities.get('neutral-ref').cargo.host.ref=crossAuthorityShared;
const crossAuthority=new WorldTradeAuthority(crossAuthoritySim);
crossAuthority.seedNode('X',{},0);crossAuthority.seedNode('Y',{},0);crossAuthority.sealGenesis(123);
const crossJson=crossAuthority.getState().sim;
const crossJsonEvent=crossJson.events[0].details.ref,
  crossJsonCargo=crossJson.entities.find(e=>e.id==='neutral-ref').cargo.host.ref;
equal(crossJsonEvent,crossJsonCargo,
  'JSON authority snapshot keeps equal host metadata values');
assert(crossJsonEvent!==crossJsonCargo,
  'scientific negative: JSON authority protocol does not preserve JS graph identity');

// Cross-field host metadata can include native Map/Set containers. Do not
// structuredClone each container independently: its keys/members may be the
// same object as nontrade cargo, other collections or the container itself.
const mapHost=hostReferenceFixture();
const mapShared={label:'same',deep:{value:1}},mapMeta=new Map(),setMeta=new Set();
mapMeta.set(mapShared,mapShared);
mapMeta.set('ref',mapShared);
mapMeta.set('self',mapMeta);
setMeta.add(mapShared);setMeta.add(mapMeta);setMeta.add(setMeta);
mapHost.events[0].details.map=mapMeta;
mapHost.events[0].details.set=setMeta;
mapHost.entities.get('neutral-ref').cargo.host.shared=mapShared;
mapHost.entities.get('neutral-ref').cargo.host.map=mapMeta;
const mapSnap=mapHost.getState(),snapMap=mapSnap.events[0].details.map,
  snapSet=mapSnap.events[0].details.set,
  snapShared=mapSnap.entities.find(e=>e.id==='neutral-ref').cargo.host.shared;
assert(snapMap instanceof Map && snapSet instanceof Set,
  'direct snapshot retains native Map and Set internal slots');
assert(snapMap!==mapMeta && snapSet!==setMeta && snapShared!==mapShared,
  'Map/Set direct snapshot graph detached from live host');
assert([...snapMap.keys()][0]===snapShared && snapMap.get('ref')===snapShared,
  'Map key/value identity agrees with direct nontrade cargo root');
assert(snapMap.get('self')===snapMap,
  'Map self-references remain cyclic and detached');
assert(snapSet.has(snapShared) && snapSet.has(snapMap) && snapSet.has(snapSet),
  'Set members preserve cross-collection and self-references');
assert(snapMap===mapSnap.entities.find(e=>e.id==='neutral-ref').cargo.host.map,
  'Map itself is identity-shared between event and cargo');
snapMap.get('ref').deep.value=2;
equal(snapShared.deep.value,2,
  'mutating Map member updates alias within exported direct snapshot');
equal(mapShared.deep.value,1,
  'modifying exported Map does not change live host');
const mapRestored=hostReferenceFixture();
mapRestored.setState(mapSnap);
const restoredMap=mapRestored.events[0].details.map,
  restoredSet=mapRestored.events[0].details.set,
  restoredShared=mapRestored.entities.get('neutral-ref').cargo.host.shared;
assert(restoredMap.get('ref')===restoredShared &&
  restoredSet.has(restoredMap) && restoredSet.has(restoredShared) &&
  restoredSet.has(restoredSet) && restoredMap.get('self')===restoredMap,
  'setState preserves native collection cross-root identity and cycles');
assert(restoredShared!==snapShared && restoredMap!==snapMap,
  'setState copies Map/Set graph without aliasing caller snapshot');
restoredMap.get('ref').deep.value=3;
equal(snapShared.deep.value,2,
  'mutating restored native collection leaves caller snapshot unchanged');
const mapTrusted=hostReferenceFixture();
restoreTrustedCivState(mapTrusted,mapSnap,civRoadGraphFingerprint(mapSnap));
assert(mapTrusted.events[0].details.map.get('ref')===
  mapTrusted.entities.get('neutral-ref').cargo.host.shared,
  'trusted direct restore preserves Map-valued host graph identity');
// Scope boundary: authority JSON intentionally treats a Map as an object with
// no enumerable string members, not a universal JS collection protocol.
const mapJsonSim=hostReferenceFixture();
mapJsonSim.config.distanceAwareTravel=true;
mapJsonSim.config.caravanUnitsPerTick=2;
mapJsonSim.events[0].details.map=new Map([['host',{label:'valid'}]]);
const mapJsonAuthority=new WorldTradeAuthority(mapJsonSim);
mapJsonAuthority.seedNode('X',{},0);mapJsonAuthority.seedNode('Y',{},0);
mapJsonAuthority.sealGenesis(321);
equal(mapJsonAuthority.getState().sim.events[0].details.map,{},
  'scientific negative: authority JSON does not represent Map entries');

// Direct snapshot metadata can refer to the same backing ArrayBuffer via
// several typed-array and DataView windows and through unrelated event/cargo
// roots. It is a mutable shared memory graph, not separate value copies.
const bufferHost=hostReferenceFixture(),backing=new ArrayBuffer(16);
const bytes=new Uint8Array(backing),words=new Uint16Array(backing,2,4),
  dataWindow=new DataView(backing,1,6);
bytes.set([1,2,3,4]);
bufferHost.events[0].details.buffer=backing;
bufferHost.events[0].details.bytes=bytes;
bufferHost.events[0].details.words=words;
bufferHost.events[0].details.dataWindow=dataWindow;
bufferHost.entities.get('neutral-ref').cargo.host.buffer=backing;
bufferHost.entities.get('neutral-ref').cargo.host.words=words;
const bufferSnapshot=bufferHost.getState(),
  exportedMeta=bufferSnapshot.events[0].details,
  exportedCargo=bufferSnapshot.entities.find(e=>e.id==='neutral-ref').cargo.host;
assert(exportedMeta.buffer===exportedCargo.buffer &&
  exportedMeta.bytes.buffer===exportedMeta.buffer &&
  exportedMeta.words.buffer===exportedMeta.buffer &&
  exportedMeta.dataWindow.buffer===exportedMeta.buffer,
  'direct snapshot retains common ArrayBuffer identity across native views and cargo');
assert(exportedMeta.words===exportedCargo.words &&
  exportedMeta.buffer!==backing && exportedMeta.words!==words,
  'typed array identity reused across roots without aliasing live host');
equal(exportedMeta.words.byteOffset,2,
  'typed array offset survives shared buffer clone');
equal(exportedMeta.dataWindow.byteOffset,1,
  'DataView offset survives shared buffer clone');
exportedMeta.bytes[2]=9;
equal(exportedMeta.dataWindow.getUint8(1),9,
  'overlapping DataView observes typed array mutation on shared snapshot buffer');
equal(new Uint8Array(exportedMeta.words.buffer,exportedMeta.words.byteOffset,1)[0],9,
  'overlapping typed view observes common backing-byte mutation');
equal(bytes[2],3,
  'mutating native snapshot buffer leaves original host memory unchanged');
const restoredBufferHost=hostReferenceFixture();
restoredBufferHost.setState(bufferSnapshot);
const restoredBufferMeta=restoredBufferHost.events[0].details,
  restoredBufferCargo=restoredBufferHost.entities.get('neutral-ref').cargo.host;
assert(restoredBufferMeta.bytes.buffer===restoredBufferMeta.buffer &&
  restoredBufferMeta.dataWindow.buffer===restoredBufferMeta.buffer &&
  restoredBufferMeta.words.buffer===restoredBufferCargo.buffer &&
  restoredBufferMeta.words===restoredBufferCargo.words,
  'direct setState preserves shared backing buffer and repeated native view identity');
assert(restoredBufferMeta.buffer!==exportedMeta.buffer,
  'direct setState detaches native buffer from caller snapshot');
restoredBufferMeta.bytes[2]=7;
equal(exportedMeta.bytes[2],9,
  'direct restore mutation does not alter caller snapshot bytes');
const trustedBufferHost=hostReferenceFixture();
restoreTrustedCivState(trustedBufferHost,bufferSnapshot,
  civRoadGraphFingerprint(bufferSnapshot));
assert(trustedBufferHost.events[0].details.bytes.buffer===
  trustedBufferHost.entities.get('neutral-ref').cargo.host.buffer,
  'trusted direct restore preserves backing buffer identity');
const dataDescriptorHost=hostReferenceFixture(),plainRecord=Object.create(null);
Object.defineProperty(plainRecord,'value',{
  value:{tag:'data'},enumerable:true,writable:false,configurable:false});
dataDescriptorHost.events[0].details.record=plainRecord;
const plainCopy=dataDescriptorHost.getState().events[0].details.record;
equal(plainCopy.value,{tag:'data'},
  'direct snapshot retains valid data-only descriptor values');
assert(plainCopy!==plainRecord && plainCopy.value!==plainRecord.value,
  'valid plain record data descriptor copy is detached');
const unsafeGetterHost=hostReferenceFixture();
let accessorCount=0;const unsafeRecord={};
Object.defineProperty(unsafeRecord,'flag',{enumerable:true,get(){
  accessorCount++;return 'safe';}});
unsafeGetterHost.events[0].details.record=unsafeRecord;
unsafeGetterHost.getState();
assert(accessorCount>0,
  'scientific negative: a valid-looking getter executes during current metadata capture');

// Explicit direct-snapshot opt-in uses own data descriptors for ordinary host
// event/cargo metadata. It does not alter the legacy host contract, authority
// JSON semantics, or the behavior of Proxy reflection traps.
const dataOnlySource=hostReferenceFixture(), dataOnlyRecord=Object.create(null),
  dataOnlyBacking=new ArrayBuffer(12), dataOnlyView=new Uint16Array(dataOnlyBacking,2,3);
Object.defineProperty(dataOnlyRecord,'level',{
  value:{value:1},enumerable:true,writable:false,configurable:false});
const dataOnlyMap=new Map([[dataOnlyRecord,dataOnlyView]]);
const dataOnlySet=new Set([dataOnlyRecord,dataOnlyMap]);
dataOnlySource.events[0].details={record:dataOnlyRecord,backing:dataOnlyBacking,
  view:dataOnlyView,map:dataOnlyMap,set:dataOnlySet};
dataOnlySource.entities.get('neutral-ref').cargo.host={record:dataOnlyRecord,
  backing:dataOnlyBacking,view:dataOnlyView,map:dataOnlyMap,set:dataOnlySet};
const dataOnlySnapshot=dataOnlySource.getState({dataOnlyHostMetadata:true}),
  dataOnlyEvent=dataOnlySnapshot.events[0].details,
  dataOnlyCargo=dataOnlySnapshot.entities.find(e=>e.id==='neutral-ref').cargo.host;
assert(dataOnlyEvent.record===dataOnlyCargo.record &&
  dataOnlyEvent.map===dataOnlyCargo.map &&
  dataOnlyEvent.set===dataOnlyCargo.set &&
  dataOnlyEvent.view===dataOnlyCargo.view,
  'opt-in data-only descriptors preserve event/cargo cross-root references');
assert(dataOnlyEvent.view.buffer===dataOnlyEvent.backing &&
  dataOnlyEvent.map.get(dataOnlyEvent.record)===dataOnlyEvent.view &&
  dataOnlyEvent.set.has(dataOnlyEvent.map),
  'opt-in data-only graph preserves Map/Set members and native shared backing');
assert(dataOnlyEvent.record!==dataOnlyRecord &&
  dataOnlyEvent.backing!==dataOnlyBacking &&
  dataOnlyEvent.record.level.value===1,
  'opt-in data-only graph is detached from host and retains readonly data values');
const dataOnlyTarget=hostReferenceFixture();
dataOnlyTarget.setState(dataOnlySnapshot,{dataOnlyHostMetadata:true});
assert(dataOnlyTarget.events[0].details.record===
  dataOnlyTarget.entities.get('neutral-ref').cargo.host.record &&
  dataOnlyTarget.events[0].details.view.buffer===
  dataOnlyTarget.entities.get('neutral-ref').cargo.host.backing &&
  dataOnlyTarget.events[0].details.record!==dataOnlyEvent.record,
  'opt-in direct setState preserves data-only identity and caller detachment');
const dataOnlyTrusted=hostReferenceFixture();
restoreTrustedCivState(dataOnlyTrusted,dataOnlySnapshot,
  civRoadGraphFingerprint(dataOnlySnapshot));
assert(dataOnlyTrusted.events[0].details.map.get(
  dataOnlyTrusted.events[0].details.record)===
  dataOnlyTrusted.entities.get('neutral-ref').cargo.host.view,
  'trusted direct restore inherits intact Map and view metadata graph');

const dataOnlyAccessorSource=hostReferenceFixture();
let optInGetterReads=0;
Object.defineProperty(dataOnlyAccessorSource.events[0].details,'bad',{
  enumerable:true,get(){
    optInGetterReads++;
    dataOnlyAccessorSource.entities.get('neutral-ref').morale=0.2;
    return 1;
  }});
throws(()=>dataOnlyAccessorSource.getState({dataOnlyHostMetadata:true}),
  /host metadata must have own data properties/,
  'opt-in direct getState refuses event accessor before getter execution');
equal(optInGetterReads,0,'opt-in event accessor has no getter reads');
equal(dataOnlyAccessorSource.entities.get('neutral-ref').morale,1,
  'opt-in event accessor rejection leaves host morale unchanged');
const dataOnlyCargoAccessor=hostReferenceFixture();
let optInCargoReads=0;
Object.defineProperty(dataOnlyCargoAccessor.entities.get('neutral-ref').cargo.host,'bad',{
  enumerable:true,get(){optInCargoReads++;return 1;}});
throws(()=>dataOnlyCargoAccessor.getState({dataOnlyHostMetadata:true}),
  /host metadata must have own data properties/,
  'opt-in direct getState refuses nontrade cargo accessor');
equal(optInCargoReads,0,'opt-in cargo accessor never executes');
const dataOnlyRestoreSnapshot=hostReferenceFixture().getState(),
  dataOnlyRestoreTarget=hostReferenceFixture();
let optInRestoreReads=0;
Object.defineProperty(dataOnlyRestoreSnapshot.events[0].details,'bad',{
  enumerable:true,get(){optInRestoreReads++;throw Error('untrusted getter');}});
throws(()=>dataOnlyRestoreTarget.setState(dataOnlyRestoreSnapshot,{
  dataOnlyHostMetadata:true}),
  /host metadata must have own data properties/,
  'opt-in direct setState preflights accessor before destination writes');
equal(optInRestoreReads,0,'opt-in setState does not execute rejected getter');
equal(dataOnlyRestoreTarget.events[0].type,'host_note',
  'rejected opt-in direct restore leaves destination journal in place');
const dataOnlyMapAccessor=hostReferenceFixture(), mapBad={};
Object.defineProperty(mapBad,'bad',{enumerable:true,get(){throw Error('map getter');}});
dataOnlyMapAccessor.events[0].details.map=new Map([['key',mapBad]]);
throws(()=>dataOnlyMapAccessor.getState({dataOnlyHostMetadata:true}),
  /host metadata must have own data properties/,
  'data-only Map values are checked for ordinary accessors');
const dataOnlyNonfinite=hostReferenceFixture();
dataOnlyNonfinite.events[0].details.map=new Map([['host',{numeric:NaN}]]);
throws(()=>dataOnlyNonfinite.getState({dataOnlyHostMetadata:true}),
  /invalid simulation event numeric payload/,
  'opt-in nested Map numeric values refuse silent JSON NaN loss');
let legacyGetterReads=0;const legacyGetterHost=hostReferenceFixture();
Object.defineProperty(legacyGetterHost.events[0].details,'legacy',{
  enumerable:true,get(){legacyGetterReads++;return 'valid';}});
equal(legacyGetterHost.getState().events[0].details.legacy,'valid',
  'legacy direct snapshots still support intentionally valid accessors');
assert(legacyGetterReads>0,
  'default metadata getter semantics remain opt-out-compatible');
// A Proxy can mutate through ownKeys/getOwnPropertyDescriptor even in opt-in
// mode. The contract never calls this a hostile-object sandbox.
let proxyTrapReads=0;const dataOnlyProxy=hostReferenceFixture();
dataOnlyProxy.events[0].details.proxy=new Proxy({flag:1},{
  ownKeys(target){proxyTrapReads++;return Reflect.ownKeys(target);}});
dataOnlyProxy.getState({dataOnlyHostMetadata:true});
assert(proxyTrapReads>0,
  'scientific negative: opt-in descriptor capture still invokes Proxy traps');
if (typeof SharedArrayBuffer !== 'undefined') {
  const sharedMemoryHost=hostReferenceFixture(),sharedMemory=new SharedArrayBuffer(8);
  sharedMemoryHost.events[0].details.sharedMemory=sharedMemory;
  throws(()=>sharedMemoryHost.getState(),/unsupported shared host memory metadata/,
    'unsupported SharedArrayBuffer is refused instead of fabricating native slots');
  const sharedViewHost=hostReferenceFixture();
  sharedViewHost.events[0].details.view=new Uint8Array(sharedMemory);
  throws(()=>sharedViewHost.getState(),/unsupported shared host memory metadata/,
    'typed view backed by shared memory cannot escape into detached direct snapshots');
}
const nodeBufferHost=hostReferenceFixture(),nodeBuffer=Buffer.from([3,4,5]);
nodeBufferHost.events[0].details.buffer=nodeBuffer;
const nodeBytes=nodeBufferHost.getState().events[0].details.buffer;
assert(nodeBytes instanceof Uint8Array && Buffer.isBuffer(nodeBytes) &&
  nodeBytes[0]===3 && nodeBytes[1]===4 && nodeBytes[2]===5,
  'Node Buffer snapshot retains its native Node Buffer API and bytes');

const realmFixture=runInContext('(()=>{const b=new ArrayBuffer(24); const bytes=new Uint8Array(b);bytes.set([1,2,3,4]);return {b,bytes,words:new Uint16Array(b,2,3),view:new DataView(b,1,8),big:new BigInt64Array(new ArrayBuffer(16))};})()',createContext({}));
const realmHost=hostReferenceFixture();
realmHost.events[0].details={backing:realmFixture.b,bytes:realmFixture.bytes,
  words:realmFixture.words,view:realmFixture.view,big:realmFixture.big};
realmHost.entities.get('neutral-ref').cargo.host={backing:realmFixture.b,
  words:realmFixture.words};
const realmSnapshot=realmHost.getState(),realmData=realmSnapshot.events[0].details,
  realmCargo=realmSnapshot.entities.find(e=>e.id==='neutral-ref').cargo.host;
assert(realmData.bytes instanceof Uint8Array &&
  realmData.words instanceof Uint16Array &&
  realmData.view instanceof DataView &&
  realmData.big instanceof BigInt64Array,
  'cross-realm native views reconstructed with local genuine internal slots');
assert(realmData.backing===realmData.bytes.buffer &&
  realmData.backing===realmData.words.buffer &&
  realmData.backing===realmData.view.buffer &&
  realmData.backing===realmCargo.backing &&
  realmData.words===realmCargo.words,
  'cross-realm typed views share copied buffer across event and cargo roots');
assert(realmData.backing instanceof ArrayBuffer &&
  realmData.backing.constructor===ArrayBuffer,
  'foreign ArrayBuffer snapshots normalize to local native ArrayBuffer');
assert(realmData.backing!==realmFixture.b && realmData.words!==realmFixture.words &&
  realmData.words.byteOffset===2 && realmData.view.byteOffset===1,
  'cross-realm native view offsets detached from the original host');
const realmRestored=hostReferenceFixture();
realmRestored.setState(realmSnapshot);
assert(realmRestored.events[0].details.words===
  realmRestored.entities.get('neutral-ref').cargo.host.words &&
  realmRestored.events[0].details.bytes.buffer===
  realmRestored.entities.get('neutral-ref').cargo.host.backing,
  'cross-realm view graph fidelity survives direct restore');
const realmTrusted=hostReferenceFixture();
restoreTrustedCivState(realmTrusted,realmSnapshot,civRoadGraphFingerprint(realmSnapshot));
assert(realmTrusted.events[0].details.words===
  realmTrusted.entities.get('neutral-ref').cargo.host.words,
  'cross-realm view graph fidelity survives trusted restore');
const realmOptIn=hostReferenceFixture();
realmOptIn.events[0].details.view=realmFixture.view;
equal(realmOptIn.getState({dataOnlyHostMetadata:true}).events[0].details.view.byteOffset,1,
  'opt-in data-only metadata accepts genuine foreign native DataView');

const resizableBuffer=new ArrayBuffer(16,{maxByteLength:64});
if(resizableBuffer.resizable){
  const resizableHost=hostReferenceFixture(),
    trackingView=new Uint8Array(resizableBuffer,2),
    fixedView=new Uint8Array(resizableBuffer,2,5),
    trackingDataView=new DataView(resizableBuffer,1);
  trackingView[0]=7;
  resizableHost.events[0].details={resizableBuffer,trackingView,fixedView,trackingDataView};
  const saved=resizableHost.getState().events[0].details;
  assert(saved.resizableBuffer.resizable && saved.resizableBuffer.maxByteLength===64 &&
    saved.trackingView.buffer===saved.resizableBuffer &&
    saved.fixedView.buffer===saved.resizableBuffer &&
    saved.trackingDataView.buffer===saved.resizableBuffer,
    'resizable native buffer capacity and shared view backing survive snapshot');
  saved.resizableBuffer.resize(24);
  equal(saved.trackingView.length,22,
    'length-tracking typed view expands with detached resizable snapshot');
  equal(saved.fixedView.length,5,
    'fixed typed view remains fixed when cloned backing grows');
  equal(saved.trackingDataView.byteLength,23,
    'length-tracking DataView expands with detached resizable snapshot');
  equal(resizableBuffer.byteLength,16,
    'resizing direct snapshot leaves host original buffer length unchanged');
  const noHeadroom=new ArrayBuffer(8,{maxByteLength:8});
  const noHeadroomHost=hostReferenceFixture();
  noHeadroomHost.events[0].details.view=new Uint8Array(noHeadroom);
  throws(()=>noHeadroomHost.getState(),/unsupported resizable host view metadata/,
    'ambiguous no-headroom length-tracking resizable view refused explicitly');
  const beforeUnsafeNativeRestore=hostReferenceFixture(),
    unsafeNativeInput=hostReferenceFixture().getState(),
    originalNativeState=JSON.stringify(beforeUnsafeNativeRestore.getState());
  unsafeNativeInput.events[0].details.badView=new Uint8Array(noHeadroom);
  throws(()=>beforeUnsafeNativeRestore.setState(unsafeNativeInput,{
    dataOnlyHostMetadata:true}),
    /unsupported resizable host view metadata/,
    'data-only direct restore pre-stages native metadata before state writes');
  equal(JSON.stringify(beforeUnsafeNativeRestore.getState()),originalNativeState,
    'unsupported native view rejection leaves destination direct simulator unchanged');
}

const customJsonHost=hostReferenceFixture();let customJsonRuns=0;
customJsonHost.config.distanceAwareTravel=true;
customJsonHost.config.caravanUnitsPerTick=2;
const customRecord={value:1};
Object.defineProperty(customRecord,'toJSON',{enumerable:false,value(){
  customJsonRuns++;customJsonHost.entities.get('neutral-ref').morale=0.1;
  return {value:2};
}});
customJsonHost.events[0].details.custom=customRecord;
const customJsonAuthority=new WorldTradeAuthority(customJsonHost);
customJsonAuthority.seedNode('X',{},0);customJsonAuthority.seedNode('Y',{},0);
customJsonAuthority.sealGenesis(123);
throws(()=>customJsonAuthority.getState({dataOnlyHostMetadata:true}),
  /host metadata must not define toJSON callbacks/,
  'data-only authority snapshot refuses nonenumerable custom toJSON before serialization');
equal(customJsonRuns,0,'data-only authority snapshot does not call rejected toJSON');
equal(customJsonHost.entities.get('neutral-ref').morale,1,
  'rejected custom toJSON leaves host morale untouched');
equal(customJsonAuthority.getState().sim.events[0].details.custom.value,1,
  'legacy direct snapshot omits nonenumerable custom toJSON as before');
equal(customJsonRuns,0,'legacy clone does not copy nonenumerable toJSON');
const enumerableToJsonHost=hostReferenceFixture();
enumerableToJsonHost.config.distanceAwareTravel=true;
enumerableToJsonHost.config.caravanUnitsPerTick=2;
let enumerableToJsonRuns=0;
enumerableToJsonHost.events[0].details.record={value:1,toJSON(){
  enumerableToJsonRuns++;return {value:2};}};
const enumerableToJsonAuthority=new WorldTradeAuthority(enumerableToJsonHost);
enumerableToJsonAuthority.seedNode('X',{},0);
enumerableToJsonAuthority.seedNode('Y',{},0);
enumerableToJsonAuthority.sealGenesis(123);
equal(enumerableToJsonAuthority.getState().sim.events[0].details.record.value,2,
  'legacy authority JSON retains enumerable custom toJSON transformation');
equal(enumerableToJsonRuns,1,'legacy authority invokes enumerable toJSON once');

// Without a trusted native isProxy predicate, Reflect.ownKeys and descriptor
// validation cannot sandbox an arbitrary Proxy. Keep the negative result.
const proxyHazard=hostReferenceFixture();let descriptorTraps=0;
proxyHazard.events[0].details.proxy=new Proxy({value:1},{
  getOwnPropertyDescriptor(target,key){descriptorTraps++;
    proxyHazard.entities.get('neutral-ref').fear=0.4;
    return Reflect.getOwnPropertyDescriptor(target,key);}});
proxyHazard.getState({dataOnlyHostMetadata:true});
assert(descriptorTraps>0 &&
  proxyHazard.entities.get('neutral-ref').fear===0.4,
  'scientific negative: opt-in Proxy descriptor traps can still mutate host state');
console.log(`SUCCESS: ${assertions} shipment-mirror assertions passed.`);
