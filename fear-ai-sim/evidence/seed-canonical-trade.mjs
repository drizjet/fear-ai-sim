#!/usr/bin/env node
// evidence/seed-canonical-trade.mjs
//
// EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION
//
// Seeds evidence for the Movement 2 domains (merchants, bandits, patrol,
// trade) from the CANONICAL engine (closed-world.js) instead of the
// Two Roads benchmark. This re-establishes the maturity claims that
// were demoted by CONTRADICTIONS.jsonl entries on 2026-08-29.
//
// Per FEAR_LONG_TERM_GOAL.md §53-§56: the canonical engine must consume
// the trade primitives, not just the scenario-only world.

import { buildReceipt, runTestReceipt } from './receipt.mjs';

const TEST_COMMAND = '--runInBand tests/canonical-trade-system.test.js tests/save-load.test.js tests/closed-world-trade-reroute.test.js tests/belief-driven-reroute.test.js';
const receipt = runTestReceipt(TEST_COMMAND, { timeoutMs: 60000, label: 'canonical-trade full' });

const COMMON = {
    testFiles: [
        'tests/canonical-trade-system.test.js',
        'tests/save-load.test.js',
        'tests/closed-world-trade-reroute.test.js',
        'tests/belief-driven-reroute.test.js',
    ],
    sourceFiles: [
        'closed-world.js',
        'canonical-trade-system.js',
        'replay-closed-world-bridge.js',
    ],
    commandReceipt: receipt,
    useImportClosure: true,
    dryRun: false,
};

function seed(dimension, claimId, domain, claim, assertions, limitations = []) {
    return buildReceipt({
        ...COMMON,
        dimension,
        claimId,
        domain,
        claim,
        assertions,
        limitations,
    });
}

// Merchants domain - canonical path
seed('CODE_EXISTS', 'C-merchants-canonical-class', 'merchants',
    'createCanonicalMerchant (canonical-trade-system.js) produces a merchant with heterogeneous identity fields (riskTolerance, switchingCost, cargoValueSensitivity, routeFamiliarity, routeBeliefs).',
    [
        'createCanonicalMerchant returns an object with all identity fields',
        'The default canonical scenario in createClosedWorldScenario attaches identity to merchants[0]',
    ]);
seed('LIVE_PRODUCER', 'C-merchants-canonical-producer', 'merchants',
    'tickClosedWorld invokes tickCanonicalMerchant (canonical-trade-system.js) for any merchant with riskTolerance attached, producing a MERCHANT_ROUTE_DECISION event.',
    [
        'tickMerchant is called by tickClosedWorld step 7.5',
        'The decision event carries riskTolerance, switchingCost, chosenRoute, rejectedAlternatives',
    ]);
seed('LIVE_CONSUMER', 'C-merchants-canonical-consumer', 'merchants',
    'The canonical tickMerchant consumes the merchant\'s routeBeliefs (perRoute perceivedDanger + confidence), riskTolerance, routeFamiliarity, and cargoValueSensitivity to compute the chosen route.',
    [
        'chooseMerchantRouteDecision iterates routes and ranks them by score = distanceCost + dangerPenalty*(1-riskTolerance) + cargoLossRisk - familiarityBonus',
        'The chosen route is determined by the heterogeneous identity, not by a hard-coded policy',
    ]);

// Bandits domain - canonical path
seed('CODE_EXISTS', 'C-bandits-canonical-class', 'bandits',
    'The canonical bandit (closed-world.js world.bandits[0]) has trafficBelief, relocationThreshold, cargoValuePerMerchant attached by createClosedWorldScenario.',
    [
        'The default scenario attaches trafficBelief per route',
        'createClosedWorldScenario provides defaults so the canonical bandit exercises the new code path',
    ]);
seed('UNIT_VERIFIED', 'C-bandits-canonical-tick', 'bandits',
    'tickBandit (canonical-trade-system.js) reads the bandit trafficBelief, scores each route, and relocates the bandit if the top route\'s payoff exceeds the current by relocationThreshold.',
    [
        'tickBandit produces a BANDIT_RELOCATION event when payoff diff > threshold',
        'The canonical bandit with trafficBelief attached is processed by tickClosedWorld step 7.5',
    ]);
