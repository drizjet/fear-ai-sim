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

const validPair = createSimultaneousArrivals();
equal(validPair.tick().settled,2,'two uncorrupted same-tick arrivals both settle');
equal(validPair.shipments.S1.status,'completed','first simultaneous arrival completes');
equal(validPair.shipments.S2.status,'completed','second simultaneous arrival completes');
validPair.assertConservation();

console.log(`SUCCESS: ${assertions} shipment-mirror assertions passed.`);
