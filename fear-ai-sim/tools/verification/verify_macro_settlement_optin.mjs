#!/usr/bin/env node

/**
 * verify_macro_settlement_optin.mjs — the §3 promotion for Macro & Settlement Systems.
 *
 * `EconomicFeedbackSystem` and `SettlementMigrationSystem` move from
 * `RELEASE_SURFACE.md` §2 (out of scope) to §1 (in scope) as opt-in services.
 * That policy requires four things, and this probe carries conditions 2, 3 and 4 of them:
 *
 *   1. wired into RuntimeSimulation as an explicit OPT-IN service;
 *   2. a standalone deterministic verifier proves the opt-in path AND the
 *      unchanged default path;
 *   3. its ledger row is promoted with bounded evidence;
 *   4. the negative tripwire and the release surface are updated in the same
 *      change.
 *
 * As with InformationPropagationEngine and PackCoordinationEngine, the critical proof is
 * that NOTHING changed for hosts that did not ask for it:
 * - A default run and an explicit-false run are byte-identical across outputs and snapshots;
 * - An enabled run produces identical core simulation outputs, identical snapshots,
 *   and identical RNG state draws;
 * - The services are strictly ADVISORY: they emit market pricing pressures, raid utilities,
 *   migration push/pull vectors, and demographic impacts without mutating host transforms,
 *   physics, canonical inventories, or agent fear.
 */

import { RuntimeSimulation } from '../../packages/runtime/src/RuntimeSimulation.js';
import { COMMODITY_TYPES } from '../../packages/core/src/EconomicFeedbackSystem.js';

let assertions = 0;
function assert(condition, message) {
    assertions += 1;
    if (!condition) throw new Error(message);
}

function assertThrows(fn, pattern, label) {
    assertions += 1;
    try {
        fn();
    } catch (error) {
        if (pattern.test(String(error && error.message))) return;
        throw new Error(`${label}: threw the wrong error — ${error && error.message}`);
    }
    throw new Error(`${label}: expected a refusal, but the call succeeded`);
}

console.log('============================================================');
console.log('VERIFY MACRO & SETTLEMENT OPT-IN SERVICES');
console.log('============================================================');

// ---------------------------------------------------------------------------
// Shared scenario for default-path comparison
// ---------------------------------------------------------------------------
const AGENTS = [
    ['scout', { neuroticism: 0.6, resilience: 0.4, openness: 0.7 }, 0],
    ['medic', { neuroticism: 0.8, resilience: 0.3, openness: 0.5 }, 4],
    ['captain', { neuroticism: 0.2, resilience: 0.8, openness: 0.3 }, 12]
];

function runFull(options) {
    const sim = new RuntimeSimulation(options);
    for (const [id, traits, x] of AGENTS) {
        sim.registerAgent(id, traits, { initial_position: { x, y: 0, z: 0 } });
    }
    const outputs = [];
    for (let tick = 0; tick < 30; tick += 1) {
        sim.queueObservation('scout', {
            x: 0, y: 0, z: 0,
            threats: [{ id: 'apex', type: 'PREDATOR', distance: 3.0, intensity: 1.0 }]
        });
        sim.queueObservation('medic', { x: 4, y: 0, z: 0, threats: [] });
        sim.queueObservation('captain', { x: 12, y: 0, z: 0, threats: [] });
        outputs.push(JSON.stringify(sim.tick(0.1)));
    }
    return { sim, outputs, snapshot: JSON.stringify(sim.saveSnapshot()) };
}

// ---------------------------------------------------------------------------
// Section A: the default path is untouched, and the flags are genuinely opt-in.
// ---------------------------------------------------------------------------
const absent = runFull({ seed: 101 });
const explicitOff = runFull({
    seed: 101,
    enableEconomicFeedback: false,
    enableSettlementMigration: false
});

assert(absent.sim.economicFeedback === null,
    'A default RuntimeSimulation constructed the economic feedback service, so it is not opt-in');
assert(absent.sim.enableEconomicFeedback === false,
    'The economic feedback opt-in flag does not default to false');
assert(absent.sim.settlementMigration === null,
    'A default RuntimeSimulation constructed the settlement migration service, so it is not opt-in');
assert(absent.sim.enableSettlementMigration === false,
    'The settlement migration opt-in flag does not default to false');

