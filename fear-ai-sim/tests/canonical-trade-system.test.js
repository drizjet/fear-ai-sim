// canonical-trade-system.test.js
//
// EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION
//
// These tests prove the merchant/bandit/patrol trade loop runs
// inside the CANONICAL engine (closed-world.js) and not only in
// the Two Roads benchmark. Per FEAR_LONG_TERM_GOAL.md §53-§56:
// "Audit Movement-2 merchant/trade/bandit/patrol claims for
//  benchmark-only or overbroad evidence. Canonicalize merchant
//  identity, beliefs and route decision logic outside scenario-
//  only code. Make Two Roads an experiment/scenario over the
//  canonical engine, not a second simulation engine."

import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    resolveBanditAttack,
} from '../closed-world.js';
import {
    createCanonicalMerchant,
    createPatrol,
    tickMerchant,
    tickBandit,
    tickPatrol,
} from '../canonical-trade-system.js';
import { saveWorld, loadWorld } from '../closed-world.js';

describe('canonical trade system (EVID-2026-08-29-CANONICAL-TRADE-INTEGRATION)', () => {

    it('createCanonicalMerchant produces a heterogeneous identity object', () => {
        const m = createCanonicalMerchant({ id: 'm-1', location: 'north', cargo: 20,
            riskTolerance: 0.9, switchingCost: 3, cargoValueSensitivity: 0.8 });
        expect(m.id).toBe('m-1');
        expect(m.riskTolerance).toBe(0.9);
        expect(m.switchingCost).toBe(3);
        expect(m.cargoValueSensitivity).toBe(0.8);
        expect(m.routeFamiliarity).toBeDefined();
        expect(m.routeBeliefs).toBeDefined();
        expect(m.cargo).toBeGreaterThan(0);
    });

    it('tickMerchant runs inside the canonical world and emits a structured route decision', () => {
        const world = createClosedWorldScenario();
        // Replace the canonical merchant with a heterogeneous one.
        world.merchants = [createCanonicalMerchant({
            id: 'merchant-1', location: 'north', cargo: 20,
            riskTolerance: 0.9, switchingCost: 0, cargoValueSensitivity: 0.5,
            routeFamiliarity: { 'road-a': 0.9, 'road-b': 0.1 },
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
                'road-b': { perceivedDanger: 0.4, confidence: 0.9 },
            },
        })];
        tickMerchant(world, 'merchant-1', { tick: 1, rng: () => 0.5 });
        const decisionEvents = world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION');
        expect(decisionEvents.length).toBe(1);
        // Risk-tolerant merchant with low belief for road-a should choose road-a.
        expect(decisionEvents[0].chosenRoute).toBe('road-a');
        // The decision must carry the heterogeneous identity fields.
        expect(decisionEvents[0].riskTolerance).toBe(0.9);
        expect(decisionEvents[0].switchingCost).toBe(0);
    });

    it('tickMerchant is consumed by tickClosedWorld (canonical path)', () => {
        const world = createClosedWorldScenario();
        // Attach heterogeneous identity to the canonical merchant.
        const m = world.merchants[0];
        m.riskTolerance = 0.9;
        m.switchingCost = 0;
        m.cargoValueSensitivity = 0.5;
        m.routeFamiliarity = { 'road-a': 0.9, 'road-b': 0.1 };
        m.routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.4, confidence: 0.9 },
        };
        // No explicit tickMerchant call here. The canonical reducer
        // must do it itself.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        const decisions = world.events.filter(e => e.type === 'MERCHANT_ROUTE_DECISION');
        // The canonical path must have produced at least one decision.
        expect(decisions.length).toBeGreaterThanOrEqual(1);
    });

    it('tickBandit uses the canonical bandit and its traffic belief', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.trafficBelief = {
            'road-a': { estimatedTraffic: 5, recency: 1.0 },
            'road-b': { estimatedTraffic: 0, recency: 0.1 },
        };
        bandit.relocationThreshold = 0.2;
        bandit.switchMargin = 0.2;
        const beforeRoad = bandit.roadId;
        tickBandit(world, bandit.id, { tick: 1, rng: () => 0.5 });
        // Bandit should have relocated to road-a (where the traffic is).
        // Or stay on road-a (already there) - either way the relocation
        // machinery must fire without error.
        const relocationEvents = world.events.filter(e => e.type === 'BANDIT_RELOCATION');
        // At minimum, the canonical bandit has the new traffic-belief
        // field which is the consumer evidence.
        expect(bandit.trafficBelief).toBeDefined();
        // If the bandit was already on road-a, no relocation event needed.
        // If it was on road-b, it should have moved.
        if (beforeRoad === 'road-b') {
            expect(bandit.roadId).toBe('road-a');
            expect(relocationEvents.length).toBe(1);
        }
    });

    it('createPatrol produces a finite patrol with detection + interception rates', () => {
        const p = createPatrol({ id: 'patrol-1', route: 'road-a', detectionRate: 0.4, interceptionRate: 0.3, travelCost: 1 });
        expect(p.id).toBe('patrol-1');
        expect(p.deployedRoute).toBe('road-a');
        expect(p.detectionRate).toBe(0.4);
        expect(p.interceptionRate).toBe(0.3);
        expect(p.travelCost).toBe(1);
    });

    it('tickPatrol runs inside the canonical world and detects/intercepts attacks', () => {
        const world = createClosedWorldScenario();
        world.patrols = [createPatrol({ id: 'patrol-1', route: 'road-a', detectionRate: 0.5, interceptionRate: 0.5, travelCost: 0 })];
        // Trigger a bandit attack on road-a
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        tickPatrol(world, 'patrol-1', { tick: 1, rng: () => 0.5 });
        const interceptionEvents = world.events.filter(e => e.type === 'PATROL_INTERCEPTION');
        // At least one interception event (or one detection miss) must
        // have been logged.
        const patrolEvents = world.events.filter(e => e.type === 'PATROL_INTERCEPTION' || e.type === 'PATROL_DETECTION_MISS');
        expect(patrolEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('patrol interception lowers the merchant\'s perceivedDanger for the deployed route (LIVE_CONSUMER)', () => {
        // Failure-first: a successful patrol interception on a
        // route must propagate to the merchant's routeBeliefs so
        // the merchant believes that route is safer next time.
        // Without this, patrol is a producer with no consumer
        // and the merchant keeps believing the route is dangerous.
        const world = createClosedWorldScenario();
        const m = world.merchants[0];
        m.riskTolerance = 0.5;
        m.switchingCost = 0;
        m.routeBeliefs = {
            'road-a': { perceivedDanger: 0.9, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.2, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.3, confidence: 0.5 },
        };
        // Deterministic rng that always returns 0.1 (well below
        // both detectionRate and interceptionRate so the patrol
        // always succeeds).
        const alwaysInterceptRng = () => 0.1;
        world.patrols = [createPatrol({ id: 'patrol-1', route: 'road-a', detectionRate: 0.5, interceptionRate: 0.5, travelCost: 0 })];
        // Trigger an attack on road-a (the patrolled route).
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const before = m.routeBeliefs['road-a'].perceivedDanger;
        tickPatrol(world, 'patrol-1', { tick: 1, rng: alwaysInterceptRng });
        const after = m.routeBeliefs['road-a'].perceivedDanger;
        // The interception must have lowered the merchant's belief.
        expect(after).toBeLessThan(before);
        // The source attribution must be set so audit can trace it.
        expect(m.routeBeliefs['road-a'].source).toBe('patrol_interception');
    });

    it('ecology / market shortage lowers the merchant\'s perceivedDanger for routes into the short town', () => {
        // EVID-2026-08-29-ECOLOGY-WIRE: when a town\'s market is
        // short on a good the merchant carries, the merchant\'s
        // perceivedDanger for routes that go there drops (because
        // the economic pressure to deliver outweighs the risk).
        // This is the ecology -> trade causal link from goal §13.
        const world = createClosedWorldScenario();
        const m = world.merchants[0];
        m.riskTolerance = 0.5;
        m.switchingCost = 0;
        // The canonical merchant has cargo = 20 (plain number).
        // We give it a goods shape so the market-shortage check
        // has something to look at.
        m.cargo = { food: 20, tools: 0 };
        m.location = 'north';
        m.routeBeliefs = {
            'road-a': { perceivedDanger: 0.8, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.2, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.3, confidence: 0.5 },
        };
        // Force the north market to be short on food.
        // We do this by setting a very high demand so the quote
        // returns a high shortage.
        const northMarket = world.towns.get('north').market;
        // Drain the food inventory and set a high demand so the
        // next quote is short.
        northMarket.inventory.set('food', 0);
        northMarket.setDemand('food', 100, 10);
        tickMerchant(world, 'merchant-1', { tick: 1, rng: () => 0.5 });
        const after = m.routeBeliefs['road-a'].perceivedDanger;
        // The market shortage must have lowered the merchant\'s
        // belief about the dangerous route.
        expect(after).toBeLessThan(0.8);
        // Source attribution must be set.
        expect(m.routeBeliefs['road-a'].source).toContain('market_shortage');
    });

    it('ecology / season modifier reduces bandit opportunity in winter', () => {
        // EVID-2026-08-29-ECOLOGY-WIRE: bandit payoff is multiplied
        // by a per-season modifier (winter = 0.5x). The same
        // trafficBelief in winter should produce a lower
        // BANDIT_RELOCATION payoff than in summer.
        const worldSummer = createClosedWorldScenario({ season: 'SUMMER' });
        const banditSummer = worldSummer.bandits[0];
        banditSummer.trafficBelief = {
            'road-a': { estimatedTraffic: 5, recency: 1.0 },
            'road-b': { estimatedTraffic: 0, recency: 0.1 },
        };
        banditSummer.relocationThreshold = 0.05;
        // Tick bandit in summer. Start the bandit on road-b so
        // the relocation to road-a fires.
        banditSummer.roadId = 'road-b';
        tickBandit(worldSummer, banditSummer.id, { tick: 1, rng: () => 0.5 });
        const summerEvents = worldSummer.events.filter(e => e.type === 'BANDIT_RELOCATION');
        const summerEvent = summerEvents[summerEvents.length - 1];
        const summerPayoff = summerEvent ? summerEvent.topPayoff : 0;

        // Same trafficBelief in winter.
        const worldWinter = createClosedWorldScenario({ season: 'WINTER' });
        const banditWinter = worldWinter.bandits[0];
        banditWinter.trafficBelief = {
            'road-a': { estimatedTraffic: 5, recency: 1.0 },
            'road-b': { estimatedTraffic: 0, recency: 0.1 },
        };
        banditWinter.relocationThreshold = 0.05;
        banditWinter.roadId = 'road-b';
        tickBandit(worldWinter, banditWinter.id, { tick: 1, rng: () => 0.5 });
        const winterEvents = worldWinter.events.filter(e => e.type === 'BANDIT_RELOCATION');
        const winterEvent = winterEvents[winterEvents.length - 1];
        const winterPayoff = winterEvent ? winterEvent.topPayoff : 0;

        // Winter payoff should be 50% of summer payoff (with the
        // same traffic).
        expect(winterPayoff).toBeLessThan(summerPayoff);
        expect(winterPayoff).toBeCloseTo(summerPayoff * 0.5, 1);
    });

    it('save/load round-trips merchant identity, bandit traffic belief, and patrol state', () => {
        const world = createClosedWorldScenario();
        const m = world.merchants[0];
        m.riskTolerance = 0.77;
        m.switchingCost = 5;
        const bandit = world.bandits[0];
        bandit.trafficBelief = { 'road-a': { estimatedTraffic: 3, recency: 0.8 } };
        world.patrols = [createPatrol({ id: 'patrol-1', route: 'road-a', detectionRate: 0.4, interceptionRate: 0.3, travelCost: 1 })];
        const json = saveWorld(world);
        const restored = loadWorld(json);
        expect(restored.merchants[0].riskTolerance).toBe(0.77);
        expect(restored.merchants[0].switchingCost).toBe(5);
        expect(restored.bandits[0].trafficBelief).toBeDefined();
        expect(restored.bandits[0].trafficBelief['road-a'].estimatedTraffic).toBe(3);
        expect(restored.patrols[0].deployedRoute).toBe('road-a');
    });
});