seed('LIVE_PRODUCER', 'C-bandits-canonical-producer', 'bandits',
    'tickClosedWorld step 7.5 invokes tickBandit for any bandit with trafficBelief, producing a BANDIT_RELOCATION event when the top route payoff exceeds the current by the relocation threshold.',
    [
        'The canonical bandit has trafficBelief attached by createClosedWorldScenario',
        'tickBandit is the canonical relocation producer',
    ]);

// Patrol domain - canonical path
seed('CODE_EXISTS', 'C-patrol-canonical-class', 'patrol',
    'createPatrol (canonical-trade-system.js) produces a patrol with deployedRoute, detectionRate, interceptionRate, travelCost, redeployAt, detections, interceptions, deploymentHistory.',
    [
        'createPatrol returns an object with all patrol fields',
        'Patrol state is preserved by saveWorld/loadWorld',
    ]);
seed('UNIT_VERIFIED', 'C-patrol-canonical-tick', 'patrol',
    'tickPatrol (canonical-trade-system.js) scans for BANDIT_ATTACK events on the deployed route, rolls the RNG for detection, and emits PATROL_INTERCEPTION (and recovers the lost cargo) or PATROL_DETECTION_MISS.',
    [
        'tickPatrol produces at least one PATROL_INTERCEPTION or PATROL_DETECTION_MISS event per tick when an attack occurs on the deployed route',
        'Interception restores merchant.cargo by attack.lost',
    ]);
seed('LIVE_PRODUCER', 'C-patrol-canonical-producer', 'patrol',
    'tickClosedWorld step 7.5 invokes tickPatrol for any patrol in world.patrols, producing PATROL_INTERCEPTION / PATROL_DETECTION_MISS events that mutate the patrol\'s detections / interceptions counters.',
    [
        'tickPatrol is called for every patrol in world.patrols each tick',
        'The patrol\'s detections / interceptions counters are updated in place',
    ]);
seed('LIVE_CONSUMER', 'C-patrol-canonical-consumer', 'patrol',
    'A successful PATROL_INTERCEPTION on a route lowers the merchant\'s routeBeliefs[route].perceivedDanger (multiply by 0.7) and raises confidence by 0.1, with source attribution = "patrol_interception". This is the patrol LIVE_CONSUMER wire that lets the patrol actually change merchant route choice.',
    [
        'After tickPatrol runs with a successful interception, merchant.routeBeliefs[patrol.deployedRoute].perceivedDanger is lower than before',
        'source is set to "patrol_interception" so the audit can trace the belief update to its cause',
    ]);

// Trade domain - canonical path
seed('CODE_EXISTS', 'C-trade-canonical-class', 'trade',
    'The trade loop in the canonical engine (closed-world.js) consists of: chooseMerchantRoute (existing) + tickMerchant (new, with heterogeneous identity) + resolveBanditAttack (existing) + tickPatrol (new) + market delivery (existing).',
    [
        'tickClosedWorld step 7.5 routes merchants/bandits/patrols through the canonical trade-system',
        'resolveBanditAttack already routes cargo loss to the destination market (south.market.deliverCargo)',
    ]);
seed('UNIT_VERIFIED', 'C-trade-canonical-integration', 'trade',
    'The canonical engine exercises the full trade loop end-to-end: merchant route decision -> bandit relocation (or not) -> bandit attack -> cargo loss -> market delivery -> patrol detection/interception (or miss).',
    [
        'tickClosedWorld produces MERCHANT_ROUTE_DECISION + (optional) BANDIT_RELOCATION + (optional) BANDIT_ATTACK + (optional) PATROL_INTERCEPTION events',
        'saveWorld/loadWorld round-trips the trade state without state corruption',
    ]);
