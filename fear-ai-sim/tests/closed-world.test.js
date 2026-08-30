import { describe, expect, it } from '@jest/globals';
import { BeliefStore } from '../beliefs.js';
import { applySurvivorEvidence, chooseMerchantRoute, createClosedWorldScenario, resolveBanditAttack } from '../closed-world.js';

describe('closed-world evidence and trade consequences', () => {
    it('models a surviving bandit attack as evidence without changing ground truth', () => {
        const world = createClosedWorldScenario();
        const before = world.routes.find(route => route.id === 'road-a').actualDanger;
        const attack = resolveBanditAttack(world);
        expect(attack.ok).toBe(true);
        expect(attack.event.survivor).toBe(true);
        expect(world.routes.find(route => route.id === 'road-a').actualDanger).toBe(before);
        expect(world.merchants[0].cargo).toBeLessThan(20);
    });

    it('derives a public rumor from survivor evidence', () => {
        const world = createClosedWorldScenario();
        world.beliefs = new BeliefStore();
        const result = applySurvivorEvidence(world);
        expect(result.ok).toBe(true);
        expect(result.belief.layer).toBe('AGENT_BELIEF');
        expect(result.rumor.layer).toBe('PUBLIC_RUMOR');
        expect(result.rumor.sourceId).toBe('survivor');
    });

    it('reroutes a merchant using perceived rather than actual danger', () => {
        const world = createClosedWorldScenario();
        const result = chooseMerchantRoute(world, 'merchant-1', 0.8);
        expect(result.ok).toBe(true);
        expect(result.routeId).toBe('road-b');
        expect(result.path).toEqual(['road-b']);
        expect(world.routes.find(route => route.id === 'road-a').actualDanger).toBe(0.8);
    });
});
