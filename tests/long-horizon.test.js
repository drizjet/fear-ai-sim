import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, mulberry32 } from '../societycore.js';

describe('long-horizon world health smoke guardrail', () => {
    it('maintains finite clocks, unique events, nonnegative stock, and conservation', () => {
        const society = new SocietyCore({ rng: mulberry32(123) });
        society.addMarket('farm', new Market({ prices: { grain: 1 }, stock: { grain: 100 } }));
        society.addFaction('town', { legitimacy: .6 });
        const trajectory = [];
        for (let tick = 0; tick < 1000; tick += 1) {
            society.tick({ actions: [
                { kind: 'SEASON_UPDATE', market: 'farm', season: tick % 5 === 0 ? 'DROUGHT' : 'SUMMER', harvest: 2 },
                { kind: 'FACTION_EVALUATION', faction: 'town', targetId: 'frontier', context: { security: tick % 2 ? .2 : .8 } },
            ] });
            if (tick % 100 === 99) trajectory.push({ tick: society.now(), stock: society.markets.get('farm').stock.grain, legitimacy: society.factions.get('town').state.legitimacy });
        }
        expect(Number.isFinite(society.now())).toBe(true);
        expect(new Set(society.events.map(event => event.id)).size).toBe(society.events.length);
        expect(society.markets.get('farm').stock.grain).toBeGreaterThanOrEqual(0);
        expect(society.markets.get('farm').balanceSheet().balanced).toBe(true);
        expect(society.factions.get('town').state.legitimacy).toBeGreaterThanOrEqual(0);
        expect(society.factions.get('town').state.legitimacy).toBeLessThanOrEqual(1);
        expect(trajectory).toHaveLength(10);
        expect(trajectory.every(point => Number.isFinite(point.stock) && Number.isFinite(point.legitimacy))).toBe(true);
    });
});
