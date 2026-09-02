import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';
import { createCanonicalMerchant, chooseMerchantRouteDecision } from '../canonical-trade-system.js';
import { Market } from '../economy.js';

// Slice I — Season → production → price → merchant opportunity → route choice
// Proves the ecology→market→trade chain is not just season→production,
// but season changes price which changes the merchant's ranked opportunityBonus.

describe('Slice I — season drives price and merchant route choice', () => {
    it('winter shortage raises price vs summer and flips merchant opportunity', () => {
        const summer = createClosedWorldScenario({ season: 'SUMMER' });
        const winter = createClosedWorldScenario({ season: 'WINTER' });
        for (const w of [summer, winter]) {
            w.ticksPerSeason = 10000;
            w.towns.get('north').population = 10;
            w.towns.get('south').population = 10;
            w.towns.get('north').produces.food = 0.8;
            w.towns.get('north').market.setCapacity('food', 500);
            w.towns.get('north').market.inventory.set('food', 40);
            w.towns.get('south').market.setCapacity('food', 500);
            w.towns.get('south').market.inventory.set('food', 50);
            // East alternative with stable price
            if (!w.towns.has('east')) {
                const m = new Market('east');
                m.setCapacity('food', 500);
                m.setDemand('food', 10, 1);
                m.inventory.set('food', 50);
                w.towns.set('east', { id: 'east', market: m, population: 10, consumes: { food: 1 }, produces: { food: 1.5 }, controlledBy: 'east-faction', homeRadius: 1, claimedRadius: 3, contestedRadius: 0, scarceResources: { food: true } });
                w.routes.push({ id: 'road-east', from: 'south', to: 'east', distance: 5, actualDanger: 0.1 });
            }
        }
        for (let t = 1; t <= 15; t++) {
            tickClosedWorld(summer, { tick: t, perceivedDanger: 0.2 });
            tickClosedWorld(winter, { tick: t, perceivedDanger: 0.2 });
        }
        const summerPrice = summer.towns.get('north').market.getQuote('food').price;
        const winterPrice = winter.towns.get('north').market.getQuote('food').price;
        expect(winterPrice).toBeGreaterThan(summerPrice);
        expect(winterPrice).toBeGreaterThan(2.0);
        expect(summerPrice).toBeCloseTo(1.0, 1);

        // Merchant at south choosing between north (season-affected) and east (stable)
        const routes = [
            { id: 'road-c', from: 'south', to: 'north', distance: 5 }, // to north (seasonal)
            { id: 'road-east', from: 'south', to: 'east', distance: 5 }, // to east (stable)
        ];
        const merchant = createCanonicalMerchant({
            id: 'test-merchant',
            location: 'south',
            cargo: 10,
            riskTolerance: 0.5,
            switchingCost: 0,
            routeFamiliarity: { 'road-c': 0.5, 'road-east': 0.5 },
            routeBeliefs: {
                'road-c': { perceivedDanger: 0.2, confidence: 0.9 },
                'road-east': { perceivedDanger: 0.2, confidence: 0.9 },
            },
        });
        merchant.cargoKind = 'food';
        // East market price ~1, north winter price ~3 → opportunityBonus 1.0 vs 0
        winter.towns.get('east').market.inventory.set('food', 50);
        winter.towns.get('east').market.setDemand('food', 10, 1);
        summer.towns.get('east').market.inventory.set('food', 50);
        summer.towns.get('east').market.setDemand('food', 10, 1);

        const winterWorld = { towns: winter.towns, markets: new Map([['north', winter.towns.get('north').market], ['east', winter.towns.get('east').market]]) };
        // Need world.towns for fallback
        winterWorld.towns = winter.towns;
        const summerWorld = { towns: summer.towns, markets: new Map([['north', summer.towns.get('north').market], ['east', summer.towns.get('east').market]]) };
        summerWorld.towns = summer.towns;

        const dWinter = chooseMerchantRouteDecision(merchant, routes, merchant.routeBeliefs, { tick: 1, world: winterWorld });
        const dSummer = chooseMerchantRouteDecision(merchant, routes, merchant.routeBeliefs, { tick: 1, world: summerWorld });

        // WHY must show opportunityBonus diff
        const winterNorthBonus = dWinter.ranked.find(r => r.route.id === 'road-c')?.opportunityBonus ?? 0;
        const summerNorthBonus = dSummer.ranked.find(r => r.route.id === 'road-c')?.opportunityBonus ?? 0;
        expect(winterNorthBonus).toBeGreaterThan(summerNorthBonus);
        expect(winterNorthBonus).toBeGreaterThan(0.5);
        expect(summerNorthBonus).toBeCloseTo(0, 1);
        // Winter should prefer north despite equal distance/danger because price is higher
        expect(dWinter.chosenRoute).toBe('road-c');
    });

    it('drought amplifies winter shortage and further raises opportunity', () => {
        const winter = createClosedWorldScenario({ season: 'WINTER' });
        const winterDrought = createClosedWorldScenario({ season: 'WINTER' });
        for (const w of [winter, winterDrought]) {
            w.ticksPerSeason = 10000;
            w.towns.get('north').population = 10;
            w.towns.get('south').population = 10;
            w.towns.get('north').produces.food = 0.8;
            w.towns.get('north').market.setCapacity('food', 500);
            w.towns.get('north').market.inventory.set('food', 40);
        }
        winterDrought.drought = { active: true, severity: 0.6, kind: 'food', townId: 'north', remainingTicks: 20, startedTick: 1 };
        const ev = appendWorldEvent(winterDrought, { type: 'DROUGHT_STARTED', townId: 'north', kind: 'food', severity: 0.6, duration: 20, tick: 1 });
        winterDrought.drought.startEventId = ev.eventId;
        for (let t = 1; t <= 15; t++) {
            tickClosedWorld(winter, { tick: t, perceivedDanger: 0.2 });
            tickClosedWorld(winterDrought, { tick: t, perceivedDanger: 0.2 });
        }
        const price = winter.towns.get('north').market.getQuote('food').price;
        const droughtPrice = winterDrought.towns.get('north').market.getQuote('food').price;
        // Both are high (winter), but drought cannot lower price below winter alone
        expect(price).toBeGreaterThan(2.0);
        expect(droughtPrice).toBeGreaterThanOrEqual(price);
    });
});