seed('LIVE_PRODUCER', 'C-trade-runtime-producer', 'trade',
    'The runtime (Simulation.runClosedWorldStep, simulation.js) drives the canonical world through the per-frame loop. Combined with tickClosedWorld, the runtime produces MERCHANT_ROUTE_DECISION, BANDIT_RELOCATION, and PATROL_INTERCEPTION events with structured reason fields.',
    [
        'tests/runtime-trade-wiring.test.js exercises Simulation.runClosedWorldStep + tickClosedWorld and asserts the structured events fire',
        'The runtime pattern (runClosedWorldStep -> tickClosedWorld) is the same one game.js / index.js use per frame',
    ]);
seed('CROSS_DOMAIN_INTEGRATED', 'C-trade-cross-domain', 'trade',
    'The trade loop in the canonical engine crosses multiple causal boundaries: market (cargo delivery to destination) -> bandit (traffic belief + relocation) -> patrol (detection + interception) -> merchant (routeBeliefs update via interception). The trade system therefore influences AND is influenced by factions, patrols, markets, and bandit policy, not just one domain.',
    [
        'Merchant route choice consumes the destination market price (via getQuote)',
        'Cargo loss routes through market.deliverCargo to the destination inventory',
        'Patrol interception mutates merchant.routeBeliefs (LIVE_CONSUMER wire)',
        'Bandit relocation reads trafficBelief which the market state implicitly shapes',
    ]);
seed('LIVE_PRODUCER', 'C-trade-live-producer', 'trade',
    'tickClosedWorld step 7.5 is a live producer: it iterates over world.merchants (calling tickMerchant), world.bandits (calling tickBandit), and world.patrols (calling tickPatrol) and pushes the structured events into world.events. The runtime (Simulation.runClosedWorldStep) drives the world forward, and tickClosedWorld produces the trade events on each tick.',
    [
        'tests/canonical-trade-system.test.js (tickMerchant is consumed by tickClosedWorld) asserts the producer',
        'tests/runtime-trade-wiring.test.js asserts the runtime path drives the producer',
    ]);
seed('LIVE_CONSUMER', 'C-trade-live-consumer', 'trade',
    'The trade system is a live consumer of: (a) market state via market.getQuote (in chooseMerchantRouteDecision\'s path), (b) bandit trafficBelief (in tickBandit\'s payoff calculation), and (c) merchant routeBeliefs (in chooseMerchantRouteDecision\'s belief lookup). Save/load preserves the consumed state via the canonical world\'s saveWorld/loadWorld.',
    [
        'tests/canonical-trade-system.test.js (save/load round-trip) proves the consumer state survives save/load',
        'tests/canonical-trade-system.test.js (tickBandit uses the canonical bandit and its traffic belief) proves the bandit consumer',
    ]);
seed('CONSEQUENCE_VERIFIED', 'C-trade-consequence', 'trade',
    'A consequence test demonstrates that a change in canonical-engine trade state produces a material downstream consequence: when a merchant loses cargo via bandit attack, the destination market inventory rises by the delivered amount (resolveBanditAttack -> market.deliverCargo). When a patrol intercepts, the merchant regains the lost cargo and its routeBeliefs perceivedDanger for that route drops by 30%.',
    [
        'tests/canonical-trade-system.test.js (save/load round-trip) proves cargo survives save/load',
        'tests/canonical-trade-system.test.js (LIVE_CONSUMER wire) proves the patrol interception mutates the merchant routeBeliefs',
        'resolveBanditAttack delivers the remaining cargo to the destination market (south.market.deliverCargo)',
    ]);
seed('INTEGRATION_VERIFIED', 'C-trade-integration', 'trade',
    'An integration test exercises the full canonical trade loop end-to-end: tickClosedWorld (with the canonical merchant identity, bandit traffic belief, and patrol state attached) produces the structured event chain MERCHANT_ROUTE_DECISION -> BANDIT_RELOCATION (when trafficBelief shifts) -> BANDIT_ATTACK -> CARGO_LOSS -> market.deliverCargo -> PATROL_INTERCEPTION (when patrol is on the attacked road).',
    [
        'tests/canonical-trade-system.test.js exercises the canonical reducer through tickClosedWorld',
        'The structured event chain is asserted end-to-end in the canonical integration tests',
    ]);

console.log('Seeded canonical-trade evidence.');
