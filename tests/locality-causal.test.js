import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

describe('legal observation boundary', () => {
    it('records an out-of-range rejection and does not create a belief', () => {
        const society = new SocietyCore();
        const actor = { id: 'merchant' };
        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actor, route: { id: 'far', actualDanger: 99 }, observation: { distance: 20, range: 5, perceivedDanger: 99 } }] });
        const event = society.events.find(item => item.type === 'ROUTE_OBSERVATION_REJECTED');
        expect(event).toMatchObject({ reason: 'OUT_OF_RANGE', routeId: 'far', actorId: 'merchant' });
        expect(actor.beliefs).toBeUndefined();
    });

    it('preserves uncertainty and distortion without exposing actual danger', () => {
        const society = new SocietyCore();
        const actor = { id: 'merchant' };
        const route = { id: 'road', actualDanger: 99 };
        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actor, route, observation: { distance: 2, range: 10, perceivedDanger: 2, distortion: 3, confidence: .4, source: 'distant-scout' } }] });
        const belief = society.actors.get('merchant').beliefs.get('route:road:danger');
        expect(belief.estimate).toBe(5);
        expect(belief.confidence).toBeGreaterThan(0);
        expect(belief.evidence[0]).toMatchObject({ valueEstimate: 5, confidence: .4, source: 'distant-scout', directObservation: true });
        expect(belief.evidence[0]).not.toHaveProperty('actualDanger');
    });

    it('keeps twin decisions identical when only hidden route truth differs', () => {
        const decide = actualDanger => {
            const society = new SocietyCore();
            society.routes.edges = [{ id: 'road', travelTime: 2, actualDanger }, { id: 'detour', travelTime: 5, actualDanger: 0 }];
            society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
            return society.events.at(-1).selectedRoute;
        };
        expect(decide(0)).toBe(decide(100));
    });
});
