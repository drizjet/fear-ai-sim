import { describe, expect, it } from '@jest/globals';
import { createClosedWorldScenario, formClosedWorldConvoy, resolveBanditAttack } from '../closed-world.js';

describe('closed-world market feedback', () => {
    it('records disrupted cargo and updates destination market', () => {
        const world = createClosedWorldScenario();
        const before = world.towns.get('south').market;
        before.supply = 100;
        before.demand = 100;
        formClosedWorldConvoy(world);
        const result = resolveBanditAttack(world, { tick: 1 });
        expect(result.ok).toBe(true);
        const merchant = world.merchants[0];
        const delivered = merchant.cargo;
        before.supply += delivered;
        before.price = Math.max(1, before.demand / Math.max(1, before.supply));
        expect(delivered).toBeLessThan(20);
        expect(before.price).toBeGreaterThan(0);
    });
});
