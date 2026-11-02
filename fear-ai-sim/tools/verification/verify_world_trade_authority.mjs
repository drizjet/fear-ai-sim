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
console.log(`SUCCESS: ${assertions} shipment-mirror assertions passed.`);
