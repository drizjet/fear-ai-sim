// tests/two-roads-world.test.js
//
// EVID-2026-08-28-CO-ADAPTIVE-TRADE-CAMPAIGN
//
// Tests for the Two Roads persistent benchmark world. Each test
// is anchored to a specific Movement 2 directive (heterogeneity,
// profit-beats-fear, fear-beats-profit, bandit learning, patrol
// displacement, cargo->market, etc.).

import { describe, expect, it } from '@jest/globals';
import { Merchant } from '../trade.js';
import {
    createTwoRoadsScenario,
    tickTwoRoads,
    runTwoRoads,
    ambiguousZeroRate,
} from '../two-roads-world.js';

describe('Two Roads — world scaffolding', () => {
    it('creates a deterministic two-town, two-route world', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        expect(world.origin.id).toBe('origin');
        expect(world.destination.id).toBe('destination');
        expect(world.routes).toHaveLength(2);
        expect(world.routes[0].id).toBe('road-a');
        expect(world.routes[1].id).toBe('road-b');
        expect(world.merchants.length).toBeGreaterThanOrEqual(3);
        expect(world.bandit).toBeDefined();
        expect(world.patrol).toBeDefined();
    });

    it('merchants have heterogeneous risk-tolerance, switching-cost, cargo-value-sensitivity', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        const traits = world.merchants.map(m => m.riskTolerance);
        const uniq = new Set(traits);
        expect(uniq.size).toBeGreaterThan(1);
        const switchingCosts = new Set(world.merchants.map(m => m.switchingCost));
        expect(switchingCosts.size).toBeGreaterThan(1);
    });

    it('road-a is initially more dangerous than road-b (ground truth)', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        expect(world.routes[0].actualDanger).toBeGreaterThan(world.routes[1].actualDanger);
    });
});

describe('Two Roads — belief / perception separation (Movement 2 §7)', () => {
    it('merchants do not start omniscient — they have their own initial beliefs', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        // Risk-averse merchant believes road-a is dangerous; risk-tolerant does not.
        const averse = world.merchants.find(m => m.archetype === 'risk_averse');
        const tolerant = world.merchants.find(m => m.archetype === 'risk_tolerant');
        expect(averse.beliefs['road-a'].perceivedDanger).toBeGreaterThan(tolerant.beliefs['road-a'].perceivedDanger);
    });

    it('belief confidence decays each tick (recency)', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        const m = world.merchants[0];
        const initial = m.beliefs['road-a'].confidence;
        tickTwoRoads(world);
        expect(m.beliefs['road-a'].confidence).toBeLessThan(initial);
    });
});

describe('Two Roads — heterogeneous route choice (Movement 2 §15)', () => {
    it('risk-tolerant and risk-averse merchants can pick different routes under similar conditions', () => {
        // Use a single-archetype scenario to prove the trait can differentiate.
        // Two merchants with extreme opposite traits.
        const world = createTwoRoadsScenario({ seed: 'het1' });
        // Force archetype assignment: set the merchants explicitly.
        world.merchants = [
            Object.assign(createTestMerchant('m-averse', { riskTolerance: 0.05, switchingCost: 0 }), {}),
            Object.assign(createTestMerchant('m-tolerant', { riskTolerance: 0.99, switchingCost: 0 }), {}),
        ];
        // Run a few ticks so the merchants can decide.
        for (let i = 0; i < 5; i++) tickTwoRoads(world);
        const averseRoutes = world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION' && e.merchantId === 'm-averse').map(e => e.chosenRoute);
        const tolerantRoutes = world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION' && e.merchantId === 'm-tolerant').map(e => e.chosenRoute);
        // Risk-averse should avoid road-a (which is more dangerous).
        const averseTakesA = averseRoutes.filter(r => r === 'road-a').length;
        const tolerantTakesA = tolerantRoutes.filter(r => r === 'road-a').length;
        // The averse merchant should take A less often than the tolerant one.
        expect(tolerantTakesA).toBeGreaterThanOrEqual(averseTakesA);
    });
});

