import { describe, expect, test } from '@jest/globals';
import {
    computeReputationDimension,
    getTradeReliability,
    recordReputationObservation,
    recordTradeReliability,
    REPUTATION_DIMENSIONS,
} from '../reputation.js';
import { FactionDecisionModel } from '../factioncore.js';
import {
    advancePendingWorldObligations,
    createClosedWorldScenario,
    loadWorld,
    saveWorld,
    schedulePendingTradeTrip,
} from '../closed-world.js';
import { chooseMerchantRouteDecision, createCanonicalMerchant } from '../canonical-trade-system.js';

function routeWorld(merchant) {
    return {
        merchants: [merchant],
        markets: new Map(),
    };
}

describe('trade reliability reputation dimension', () => {
    test('trade reliability is independent from violence memory and remains bounded', () => {
        const observer = new FactionDecisionModel({ id: 'observer' });
        observer.memoryByActor = { 'bandit-1': 0.8 };

        const record = recordTradeReliability(observer, 'south', {
            shipped: 10,
            delivered: 5,
            stored: 5,
            overflow: 0,
            tick: 4,
            tripId: 'TRIP-1',
        });

        expect(record.score).toBeCloseTo(0.5, 5);
        expect(record.lastOutcome).toBe('PARTIAL');
        expect(record.observations).toBe(1);
        expect(observer.memoryByActor).toEqual({ 'bandit-1': 0.8 });
        expect(getTradeReliability(observer, 'south', { tick: 4, halfLifeTicks: Infinity })).toBeCloseTo(0.5, 5);
        expect(observer.reputationByDimension[REPUTATION_DIMENSIONS.TRADE_RELIABILITY].south.lastMetadata).toMatchObject({
            shipped: 10,
            stored: 5,
            tripId: 'TRIP-1',
        });
    });

    test('dimension aggregation weights trusted observers and ignores unobserved destinations', () => {
        const trusted = {};
        const untrusted = {};
        recordTradeReliability(trusted, 'south', { shipped: 10, stored: 10, tick: 0, observerTrust: 1 });
        recordTradeReliability(untrusted, 'south', { shipped: 10, stored: 0, tick: 0, observerTrust: 0.25 });
        recordReputationObservation(untrusted, 'east', REPUTATION_DIMENSIONS.TRADE_FAIRNESS, { score: 0.1, tick: 0 });

        expect(computeReputationDimension(
            'south',
            REPUTATION_DIMENSIONS.TRADE_RELIABILITY,
            [trusted, untrusted],
            { tick: 0, halfLifeTicks: Infinity },
        )).toBeCloseTo(0.8, 5);
        expect(computeReputationDimension(
            'north',
            REPUTATION_DIMENSIONS.TRADE_RELIABILITY,
            [trusted, untrusted],
            { tick: 0 },
        )).toBeCloseTo(0.5, 5);
    });

    test('a failed destination reputation changes live route choice and WHY, while missing history stays neutral', () => {
        const merchant = createCanonicalMerchant({
            id: 'merchant-reputation',
            location: 'north',
            cargo: 10,
            cargoValueSensitivity: 0,
            routeFamiliarity: { 'road-south': 0.5, 'road-east': 0.5 },
            routeBeliefs: {
                'road-south': { perceivedDanger: 0.1, confidence: 0.9 },
                'road-east': { perceivedDanger: 0.1, confidence: 0.9 },
            },
            tradeReliabilityWeight: 0.8,
        });
        merchant.cargoKind = 'food';
        recordTradeReliability(merchant, 'south', {
            shipped: 10,
            stored: 0,
            delivered: 0,
            tick: 0,
        });

        const routes = [
            { id: 'road-south', from: 'north', to: 'south', distance: 5 },
            { id: 'road-east', from: 'north', to: 'east', distance: 5 },
        ];
        const decision = chooseMerchantRouteDecision(
            merchant,
            routes,
            merchant.routeBeliefs,
            { tick: 1, world: routeWorld(merchant) },
        );

        expect(decision.chosenRoute).toBe('road-east');
        const south = decision.ranked.find(item => item.route.id === 'road-south');
        const east = decision.ranked.find(item => item.route.id === 'road-east');
        expect(south.tradeReliability).toBeLessThan(0.1);
        expect(south.tradeReliabilityPenalty).toBeGreaterThan(0.7);
        expect(south.reliabilityObserved).toBe(true);
        expect(east.tradeReliability).toBeNull();
        expect(east.tradeReliabilityPenalty).toBe(0);
        expect(east.reliabilityObserved).toBe(false);
    });

    test('materialized shipment records a failed reliability observation at terminal delivery', () => {
        const world = createClosedWorldScenario();
        const merchant = world.merchants[0];
        merchant.cargo = 10;
        const destination = world.towns.get('south');
        destination.market.setCapacity('food', 0);
        const trip = schedulePendingTradeTrip(world, {
            merchantId: merchant.id,
            routeId: 'road-b',
            destinationTownId: 'south',
            cargoKind: 'food',
            cargoAmount: 5,
            travelTicks: 1,
            startTick: 0,
        });
        world.deliveredThisTick = new Map();
        advancePendingWorldObligations(world, { tick: 1 });

        const record = merchant.reputationByDimension.tradeReliability.south;
        expect(trip.status).toBe('DELIVERED');
        expect(record.score).toBe(0);
        expect(record.lastOutcome).toBe('FAILED');
        expect(record.failures).toBe(1);
        expect(record.lastMetadata).toMatchObject({ shipped: 5, stored: 0, overflow: 5 });
        const event = world.events.find(item => item.type === 'PENDING_CARGO_DELIVERED');
        expect(event.reputation).toMatchObject({
            dimension: 'tradeReliability',
            destinationTownId: 'south',
            score: 0,
            outcome: 'FAILED',
        });
    });

    test('trade reliability survives save/load and produces deterministic decisions', () => {
        const original = createCanonicalMerchant({
            id: 'merchant-persist',
            location: 'north',
            cargo: 10,
            routeFamiliarity: { 'road-south': 0.5, 'road-east': 0.5 },
            routeBeliefs: {
                'road-south': { perceivedDanger: 0.1, confidence: 0.9 },
                'road-east': { perceivedDanger: 0.1, confidence: 0.9 },
            },
        });
        original.cargoKind = 'food';
        recordTradeReliability(original, 'south', { shipped: 10, stored: 2, tick: 3, tripId: 'TRIP-PERSIST' });
        const world = routeWorld(original);
        const restoredWorld = loadWorld(saveWorld(world));
        const restored = restoredWorld.merchants[0];

        expect(restored.reputationByDimension.tradeReliability.south).toEqual(
            original.reputationByDimension.tradeReliability.south,
        );
        const first = chooseMerchantRouteDecision(original, [
            { id: 'road-south', from: 'north', to: 'south', distance: 5 },
            { id: 'road-east', from: 'north', to: 'east', distance: 5 },
        ], original.routeBeliefs, { tick: 4, world });
        const second = chooseMerchantRouteDecision(restored, [
            { id: 'road-south', from: 'north', to: 'south', distance: 5 },
            { id: 'road-east', from: 'north', to: 'east', distance: 5 },
        ], restored.routeBeliefs, { tick: 4, world: restoredWorld });
        expect(second.chosenRoute).toBe(first.chosenRoute);
        expect(second.ranked.map(item => ({
            routeId: item.route.id,
            score: item.score,
            reliability: item.tradeReliability,
            penalty: item.tradeReliabilityPenalty,
        }))).toEqual(first.ranked.map(item => ({
            routeId: item.route.id,
            score: item.score,
            reliability: item.tradeReliability,
            penalty: item.tradeReliabilityPenalty,
        })));
    });
});
