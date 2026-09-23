import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('canonical multi-system world step', () => {
    it('connects production, price-aware travel, faction state, and delayed information', () => {
        const society = new SocietyCore({ seed: 53 });
        society.addMarket('farm', new Market({ prices: { grain: 1 }, stock: { grain: 10 } }));
        society.addMarket('city', new Market({ prices: { grain: 9 }, stock: { grain: 0 } }));
        society.routes = new RouteNetwork([{ id: 'road', travelTime: 2 }]);
        society.addFaction('town', { legitimacy: .5 });
        const merchant = { id: 'merchant' };
        const rumor = society.rumors.publish({ claim: 'road-danger', valueEstimate: 4, source: 'scout', confidence: .8 });
        society.worldStep({ market: 'farm', season: 'DROUGHT', harvest: 10, destination: 'city', good: 'grain', minimumPrice: 5, routes: society.routes.edges, actorId: merchant.id, faction: 'town', factionTarget: 'frontier', factionContext: { security: 0, opportunity: 0, resourceNeed: 0 }, rumor, rumorRecipients: [{ ...merchant, delay: 1 }] });
        expect(society.markets.get('farm').stock.grain).toBe(12);
        expect(society.events.map(event => event.type)).toEqual(expect.arrayContaining(['SEASON_UPDATE', 'TRADE_ROUTE_DECISION', 'FACTION_EVALUATION', 'TURN']));
        expect(merchant.beliefs).toBeUndefined();
        society.tick();
        society.deliverRumors([merchant]);
        expect(merchant.beliefs.get('road-danger').estimate).toBe(4);
        const turn = society.events.find(event => event.type === 'TURN');
        expect(society.events.filter(event => event.parentId === turn.id).length).toBeGreaterThanOrEqual(3);
        expect(society.markets.get('farm').balanceSheet().balanced).toBe(true);
    });
});
