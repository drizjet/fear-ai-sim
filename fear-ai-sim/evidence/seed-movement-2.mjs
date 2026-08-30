#!/usr/bin/env node
// evidence/seed-movement-2.mjs
//
// EVID-2026-08-28-CO-ADAPTIVE-TRADE-CAMPAIGN
//
// Seeds evidence receipts for the Movement 2 domains (trade, merchants,
// bandits, patrol, market). Uses the generic buildReceipt() helper
// from evidence/receipt.mjs.
//
// This is the LAST domain-specific seed script. From here on, all
// new evidence is captured via buildReceipt() with a per-claim
// (claimId, testFiles, sourceFiles, commandReceipt) tuple.
//
// Usage:
//   node evidence/seed-movement-2.mjs

import { buildReceipt, runTestReceipt } from './receipt.mjs';

const TEST_COMMAND = '--runInBand tests/two-roads-world.test.js tests/two-roads-metamorphic.test.js tests/two-roads-cat-and-mouse.test.js';
const receipt = runTestReceipt(TEST_COMMAND, { timeoutMs: 60000, label: 'two-roads full' });

const COMMON = {
    testFiles: [
        'tests/two-roads-world.test.js',
        'tests/two-roads-metamorphic.test.js',
        'tests/two-roads-cat-and-mouse.test.js',
    ],
    sourceFiles: [
        'two-roads-world.js',
        'routing.js',
        'trade.js',
        'economy.js',
        'math-utils.js',
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

// Merchants domain
seed('CODE_EXISTS', 'C-merchants-class', 'merchants',
    'The Merchant class (trade.js) has heterogeneous identity fields: riskTolerance, switchingCost, cargoValueSensitivity, routeFamiliarity, informationConfidence, beliefs (perRoute).',
    [
        'Merchant constructor accepts cargo and sets identity fields',
        'The Two Roads world extends each merchant with per-route beliefs and archetype-specific traits',
    ]);

seed('UNIT_VERIFIED', 'C-merchants-identity', 'merchants',
    'Merchant identity (riskTolerance, switchingCost, cargoValueSensitivity, routeFamiliarity) is set per archetype and produces heterogeneous route choices in the Two Roads test suite.',
    [
        'risk_averse and risk_tolerant archetypes have different riskTolerance, switchingCost, cargoValueSensitivity',
        'The Two Roads heterogeneity test asserts that risk_tolerant takes road-a at least as often as risk_averse',
    ]);

// Bandits domain
seed('CODE_EXISTS', 'C-bandit-class', 'bandits',
    'The bandit object has per-route beliefs (believedTraffic, believedCargoValue, lastSuccessTick), a currentRoute, and a relocationCooldown.',
    [
        'createTwoRoadsScenario creates a bandit with beliefs for both routes',
    ]);

// Patrol domain
seed('CODE_EXISTS', 'C-patrol-class', 'patrol',
    'The patrol object has deployedRoute, travelRemaining, detectionRate, interceptionSuccess, and per-tick redeployment logic.',
    [
        'createTwoRoadsScenario creates a patrol with finite detection/interception rates',
        'tickTwoRoads decrements travelRemaining and finalizes pendingDeployment',
    ]);

// Market domain
seed('CODE_EXISTS', 'C-market-class', 'market',
    'The Market class (economy.js) tracks inventory, demand, basePrice, delivered, disrupted, capacity, and spoilageRate per kind.',
    [
        'Market.setDemand / getQuote / deliverCargo / produce / consume / spoil are present',
    ]);

// Trade domain
seed('CODE_EXISTS', 'C-trade-two-roads-world', 'trade',
    'A persistent two-town, two-route benchmark world is implemented (origin, destination, road-a, road-b).',
    [
        'createTwoRoadsScenario returns a world with origin, destination, two routes, and merchants',
        'routes have stable ids (road-a, road-b) and ground-truth actualDanger fields',
    ],
    ['The two-roads world is a benchmark laboratory, not a production replacement.']);

seed('UNIT_VERIFIED', 'C-trade-two-roads-tick', 'trade',
    'The Two Roads reducer advances one tick deterministically, runs N ticks, and exposes a structured history.',
    [
        'tickTwoRoads increments world.tick, updates exposure, history, and events',
        'runTwoRoads returns a world with a history array of the expected length',
        'same seed -> same per-tick state (determinism)',
    ]);

seed('LIVE_PRODUCER', 'C-trade-merchant-decisions', 'merchants',
    'Each tick the reducer emits structured MERCHANT_ROUTE_DECISION events for merchants at origin.',
    [
        'Each MERCHANT_ROUTE_DECISION event has the required fields: eventId, tick, merchantId, from, to, chosenRoute, rejectedAlternatives, beliefConfidence, expectedDeliveryValue, expectedCargoLoss, reason',
        'Different merchants in the same world emit different decisions based on heterogeneous identity',
    ]);

seed('LIVE_CONSUMER', 'C-trade-merchant-route-cost', 'merchants',
    'Merchant identity (risk-tolerance, cargo-value-sensitivity, switching-cost) is consumed by routeCost via the perception object, producing heterogeneous rankings.',
    [
        'risk_tolerant merchant selects road-a more often than risk_averse merchant (Phase 2 §15 test)',
        'higher believed danger -> fewer A choices (metamorphic test)',
        'higher switching cost -> fewer route switches (metamorphic test)',
    ]);

seed('CONSEQUENCE_VERIFIED', 'C-trade-cargo-market', 'trade',
    'Cargo losses in bandit attacks reduce what the destination market receives, and the destination shortage can drive prices up.',
    [
        'A bandit attack emits a CARGO_LOSS event with captured and destroyed amounts',
        'Destination market inventory reflects delivered cargo minus losses',
        'Destination shortage raises destination price (Phase 2 §37 / Movement 2 §37 test)',
    ]);

seed('CROSS_DOMAIN_INTEGRATED', 'C-trade-loop-close', 'trade',
    'The trade-security loop has both an inbound edge (market shortage -> price -> merchant expected profit) and an outbound edge (merchant traffic -> bandit opportunity -> attack -> cargo -> market).',
    [
        'destination price increases with shortage (Movement 2 §37)',
        'cargo loss reaches the market (CARGO_LOSS event)',
        'merchant belief updates from firsthand attack (metamorphic test)',
        'bandit may relocate when expected payoff shifts (bandit belief/relocation test)',
    ]);

// Bandits domain
seed('UNIT_VERIFIED', 'C-bandit-belief-relocate', 'bandits',
    'The bandit has per-route beliefs (believedTraffic, believedCargoValue, lastSuccessTick) and can relocate when expected payoff shifts.',
    [
        'bandit has beliefs for both road-a and road-b',
        'BANDIT_RELOCATION event records from/to and payoff comparison',
    ]);

seed('LIVE_CONSUMER', 'C-bandit-consumes-traffic', 'bandits',
    'The bandit reads merchant exposure to update its believedTraffic and attacks based on that belief.',
    [
        'After merchants travel, bandit.beliefs[r].believedTraffic moves toward observed exposure (recency-weighted)',
        'bandit attacks only on its currentRoute and only on exposed edges',
    ]);

// Patrol domain
seed('UNIT_VERIFIED', 'C-patrol-coverage-displacement', 'patrol',
    'The patrol has finite coverage, can be deployed to one route at a time, and reduces attack success rate on the covered route.',
    [
        'patrol.deployedRoute is single-valued',
        'PATROL_INTERCEPTION event fires when an attack is detected on a covered route',
        'attack success rate on the covered route is at most the rate on the uncovered route (Phase 3 displacement test)',
    ]);

// Market domain
seed('LIVE_PRODUCER', 'C-market-price-shortage', 'market',
    'The destination market price reflects shortage, and price updates are visible to merchant decision-making (as part of expected profit).',
    [
        'destination price = basePrice * (1 + shortage * 2) (economy.getQuote)',
        'merchant.expectedProfitAtDeparture uses destination market price',
    ]);

// Contradiction cap test
buildReceipt({
    ...COMMON,
    claimId: 'C-trade-no-omniscience',
    domain: 'merchants',
    dimension: 'LIVE_CONSUMER',
    claim: 'Merchants do not consume ground-truth danger directly; they consume their own per-route beliefs (no omniscience).',
    assertions: [
        'A merchant with a stale belief about road-a keeps that belief until a firsthand attack or other observation updates it (no-telepathy metamorphic test)',
    ],
    knownContradictions: [],
    limitations: [
        'Belief initialization uses hand-tuned archetypes; future work can wire belief formation to actual observations from a belief propagation system.',
    ],
});

process.stdout.write('seeded 9 evidence receipts for Movement 2\n');