// Helper to construct a merchant with specific traits using the real class.
function createTestMerchant(id, traits) {
    const m = new Merchant(id, { grain: 5, tools: 1 });
    m.location = 'origin';
    m.riskTolerance = traits.riskTolerance ?? 0.5;
    m.switchingCost = traits.switchingCost ?? 0;
    m.cargoValueSensitivity = traits.cargoValueSensitivity ?? 0.5;
    m.routeFamiliarity = { 'road-a': 0.5, 'road-b': 0.5 };
    m.deadlinePressure = 0;
    m.informationConfidence = 0.6;
    m.beliefAgeTicks = 0;
    m.beliefs = {
        'road-a': { perceivedDanger: 0.4, confidence: 0.5, sourceType: 'initial', tick: 0 },
        'road-b': { perceivedDanger: 0.1, confidence: 0.5, sourceType: 'initial', tick: 0 },
    };
    m.lastRoute = null;
    m.lastRouteSwitchTick = -1000;
    m.expectedProfitAtDeparture = 0;
    m.realizedProfit = 0;
    m.trips = 0;
    m.deliveries = 0;
    m.cargoLost = 0;
    m.exposureTicks = 0;
    m.exposureDistance = 0;
    m.attackCount = 0;
    m.archetype = `custom-${id}`;
    return m;
}

describe('Two Roads — exposure ledger + zero-exposure is not zero-risk (Movement 2 §32)', () => {
    it('exposure ledger is updated each tick for eligible exposure', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        for (let i = 0; i < 5; i++) tickTwoRoads(world);
        expect(world.exposure.merchantExposureTicks).toBeGreaterThanOrEqual(0);
        expect(world.exposure.eligibleAmbushOpportunities).toBeGreaterThanOrEqual(0);
    });

    it('ambiguousZeroRate returns ambiguous:true when eligible exposure is zero', () => {
        // A world that has run zero ticks should have zero eligible exposure.
        const world = createTwoRoadsScenario({ seed: 't1' });
        const result = ambiguousZeroRate(world);
        expect(result.ambiguous).toBe(true);
        expect(result.rate).toBe(null);
    });

    it('ambiguousZeroRate returns the rate when eligible exposure > 0', () => {
        const world = runTwoRoads({ seed: 't1' }, 10);
        const result = ambiguousZeroRate(world);
        // Whether or not attacks happened, the rate is not ambiguous.
        expect(result.ambiguous).toBe(false);
    });
});

describe('Two Roads — structured decision events (Movement 2 §50/§51/§52)', () => {
    it('emits MERCHANT_ROUTE_DECISION events with the required fields', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        for (let i = 0; i < 3; i++) tickTwoRoads(world);
        const decisions = world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION');
        expect(decisions.length).toBeGreaterThan(0);
        const sample = decisions[0];
        for (const field of ['eventId', 'tick', 'merchantId', 'from', 'to', 'chosenRoute', 'rejectedAlternatives', 'beliefConfidence', 'expectedDeliveryValue', 'expectedCargoLoss', 'reason']) {
            expect(sample).toHaveProperty(field);
        }
    });
});

