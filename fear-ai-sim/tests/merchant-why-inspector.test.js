import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';
import { createCanonicalMerchant, chooseMerchantRouteDecision, tickMerchant } from '../canonical-trade-system.js';
import { Market } from '../economy.js';

// Slice F — WHY inspector for merchant route B vs A
// Proves MERCHANT_ROUTE_DECISION carries observations, belief snapshot,
// ranked candidates with score breakdown, threshold, and rng draws,
// and that toggling one belief flips the choice and the WHY record names it.

describe('Slice F — merchant WHY inspector (route B vs A)', () => {
    it('toggling one belief flips the choice and WHY records the flipped belief', () => {
        const merchant = createCanonicalMerchant({
            id: 'test-merchant',
            location: 'north',
            cargo: 10,
            riskTolerance: 0.3,
            switchingCost: 0,
            routeFamiliarity: { 'road-a': 0.5, 'road-b': 0.5 },
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.8, confidence: 0.9 },
                'road-b': { perceivedDanger: 0.1, confidence: 0.9 },
            },
        });
        merchant.cargoKind = 'food';
        const routes = [
            { id: 'road-a', from: 'north', to: 'south', distance: 5 },
            { id: 'road-b', from: 'north', to: 'east', distance: 5 },
        ];
        const southMarket = new Market('south');
        southMarket.setCapacity('food', 100);
        southMarket.setDemand('food', 10, 1);
        southMarket.inventory.set('food', 50);
        const eastMarket = new Market('east');
        eastMarket.setCapacity('food', 100);
        eastMarket.setDemand('food', 10, 1);
        eastMarket.inventory.set('food', 50);
        const world = { markets: new Map([['south', southMarket], ['east', eastMarket]]) };

        // Initially road-b is safer, should win
        const d1 = chooseMerchantRouteDecision(merchant, routes, merchant.routeBeliefs, { tick: 1, world });
        expect(d1.chosenRoute).toBe('road-b');
        // Flip belief: make road-b dangerous, road-a safe
        merchant.routeBeliefs['road-a'].perceivedDanger = 0.1;
        merchant.routeBeliefs['road-b'].perceivedDanger = 0.8;
        const d2 = chooseMerchantRouteDecision(merchant, routes, merchant.routeBeliefs, { tick: 2, world });
        expect(d2.chosenRoute).toBe('road-a');
        // WHY must show ranked with score breakdown naming the belief
        expect(d2.ranked[0].route.id).toBe('road-a');
        expect(d2.ranked[0].belief.perceivedDanger).toBeCloseTo(0.1);
        expect(d2.ranked[1].belief.perceivedDanger).toBeCloseTo(0.8);
        expect(d2.ranked[0].dangerPenalty).toBeLessThan(d2.ranked[1].dangerPenalty);
    });

    it('WHY contains ranked with score breakdown, observations, belief snapshot, threshold, rngDraws', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        const merchant = world.merchants[0];
        merchant.routeBeliefs = {
            'road-a': { perceivedDanger: 0.2, confidence: 0.8 },
            'road-b': { perceivedDanger: 0.6, confidence: 0.7 },
            'road-c': { perceivedDanger: 0.3, confidence: 0.6 },
        };
        merchant.perceptionAccuracy = 1;
        merchant.riskTolerance = 0.5;
        merchant.switchingCost = 2;
        merchant.lastRoute = 'road-b';
        merchant.lastRouteSwitchTick = 5;
        // R1: draws exist only via the legal channel now — stage a
        // BANDIT_ATTACK on the merchant's road so the observation (and
        // its rng draws) fires for the right reason.
        merchant.selectedRoute = 'road-a';
        world.bandits[0].roadId = 'road-a';
        appendWorldEvent(world, { type: 'BANDIT_ATTACK', roadId: 'road-a', tick: 10, banditId: 'bandit-1', merchantId: merchant.id });
        const result = tickMerchant(world, merchant.id, { tick: 10, parentEventIds: [] });
        expect(result.ok).toBe(true);
        const ev = result.event;
        expect(ev.why).toBeDefined();
        expect(ev.why.observations).toBeDefined();
        expect(ev.why.beliefSnapshot).toBeDefined();
        expect(ev.why.beliefSnapshotBefore).toBeDefined();
        expect(ev.why.rngDraws).toBeDefined();
        expect(ev.why.rngDraws.length).toBeGreaterThan(0);
        expect(ev.why.ranked.length).toBeGreaterThanOrEqual(2);
        for (const r of ev.why.ranked) {
            expect(r.routeId).toBeDefined();
            expect(Number.isFinite(r.score)).toBe(true);
            expect(Number.isFinite(r.distanceCost)).toBe(true);
            expect(Number.isFinite(r.dangerPenalty)).toBe(true);
            expect(Number.isFinite(r.perceivedDanger)).toBe(true);
        }
        expect(ev.why.threshold).toBeDefined();
        expect(ev.why.threshold.switchingCost).toBe(2);
        expect(Number.isFinite(ev.why.threshold.ticksSinceSwitch)).toBe(true);
        expect(typeof ev.why.threshold.inertiaApplied).toBe('boolean');
        expect(ev.why.chosenRoute).toBe(ev.chosenRoute);
    });

    it('inertia threshold is captured and influences choice', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        const merchant = world.merchants[0];
        merchant.routeBeliefs = {
            'road-a': { perceivedDanger: 0.1, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.9, confidence: 0.9 },
            'road-c': { perceivedDanger: 0.9, confidence: 0.9 },
        };
        merchant.riskTolerance = 0.2;
        merchant.switchingCost = 10;
        merchant.lastRoute = 'road-b';
        merchant.lastRouteSwitchTick = 9; // 1 tick ago, within cooldown
        world.bandits = [];
        const result = tickMerchant(world, merchant.id, { tick: 10, parentEventIds: [] });
        expect(result.ok).toBe(true);
        // Despite road-a being best raw score, inertia should keep road-b
        // Check WHY records inertiaApplied
        expect(result.event.why.threshold.inertiaApplied).toBe(true);
        expect(result.event.chosenRoute).toBe('road-b');
        // Without inertia (switchingCost 0), road-a would win
        merchant.switchingCost = 0;
        const world2 = createClosedWorldScenario();
        world2.ticksPerSeason = 10000;
        const m2 = world2.merchants[0];
        m2.routeBeliefs = {
            'road-a': { perceivedDanger: 0.1, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.9, confidence: 0.9 },
            'road-c': { perceivedDanger: 0.9, confidence: 0.9 },
        };
        m2.riskTolerance = 0.2;
        m2.switchingCost = 0;
        m2.lastRoute = 'road-b';
        m2.lastRouteSwitchTick = 9;
        world2.bandits = [];
        const r2 = tickMerchant(world2, m2.id, { tick: 10, parentEventIds: [] });
        expect(r2.event.chosenRoute).toBe('road-a');
        expect(r2.event.why.threshold.inertiaApplied).toBe(false);
    });

    it('closed-world tickMerchant via tickClosedWorld populates WHY on the ledger', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.2, confidence: 0.8 },
            'road-b': { perceivedDanger: 0.5, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.3, confidence: 0.5 },
        };
        world.merchants[0].cargoKind = 'food';
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.3 });
        const ev = world.events.find(e => e.type === 'MERCHANT_ROUTE_DECISION');
        expect(ev).toBeDefined();
        expect(ev.why).toBeDefined();
        expect(ev.why.ranked).toBeDefined();
        expect(ev.why.ranked.length).toBeGreaterThan(0);
        expect(ev.why.beliefSnapshot).toBeDefined();
    });
});
