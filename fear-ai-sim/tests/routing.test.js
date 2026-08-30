import { describe, expect, it } from '@jest/globals';
import { createRouteBelief, findRoutePath, routeCost, selectRoute } from '../routing.js';

const routes = [
    { id: 'safe-long', distance: 100, actualDanger: 0.1 },
    { id: 'short-dangerous', distance: 20, actualDanger: 0.9, politicalRisk: 1 },
];

describe('Deterministic routing primitives', () => {
    it('uses perceived danger rather than silently reading actual danger', () => {
        const lowFear = { perceivedDanger: 0, confidence: 1, fearSensitivity: 20, expectedCargoLoss: 0, uncertaintyAversion: 0 };
        const highFear = { perceivedDanger: 1, confidence: 1, fearSensitivity: 100, expectedCargoLoss: 0, uncertaintyAversion: 0, perceivedAmbushProbability: 1, cargoValue: 100 };
        expect(selectRoute(routes, lowFear).route.id).toBe('short-dangerous');
        expect(selectRoute(routes, highFear).route.id).toBe('short-dangerous');
    });

    it('returns alternatives and keeps actual danger separate from perception', () => {
        const decision = selectRoute(routes, { perceivedDanger: 0.5, confidence: 0.6, fearSensitivity: 10 });
        expect(decision.actualDanger).toBe(decision.route.actualDanger);
        expect(decision.perceivedDanger).toBe(0.5);
        expect(decision.alternatives).toHaveLength(1);
    });

    it('is deterministic on ties and preserves belief provenance', () => {
        const tied = selectRoute([{ id: 'a', distance: 10 }, { id: 'b', distance: 10 }]);
        expect(tied.route.id).toBe('a');
        expect(createRouteBelief(routes[0], { perceivedDanger: 0.8, confidence: 0.4, sourceId: 'survivor', tick: 7 })).toEqual({
            layer: 'AGENT_BELIEF', subject: 'safe-long', claim: 'route_danger', actualDanger: 0.1,
            perceivedDanger: 0.8, confidence: 0.4, sourceId: 'survivor', tick: 7
        });
    });

    it('finds a deterministic multi-hop path and rejects disconnected graphs', () => {
        const graph = [
            { id: 'a-c', from: 'a', to: 'c', distance: 20 },
            { id: 'a-b', from: 'a', to: 'b', distance: 5 },
            { id: 'b-c', from: 'b', to: 'c', distance: 5 }
        ];
        expect(findRoutePath(graph, 'a', 'c', {}).routes.map(route => route.id)).toEqual(['a-b', 'b-c']);
        expect(findRoutePath(graph, 'x', 'c', {})).toBeNull();
    });

    it('sanitizes invalid numeric inputs', () => {
        expect(routeCost({ distance: NaN }, { perceivedDanger: Infinity, confidence: null })).toBe(0);
    });
});
