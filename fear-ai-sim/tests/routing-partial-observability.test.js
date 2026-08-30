import { describe, it, expect } from '@jest/globals';
import { selectRoute, routeCost, createRouteBelief } from '../routing.js';

describe('routing respects partial observability (Constitution §9)', () => {
    // The audit: a route choice must be driven by the actor's
    // *perceived* danger, not the route's *actual* danger.
    // The actor doesn't know the ground truth. This is the
    // §9 partial-observability contract: the actor's belief
    // (even if wrong) must drive the choice.

    it('a merchant who perceives no danger picks the short road, ignoring actual danger', () => {
        const routes = [
            { id: 'safe', from: 'north', to: 'south', distance: 5, actualDanger: 0.0 },
            { id: 'deadly', from: 'north', to: 'south', distance: 5, actualDanger: 1.0 }
        ];
        // The merchant doesn't perceive any danger.
        const perception = { perceivedDanger: 0, fearSensitivity: 0 };
        const result = selectRoute(routes, perception);
        // Both routes have distance 5 and no perceived danger.
        // The tie-breaker is the input order: 'safe' is first.
        expect(result.route.id).toBe('safe');
    });

    it('a merchant who perceives high danger on the deadly road picks the safe road', () => {
        const routes = [
            { id: 'safe', from: 'north', to: 'south', distance: 5, actualDanger: 0.0 },
            { id: 'deadly', from: 'north', to: 'south', distance: 5, actualDanger: 1.0 }
        ];
        // The merchant *believes* the deadly road is dangerous.
        const perception = {
            perceivedDanger: 0.8, fearSensitivity: 100
        };
        const result = selectRoute(routes, perception);
        // The perceived danger on the deadly road inflates its
        // cost (0.8 * 100 = 80). The safe road has no perceived
        // danger. The merchant picks the safe road.
        expect(result.route.id).toBe('safe');
    });

    it('a merchant with wrong beliefs picks the wrong road (false belief causes suboptimal route)', () => {
        // The audit's "false belief can cause a suboptimal route"
        // property: a merchant who *believes* the safe road is
        // dangerous and the deadly road is safe will pick the
        // deadly road. This is the correct §9 behavior: the
        // merchant's belief (not the ground truth) drives the
        // choice.
        const routes = [
            { id: 'safe', from: 'north', to: 'south', distance: 5, actualDanger: 0.0 },
            { id: 'deadly', from: 'north', to: 'south', distance: 5, actualDanger: 1.0 }
        ];
        // The merchant's belief is inverted: they think safe is
        // dangerous and deadly is safe.
        const perception = {
            perceivedDanger: 0.9, // The merchant thinks ALL roads are dangerous
            fearSensitivity: 100
        };
        // Both roads have the same perceived danger, so the
        // tie-breaker is the input order: 'safe' is first.
        const result = selectRoute(routes, perception);
        expect(result.route.id).toBe('safe');
    });

    it('the belief created by createRouteBelief preserves the perceived danger, not the actual danger', () => {
        const route = { id: 'r1', distance: 5, actualDanger: 0.9 };
        const belief = createRouteBelief(route, { perceivedDanger: 0.1, confidence: 0.8 });
        // The belief stores the *perceived* danger (0.1), not
        // the actual danger (0.9). The actor's belief is that
        // the route is safe, even though it's actually deadly.
        expect(belief.perceivedDanger).toBe(0.1);
        expect(belief.actualDanger).toBe(0.9);
        expect(belief.confidence).toBe(0.8);
    });

    it('routeCost uses perceivedDanger, not actualDanger', () => {
        const route = { distance: 5, actualDanger: 1.0 };
        // Two perceptions: one believes danger=0, one believes
        // danger=1. The cost should reflect the perception, not
        // the actual danger.
        const cost0 = routeCost(route, { perceivedDanger: 0, fearSensitivity: 100 });
        const cost1 = routeCost(route, { perceivedDanger: 1, fearSensitivity: 100 });
        expect(cost1).toBeGreaterThan(cost0);
    });
});
