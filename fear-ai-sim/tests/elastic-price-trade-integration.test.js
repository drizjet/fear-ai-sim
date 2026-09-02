import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario } from '../closed-world.js';
import { createCanonicalMerchant, chooseMerchantRouteDecision } from '../canonical-trade-system.js';
import { Market } from '../economy.js';

describe('Slice O — elastic price drives merchant opportunity (sustained > spike)', () => {
    it('sustained high shortage at destination raises opportunityBonus vs brief spike', () => {
        // Two worlds: sustained high price (EMA high) vs brief spike (EMA low)
        // We prime elastic memory via getElasticQuote calls before decision
        const makeWorld = (inventory, primeTicks) => {
            const world = createClosedWorldScenario({ season: 'SPRING' });
            world.ticksPerSeason = 10000;
            world.routes = [{ id: 'road-a', from: 'north', to: 'south', distance: 5 }];
            const south = world.towns.get('south');
            south.market.setCapacity('food', 200);
            south.market.setDemand('food', 50, 1);
            south.market.inventory.set('food', inventory);
            // prime elastic memory
            for (let i = 0; i < primeTicks; i++) south.market.getElasticQuote('food');
            world.towns.set('east', {
                id: 'east', market: (() => {
                    const m = new Market('east'); m.setCapacity('food', 200); m.setDemand('food', 50, 1); m.inventory.set('food', 50); return m;
                })(),
                population: 10, consumes: { food: 1 }, produces: { food: 1 }, controlledBy: 'east-faction', homeRadius: 1, claimedRadius: 3, contestedRadius: 0, scarceResources: { food: true }
            });
            world.routes.push({ id: 'road-east', from: 'north', to: 'east', distance: 5, actualDanger: 0.1 });
            return world;
        };
        const sustainedWorld = makeWorld(10, 5); // shortage 0.8 for 5 ticks
        sustainedWorld.towns.get('south').market.inventory.set('food', 10);
        // one more to get sustained price
        sustainedWorld.towns.get('south').market.getElasticQuote('food');

        const briefWorld = makeWorld(50, 5); // low shortage
        briefWorld.towns.get('south').market.inventory.set('food', 10); // spike one tick
        // no priming high, so EMA low

        const routes = [
            { id: 'road-a', from: 'north', to: 'south', distance: 5 },
            { id: 'road-east', from: 'north', to: 'east', distance: 5 },
        ];
        const merchantTemplate = () => createCanonicalMerchant({
            id: 'm', location: 'north', cargo: 10, riskTolerance: 0.5, switchingCost: 0,
            routeFamiliarity: { 'road-a': 0.5, 'road-east': 0.5 },
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.2, confidence: 0.9 },
                'road-east': { perceivedDanger: 0.2, confidence: 0.9 },
            },
        });
        const m1 = merchantTemplate(); m1.cargoKind = 'food';
        const m2 = merchantTemplate(); m2.cargoKind = 'food';

        const dSustained = chooseMerchantRouteDecision(m1, routes, m1.routeBeliefs, { tick: 1, world: sustainedWorld });
        const dBrief = chooseMerchantRouteDecision(m2, routes, m2.routeBeliefs, { tick: 1, world: briefWorld });

        const bonusSustained = dSustained.ranked.find(r => r.route.id === 'road-a')?.opportunityBonus ?? 0;
        const bonusBrief = dBrief.ranked.find(r => r.route.id === 'road-a')?.opportunityBonus ?? 0;
        expect(bonusSustained).toBeGreaterThan(bonusBrief);
        expect(bonusSustained - bonusBrief).toBeGreaterThan(0.03);
    });

    it('getQuote still instant — elastic does not leak into getQuote', () => {
        const m = new Market('test');
        m.setCapacity('food', 100);
        m.setDemand('food', 50, 1);
        m.inventory.set('food', 30);
        expect(m.getQuote('food').price).toBeCloseTo(1.8, 5);
        // prime elastic to high
        m.inventory.set('food', 5);
        for (let i = 0; i < 5; i++) m.getElasticQuote('food');
        // getQuote should reflect current shortage, not EMA-inflated
        m.inventory.set('food', 30);
        expect(m.getQuote('food').price).toBeCloseTo(1.8, 5);
    });
});
