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

console.log(`SUCCESS: ${assertions} shipment-mirror assertions passed.`);