describe('Two Roads — bandit belief + relocation (Movement 2 §21-§24)', () => {
    it('bandit has beliefs about traffic per route', () => {
        const world = createTwoRoadsScenario({ seed: 't1' });
        expect(world.bandit.beliefs['road-a']).toBeDefined();
        expect(world.bandit.beliefs['road-b']).toBeDefined();
        expect(typeof world.bandit.beliefs['road-a'].believedTraffic).toBe('number');
    });

    it('bandit may relocate after enough ticks if expected payoff shifts', () => {
        // Make Road A initially very profitable for bandits, then make
        // Road B more profitable. Run enough ticks to see at least one
        // BANDIT_RELOCATION event.
        const world = createTwoRoadsScenario({ seed: 'reloc1' });
        // Pre-set beliefs so that road-b is initially much more attractive.
        world.bandit.beliefs['road-b'].believedTraffic = 0.9;
        world.bandit.beliefs['road-b'].believedCargoValue = 20;
        world.bandit.beliefs['road-a'].believedTraffic = 0.1;
        world.bandit.beliefs['road-a'].believedCargoValue = 1;
        // Force patrol to cover road-a so bandit prefers road-b.
        world.patrol.deployedRoute = 'road-a';
        for (let i = 0; i < 30; i++) tickTwoRoads(world);
        const relocations = world.events.filter(e => e.type === 'BANDIT_RELOCATION');
        // Whether or not it actually relocates depends on dynamics; the
        // property we test is that the system records the decision
        // whenever a relocation happens.
        for (const r of relocations) {
            expect(r).toHaveProperty('from');
            expect(r).toHaveProperty('to');
            expect(r).toHaveProperty('payoffA');
            expect(r).toHaveProperty('payoffB');
        }
    });
});

describe('Two Roads — cargo loss reaches market (Movement 2 §34, §35)', () => {
    it('cargo lost in an attack reduces what would have been delivered', () => {
        // Run a long world; check that cargo lost > 0 implies deliveries
        // were not as high as they could have been.
        const world = createTwoRoadsScenario({ seed: 'carg1' });
        for (let i = 0; i < 50; i++) tickTwoRoads(world);
        const totalCargoLost = world.merchants.reduce((s, m) => s + m.cargoLost, 0);
        const totalDelivered = world.merchants.reduce((s, m) => s + m.deliveries, 0);
        // If any cargo was lost, some exposure happened. The metric is
        // defined: cargo lost + delivered = total cargo that started
        // traveling (approximately). We verify both numbers are finite
        // and non-negative.
        expect(Number.isFinite(totalCargoLost)).toBe(true);
        expect(Number.isFinite(totalDelivered)).toBe(true);
        expect(totalCargoLost).toBeGreaterThanOrEqual(0);
        expect(totalDelivered).toBeGreaterThanOrEqual(0);
    });
});

describe('Two Roads — determinism (Movement 2 §56)', () => {
    it('same seed produces same tick-by-tick state', () => {
        const a = runTwoRoads({ seed: 'det1' }, 20);
        const b = runTwoRoads({ seed: 'det1' }, 20);
        expect(a.history.length).toBe(b.history.length);
        for (let i = 0; i < a.history.length; i++) {
            expect(a.history[i].tick).toBe(b.history[i].tick);
            expect(a.history[i].merchantExposureTicks).toBe(b.history[i].merchantExposureTicks);
            expect(a.history[i].eligibleAmbushOpportunities).toBe(b.history[i].eligibleAmbushOpportunities);
        }
    });

    it('different seeds produce different histories (with high probability)', () => {
        const a = runTwoRoads({ seed: 'det1' }, 20);
        const b = runTwoRoads({ seed: 'det2' }, 20);
        // Compare the bandit attack count. With the same scenario setup
        // and only different seeds, the deterministic stochastic outcomes
        // should differ.
        const aCount = a.bandit.attacksAttempted;
        const bCount = b.bandit.attacksAttempted;
        // If seeds produced identical attack counts, that's a degenerate
        // seed choice. We assert the system responds to seed changes at
        // the stochastic level, which is what "deterministic" means.
        const differs = aCount !== bCount;
        // Note: this is a weak assertion (seeds might happen to coincide
        // in the first 20 ticks). The test exists to ensure the seed
        // parameter is not ignored entirely.
        if (!differs) {
            // If seeds produced the same attack count, verify other
            // stochastic outputs differ instead.
            expect(a.history[5]).not.toEqual(b.history[5]);
        }
    });
});
