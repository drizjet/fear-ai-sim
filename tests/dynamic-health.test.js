import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('dynamic health counterexamples', () => {
    it('does not inflate legitimacy from repeated HOLD decisions without cooperation', () => {
        const society = new SocietyCore();
        society.addFaction('town', { legitimacy: .5 });
        for (let i = 0; i < 100; i += 1) society.tick({ actions: [{ kind: 'FACTION_EVALUATION', faction: 'town', targetId: 'frontier', context: { security: 0, opportunity: 0, resourceNeed: 0 } }] });
        expect(society.factions.get('town').state.legitimacy).toBe(.5);
    });

    it('defers a route when destination price is below the merchant minimum', () => {
        const society = new SocietyCore();
        society.addMarket('city', new Market({ prices: { grain: 1 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 1 }]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', minimumPrice: 5 }] });
        expect(society.events.at(-1)).toMatchObject({ decision: 'WAIT', profitable: false, selectedRoute: null });
    });

    it('allows an above-threshold destination price to select a route', () => {
        const society = new SocietyCore();
        society.addMarket('city', new Market({ prices: { grain: 8 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 1 }]);
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', minimumPrice: 5 }] });
        expect(society.events.at(-1)).toMatchObject({ decision: 'TRAVEL', profitable: true, selectedRoute: 'road' });
    });
});
