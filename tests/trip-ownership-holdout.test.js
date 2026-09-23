import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('market trip ownership holdout', () => {
    it('settles stolen and returned cargo through canonical events after restart', () => {
        const society = new SocietyCore({ seed: 19 });
        society.addMarket('origin', new Market({ stock: { grain: 20 } }));
        society.addMarket('destination', new Market({ stock: { grain: 0 } }));
        society.tick({ actions: [{ kind: 'MARKET_TRIP_CREATE', market: 'origin', tripId: 'stolen-1', good: 'grain', quantity: 5, destination: 'destination' }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        restored.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'stolen-1', outcome: 'STOLEN', thief: 'bandit-7' }] });
        const event = restored.events.at(-1);
        expect(event).toMatchObject({ type: 'MARKET_TRIP_SETTLE', outcome: 'STOLEN', owner: 'bandit-7' });
        expect(restored.markets.get('origin').stock.grain).toBe(15);
        expect(restored.markets.get('origin').balanceSheet().balanced).toBe(true);
        expect(event.parentId).toBe(restored.events.at(-2).id);

        const returned = restored.markets.get('origin').createTrip({ id: 'returned-1', good: 'grain', quantity: 4, destination: 'destination' });
        expect(returned.status).toBe('IN_TRANSIT');
        const saved = JSON.parse(JSON.stringify(restored.serialize()));
        const continued = SocietyCore.deserialize(saved);
        continued.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'origin', tripId: 'returned-1', outcome: 'RETURNED' }] });
        expect(continued.markets.get('origin').stock.grain).toBe(15);
        expect(continued.markets.get('origin').history.filter(entry => entry.kind === 'TRIP_RETURN')).toHaveLength(1);
        expect(continued.markets.get('origin').balanceSheet().balanced).toBe(true);
    });
});
