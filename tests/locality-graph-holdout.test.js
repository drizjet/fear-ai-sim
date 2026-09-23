import { describe, expect, it } from '@jest/globals';
import { RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-BELIEF-LOCALITY-001 graph-local route decisions', () => {
    const setup = () => {
        const society = new SocietyCore();
        society.routes = new RouteNetwork([
            { id: 'short', travelTime: 2, perceivedDanger: 0, actualDanger: 100 },
            { id: 'detour', travelTime: 5, perceivedDanger: 0, actualDanger: 0 },
        ]);
        society.actors.set('merchant', { id: 'merchant', beliefs: new Map() });
        return society;
    };

    it('uses an actor belief for route choice and records causal parentage', () => {
        const society = setup();
        society.tick({ actions: [
            { kind: 'ROUTE_OBSERVATION', actorId: 'merchant', routeId: 'short', observation: { distance: 1, range: 10, perceivedDanger: 10, confidence: 1, source: 'scout' } },
            { kind: 'TRADE_ROUTE_DECISION', actorId: 'merchant', routes: society.routes.edges, context: { fearSensitivity: 2 } },
        ] });
        const observation = society.events.find(event => event.type === 'ROUTE_OBSERVATION');
        const decision = society.events.find(event => event.type === 'TRADE_ROUTE_DECISION');
        expect(decision.selectedRoute).toBe('detour');
        expect(decision.parentId).toBe(observation.id);
        expect(decision).not.toHaveProperty('actualDanger');
    });

    it('keeps twin decisions identical when only hidden route truth changes', () => {
        const decide = actualDanger => {
            const society = setup();
            society.routes.edges[0].actualDanger = actualDanger;
            society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: 'merchant', routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
            return society.events.at(-1).selectedRoute;
        };
        expect(decide(0)).toBe(decide(100));
    });

    it('persists the route belief and keeps the decision after a fresh deserialize', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actorId: 'merchant', routeId: 'short', observation: { distance: 1, range: 10, perceivedDanger: 10, confidence: 1, source: 'scout' } }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        restored.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: 'merchant', routes: restored.routes.edges, context: { fearSensitivity: 2 } }] });
        expect(restored.events.at(-1).selectedRoute).toBe('detour');
        expect(restored.actors.get('merchant').beliefs.get('route:short:danger').estimate).toBe(10);
    });

    it('mutation control proves deleting the belief changes the route decision', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actorId: 'merchant', routeId: 'short', observation: { distance: 1, range: 10, perceivedDanger: 10, confidence: 1, source: 'scout' } }] });
        society.actors.get('merchant').beliefs.clear();
        society.tick({ actions: [{ kind: 'TRADE_ROUTE_DECISION', actorId: 'merchant', routes: society.routes.edges, context: { fearSensitivity: 2 } }] });
        expect(society.events.at(-1).selectedRoute).toBe('short');
    });
});
