import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, mulberry32 } from '../societycore.js';

describe('fresh runtime persistence and fork holdout', () => {
    it('continues a saved world identically after destroying the original runtime', () => {
        const original = new SocietyCore({ rng: mulberry32(77) });
        original.addMarket('north', new Market({ prices: { grain: 1 }, stock: { grain: 10 } }));
        original.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 0 } }));
        original.addFaction('town', { legitimacy: .7, grievance: .1 });
        const actor = { id: 'scout' };
        original.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actor, route: { id: 'road', actualDanger: 9 }, observation: { perceivedDanger: 2, confidence: .8, source: 'scout' } }] });
        const rumor = original.rumors.publish({ claim: 'road-danger', valueEstimate: true });
        original.queueRumor(rumor, { id: 'scout' }, { delay: 2 });
        original.tick({ actions: [{ kind: 'MARKET_TRIP_CREATE', market: 'north', tripId: 't1', good: 'grain', quantity: 3, destination: 'south' }] });
        const saved = JSON.parse(JSON.stringify(original.serialize()));
        const restored = SocietyCore.deserialize(saved);
        const restoredActor = restored.actors.get('scout');
        restored.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'north', destinationMarket: 'south', tripId: 't1', outcome: 'DELIVERED' }] });
        restored.deliverRumors([restoredActor]);
        const expected = restored.serialize();
        original.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'north', destinationMarket: 'south', tripId: 't1', outcome: 'DELIVERED' }] });
        original.deliverRumors([original.actors.get('scout')]);
        expect(original.serialize()).toEqual(expected);
    });

    it('forks diverge only after the intervention', () => {
        const base = new SocietyCore({ rng: mulberry32(9) });
        base.addFaction('town', { legitimacy: .5, grievance: 0 });
        const saved = JSON.parse(JSON.stringify(base.serialize()));
        const a = SocietyCore.deserialize(saved);
        const b = SocietyCore.deserialize(saved);
        expect(a.serialize()).toEqual(b.serialize());
        a.tick({ actions: [{ kind: 'JUSTICE_RESOLUTION', faction: 'town', solved: true, injustice: 0 }] });
        b.tick({ actions: [{ kind: 'JUSTICE_RESOLUTION', faction: 'town', solved: false, injustice: 1 }] });
        expect(a.factions.get('town').state.legitimacy).not.toBe(b.factions.get('town').state.legitimacy);
    });
});
