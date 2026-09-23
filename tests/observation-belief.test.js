import { describe, expect, it } from '@jest/globals';
import { SocietyCore, RouteNetwork } from '../societycore.js';

describe('observation to belief integration', () => {
    it('records perceived route danger without copying actual danger', () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork();
        const actor = { id: 'merchant-1' };
        const route = { id: 'road-a', actualDanger: 99 };
        society.recordRouteObservation(actor, route, { perceivedDanger: 2, confidence: .8, source: 'scout' });
        const belief = actor.beliefs.get('route:road-a:danger');
        expect(belief.estimate).toBe(2);
        expect(belief.confidence).toBeGreaterThan(0);
        expect(belief.evidence[0].directObservation).toBe(true);
        expect(belief.evidence[0]).not.toHaveProperty('actualDanger');
    });

    it('restores actor beliefs with their original world timestamp', () => {
        const society = new SocietyCore();
        society.tick();
        const actor = { id: 'merchant-1' };
        society.recordRouteObservation(actor, { id: 'road-a', actualDanger: 50 }, { perceivedDanger: 3, confidence: 1, source: 'scout' });
        society.actors.set(actor.id, actor);
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        const belief = restored.actors.get(actor.id).beliefs.get('route:road-a:danger');
        expect(belief.estimate).toBe(3);
        expect(belief.lastUpdated).toBe(1);
        expect(belief.evidence[0].timestamp).toBe(1);
    });
});