assert(absent.outputs.join('\n') === explicitOff.outputs.join('\n'),
    'Omitting the flags and passing them as false produced different simulation outputs');
assert(absent.snapshot === explicitOff.snapshot,
    'Omitting the flags and passing them as false produced different persistence snapshots');
console.log('  * flags absent and flags explicitly false are byte-identical over 30 ticks, in both the');
console.log('    advisory outputs and the persistence snapshot: PASS');

assert(!absent.snapshot.includes('economicFeedback'),
    'The persistence snapshot grew an economicFeedback field, altering the snapshot contract');
assert(!absent.snapshot.includes('settlementMigration'),
    'The persistence snapshot grew a settlementMigration field, altering the snapshot contract');
console.log('  * the snapshot contract is unchanged: no macro or settlement fields serialized: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section B: enabling them does not perturb the core simulation.
// ---------------------------------------------------------------------------
const enabled = runFull({
    seed: 101,
    enableEconomicFeedback: true,
    enableSettlementMigration: true
});

assert(enabled.sim.economicFeedback !== null,
    'enableEconomicFeedback:true did not construct the service');
assert(enabled.sim.settlementMigration !== null,
    'enableSettlementMigration:true did not construct the service');
assert(enabled.outputs.join('\n') === absent.outputs.join('\n'),
    'Enabling macro settlement services changed core simulation outputs — they are not advisory');
assert(enabled.snapshot === absent.snapshot,
    'Enabling macro settlement services changed the persistence snapshot, perturbing determinism');
assert(enabled.sim.rng.getState().toString() === absent.sim.rng.getState().toString(),
    'The macro settlement services drew from the simulation RNG');
console.log('  * enabling macro services changes no simulation output, no snapshot field and no RNG draw: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section C: Active Economic Feedback Lifecycle
// ---------------------------------------------------------------------------
const liveSim = new RuntimeSimulation({
    seed: 101,
    enableEconomicFeedback: true,
    enableSettlementMigration: true
});

// 1. Register settlement markets
liveSim.registerSettlementMarket('RIVERBEND', {
    population: 100,
    wealth: 200,
    garrison: 0.8,
    initialStockpiles: {
        [COMMODITY_TYPES.FOOD]: 150,
        [COMMODITY_TYPES.TIMBER]: 80,
        [COMMODITY_TYPES.ORE]: 40
    }
});

liveSim.registerSettlementMarket('MINING_OUTPOST', {
    population: 40,
    wealth: 80,
    garrison: 0.3,
    initialStockpiles: {
        [COMMODITY_TYPES.FOOD]: 20,
        [COMMODITY_TYPES.TIMBER]: 20,
        [COMMODITY_TYPES.ORE]: 120
    }
});

// Verify market summary reads
const riverSummary = liveSim.getMarketSummary('RIVERBEND');
assert(riverSummary && riverSummary.id === 'RIVERBEND', 'getMarketSummary failed to read RIVERBEND');
assert(riverSummary.population === 100, 'RIVERBEND population mismatch');
assert(riverSummary.wealth === 200, 'RIVERBEND wealth mismatch');

// 2. Record trade transaction
const tradeSuccess = liveSim.recordTradeTransaction('RIVERBEND', 'MINING_OUTPOST', COMMODITY_TYPES.FOOD, 25);
assert(tradeSuccess === true, 'recordTradeTransaction failed between RIVERBEND and MINING_OUTPOST');

const miningSummary = liveSim.getMarketSummary('MINING_OUTPOST');
assert(miningSummary.foodStockpile === 45, `Expected 45 food in MINING_OUTPOST after transfer, got ${miningSummary.foodStockpile}`);

// 3. Deliver shipments with throttle table
const shipmentResult = liveSim.deliverShipments([
    { sourceId: 'MINING_OUTPOST', destId: 'RIVERBEND', commodity: COMMODITY_TYPES.ORE, amount: 20, corridorId: 'CORRIDOR_1' },
    { sourceId: 'MINING_OUTPOST', destId: 'RIVERBEND', commodity: COMMODITY_TYPES.ORE, amount: 20, corridorId: 'CORRIDOR_BLOCKADED' }
], {
    CORRIDOR_1: 1.0,
    CORRIDOR_BLOCKADED: 0.25
});
assert(shipmentResult.deliveries.length === 2, 'deliverShipments did not process 2 deliveries');
assert(shipmentResult.deliveries[0].allowed === 1.0, 'CORRIDOR_1 allowed fraction mismatch');
assert(shipmentResult.deliveries[1].allowed === 0.25, 'CORRIDOR_BLOCKADED allowed fraction mismatch');

// 4. Advance ticks and observe economic dynamics
for (let t = 0; t < 10; t++) {
    liveSim.tick(0.1);
}

// 5. Evaluate raid desirability
const riverRaid = liveSim.calculateRaidDesirability('RIVERBEND');
const miningRaid = liveSim.calculateRaidDesirability('MINING_OUTPOST');
assert(Number.isFinite(riverRaid.raidUtility) && Number.isFinite(riverRaid.plunderValue), 'RIVERBEND raid utility non-finite');
assert(Number.isFinite(miningRaid.raidUtility) && Number.isFinite(miningRaid.defenseScore), 'MINING_OUTPOST defense score non-finite');
// Low garrison + high ore makes mining outpost a relatively attractive raid target
assert(miningRaid.defenseScore < riverRaid.defenseScore, 'MINING_OUTPOST defense score should be lower than fortified capital');

// 6. Validate economic health
const econHealth = liveSim.validateEconomicHealth();
assert(econHealth.healthy === true, `Economic health validation detected critical pathologies: ${JSON.stringify(econHealth.pathologies)}`);
console.log('  * economic feedback: markets registered, trade completed, deliveries throttled, raids calculated, health verified: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section D: Active Settlement Migration & Population Conservation
// ---------------------------------------------------------------------------
const initialWorldPop = 180;
liveSim.registerSettlement('VALLEY_SOURCE', {
    population: 100,
    housingCapacity: 120,
    foodStock: 15.0, // Scarcity push (< 30)
    threatLevel: 0.85, // Terror push
    garrisonStrength: 0.3
});

liveSim.registerSettlement('HAVEN_DEST', {
    population: 80,
    housingCapacity: 150,
    foodStock: 120.0, // Food pull
    threatLevel: 0.1,
    garrisonStrength: 0.9 // High safety pull
});

// 1. Evaluate push pressure
const pushPressure = liveSim.evaluatePushPressure('VALLEY_SOURCE');
assert(pushPressure.netPush > 0.30, `Expected push pressure to exceed 0.30, got ${pushPressure.netPush}`);
assert(pushPressure.primaryDriver !== undefined, 'Push pressure primaryDriver missing');

// 2. Evaluate pull attraction
const pullAttraction = liveSim.evaluatePullAttraction('HAVEN_DEST', 0.2);
assert(pullAttraction > 0.15, `Expected pull attraction > 0.15, got ${pullAttraction}`);

// 3. Trigger migration wave
const wave = liveSim.triggerMigrationWave('VALLEY_SOURCE', 'HAVEN_DEST', 0.2);
assert(wave !== null, 'triggerMigrationWave returned null under high push and attractive pull');
assert(wave.headcount > 0, `Migration wave headcount should be positive, got ${wave.headcount}`);

// 4. Audit population conservation while in transit
const inTransitAudit = liveSim.auditPopulationConservation(initialWorldPop);
assert(inTransitAudit.isConserved === true,
    `Population conservation violated during transit: initial ${initialWorldPop}, accounted ${inTransitAudit.accountedTotal}`);
assert(inTransitAudit.inTransitPop === wave.headcount,
    `In-transit population mismatch: expected ${wave.headcount}, got ${inTransitAudit.inTransitPop}`);

// 5. Advance ticks to resolve migration arrival (arrival occurs at departureTick + 5)
for (let t = 0; t < 6; t++) {
    liveSim.tick(0.1);
}

// 6. Post-arrival population and conservation audit
const postArrivalAudit = liveSim.auditPopulationConservation(initialWorldPop);
assert(postArrivalAudit.isConserved === true,
    `Population conservation violated post-arrival: initial ${initialWorldPop}, accounted ${postArrivalAudit.accountedTotal}`);
assert(postArrivalAudit.inTransitPop === 0, 'In-transit parties should be empty post-arrival');

const destState = liveSim.getSettlementMigrationState('HAVEN_DEST');
assert(destState.population > 80, `Destination population should have increased from 80, got ${destState.population}`);
assert(destState.laborBonus > 1.0, `Destination labor bonus should increase from baseline 1.0, got ${destState.laborBonus}`);
console.log('  * settlement migration: push evaluated, pull evaluated, wave dispatched, population conserved: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section E: Refusals on Disabled Runtime
// ---------------------------------------------------------------------------
const disabledSim = new RuntimeSimulation({ seed: 101 });

// Economic refusals
assertThrows(() => disabledSim.registerSettlementMarket('M1'), /ECONOMIC_FEEDBACK_DISABLED/, 'registerSettlementMarket on disabled');
assertThrows(() => disabledSim.recordTradeTransaction('A', 'B', COMMODITY_TYPES.FOOD, 10), /ECONOMIC_FEEDBACK_DISABLED/, 'recordTradeTransaction on disabled');
assertThrows(() => disabledSim.deliverShipments([], {}), /ECONOMIC_FEEDBACK_DISABLED/, 'deliverShipments on disabled');
assertThrows(() => disabledSim.calculateRaidDesirability('M1'), /ECONOMIC_FEEDBACK_DISABLED/, 'calculateRaidDesirability on disabled');
assertThrows(() => disabledSim.validateEconomicHealth(), /ECONOMIC_FEEDBACK_DISABLED/, 'validateEconomicHealth on disabled');
assert(disabledSim.getMarketSummary('M1') === null, 'getMarketSummary on disabled should return null');

// Migration refusals
assertThrows(() => disabledSim.registerSettlement('S1'), /SETTLEMENT_MIGRATION_DISABLED/, 'registerSettlement on disabled');
assertThrows(() => disabledSim.evaluatePushPressure('S1'), /SETTLEMENT_MIGRATION_DISABLED/, 'evaluatePushPressure on disabled');
assertThrows(() => disabledSim.evaluatePullAttraction('S1'), /SETTLEMENT_MIGRATION_DISABLED/, 'evaluatePullAttraction on disabled');
assertThrows(() => disabledSim.triggerMigrationWave('S1', 'S2'), /SETTLEMENT_MIGRATION_DISABLED/, 'triggerMigrationWave on disabled');
assertThrows(() => disabledSim.auditPopulationConservation(100), /SETTLEMENT_MIGRATION_DISABLED/, 'auditPopulationConservation on disabled');
assert(disabledSim.getSettlementMigrationState('S1') === null, 'getSettlementMigrationState on disabled should return null');

// Unknown entity refusals on live sim
assertThrows(() => liveSim.evaluatePushPressure('UNKNOWN_CITY'), /UNKNOWN_SETTLEMENT/, 'evaluatePushPressure on unknown settlement');
assertThrows(() => liveSim.evaluatePullAttraction('UNKNOWN_CITY'), /UNKNOWN_SETTLEMENT/, 'evaluatePullAttraction on unknown settlement');
console.log('  * all macro settlement operations refuse cleanly on disabled runtime or unknown entities: PASS');
console.log('');

// ---------------------------------------------------------------------------
// Section F: Host Authority & Immutability Verification
// ---------------------------------------------------------------------------
const hostEntity = {
    id: 'RIVERBEND',
    transform: { position: [100, 0, 50], rotation: [0, 1, 0, 0] },
    physics: { velocity: [0, 0, 0], mass: 5000 },
    canonicalInventory: { gold: 1000, grainBags: 50 }
};

const immutabilityAudit = liveSim.auditMacroSettlementImmutability(hostEntity);
assert(immutabilityAudit.intact === true, 'Host entity was modified during macro settlement query');
assert(immutabilityAudit.physicsMutations === 0, 'Host physics mutated');
assert(immutabilityAudit.transformMutations === 0, 'Host transform mutated');

// Migration system internal host authority validation
const settlementHostAudit = liveSim.settlementMigration.validateHostAuthorityInvariant({
    id: 'RIVERBEND',
    population: 100,
    housingCapacity: 120,
    foodStock: 150.0,
    threatLevel: 0.1,
    garrisonStrength: 0.8
});
assert(settlementHostAudit === true, 'SettlementMigrationSystem host authority invariant violated');
console.log('  * host game authority: zero physics mutations, zero transform mutations, canonical state untouched: PASS');

console.log('\nScope: this verifier proves JavaScript opt-in wiring, population conservation, and authority boundaries.');
console.log(`SUCCESS: All ${assertions} macro-settlement opt-in assertions passed.\n`);
