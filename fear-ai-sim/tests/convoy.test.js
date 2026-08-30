import { describe, expect, it } from '@jest/globals';
import { adaptBandits, formConvoy, resolveConvoyAmbush } from '../convoy.js';

describe('convoy and bandit adaptation', () => {
    it('assigns escorts deterministically', () => {
        const merchants = [{ id: 'm1', cargo: 10 }, { id: 'm2', cargo: 5 }];
        const guards = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }];
        const convoy = formConvoy(merchants, guards);
        expect(convoy.escortIds).toEqual(['g1', 'g2']);
        expect(convoy.cargo).toBe(15);
    });

    it('reduces ambush loss with escorts and records adaptation', () => {
        const convoy = formConvoy([{ id: 'm1', cargo: 20 }], [{ id: 'g1' }]);
        const bandit = { id: 'b1', roadId: 'r1', lootExpectation: 0.5 };
        const result = resolveConvoyAmbush(convoy, bandit, { roadDanger: 0.8, escortStrength: 0.5, tick: 1 });
        expect(result.lost).toBeLessThan(16);
        expect(bandit.lootExpectation).toBeGreaterThan(0.5);
        expect(adaptBandits(bandit, { loss: 1 }).lootExpectation).toBeLessThan(0.6);
    });
});
