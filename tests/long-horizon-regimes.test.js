import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore, mulberry32 } from '../societycore.js';

describe('RESP-LONG-HORIZON-HEALTH-001 trajectory regimes', () => {
    for (const seed of [123, 321, 777]) {
        it(`keeps coupled world state healthy for seed ${seed}`, () => {
            const society = new SocietyCore({ rng: mulberry32(seed) });
            society.addMarket('farm', new Market({ prices: { grain: 1 }, stock: { grain: 100 } }));
            society.addFaction('town', { legitimacy: .6 });
            society.addRoamingGroup('nomads', { food: 2, foodNeed: 5, loot: 10 });
            society.routes = new RouteNetwork([{ id: 'road', travelTime: 2, perceivedDanger: 0, trafficCapacity: 100 }]);
            const trajectory = [];
            for (let tick = 0; tick < 1000; tick += 1) {
                const actions = [
                    { kind: 'SEASON_UPDATE', market: 'farm', season: tick % 5 === 0 ? 'DROUGHT' : 'SUMMER', harvest: 2 },
                    { kind: 'FACTION_EVALUATION', faction: 'town', targetId: 'frontier', context: { security: tick % 2 ? .2 : .8 } },
                ];
                if (tick % 3 === 0) actions.push({ kind: 'ROUTE_TRAFFIC_DECAY', rate: .1 });
                if (tick % 4 === 0) actions.push({ kind: 'ROAMING_GROUP_MOBILITY_ROUTE', group: 'nomads' });
                society.tick({ actions });
                if (tick % 100 === 99) trajectory.push({ tick: society.now(), stock: society.markets.get('farm').stock.grain, traffic: society.routes.edges[0].traffic });
            }
            const market = society.markets.get('farm');
            expect(trajectory).toHaveLength(10);
            expect(trajectory.every(point => Number.isFinite(point.stock) && point.stock >= 0 && Number.isFinite(point.traffic) && point.traffic >= 0 && point.traffic <= 100)).toBe(true);
            expect(market.balanceSheet().balanced).toBe(true);
            expect(new Set(society.events.map(event => event.id)).size).toBe(society.events.length);
            expect(society.events.every(event => event.parentId == null || society.events.some(parent => parent.id === event.parentId && parent.seq < event.seq))).toBe(true);
            expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()).toEqual(society.serialize());
        });
    }
});
