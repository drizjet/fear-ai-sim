import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('ecology to market cascade', () => {
    it('drought reduces harvest entering the market', () => {
        const society = new SocietyCore();
        society.addMarket('farm', new Market({ prices: { grain: 1 }, stock: { grain: 0 } }));
        society.tick({ actions: [{ kind: 'SEASON_UPDATE', market: 'farm', season: 'DROUGHT', harvest: 10 }] });
        const event = society.events.find(item => item.type === 'SEASON_UPDATE');
        expect(event.parentId).toBe(society.events[0].id);
        expect(event.produced).toBe(2);
        expect(society.markets.get('farm').stock.grain).toBe(2);
    });

    it('changing season changes production rather than only changing a label', () => {
        const run = season => {
            const society = new SocietyCore();
            society.addMarket('farm', new Market({ prices: { grain: 1 }, stock: { grain: 0 } }));
            society.tick({ actions: [{ kind: 'SEASON_UPDATE', market: 'farm', season, harvest: 10 }] });
            return society.markets.get('farm').stock.grain;
        };
        expect(run('DROUGHT')).toBeLessThan(run('SUMMER'));
    });
});
