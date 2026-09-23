import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

function setup(hiddenDanger) {
    const society = new SocietyCore({ seed: 5201 });
    society.addMarket('city', new Market({ prices: { grain: 6 }, stock: { grain: 10 } }));
    society.routes = new RouteNetwork([{ id: 'road', available: true, perceivedDanger: 0, actualDanger: hiddenDanger }]);
    society.actors.set('merchant', { id: 'merchant', beliefs: new Map() });
    return society;
}

describe('RESP-OBSERVATION-HIDDEN-TRUTH-TWIN-AUDIT-001', () => {
    it('keeps decisions invariant when hidden danger changes without observation', () => {
        const low = setup(0);
        const high = setup(999);
        const action = { kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', routes: low.routes.edges, actorId: 'merchant', minimumPrice: 5 };
        low.tick({ actions: [action] });
        high.tick({ actions: [{ ...action, routes: high.routes.edges }] });
        expect(low.events.at(-1).decision).toBe(high.events.at(-1).decision);
        expect(low.events.at(-1).selectedRoute).toBe(high.events.at(-1).selectedRoute);
    });

    it('allows legal route observation to change the actor decision', () => {
        const society = setup(999);
        const actor = society.actors.get('merchant');
        society.recordRouteObservation(actor, society.routes.edges[0], { perceivedDanger: 999, confidence: 1 });
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', destination: 'city', good: 'grain', routes: society.routes.edges, actorId: actor.id, minimumPrice: 5, context: { fearSensitivity: 1 } }] });
        expect(society.events.at(-1).provenance).not.toBeNull();
        expect(JSON.stringify(society.events.at(-1))).not.toContain('actualDanger');
    });
});
