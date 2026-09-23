import { describe, expect, it } from '@jest/globals';
import { RouteNetwork } from '../societycore.js';

describe('RESP-BELIEF-LOCALITY-001: route choice consumes perceived information', () => {
    it('does not change when only hidden actual danger changes', () => {
        const network = new RouteNetwork();
        const routes = [
            { id: 'short', travelTime: 2, perceivedDanger: 0, actualDanger: 100 },
            { id: 'long', travelTime: 10, perceivedDanger: 0, actualDanger: 0 },
        ];
        const first = network.chooseRoute(routes, { fearSensitivity: 2 });
        routes[0].actualDanger = 0;
        routes[1].actualDanger = 100;
        const second = network.chooseRoute(routes, { fearSensitivity: 2 });
        expect(first.id).toBe('short');
        expect(second.id).toBe('short');
    });

    it('derives route perception through an explicit observation boundary', () => {
        const network = new RouteNetwork();
        const route = { id: 'road-a', actualDanger: 99 };
        const observation = network.observeRoute(route, { perceivedDanger: 2, confidence: .75, source: 'scout', observedAt: 4 });
        expect(observation).toMatchObject({ routeId: 'road-a', perceivedDanger: 2, confidence: .75, source: 'scout', observedAt: 4 });
        expect(observation).not.toHaveProperty('actualDanger');
    });

    it('rejects observations outside the actor observation range', () => {
        const network = new RouteNetwork();
        expect(network.observeRoute({ id: 'far-road', actualDanger: 10 }, { distance: 11, range: 10, perceivedDanger: 10 })).toBeNull();
    });

    it('changes when the actor receives a changed perceived danger observation', () => {
        const network = new RouteNetwork();
        const routes = [
            { id: 'short', travelTime: 2, perceivedDanger: 0 },
            { id: 'long', travelTime: 10, perceivedDanger: 0 },
        ];
        expect(network.chooseRoute(routes, { fearSensitivity: 2 }).id).toBe('short');
        routes[0].perceivedDanger = 10;
        expect(network.chooseRoute(routes, { fearSensitivity: 2 }).id).toBe('long');
    });
});
